import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Users, ClipboardList, Building2, AlertCircle, Download, RefreshCw, ChevronLeft, ChevronRight, X, FileText, Calendar } from 'lucide-react';
import { apiUrl } from '../utils/api';
import jsPDF from 'jspdf';
import { normalizeCourseName, hasViewAccess } from '../utils/permissions';
import useOnlineStatus from '../hooks/useOnlineStatus'; // Assuming this hook exists or we can use navigator.onLine check, but let's check imports in StudentDashboard
// Actually StudentDashboard uses useOnlineStatus. Let's check if we need it here.
// The file previously didn't use it. Let's stick to what's needed.

const normalizeValue = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const getItemKey = (name = '') => String(name).toLowerCase().replace(/\s+/g, '_');

const getProductYears = (product) => {
  if (!product) return [];
  const fromArray = Array.isArray(product.years) ? product.years : [];
  const normalized = fromArray.map(Number).filter(year => !Number.isNaN(year) && year > 0);

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackYear = Number(product.year);
  if (!Number.isNaN(fallbackYear) && fallbackYear > 0) {
    return [fallbackYear];
  }

  return [];
};

const formatCurrency = (amount = 0) => `₹${Number(amount || 0).toFixed(2)}`;

const StudentDue = ({ currentUser }) => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [products, setProducts] = useState([]);

  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({
    totalStudents: 0,
    totalPendingItems: 0,
    totalPendingAmount: 0,
    impactedCourses: 0
  });

  const [dueFilters, setDueFilters] = useState({ search: '', course: '', year: '', branch: '', semester: '', kit: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    branch: '',
    semester: '',
    kit: '',
    selectedKits: [], // Array for multiple kit selection
    includeSummary: true,
    includeItemDetails: false,
  });
  const [generatingReport, setGeneratingReport] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });

  // -- Permissions --
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  const [collegeCourses, setCollegeCourses] = useState([]);

  // Fetch Assigned College Courses
  useEffect(() => {
    const fetchCollegeCourses = async () => {
      if (!currentUser?.assignedCollege) return;

      try {
        const collegeId = typeof currentUser.assignedCollege === 'object'
          ? currentUser.assignedCollege._id
          : currentUser.assignedCollege;

        if (!collegeId) return;

        const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock`));
        if (res.ok) {
          const data = await res.json();
          if (data.courses && Array.isArray(data.courses)) {
            setCollegeCourses(data.courses);
          }
        }
      } catch (err) {
        console.error('Failed to fetch college courses:', err);
      }
    };

    fetchCollegeCourses();
  }, [currentUser]);

  // Helper to extract allowed courses from permissions AND assigned college
  const allowedCourseNames = useMemo(() => {
    if (isSuperAdmin) return null; // Access to all

    const allowed = new Set();

    // 1. Add courses from permissions
    if (hasViewAccess(userPermissions, 'course-dashboard')) {
      userPermissions.forEach(perm => {
        if (typeof perm === 'string' && perm.startsWith('course-dashboard-')) {
          const parts = perm.split(':');
          const courseName = parts[0].replace('course-dashboard-', '');
          allowed.add(courseName);
        }
      });
    }

    // 2. Add courses from Assigned College (Automatic Access)
    collegeCourses.forEach(course => {
      allowed.add(course);
    });

    // If no permissions AND no college courses, return empty array to block access
    if (allowed.size === 0) return [];

    return Array.from(allowed);
  }, [isSuperAdmin, userPermissions, collegeCourses]);

  // Fetch Courses (Modified to filter)
  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/sql/academic/courses'));
      if (response.ok) {
        const data = await response.json();

        let availableCourses = data;
        if (allowedCourseNames !== null) {
          availableCourses = data.filter(c => {
            // Check 1: Match by ID
            const idMatch = allowedCourseNames.includes(String(c.id));
            // Check 2: Match by Normalized Name
            const normName = normalizeCourseName(c.name);
            const nameMatch = allowedCourseNames.some(allowed => normalizeCourseName(allowed) === normName);
            return idMatch || nameMatch;
          });
        }
        setCourses(availableCourses || []);
      }
    } catch (err) {
      console.error("Failed to fetch courses", err);
    }
  }, [allowedCourseNames]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/settings'));
      if (response.ok) {
        const data = await response.json();
        setReceiptSettings({
          receiptHeader: data.receiptHeader || 'PYDAH GROUP OF INSTITUTIONS',
          receiptSubheader: data.receiptSubheader || 'Stationery Management System',
        });
      }
    } catch (error) {
      console.warn('Failed to load receipt settings:', error.message || error);
    }
  }, []);

  // Trigger fetch when filters or page change
  useEffect(() => {
    if (!dueFilters.course) return;

    const timer = setTimeout(() => {
      fetchDues();
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [currentPage, itemsPerPage, dueFilters]);

  useEffect(() => {
    fetchCourses(); // From SQL
    fetchProducts();
    fetchSettings();
  }, [fetchCourses, fetchSettings]);

  const fetchDues = useCallback(async () => {
    try {
      setStudentsLoading(true);
      setStudentsError('');

      // Optimization: Don't fetch if no course selected
      if (!dueFilters.course) {
        setStudents([]);
        setStats({
          totalStudents: 0,
          totalPendingItems: 0,
          totalPendingAmount: 0,
          impactedCourses: 0
        });
        setStudentsLoading(false);
        return;
      }
      const query = new URLSearchParams({
        page: currentPage,
        limit: itemsPerPage,
        search: dueFilters.search,
        course: dueFilters.course,
        branch: dueFilters.branch,
        year: dueFilters.year,
        semester: dueFilters.semester,
        kitId: dueFilters.kit // Backend expects kitId
      });

      const response = await fetch(apiUrl(`/api/sql/dues?${query.toString()}`));
      if (!response.ok) throw new Error('Failed to fetch dues');

      const data = await response.json();
      setStudents(data.students || []); // These are already calculated due reports
      setStats(data.stats || {
        totalStudents: 0,
        totalPendingItems: 0,
        totalPendingAmount: 0,
        impactedCourses: 0
      });
      setTotalPages(data.totalPages || 1);

    } catch (error) {
      console.error('Error fetching dues:', error);
      setStudentsError(error.message || 'Failed to load dues');
    } finally {
      setStudentsLoading(false);
    }
  }, [currentPage, itemsPerPage, dueFilters]);

  const fetchProducts = useCallback(async () => {
    try {
      setProductsLoading(true);
      setProductsError('');
      const response = await fetch(apiUrl('/api/products'));
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProductsError(error.message || 'Failed to load products');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchDues(), fetchProducts()]);
    setRefreshing(false);
  }, [fetchDues, fetchProducts]);

  const courseOptions = useMemo(() => {
    return courses.map(c => c.displayName || c.name).sort();
  }, [courses]);

  const yearOptions = useMemo(() => {
    if (!dueFilters.course) {
      const years = new Set();
      courses.forEach(c => (c.years || []).forEach(y => years.add(y)));
      return years.size === 0 ? [1, 2, 3, 4] : Array.from(years).sort((a, b) => a - b);
    }

    const selectedCourse = courses.find(c => (c.displayName || c.name) === dueFilters.course);
    if (!selectedCourse) return [1, 2, 3, 4];

    if (dueFilters.branch) {
      const selectedBranch = selectedCourse.branches?.find(b => b.name === dueFilters.branch);
      if (selectedBranch && selectedBranch.years) return selectedBranch.years;
    }

    return selectedCourse.years || [1, 2, 3, 4];
  }, [courses, dueFilters.course, dueFilters.branch]);

  const semesterOptions = useMemo(() => {
    if (!dueFilters.course) return [1, 2, 3, 4, 5, 6, 7, 8];

    const selectedCourse = courses.find(c => (c.displayName || c.name) === dueFilters.course);
    if (!selectedCourse) return [1, 2, 3, 4, 5, 6, 7, 8];

    if (dueFilters.branch) {
      const selectedBranch = selectedCourse.branches?.find(b => b.name === dueFilters.branch);
      if (selectedBranch && selectedBranch.semesters) return selectedBranch.semesters;
    }

    return selectedCourse.semesters || [1, 2, 3, 4, 5, 6, 7, 8];
  }, [courses, dueFilters.course, dueFilters.branch]);

  const branchOptions = useMemo(() => {
    if (!dueFilters.course) {
      const branches = new Set();
      courses.forEach(c => (c.branches || []).forEach(b => branches.add(typeof b === 'object' ? b.name : b)));
      return Array.from(branches).sort();
    }
    const selectedCourse = courses.find(c => (c.displayName || c.name) === dueFilters.course);
    return (selectedCourse?.branches || []).map(b => typeof b === 'object' ? b.name : b).sort();
  }, [courses, dueFilters.course]);

  // Report Modal Options
  const reportYearOptions = useMemo(() => {
    if (!reportFilters.course) {
      const years = new Set();
      courses.forEach(c => (c.years || []).forEach(y => years.add(y)));
      return years.size === 0 ? [1, 2, 3, 4] : Array.from(years).sort((a, b) => a - b);
    }
    const selectedCourse = courses.find(c => (c.displayName || c.name) === reportFilters.course);
    if (!selectedCourse) return [1, 2, 3, 4];
    if (reportFilters.branch) {
      const selectedBranch = selectedCourse.branches?.find(b => b.name === reportFilters.branch);
      if (selectedBranch && selectedBranch.years) return selectedBranch.years;
    }
    return selectedCourse.years || [1, 2, 3, 4];
  }, [courses, reportFilters.course, reportFilters.branch]);

  const reportSemesterOptions = useMemo(() => {
    if (!reportFilters.course) return [1, 2, 3, 4, 5, 6, 7, 8];
    const selectedCourse = courses.find(c => (c.displayName || c.name) === reportFilters.course);
    if (!selectedCourse) return [1, 2, 3, 4, 5, 6, 7, 8];
    if (reportFilters.branch) {
      const selectedBranch = selectedCourse.branches?.find(b => b.name === reportFilters.branch);
      if (selectedBranch && selectedBranch.semesters) return selectedBranch.semesters;
    }
    return selectedCourse.semesters || [1, 2, 3, 4, 5, 6, 7, 8];
  }, [courses, reportFilters.course, reportFilters.branch]);

  const reportBranchOptions = useMemo(() => {
    if (!reportFilters.course) {
      const branches = new Set();
      courses.forEach(c => (c.branches || []).forEach(b => branches.add(typeof b === 'object' ? b.name : b)));
      return Array.from(branches).sort();
    }
    const selectedCourse = courses.find(c => (c.displayName || c.name) === reportFilters.course);
    return (selectedCourse?.branches || []).map(b => typeof b === 'object' ? b.name : b).sort();
  }, [courses, reportFilters.course]);


  // Pre-normalize and precompute product data for performance
  const normalizedProducts = useMemo(() => {
    return products.map(product => ({
      ...product,
      _normalizedCourse: normalizeValue(product.forCourse),
      _normalizedBranches: (Array.isArray(product.branch)
        ? product.branch
        : (product.branch ? [product.branch] : [])).map(b => normalizeValue(b)),
      _years: getProductYears(product),
      _semesters: product.semesters || [],
      _key: getItemKey(product.name),
      _applicabilityMode: product.applicabilityMode || 'rules',
      _applicableStudents: new Set((product.applicableStudents || []).map(String)),
    }));
  }, [products]);

  const kitOptions = useMemo(() => {
    // If filters are selected, show kits that match those filters
    const selectedCourse = normalizeValue(dueFilters.course);
    const selectedYear = Number(dueFilters.year);
    const selectedBranch = dueFilters.branch ? normalizeValue(dueFilters.branch) : null;
    const selectedSemester = dueFilters.semester ? Number(dueFilters.semester) : null;

    return normalizedProducts
      .filter(p => {
        if (!p.isSet) return false;

        // Course filter
        if (selectedCourse && p._normalizedCourse && p._normalizedCourse !== selectedCourse) return false;

        // Year filter
        if (!Number.isNaN(selectedYear) && selectedYear > 0 && p._years.length > 0 && !p._years.includes(selectedYear)) return false;

        // Branch filter
        if (selectedBranch && p._normalizedBranches.length > 0 && !p._normalizedBranches.includes(selectedBranch)) return false;

        // Semester filter
        if (selectedSemester !== null && !Number.isNaN(selectedSemester) && selectedSemester > 0 && p._semesters.length > 0 && !p._semesters.includes(selectedSemester)) return false;

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedProducts, dueFilters.course, dueFilters.year, dueFilters.branch, dueFilters.semester]);

  const reportKitOptions = useMemo(() => {
    // Replicate same logic for report filters
    const selectedCourse = normalizeValue(reportFilters.course);
    const selectedYear = Number(reportFilters.year);
    const selectedBranch = reportFilters.branch ? normalizeValue(reportFilters.branch) : null;
    const selectedSemester = reportFilters.semester ? Number(reportFilters.semester) : null;

    return normalizedProducts
      .filter(p => {
        if (!p.isSet) return false;

        if (selectedCourse && p._normalizedCourse && p._normalizedCourse !== selectedCourse) return false;
        if (!Number.isNaN(selectedYear) && selectedYear > 0 && p._years.length > 0 && !p._years.includes(selectedYear)) return false;
        if (selectedBranch && p._normalizedBranches.length > 0 && !p._normalizedBranches.includes(selectedBranch)) return false;
        if (selectedSemester !== null && !Number.isNaN(selectedSemester) && selectedSemester > 0 && p._semesters.length > 0 && !p._semesters.includes(selectedSemester)) return false;

        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedProducts, reportFilters.course, reportFilters.year, reportFilters.branch, reportFilters.semester]);

  // Pre-normalize student data
  // normalizedStudents removed


  // dueStudents removed
  const dueStudents = [];


  const filteredDueStudents = useMemo(() => {
    const searchValue = dueFilters.search.trim().toLowerCase();
    const selectedCourse = normalizeValue(dueFilters.course);
    const selectedYear = Number(dueFilters.year);
    const selectedBranch = dueFilters.branch ? normalizeValue(dueFilters.branch) : null;
    const selectedSemester = dueFilters.semester ? Number(dueFilters.semester) : null;
    const selectedKitId = dueFilters.kit;

    // Kit specific filter logic: find if the kit is assigned to this student
    const kitIdStr = selectedKitId ? String(selectedKitId) : null;
    const selectedKit = kitIdStr ? normalizedProducts.find(p => String(p._id) === kitIdStr) : null;
    const selectedKitKey = selectedKit ? selectedKit._key : null;

    return dueStudents.filter(record => {
      const { student, pendingItems } = record;
      if (selectedCourse && normalizeValue(student.course) !== selectedCourse) return false;
      if (!Number.isNaN(selectedYear) && selectedYear > 0 && Number(student.year) !== selectedYear) return false;
      if (selectedBranch && normalizeValue(student.branch) !== selectedBranch) return false;
      if (selectedSemester !== null && !Number.isNaN(selectedSemester) && selectedSemester > 0) {
        const studentSemester = Number(student.semester);
        if (Number.isNaN(studentSemester) || studentSemester !== selectedSemester) return false;
      }

      // Kit filter logic: Student must have the kit mapped AND at least one item from the kit must be pending
      if (selectedKitId && kitIdStr) {
        const isKitMapped = record.mappedProducts.some(p => String(p._id) === kitIdStr);
        if (!isKitMapped) return false;

        // IMPORTANT: When a kit is received, the transaction stores the KIT's name in items map, not component names
        // So we need to check: 1) Is the kit itself received? 2) If not, check individual components
        const kitKey = selectedKit._key; // The kit's own key (e.g., "engineering_kit")

        // If kit is fully received (kit key exists in items map), student has no pending items from this kit
        if (student._itemsMap[kitKey]) {
          return false; // Kit fully received, no pending items
        }

        // Kit not fully received - check if any components are pending
        if (selectedKit.isSet) {
          const kitComponentsKeys = (selectedKit.setItems || []).map(si =>
            getItemKey(si.product?.name || si.productNameSnapshot)
          );
          const hasPendingKitItem = kitComponentsKeys.some(key => !student._itemsMap[key]);
          if (!hasPendingKitItem) return false; // All components received but kit key not set (edge case)
        } else {
          // Non-set kit: if kit key not in map, it's pending
          // (already checked above, but keeping for clarity)
        }
      }

      if (searchValue) {
        const matchesSearch =
          student.name?.toLowerCase().includes(searchValue) ||
          student.studentId?.toLowerCase().includes(searchValue);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [dueStudents, dueFilters]);

  // dueStats removed

  // Pagination calculations (client-side) removed
  // Helper for UI "Showing X to Y"
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + students.length;
  // paginatedDueStudents removed

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dueFilters.search, dueFilters.course, dueFilters.year, dueFilters.branch, dueFilters.semester]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(Number(newItemsPerPage));
    setCurrentPage(1);
  };

  const formatCurrencyForPDF = (amount) => {
    return `Rs ${Number(amount || 0).toFixed(2)}`;
  };

  const handleGenerateReport = () => {
    // Initialize report filters with current dueFilters
    setReportFilters({
      course: dueFilters.course || '',
      branch: dueFilters.branch || '',
      semester: dueFilters.semester || '',
      kit: dueFilters.kit || '', // Keep for sync, but we use selectedKits mostly now
      selectedKits: dueFilters.kit ? [dueFilters.kit] : [],
      includeSummary: true,
      includeItemDetails: false,
    });
    setShowReportModal(true);
  };

  const handleReportGenerate = async () => {
    try {
      setGeneratingReport(true);
      // Fetch ALL matching students for report (ignore client pagination)
      const query = new URLSearchParams({
        page: 1,
        limit: 1000000, // Fetch effectively all
        search: reportFilters.course ? '' : dueFilters.search,
        course: reportFilters.course,
        branch: reportFilters.branch,
        year: reportFilters.year,
        semester: reportFilters.semester,
        // Send multiple kit IDs if selected, otherwise fallback to single kit
        ...(reportFilters.selectedKits.length > 0
          ? { kitIds: reportFilters.selectedKits.join(',') }
          : reportFilters.kit ? { kitId: reportFilters.kit } : {})
      });

      const response = await fetch(apiUrl(`/api/sql/dues?${query.toString()}`));
      if (!response.ok) throw new Error('Failed to fetch report data');

      const data = await response.json();
      const filteredForReport = data.students || [];

      // Calculate global stats
      const reportStats = data.stats || {};
      const totalPendingAmount = reportStats.totalPendingAmount || filteredForReport.reduce((sum, record) => sum + (record.totalDue || 0), 0);
      const totalPendingStudents = filteredForReport.length;

      const totalEnrolled = reportStats.totalEnrolled || totalPendingStudents;
      const paidStudents = reportStats.paidStudents || 0;
      const branchStats = reportStats.branchStats || {};

      // Group Data: Course -> Branch -> Year -> Students
      const groupedData = {};

      filteredForReport.forEach(record => {
        const course = record.student.course ? record.student.course.toUpperCase() : 'UNKNOWN COURSE';
        const branch = record.student.branch ? record.student.branch.toUpperCase() : 'COMMON / NO BRANCH';
        const year = record.student.year ? `Year ${record.student.year}` : 'Unknown Year';

        if (!groupedData[course]) groupedData[course] = {};
        if (!groupedData[course][branch]) groupedData[course][branch] = {};
        if (!groupedData[course][branch][year]) groupedData[course][branch][year] = [];

        groupedData[course][branch][year].push(record);
      });

      // Generate PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Helper to check page break
      let yPos = 20;
      const pageHeight = pdf.internal.pageSize.height;

      // Header Function
      const drawHeader = () => {
        pdf.setFontSize(16);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'bold');

        const selectedKitsCount = reportFilters.selectedKits.length;
        let reportTitle = 'Stationary Pending Students List';

        if (selectedKitsCount === 1) {
          const kit = normalizedProducts.find(p => String(p._id) === String(reportFilters.selectedKits[0]));
          if (kit) reportTitle = `Stationary Pending List: ${kit.name}`;
        } else if (selectedKitsCount > 1) {
          reportTitle = `Stationary Pending List: ${selectedKitsCount} Kits Selected`;
        }

        pdf.text(reportTitle, 105, 15, { align: 'center' });

        // Stats in header
        if (reportFilters.includeSummary) {
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          const statsText = `Total Students: ${totalEnrolled} | Paid: ${paidStudents} | Unpaid: ${totalPendingStudents} | Total Due: ${formatCurrencyForPDF(totalPendingAmount)}`;
          pdf.text(statsText, 105, 22, { align: 'center' });
        }

        pdf.setDrawColor(200, 200, 200);
        pdf.line(20, 25, 190, 25);
        yPos = 35;
      };

      const checkPageBreak = (neededSpace) => {
        if (yPos + neededSpace > pageHeight - 20) {
          pdf.addPage();
          yPos = 20;
          return true;
        }
        return false;
      };

      drawHeader();

      // Iterate and Render
      const sortedCourses = Object.keys(groupedData).sort();

      sortedCourses.forEach((course, courseIndex) => {
        const branches = groupedData[course];
        const sortedBranches = Object.keys(branches).sort();

        sortedBranches.forEach((branch, branchIndex) => {
          // Force new page for every branch except the very first one of the first course
          if (courseIndex > 0 || branchIndex > 0) {
            pdf.addPage();
            drawHeader();
          }

          const years = branches[branch];
          const sortedYears = Object.keys(years).sort();

          sortedYears.forEach((year) => {
            const studentsInGroup = years[year];

            // Check if we need space for header + table header + 1 row
            checkPageBreak(30);

            // Combined Header: Course / Branch / Year
            pdf.setFontSize(12);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont(undefined, 'bold');

            const headerText = `Course: ${course}    Branch: ${branch}    ${year}`;
            const headerWidth = pdf.getTextWidth(headerText);
            pdf.text(headerText, 20, yPos);

            // Move Branch Stats to the same row if enabled
            if (reportFilters.includeSummary && branchStats[branch]) {
              const b = branchStats[branch];
              pdf.setFontSize(9);
              pdf.setFont(undefined, 'normal');
              const bStatsText = `(Total: ${b.total} | Paid: ${b.paid} | Unpaid: ${b.unpaid})`;
              // Small vertical adjustment (0.5mm) to visually center smaller text with larger header
              pdf.text(bStatsText, 20 + headerWidth + 5, yPos - 0.5);
            }

            yPos += 6;

            // Define group variables for filtering
            const branchNorm = normalizeValue(branch);
            const yearNum = parseInt(year.replace(/\D/g, ''));
            
            // Find kits matching this specific group (Branch, Course, Year)
            const allMatchingKits = normalizedProducts.filter(p => {
              if (!p.isSet) return false;
              if (normalizeValue(course) !== p._normalizedCourse) return false;
              
              const isCommonBranch = branchNorm === 'common / no branch' || branchNorm === 'common';
              const kitHasBranches = p._normalizedBranches && p._normalizedBranches.length > 0;
              
              let isBranchMatch = false;
              const kitNameNorm = normalizeValue(p.name);
              
              if (isCommonBranch) {
                isBranchMatch = !kitHasBranches; 
              } else if (kitHasBranches) {
                isBranchMatch = p._normalizedBranches.includes(branchNorm);
              } else {
                const hasThisBranch = kitNameNorm.includes(branchNorm);
                const allOtherBranchNorms = branchOptions
                  .map(b => normalizeValue(b))
                  .filter(b => b && b !== branchNorm && b !== 'common' && b !== 'common / no branch');
                const hasOtherMoreSpecificBranch = allOtherBranchNorms.some(other => 
                  kitNameNorm.includes(other) && (other.length >= branchNorm.length)
                );
                isBranchMatch = hasThisBranch && !hasOtherMoreSpecificBranch;
              }

              const isYearMatch = isNaN(yearNum) || p._years.length === 0 || p._years.includes(yearNum);
              return isBranchMatch && isYearMatch;
            });

            // If user explicitly selected kits, only show those THAT ALSO match this branch/year
            let kitsToDisplay = allMatchingKits;
            if (reportFilters.selectedKits.length > 0) {
              kitsToDisplay = allMatchingKits.filter(p => reportFilters.selectedKits.includes(String(p._id)));
            }

            if (kitsToDisplay.length > 0) {
              pdf.setFontSize(9);
              pdf.setFont(undefined, 'bold');
              // Use Rs instead of ₹ symbol to avoid "spaced-out" encoding issues in PDF
              const kitText = kitsToDisplay.map(k => `${k.name} (Price: Rs ${Number(k.price).toFixed(2)})`).join(' | ');
              
              // Wrap long kit lists
              const splitKitText = pdf.splitTextToSize(`Associated Kit: ${kitText}`, 170);
              pdf.text(splitKitText, 20, yPos);
              yPos += (splitKitText.length * 4) + 1;
            }

            yPos += 3;

            // Table Header
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont(undefined, 'bold');
            pdf.setFillColor(230, 230, 230);
            pdf.rect(20, yPos - 3, 170, 6, 'F');

            const colName = 22;
            const colRoll = 105;
            const colRemarks = 150;

            pdf.text('Student Name', colName, yPos + 1);
            pdf.text('Roll Number', colRoll, yPos + 1);
            // Changed to "Remark" as per user example output
            const remarksLabel = reportFilters.includeItemDetails ? 'Pending Items' : 'Remark';
            pdf.text(remarksLabel, colRemarks, yPos + 1);
            yPos += 8;

            // Table Rows
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(9);

            studentsInGroup.forEach((record, index) => {
              const student = record.student;
              const hasSelectedKits = reportFilters.selectedKits.length > 0;

              const relevantKits = hasSelectedKits
                ? normalizedProducts.filter(p => reportFilters.selectedKits.includes(String(p._id)))
                : reportFilters.kit
                  ? [normalizedProducts.find(p => String(p._id) === String(reportFilters.kit))].filter(Boolean)
                  : [];

              // Determine row height based on content
              let rowHeight = 8;
              let splitItems = null;

              if (reportFilters.includeItemDetails) {
                let displayItems = record.pendingItems;
                if (relevantKits.length > 0) {
                  const relevantKeys = new Set();
                  relevantKits.forEach(kit => {
                    relevantKeys.add(kit._key);
                    if (kit.isSet) {
                      (kit.setItems || []).forEach(si => {
                        relevantKeys.add(getItemKey(si.product?.name || si.productNameSnapshot));
                      });
                    }
                  });
                  displayItems = record.pendingItems.filter(pi => relevantKeys.has(pi._key));
                }
                const itemNames = displayItems.map(pi => pi.name).join(', ');
                splitItems = pdf.splitTextToSize(itemNames, 35);
                if (splitItems.length > 1) {
                  rowHeight += (splitItems.length - 1) * 4;
                }
              }

              if (checkPageBreak(rowHeight)) {
                // Redraw headers if page break
                pdf.setFont(undefined, 'bold');
                pdf.setFontSize(9);
                pdf.setFillColor(230, 230, 230);
                pdf.rect(20, yPos - 3, 170, 6, 'F');
                pdf.text('Student Name', colName, yPos + 1);
                pdf.text('Roll Number', colRoll, yPos + 1);
                pdf.text(remarksLabel, colRemarks, yPos + 1);
                yPos += 8;
                pdf.setFont(undefined, 'normal');
                pdf.setFontSize(9);
              }

              if (index % 2 === 0) {
                pdf.setFillColor(250, 250, 250);
                pdf.rect(20, yPos - 3, 170, rowHeight, 'F');
              }

              pdf.text((student.name || 'N/A').substring(0, 45), colName, yPos + 2);
              pdf.text((student.pin || student.studentId || 'N/A'), colRoll, yPos + 2);

              if (reportFilters.includeItemDetails && splitItems) {
                pdf.text(splitItems, colRemarks, yPos + 2);
              } else {
                // Return empty string for Remarks column as requested
                pdf.text('', colRemarks, yPos + 2);
              }

              yPos += rowHeight;
            });

            yPos += 5; // Spacing after year table
          });
          yPos += 2; // Spacing after branch section
        });
        yPos += 5; // Extra spacing after course section
      });

      // Footer
      const pageCount = pdf.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
        pdf.text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 105, 290, { align: 'center' });
      }

      const fileName = `Student_Due_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      setShowReportModal(false);
      alert('PDF report generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF report');
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <ClipboardList className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Student Due</h1>
              <p className="text-gray-600 mt-1">Track students who still need their mapped stationery items</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateReport}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl font-medium"
            >
              <Download size={20} />
              Generate Report
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white">Students Pending</p>
                  <p className="text-2xl font-semibold text-white mt-1">{stats.totalStudents || 0}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
              </div>
              <p className="text-xs text-white/90 mt-3">Students who still need their mapped items</p>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white">Due Amount</p>
                  <p className="text-2xl font-semibold text-white mt-1">{formatCurrency(stats.totalPendingAmount)}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
              </div>
              <p className="text-xs text-white/90 mt-3">{stats.totalPendingItems} pending item(s) to issue</p>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white">Courses Impacted</p>
                  <p className="text-2xl font-semibold text-white mt-1">{stats.impactedCourses}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Building2 size={20} />
                </div>
              </div>
              <p className="text-xs text-white/90 mt-3">Courses with at least one pending student</p>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-full lg:w-68 shrink-0">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search students..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                value={dueFilters.search}
                onChange={(e) => setDueFilters({ ...dueFilters, search: e.target.value })}
              />
            </div>

            <select
              value={dueFilters.course}
              onChange={(e) => setDueFilters({ ...dueFilters, course: e.target.value, branch: '', year: '', semester: '' })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm w-full lg:w-auto"
            >
              <option value="">Select Course</option>
              {courseOptions.map(course => (
                <option key={course} value={course}>{course.toUpperCase()}</option>
              ))}
            </select>

            <select
              value={dueFilters.branch}
              onChange={(e) => setDueFilters({ ...dueFilters, branch: e.target.value, year: '', semester: '' })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm w-full lg:w-auto disabled:opacity-50"
              disabled={!dueFilters.course && branchOptions.length === 0}
            >
              <option value="">All Branches</option>
              {branchOptions.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>

            <select
              value={dueFilters.year}
              onChange={(e) => setDueFilters({ ...dueFilters, year: e.target.value })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm w-full lg:w-auto"
            >
              <option value="">All Years</option>
              {yearOptions.map(year => (
                <option key={year} value={String(year)}>{`Year ${year}`}</option>
              ))}
            </select>

            <select
              value={dueFilters.semester}
              onChange={(e) => setDueFilters({ ...dueFilters, semester: e.target.value })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm w-full lg:w-auto"
            >
              <option value="">All Semesters</option>
              {semesterOptions.map(semester => (
                <option key={semester} value={String(semester)}>{`Semester ${semester}`}</option>
              ))}
            </select>

            <select
              value={dueFilters.kit}
              onChange={(e) => setDueFilters({ ...dueFilters, kit: e.target.value })}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm w-full lg:w-auto"
            >
              <option value="">All Kits/Sets</option>
              {kitOptions.map(kit => (
                <option key={kit._id} value={kit._id}>{kit.name}</option>
              ))}
            </select>

            {/* Reset Button */}
            <button
              onClick={() => setDueFilters({ search: '', course: '', year: '', branch: '', semester: '', kit: '' })}
              className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm w-full lg:w-auto ml-auto lg:ml-0"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Student Due Report</h3>
              <p className="text-sm text-gray-500">Students who have not yet received their mapped items</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Items per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                {stats.totalStudents || 0} student{(stats.totalStudents || 0) === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {(studentsLoading || productsLoading) && !refreshing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600">
                {studentsLoading && productsLoading
                  ? 'Loading students and products...'
                  : studentsLoading
                    ? 'Loading students...'
                    : 'Loading products...'}
              </p>
            </div>
          ) : (productsError || studentsError) ? (
            <div className="p-12 text-center space-y-4">
              <AlertCircle className="mx-auto text-red-500" size={48} />
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-1">
                  {productsError && studentsError
                    ? 'Unable to load data'
                    : productsError
                      ? 'Unable to load products'
                      : 'Unable to load students'}
                </h4>
                <p className="text-gray-600">{productsError || studentsError}</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          ) : (students || []).length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h4>
              <p className="text-gray-600">Every student has received the items mapped to their course and year.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course / Year</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Items</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(students || []).map(record => {
                      const student = record.student;
                      if (!student) return null; // Safe guard against missing student data
                      const totalMapped = record.mappedProducts?.length || 0;
                      const pendingCount = record.pendingItems.length;
                      const issuedCount = record.issuedCount;
                      const completion = totalMapped > 0 ? Math.round((issuedCount / totalMapped) * 100) : 0;
                      const studentKey = student._id || student.id || student.studentId || Math.random();

                      return (
                        <tr
                          key={studentKey}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/student/${student._id || student.id || studentKey}`)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{student.name}</span>
                              <span className="text-xs text-gray-500">{student.pin || student.studentId}</span>
                              {student.phoneNumber && (
                                <span className="text-xs text-gray-400 mt-0.5">{student.phoneNumber}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {student.course?.toUpperCase() || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">Year {student.year}{student.branch ? ` • ${student.branch}` : ''}</div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="flex flex-wrap gap-2">
                              {record.pendingItems.slice(0, 3).map(product =>
                                <span key={product._id || product.name} className="px-2 py-1 text-xs bg-rose-100 text-rose-700 rounded-full">
                                  {product.name}
                                </span>
                              )}
                              {pendingCount > 3 && (
                                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                  +{pendingCount - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-2">
                              {/* <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{issuedCount} issued</span>
                                <span>{pendingCount} pending</span>
                              </div> */}
                              {/* <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{formatCurrency(record.issuedValue)}</span>
                                <span>{formatCurrency(record.pendingValue)}</span>
                              </div> */}
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${completion}%` }}></div>
                              </div>
                              <p className="text-xs font-medium text-gray-600">{issuedCount}/{totalMapped}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-semibold text-rose-600">
                              {formatCurrency(record.totalDue)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-gray-600">
                      Shows <span className="font-semibold">
                        {students.length > 0 ? startIndex + 1 : 0}
                      </span> to {' '}
                      <span className="font-semibold">
                        {startIndex + students.length}
                      </span>{' '}
                      of <span className="font-semibold">{Math.max(stats.totalStudents || 0, startIndex + students.length)}</span> students
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} className="text-gray-700" />
                      </button>

                      <div className="flex items-center gap-1">
                        {/* First page */}
                        {currentPage > 3 && (
                          <>
                            <button
                              onClick={() => handlePageChange(1)}
                              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              1
                            </button>
                            {currentPage > 4 && (
                              <span className="px-2 text-gray-500">...</span>
                            )}
                          </>
                        )}

                        {/* Page numbers around current page */}
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            if (page === currentPage) return true;
                            if (page === currentPage - 1 || page === currentPage + 1) return true;
                            if (page === 1 || page === totalPages) return true;
                            return false;
                          })
                          .map(page => (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={`px-3 py-1 text-sm border rounded-lg transition-colors ${page === currentPage
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'border-gray-300 hover:bg-gray-100'
                                }`}
                            >
                              {page}
                            </button>
                          ))}

                        {/* Last page */}
                        {currentPage < totalPages - 2 && (
                          <>
                            {currentPage < totalPages - 3 && (
                              <span className="px-2 text-gray-500">...</span>
                            )}
                            <button
                              onClick={() => handlePageChange(totalPages)}
                              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              {totalPages}
                            </button>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} className="text-gray-700" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Report Generation Modal */}
      {showReportModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }} onClick={() => {
          setShowReportModal(false);
        }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Generate Student Due Report</h2>
              <button
                onClick={() => setShowReportModal(false)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">Configure filters and options for the student due report</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                  <select
                    value={reportFilters.course}
                    onChange={(e) => setReportFilters({ ...reportFilters, course: e.target.value, branch: '' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Courses</option>
                    {courseOptions.map(course => (
                      <option key={course} value={course}>{course.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                  <select
                    value={reportFilters.year}
                    onChange={(e) => setReportFilters({ ...reportFilters, year: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Years</option>
                    {reportYearOptions.map(year => (
                      <option key={year} value={String(year)}>{`Year ${year}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                  <select
                    value={reportFilters.branch}
                    onChange={(e) => setReportFilters({ ...reportFilters, branch: e.target.value, year: '', semester: '' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={!reportFilters.course && reportBranchOptions.length === 0}
                  >
                    <option value="">All Branches</option>
                    {reportBranchOptions.map(branch => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                  <select
                    value={reportFilters.semester}
                    onChange={(e) => setReportFilters({ ...reportFilters, semester: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Semesters</option>
                    {reportSemesterOptions.map(semester => (
                      <option key={semester} value={String(semester)}>{`Semester ${semester}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Kits / Sets Selection</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setReportFilters({ ...reportFilters, selectedKits: reportKitOptions.map(k => String(k._id)) })}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setReportFilters({ ...reportFilters, selectedKits: [] })}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-gray-50">
                    {reportKitOptions.length === 0 ? (
                      <p className="text-sm text-gray-500 col-span-2 text-center py-4">No kits available for these filters</p>
                    ) : (
                      reportKitOptions.map(kit => (
                        <div key={kit._id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`kit-${kit._id}`}
                            checked={reportFilters.selectedKits.includes(String(kit._id))}
                            onChange={(e) => {
                              const kitId = String(kit._id);
                              const newSelected = e.target.checked
                                ? [...reportFilters.selectedKits, kitId]
                                : reportFilters.selectedKits.filter(id => id !== kitId);
                              setReportFilters({ ...reportFilters, selectedKits: newSelected });
                            }}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <label htmlFor={`kit-${kit._id}`} className="text-sm text-gray-700 cursor-pointer line-clamp-1">
                            {kit.name}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                  {reportFilters.selectedKits.length > 0 && (
                    <p className="text-xs text-purple-600 mt-2 font-medium">
                      {reportFilters.selectedKits.length} kit(s) selected
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-200 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Report Options</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeSummary"
                      checked={reportFilters.includeSummary}
                      onChange={(e) => setReportFilters({ ...reportFilters, includeSummary: e.target.checked })}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="includeSummary" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Include summary statistics
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeItemDetails"
                      checked={reportFilters.includeItemDetails}
                      onChange={(e) => setReportFilters({ ...reportFilters, includeItemDetails: e.target.checked })}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="includeItemDetails" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Include pending item details for each student
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReportGenerate}
                  disabled={generatingReport}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {generatingReport ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      Generate PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDue;

