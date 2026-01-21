import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Users, ClipboardList, Building2, AlertCircle, Download, RefreshCw, ChevronLeft, ChevronRight, X, FileText, Calendar } from 'lucide-react';
import { apiUrl } from '../utils/api';
import jsPDF from 'jspdf';

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

const StudentDue = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [products, setProducts] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [studentsError, setStudentsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dueFilters, setDueFilters] = useState({ search: '', course: '', year: '', branch: '', semester: '', kit: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    course: '',
    year: '',
    branch: '',
    semester: '',
    kit: '',
    includeSummary: true,
    includeItemDetails: false,
  });
  const [receiptSettings, setReceiptSettings] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });

  useEffect(() => {
    fetchStudents();
    fetchProducts();
    fetchSettings();
  }, []);

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

  const fetchStudents = useCallback(async () => {
    try {
      setStudentsLoading(true);
      setStudentsError('');
      const response = await fetch(apiUrl('/api/users'));
      if (response.ok) {
        const data = await response.json();
        setStudents(Array.isArray(data) ? data : []);
        // Normalize courses: convert to lowercase and trim, then create a map to preserve original casing
        const courseMap = new Map();
        (data || []).forEach(student => {
          if (student.course) {
            const normalized = student.course.toLowerCase().trim();
            // Store the first occurrence with original casing
            if (!courseMap.has(normalized)) {
              courseMap.set(normalized, student.course.trim());
            }
          }
        });
        const uniqueCourses = Array.from(courseMap.values());
        setCourses(uniqueCourses);
      } else {
        throw new Error('Failed to fetch students');
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudentsError(error.message || 'Failed to load students');
    } finally {
      setStudentsLoading(false);
    }
  }, []);

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
    try {
      await Promise.all([fetchStudents(), fetchProducts()]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchStudents, fetchProducts]);

  const courseOptions = useMemo(() => {
    // Further deduplicate and normalize for display
    const normalizedMap = new Map();
    courses.forEach(course => {
      if (course) {
        const normalized = course.toLowerCase().trim();
        if (!normalizedMap.has(normalized)) {
          normalizedMap.set(normalized, course.trim());
        }
      }
    });
    return Array.from(normalizedMap.values())
      .sort((a, b) => a.localeCompare(b));
  }, [courses]);

  const yearOptions = useMemo(() => {
    const years = new Set();
    students.forEach(student => {
      const numericYear = Number(student.year);
      if (!Number.isNaN(numericYear) && numericYear > 0) {
        years.add(numericYear);
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [students]);

  const semesterOptions = useMemo(() => {
    const semesters = new Set();
    students.forEach(student => {
      const numericSemester = Number(student.semester);
      if (!Number.isNaN(numericSemester) && numericSemester > 0) {
        semesters.add(numericSemester);
      }
    });
    return Array.from(semesters).sort((a, b) => a - b);
  }, [students]);

  const branchOptions = useMemo(() => {
    if (!dueFilters.course) {
      // If no course selected, show all branches from all students
      const branches = new Set();
      students.forEach(student => {
        if (student.branch && student.branch.trim()) {
          branches.add(student.branch.trim());
        }
      });
      return Array.from(branches).sort((a, b) => a.localeCompare(b));
    }

    // Filter branches by selected course
    const courseNormalized = normalizeValue(dueFilters.course);
    const branches = new Set();
    students.forEach(student => {
      if (normalizeValue(student.course) === courseNormalized && student.branch && student.branch.trim()) {
        branches.add(student.branch.trim());
      }
    });
    return Array.from(branches).sort((a, b) => a.localeCompare(b));
  }, [students, dueFilters.course]);


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
  const normalizedStudents = useMemo(() => {
    return students.map(student => ({
      ...student,
      _normalizedCourse: normalizeValue(student.course),
      _normalizedBranch: normalizeValue(student.branch),
      _year: Number(student.year),
      _semester: Number(student.semester),
      _itemsMap: student.items || {},
    }));
  }, [students]);

  const dueStudents = useMemo(() => {
    if (!normalizedStudents.length || !normalizedProducts.length) return [];

    const records = [];

    // Optimize: group products by course first to reduce iterations
    const productsByCourse = new Map();
    normalizedProducts.forEach(product => {
      if (!product._normalizedCourse) return;
      if (!productsByCourse.has(product._normalizedCourse)) {
        productsByCourse.set(product._normalizedCourse, []);
      }
      productsByCourse.get(product._normalizedCourse).push(product);
    });

    for (const student of normalizedStudents) {
      // Early exit if student has no course
      if (!student._normalizedCourse) continue;

      // Get products for this course only (reduces filter iterations)
      const courseProducts = productsByCourse.get(student._normalizedCourse) || [];
      if (!courseProducts.length) continue;

      // Filter products matching student's year and branch OR specific assignment
      const mappedProducts = [];
      for (const product of courseProducts) {
        // NEW: Check applicability mode
        if (product._applicabilityMode === 'students') {
          if (product._applicableStudents.has(String(student._id))) {
            mappedProducts.push(product);
          }
          // If 'students' mode and not in list, SKIP
          continue;
        }

        // Rule-Based Logic (Existing)
        // Year filter
        if (product._years.length > 0 && !product._years.includes(student._year)) {
          continue;
        }

        // Semester match (products with specific semesters vs student semester)
        if (product._semesters.length > 0) {
          if (!student._semester || !product._semesters.includes(student._semester)) {
            continue;
          }
        }

        // Branch filter
        if (product._normalizedBranches.length > 0) {
          if (!product._normalizedBranches.includes(student._normalizedBranch)) {
            continue;
          }
        }

        mappedProducts.push(product);
      }

      if (!mappedProducts.length) continue;

      // Find pending items
      const pendingItems = [];
      for (const product of mappedProducts) {
        if (!student._itemsMap[product._key]) {
          pendingItems.push(product);
        }
      }

      if (!pendingItems.length) continue;

      // Calculate values
      const issuedCount = mappedProducts.length - pendingItems.length;
      let mappedValue = 0;
      let pendingValue = 0;

      for (const product of mappedProducts) {
        const price = Number(product.price) || 0;
        mappedValue += price;
      }

      for (const product of pendingItems) {
        const price = Number(product.price) || 0;
        pendingValue += price;
      }

      const issuedValue = Math.max(mappedValue - pendingValue, 0);

      records.push({
        student,
        mappedProducts,
        pendingItems,
        issuedCount,
        mappedValue,
        pendingValue,
        issuedValue,
      });
    }

    // Sort records
    return records.sort((a, b) => {
      const courseCompare = (a.student.course || '').localeCompare(b.student.course || '');
      if (courseCompare !== 0) return courseCompare;

      const yearDifference = Number(a.student.year) - Number(b.student.year);
      if (yearDifference !== 0) return yearDifference;

      return (a.student.name || '').localeCompare(b.student.name || '');
    });
  }, [normalizedStudents, normalizedProducts]);

  const filteredDueStudents = useMemo(() => {
    const searchValue = dueFilters.search.trim().toLowerCase();
    const selectedCourse = normalizeValue(dueFilters.course);
    const selectedYear = Number(dueFilters.year);
    const selectedBranch = dueFilters.branch ? normalizeValue(dueFilters.branch) : null;
    const selectedSemester = dueFilters.semester ? Number(dueFilters.semester) : null;
    const selectedKitId = dueFilters.kit;

    // Kit specific filter logic: find if the kit is assigned to this student
    const selectedKit = selectedKitId ? normalizedProducts.find(p => p._id === selectedKitId) : null;
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
      if (selectedKitId) {
        const isKitMapped = record.mappedProducts.some(p => p._id === selectedKitId);
        if (!isKitMapped) return false;

        // Check if ANY component of this kit is in pendingItems
        const kitComponentsKeys = selectedKit.isSet
          ? (selectedKit.setItems || []).map(si => getItemKey(si.product?.name || si.productNameSnapshot))
          : [selectedKit._key];

        const hasPendingKitItem = kitComponentsKeys.some(key => !student._itemsMap[key]);
        if (!hasPendingKitItem) return false;
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

  const dueStats = useMemo(() => {
    const totalPendingItems = filteredDueStudents.reduce((sum, record) => sum + record.pendingItems.length, 0);
    const totalPendingAmount = filteredDueStudents.reduce((sum, record) => sum + record.pendingValue, 0);
    const impactedCourses = new Set(
      filteredDueStudents.map(record => (record.student.course || '').toUpperCase())
    );

    return {
      totalStudents: filteredDueStudents.length,
      totalPendingItems,
      totalPendingAmount,
      impactedCourses: impactedCourses.size,
    };
  }, [filteredDueStudents]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredDueStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDueStudents = useMemo(() => {
    return filteredDueStudents.slice(startIndex, endIndex);
  }, [filteredDueStudents, startIndex, endIndex]);

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
      year: dueFilters.year || '',
      branch: dueFilters.branch || '',
      semester: dueFilters.semester || '',
      kit: dueFilters.kit || '',
      includeSummary: true,
      includeItemDetails: false,
    });
    setShowReportModal(true);
  };

  const handleReportGenerate = async () => {
    try {
      // Filter dueStudents based on reportFilters
      const filteredForReport = dueStudents.filter(record => {
        const { student } = record;
        const selectedCourse = normalizeValue(reportFilters.course);
        const selectedYear = Number(reportFilters.year);
        const selectedBranch = reportFilters.branch ? normalizeValue(reportFilters.branch) : null;
        const selectedSemester = reportFilters.semester ? Number(reportFilters.semester) : null;
        const selectedKitId = reportFilters.kit;

        if (selectedCourse && normalizeValue(student.course) !== selectedCourse) return false;
        if (!Number.isNaN(selectedYear) && selectedYear > 0 && Number(student.year) !== selectedYear) return false;
        if (selectedBranch && normalizeValue(student.branch) !== selectedBranch) return false;
        if (selectedSemester !== null && !Number.isNaN(selectedSemester) && selectedSemester > 0) {
          const studentSemester = Number(student.semester);
          if (Number.isNaN(studentSemester) || studentSemester !== selectedSemester) return false;
        }

        // Kit filter logic for report
        if (selectedKitId) {
          const isKitMapped = record.mappedProducts.some(p => p._id === selectedKitId);
          if (!isKitMapped) return false;

          const selectedKit = normalizedProducts.find(p => p._id === selectedKitId);
          const kitComponentsKeys = selectedKit && selectedKit.isSet
            ? (selectedKit.setItems || []).map(si => getItemKey(si.product?.name || si.productNameSnapshot))
            : selectedKit ? [selectedKit._key] : [];

          const hasPendingKitItem = kitComponentsKeys.some(key => !student._itemsMap[key]);
          if (!hasPendingKitItem) return false;
        }

        return true;
      });

      // Calculate Paid/Unpaid counts for the report summary
      let reportPaidCount = 0;
      let reportUnpaidCount = 0;
      let reportTotalStudents = 0;

      // Helper to check status (Paid/Unpaid) for filtered students
      // We process all students matching the filters to get accurate counts
      const studentsMatchingFilters = normalizedStudents.filter(student => {
        const selectedCourse = normalizeValue(reportFilters.course);
        const selectedYear = Number(reportFilters.year);
        const selectedBranch = reportFilters.branch ? normalizeValue(reportFilters.branch) : null;
        const selectedSemester = reportFilters.semester ? Number(reportFilters.semester) : null;

        if (selectedCourse && normalizeValue(student.course) !== selectedCourse) return false;
        if (!Number.isNaN(selectedYear) && selectedYear > 0 && Number(student.year) !== selectedYear) return false;
        if (selectedBranch && normalizeValue(student.branch) !== selectedBranch) return false;
        if (selectedSemester !== null && !Number.isNaN(selectedSemester) && selectedSemester > 0) {
          const studentSemester = Number(student.semester);
          if (Number.isNaN(studentSemester) || studentSemester !== selectedSemester) return false;
        }
        return true;
      });

      // Products map for faster lookup
      const productsByCourse = new Map();
      normalizedProducts.forEach(product => {
        if (!product._normalizedCourse) return;
        if (!productsByCourse.has(product._normalizedCourse)) {
          productsByCourse.set(product._normalizedCourse, []);
        }
        productsByCourse.get(product._normalizedCourse).push(product);
      });

      studentsMatchingFilters.forEach(student => {
        if (!student._normalizedCourse) return;
        const courseProducts = productsByCourse.get(student._normalizedCourse) || [];
        if (!courseProducts.length) return;

        // Check if student has applicable products
        const applicableProds = courseProducts.filter(product => {
          if (product._years.length > 0 && !product._years.includes(student._year)) return false;
          if (product._semesters.length > 0 && (!student._semester || !product._semesters.includes(student._semester))) return false;
          if (product._normalizedBranches.length > 0 && !product._normalizedBranches.includes(student._normalizedBranch)) return false;
          return true;
        });

        if (applicableProds.length === 0) return; // Not applicable for this student

        // Kit specific counting logic
        if (reportFilters.kit) {
          const isKitMapped = applicableProds.some(p => p._id === reportFilters.kit);
          if (!isKitMapped) return; // This student is not mapped to the selected kit

          const selectedKit = normalizedProducts.find(p => p._id === reportFilters.kit);
          const kitComponentsKeys = selectedKit && selectedKit.isSet
            ? (selectedKit.setItems || []).map(si => getItemKey(si.product?.name || si.productNameSnapshot))
            : selectedKit ? [selectedKit._key] : [];

          reportTotalStudents++;
          const hasPending = kitComponentsKeys.some(key => !student._itemsMap[key]);
          if (hasPending) {
            reportUnpaidCount++;
          } else {
            reportPaidCount++;
          }
          return;
        }

        // Default counting logic (all applicable products)
        reportTotalStudents++;
        const hasPending = applicableProds.some(product => !student._itemsMap[product._key]);
        if (hasPending) {
          reportUnpaidCount++;
        } else {
          reportPaidCount++;
        }
      });

      // Generate PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Header Section
      pdf.setFontSize(16);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'bold');

      const selectedKit = reportFilters.kit ? normalizedProducts.find(p => p._id === reportFilters.kit) : null;
      const reportTitle = selectedKit
        ? `Stationary Pending List: ${selectedKit.name}`
        : 'Stationary Pending Students List';

      pdf.text(reportTitle, 105, 15, { align: 'center' });

      // Draw line under header
      pdf.setDrawColor(200, 200, 200);
      pdf.line(20, 20, 190, 20);

      let yPos = 28;

      // Report Info Section (Condensed)
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');

      const filterParts = [];
      if (reportFilters.course) filterParts.push(`Course: ${reportFilters.course.toUpperCase()}`);
      if (reportFilters.year) filterParts.push(`Year: ${reportFilters.year}`);
      if (reportFilters.branch) filterParts.push(`Branch: ${reportFilters.branch}`);
      if (reportFilters.semester) filterParts.push(`Semester: ${reportFilters.semester}`);
      if (selectedKit) filterParts.push(`Kit: ${selectedKit.name}`);

      // Just display filters without "Report Information" label
      if (filterParts.length > 0) {
        pdf.text(filterParts.join("   |   "), 105, yPos, { align: 'center' });
        yPos += 5;
      }

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      // Generated on date removed from top as it appears in footer
      yPos += 3;

      // Student Details Table & Statistics Merged
      if (filteredForReport.length > 0) {
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');

        // Header Background
        pdf.setFillColor(240, 240, 240);
        pdf.rect(20, yPos - 4, 170, 6, 'F');

        // Left side: Title
        pdf.text('Student Due Details', 20, yPos);

        // Right side: Statistics (Merged into same line)
        if (reportFilters.includeSummary) {
          const totalPendingAmount = filteredForReport.reduce((sum, record) => sum + record.pendingValue, 0);
          // NEW SUMMARY FORMAT: Paid | Unpaid | Total Students | Pending Amount
          const statsText = `Paid: ${reportPaidCount} | Unpaid: ${reportUnpaidCount} | Total Students: ${reportTotalStudents} | Amount: ${formatCurrencyForPDF(totalPendingAmount)}`;

          pdf.setFontSize(9); // Slightly smaller for stats
          pdf.text(statsText, 190, yPos, { align: 'right' });
          pdf.setFontSize(10); // Reset for next elements if needed
        }

        yPos += 7;

        // Table Headers
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(230, 230, 230);
        pdf.rect(20, yPos - 3, 170, 6, 'F');

        // Define column positions
        const colName = 22;
        const colRoll = 85;
        const colPhone = 120;
        const colRemarks = 155;

        pdf.text('Student Name', colName, yPos + 1);
        pdf.text('Roll Number', colRoll, yPos + 1);
        pdf.text('Mobile', colPhone, yPos + 1);

        const remarksLabel = reportFilters.includeItemDetails ? 'Pending Items' : 'Remarks';
        pdf.text(remarksLabel, colRemarks, yPos + 1);
        yPos += 8;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(9);

        filteredForReport.forEach((record, index) => {
          console.log('PDF Record:', record.student.name, record.student.phoneNumber);
          // Check if we need a new page
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
            // Redraw table headers on new page
            pdf.setFont(undefined, 'bold');
            pdf.setFontSize(9);
            pdf.setFillColor(230, 230, 230);
            pdf.rect(20, yPos - 3, 170, 6, 'F');
            pdf.text('Student Name', colName, yPos + 1);
            pdf.text('Roll Number', colRoll, yPos + 1);
            pdf.text('Mobile', colPhone, yPos + 1);
            pdf.text('Remarks', colRemarks, yPos + 1);
            yPos += 8;
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(9);
          }

          const student = record.student;
          const studentName = (student.name || 'N/A').substring(0, 40);
          const studentId = (student.studentId || 'N/A');
          // Ensure phone number is treated as string
          const phone = student.phoneNumber ? String(student.phoneNumber) : 'N/A';

          // Alternate row background
          if (index % 2 === 0) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(20, yPos - 3, 170, 8, 'F');
          }

          pdf.text(studentName, colName, yPos + 2);
          pdf.text(studentId, colRoll, yPos + 2);
          pdf.text(phone, colPhone, yPos + 2);

          if (reportFilters.includeItemDetails) {
            // Show only items from the selected kit if a kit is filtered
            let displayItems = record.pendingItems;
            if (selectedKit) {
              const kitComponentsKeys = selectedKit.isSet
                ? (selectedKit.setItems || []).map(si => getItemKey(si.product?.name || si.productNameSnapshot))
                : [selectedKit._key];
              displayItems = record.pendingItems.filter(pi => kitComponentsKeys.includes(pi._key));
            }

            const itemNames = displayItems.map(pi => pi.name).join(', ');
            const splitItems = pdf.splitTextToSize(itemNames, 40);
            pdf.text(splitItems, colRemarks, yPos + 2);

            // Adjust yPos if items wrap
            const lines = splitItems.length;
            if (lines > 1) {
              yPos += (lines - 1) * 4;
            }
          }

          yPos += 8;

          // Separator line REMOVED as requested
        });
      } else {
        pdf.setFontSize(10);
        pdf.text('No students found with pending items for the selected filters.', 20, yPos);
      }

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

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white">Students Pending</p>
                  <p className="text-2xl font-semibold text-white mt-1">{dueStats.totalStudents}</p>
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
                  <p className="text-2xl font-semibold text-white mt-1">{formatCurrency(dueStats.totalPendingAmount)}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
              </div>
              <p className="text-xs text-white/90 mt-3">{dueStats.totalPendingItems} pending item(s) to issue</p>
            </div>

            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white">Courses Impacted</p>
                  <p className="text-2xl font-semibold text-white mt-1">{dueStats.impactedCourses}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Building2 size={20} />
                </div>
              </div>
              <p className="text-xs text-white/90 mt-3">Courses with at least one pending student</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={dueFilters.search}
                onChange={(e) => setDueFilters({ ...dueFilters, search: e.target.value })}
                placeholder="Search by student name or ID"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <select
                value={dueFilters.course}
                onChange={(e) => setDueFilters({ ...dueFilters, course: e.target.value, branch: '' })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Courses</option>
                {courseOptions.map(course => (
                  <option key={course} value={course}>{course.toUpperCase()}</option>
                ))}
              </select>
              <select
                value={dueFilters.year}
                onChange={(e) => setDueFilters({ ...dueFilters, year: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Years</option>
                {yearOptions.map(year => (
                  <option key={year} value={String(year)}>{`Year ${year}`}</option>
                ))}
              </select>
              <select
                value={dueFilters.branch}
                onChange={(e) => setDueFilters({ ...dueFilters, branch: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!dueFilters.course && branchOptions.length === 0}
              >
                <option value="">All Branches</option>
                {branchOptions.map(branch => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              <select
                value={dueFilters.semester}
                onChange={(e) => setDueFilters({ ...dueFilters, semester: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Semesters</option>
                {semesterOptions.map(semester => (
                  <option key={semester} value={String(semester)}>{`Semester ${semester}`}</option>
                ))}
              </select>
              <select
                value={dueFilters.kit}
                onChange={(e) => setDueFilters({ ...dueFilters, kit: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Kits/Sets</option>
                {kitOptions.map(kit => (
                  <option key={kit._id} value={kit._id}>{kit.name}</option>
                ))}
              </select>
              <button
                onClick={() => setDueFilters({ search: '', course: '', year: '', branch: '', semester: '', kit: '' })}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Reset
              </button>
            </div>
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
                {filteredDueStudents.length} student{filteredDueStudents.length === 1 ? '' : 's'}
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
          ) : filteredDueStudents.length === 0 ? (
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
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Count</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedDueStudents.map(record => {
                      const student = record.student;
                      const totalMapped = record.mappedProducts.length;
                      const pendingCount = record.pendingItems.length;
                      const issuedCount = record.issuedCount;
                      const completion = totalMapped > 0 ? Math.round((issuedCount / totalMapped) * 100) : 0;
                      const studentKey = student._id || student.id || student.studentId;

                      return (
                        <tr key={studentKey} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{student.name}</span>
                              <span className="text-xs text-gray-500">{student.studentId}</span>
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
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{issuedCount} issued</span>
                                <span>{pendingCount} pending</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{formatCurrency(record.issuedValue)}</span>
                                <span>{formatCurrency(record.pendingValue)}</span>
                              </div>
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${completion}%` }}></div>
                              </div>
                              <p className="text-xs font-medium text-gray-600">{completion}% complete</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-semibold text-rose-600">{formatCurrency(record.pendingValue)}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold">
                              {pendingCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => navigate(`/student/${student._id || student.id || studentKey}`)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <Eye size={16} />
                              View Student
                            </button>
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
                      Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                      <span className="font-semibold">
                        {Math.min(endIndex, filteredDueStudents.length)}
                      </span>{' '}
                      of <span className="font-semibold">{filteredDueStudents.length}</span> students
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
                    {yearOptions.map(year => (
                      <option key={year} value={String(year)}>{`Year ${year}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                  <select
                    value={reportFilters.branch}
                    onChange={(e) => setReportFilters({ ...reportFilters, branch: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={!reportFilters.course && branchOptions.length === 0}
                  >
                    <option value="">All Branches</option>
                    {branchOptions.map(branch => (
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
                    {semesterOptions.map(semester => (
                      <option key={semester} value={String(semester)}>{`Semester ${semester}`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Kit/Set</label>
                  <select
                    value={reportFilters.kit}
                    onChange={(e) => setReportFilters({ ...reportFilters, kit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">All Kits/Sets</option>
                    {reportKitOptions.map(kit => (
                      <option key={kit._id} value={kit._id}>{kit.name}</option>
                    ))}
                  </select>
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
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all font-medium flex items-center gap-2"
                >
                  <Download size={18} />
                  Generate PDF
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

