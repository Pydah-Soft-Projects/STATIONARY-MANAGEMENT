import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Trash2, Receipt, Download, Eye, X, FileText, Calendar, Package, Building2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Filter, Printer, DollarSign, TrendingUp, ShoppingCart, AlertCircle, Loader2 } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasFullAccess } from '../utils/permissions';
import jsPDF from 'jspdf';
import { useReactToPrint } from 'react-to-print';

// Helpers defined outside component so they can be used in initial state
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};
const getDefaultStartDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().split('T')[0];
};

const Reports = ({ currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const canEdit = isSuperAdmin || hasFullAccess(currentUser?.permissions || [], 'transactions');
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    course: '',
    studentId: '',
    transactionType: '',
    paymentMethod: '',
    isPaid: '',
    startDate: getDefaultStartDate(),
    endDate: getTodayDate(),
  });
  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState('');
  const [selectedCollegeData, setSelectedCollegeData] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSalesSummaryPrint, setShowSalesSummaryPrint] = useState(false);
  const [salesSummaryData, setSalesSummaryData] = useState(null);
  const salesSummaryPrintRef = useRef(null);
  const [courses, setCourses] = useState([]);
  const [reportType, setReportType] = useState(''); // 'day-end', 'stock', 'vendor-purchase'
  const [receiptSettings, setReceiptSettings] = useState({
    receiptHeader: 'PYDAH COLLEGE OF ENGINEERING',
    receiptSubheader: 'Stationery Management System',
  });

  const [reportFilters, setReportFilters] = useState({
    course: '',
    paymentMethod: '',
    isPaid: '',
    startDate: getTodayDate(),
    endDate: getTodayDate(),
    includeItems: false,
    includeSummary: true,
    onlyStatistics: false,
    includeDayEndSales: false,
    collegeId: '',
    // For stock report
    productCategory: '',
    stockType: 'academic', // 'academic' or 'distribute'
    // For vendor purchase report
    vendor: '',
  });
  const [vendors, setVendors] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [stockEntriesLoading, setStockEntriesLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedMonthForDaily, setSelectedMonthForDaily] = useState(null); // For daily breakdown view
  const [currentPage, setCurrentPage] = useState(1);
  const [branchTransferPage, setBranchTransferPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [itemsSoldExpanded, setItemsSoldExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('daily'); // 'daily', 'monthly', 'stock'
  const [monthlyReportSubTab, setMonthlyReportSubTab] = useState('monthly-sale'); // 'monthly-sale', 'daily-breakdown'
  const [expandedDays, setExpandedDays] = useState(new Set()); // Track expanded days: "monthKey-dayKey"
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    fetchColleges();
    fetchTransactions();
    fetchStudents();
    fetchVendors();
    fetchSettings();
    fetchStockEntries();
    fetchProducts();
  }, []);

  // Set default college for sub-admins
  useEffect(() => {
    if (!isSuperAdmin && currentUser?.assignedCollege) {
      const collegeId = typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege;
      setSelectedCollege(collegeId);
    }
  }, [isSuperAdmin, currentUser]);

  // Update selected college data when selection changes
  useEffect(() => {
    if (selectedCollege) {
      const college = colleges.find(c => c._id === selectedCollege);
      setSelectedCollegeData(college || null);
    } else {
      setSelectedCollegeData(null);
    }
    // Refetch data when college changes
    fetchTransactions();
    fetchStockEntries();
    fetchProducts();
    // fetchStudents will be filtered client-side based on courses, but we refetch to be sure
    fetchStudents();
  }, [selectedCollege, colleges]);

  const fetchColleges = async () => {
    try {
      const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
      if (res.ok) {
        const data = await res.json();
        setColleges(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching colleges:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStockEntries();
    } else if (activeTab === 'monthly') {
      fetchProducts();
    }
  }, [activeTab]);

  // Get current month key in format YYYY-MM
  const getCurrentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  // Get unique categories from items
  const availableCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(categories).sort();
  }, [products]);

  // Refetch products when stock type changes in report filters
  useEffect(() => {
    if (showReportModal && (reportType === 'stock' || reportType === 'day-end' || reportType === 'vendor-purchase')) {
      fetchProducts(reportFilters.stockType);
    }
  }, [reportFilters.stockType, reportType, showReportModal]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(apiUrl('/api/settings'));
      if (response.ok) {
        const data = await response.json();
        setReceiptSettings({
          receiptHeader: data.receiptHeader || 'PYDAH COLLEGE OF ENGINEERING',
          receiptSubheader: data.receiptSubheader || 'Stationery Management System',
        });
      }
    } catch (error) {
      console.warn('Failed to load receipt settings:', error.message || error);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await fetch(apiUrl('/api/vendors'));
      if (response.ok) {
        const data = await response.json();
        setVendors(data);
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const fetchStockEntries = async () => {
    try {
      setStockEntriesLoading(true);
      const queryParams = new URLSearchParams();
      if (selectedCollege) queryParams.append('college', selectedCollege);
      const response = await fetch(apiUrl(`/api/stock-entries?${queryParams.toString()}`));
      if (response.ok) {
        const data = await response.json();
        setStockEntries(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching stock entries:', error);
    } finally {
      setStockEntriesLoading(false);
    }
  };

  const fetchProducts = async (type = 'academic') => {
    try {
      setProductsLoading(true);
      const isGeneral = type === 'distribute';

      let url;
      if (isGeneral) {
        const queryParams = new URLSearchParams();
        const colId = reportFilters.collegeId || selectedCollege;
        if (colId) queryParams.append('collegeId', colId);
        url = apiUrl(`/api/general-products?${queryParams.toString()}`);
      } else {
        url = selectedCollege
          ? apiUrl(`/api/stock-transfers/colleges/${selectedCollege}/stock`)
          : apiUrl('/api/products');
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        let productsData = [];

        if (isGeneral) {
          productsData = Array.isArray(data) ? data : [];
        } else if (selectedCollege) {
          // Response for college stock is { _id, name, stock: [...] }
          productsData = (data.stock || []).map(item => ({
            ...item.product,
            stock: item.quantity
          }));
        } else {
          productsData = Array.isArray(data) ? data : [];
        }

        setProducts(productsData);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.course) queryParams.append('course', filters.course);
      if (filters.studentId) queryParams.append('studentId', filters.studentId);
      if (filters.transactionType) queryParams.append('transactionType', filters.transactionType);
      if (filters.paymentMethod) queryParams.append('paymentMethod', filters.paymentMethod);
      if (filters.isPaid !== '') queryParams.append('isPaid', filters.isPaid);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (selectedCollege) queryParams.append('collegeId', selectedCollege);

      const response = await fetch(apiUrl(`/api/transactions?${queryParams.toString()}`));
      if (response.ok) {
        const data = await response.json();
        const safeData = Array.isArray(data) ? data : [];
        // Filter by date range on client side if needed
        let filteredData = safeData;
        if (filters.startDate || filters.endDate) {
          filteredData = safeData.filter(transaction => {
            const transDate = new Date(transaction.transactionDate);
            if (filters.startDate && transDate < new Date(filters.startDate)) return false;
            if (filters.endDate && transDate > new Date(filters.endDate + 'T23:59:59')) return false;
            return true;
          });
        }
        setTransactions(filteredData);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await fetch(apiUrl('/api/users'));
      if (response.ok) {
        const data = await response.json();
        // Normalize courses: convert to lowercase and trim, then create a map to preserve original casing
        const courseMap = new Map();
        data.forEach(student => {
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
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const courseOptions = useMemo(() => {
    // If a college is selected, only show courses for that college
    if (selectedCollege && selectedCollegeData?.courses) {
      return [...selectedCollegeData.courses].sort((a, b) => a.localeCompare(b));
    }

    // Otherwise, show all unique courses from all students
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
  }, [courses, selectedCollege, selectedCollegeData]);

  useEffect(() => {
    fetchTransactions();
  }, [filters]);

  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(transaction => {
      // Filter by transaction type if selected
      if (filters.transactionType) {
        const transType = transaction.transactionType || 'student';
        if (transType !== filters.transactionType) {
          // Compatibility for college/branch transfers
          const isTransferFilter = filters.transactionType === 'college_transfer' || filters.transactionType === 'branch_transfer';
          const isTransferType = transType === 'college_transfer' || transType === 'branch_transfer';

          if (isTransferFilter && isTransferType) {
            // Allow match
          } else {
            return false;
          }
        }
      }

      const matchesSearch =
        transaction.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.student?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.student?.studentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.collegeTransfer?.collegeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.branchTransfer?.branchName?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [transactions, searchTerm, filters.transactionType]);

  // Separate student transactions and college transfers
  const studentTransactions = useMemo(() => {
    return filteredTransactions.filter(t => !t.transactionType || t.transactionType === 'student' || t.transactionType === 'employee');
  }, [filteredTransactions]);

  // Transactions that count toward revenue: all student + paid college/branch transfers (for monthly/daily reports)
  const revenueEligibleTransactions = useMemo(() => {
    return filteredTransactions.filter(t => {
      if (t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer') {
        return t.isPaid === true;
      }
      return !t.transactionType || t.transactionType === 'student' || t.transactionType === 'employee';
    });
  }, [filteredTransactions]);

  const branchTransfers = useMemo(() => {
    return filteredTransactions.filter(t => t.transactionType === 'branch_transfer' || t.transactionType === 'college_transfer');
  }, [filteredTransactions]);

  // For reports: college/branch transfers use transferDate (from StockTransfer), others use transactionDate
  const getReportDate = useCallback((transaction) => {
    const isTransfer = transaction.transactionType === 'college_transfer' || transaction.transactionType === 'branch_transfer';
    const dateVal = isTransfer && transaction.transferDate ? transaction.transferDate : transaction.transactionDate;
    return new Date(dateVal);
  }, []);

  // Pagination for student transactions
  const studentTotalPages = Math.ceil(studentTransactions.length / itemsPerPage);
  const studentStartIndex = (currentPage - 1) * itemsPerPage;
  const studentEndIndex = studentStartIndex + itemsPerPage;
  const paginatedStudentTransactions = studentTransactions.slice(studentStartIndex, studentEndIndex);

  // Pagination for branch transfers
  const branchTransferTotalPages = Math.ceil(branchTransfers.length / itemsPerPage);
  const branchTransferStartIndex = (branchTransferPage - 1) * itemsPerPage;
  const branchTransferEndIndex = branchTransferStartIndex + itemsPerPage;
  const paginatedBranchTransfers = branchTransfers.slice(branchTransferStartIndex, branchTransferEndIndex);


  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
    setBranchTransferPage(1);
  }, [searchTerm, filters]);

  const handleDelete = async (transactionId) => {
    if (!canEdit) {
      alert('You do not have permission to delete transactions');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/transactions/${transactionId}`), {
        method: 'DELETE',
      });

      if (response.ok) {
        setTransactions(prev => prev.filter(t => t._id !== transactionId));
        alert('Transaction deleted successfully');
      } else {
        throw new Error('Failed to delete transaction');
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Error deleting transaction');
    }
  };

  const handleViewDetails = (transaction) => {
    setSelectedTransaction(transaction);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    return `₹${Number(amount).toFixed(2)}`;
  };

  const formatCurrencyForPDF = (amount) => {
    // Use 'Rs' instead of ₹ symbol to avoid encoding issues
    return `Rs ${Number(amount || 0).toFixed(2)}`;
  };

  // Calculate day-end sales summary (revenue amounts include paid college/branch transfers; items sold = student only)
  const calculateDayEndSales = useCallback((transactions) => {
    // Use passed-in transactions for revenue amounts (already revenue-eligible: student + paid transfers)
    const revenueTransactions = transactions;
    // For "items sold" count student transactions and distributions
    const itemsTransactions = (transactions || []).filter(t =>
      (t.transactionType === 'student' || t.transactionType === 'employee' || !t.transactionType) &&
      t.isPaid
    );

    // Aggregate items sold across student transactions only
    // For sets, expand them into their component items
    const itemsSoldMap = new Map();
    itemsTransactions.forEach(transaction => {
      if (transaction.items && Array.isArray(transaction.items)) {
        transaction.items.forEach(item => {
          const setQuantity = Number(item.quantity) || 0;
          const setComponents = Array.isArray(item.setComponents) ? item.setComponents : [];
          const isSet = item.isSet || setComponents.length > 0;

          if (isSet && setComponents.length > 0) {
            // If it's a set, expand into component items
            setComponents.forEach(component => {
              const componentName = component.name || component.productNameSnapshot || 'N/A';
              const componentQty = Number(component.quantity) || 1;
              // Multiply component quantity by set quantity
              const totalQuantity = componentQty * setQuantity;

              if (itemsSoldMap.has(componentName)) {
                itemsSoldMap.set(componentName, itemsSoldMap.get(componentName) + totalQuantity);
              } else {
                itemsSoldMap.set(componentName, totalQuantity);
              }
            });
          } else {
            // Regular item (not a set)
            const itemName = item.name || 'N/A';
            const quantity = setQuantity;

            if (itemsSoldMap.has(itemName)) {
              itemsSoldMap.set(itemName, itemsSoldMap.get(itemName) + quantity);
            } else {
              itemsSoldMap.set(itemName, quantity);
            }
          }
        });
      }
    });

    // Convert map to array and sort by quantity (descending)
    const itemsSold = Array.from(itemsSoldMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    // Calculate statistics
    const totalAmount = revenueTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const regularTransactions = revenueTransactions.filter(t => !t.transactionType || t.transactionType === 'student' || t.transactionType === 'employee');
    const cashAmount = regularTransactions.filter(t => t.isPaid).reduce((sum, t) => {
      if (t.paymentMethod === 'cash') return sum + (t.totalAmount || 0);
      if (t.paymentMethod === 'split') return sum + (t.cashAmount || 0);
      return sum;
    }, 0);
    const onlineAmount = regularTransactions.filter(t => t.isPaid).reduce((sum, t) => {
      if (t.paymentMethod === 'online') return sum + (t.totalAmount || 0);
      if (t.paymentMethod === 'split') return sum + (t.onlineAmount || 0);
      return sum;
    }, 0);
    const paidCount = revenueTransactions.filter(t => t.isPaid).length;
    const paidAmount = revenueTransactions.filter(t => t.isPaid).reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalItemsSold = itemsSold.reduce((sum, item) => sum + item.quantity, 0);

    return {
      itemsSold,
      statistics: {
        totalTransactions: revenueTransactions.length,
        totalAmount,
        cashAmount,
        onlineAmount,
        paidCount,
        paidAmount,
        totalItemsSold,
      }
    };
  }, []);

  // Calculate statistics from filtered transactions (regular sales only for monetary totals)
  const statistics = useMemo(() => {
    const allRevenueTxs = revenueEligibleTransactions;
    const isTransfer = (t) => t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer';

    // Regular sales for main totals
    const regularTxs = allRevenueTxs.filter(t => !isTransfer(t));
    const transferTxs = allRevenueTxs.filter(t => isTransfer(t));

    const totalAmount = regularTxs.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const paidTransactions = regularTxs.filter(t => t.isPaid);
    const unpaidTransactions = regularTxs.filter(t => !t.isPaid);
    const paidAmount = paidTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const unpaidAmount = unpaidTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    // Track transfers separately
    const transferAmount = transferTxs.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    // Calculate items sold using existing function (pass revenue-eligible for amounts; items sold = student only inside)
    const salesData = calculateDayEndSales(allRevenueTxs);

    return {
      totalTransactions: regularTxs.length,
      transferTransactions: transferTxs.length,
      totalAmount,
      transferAmount,
      paidCount: paidTransactions.length,
      paidAmount,
      unpaidCount: unpaidTransactions.length,
      unpaidAmount,
      itemsSold: salesData.itemsSold,
      totalItemsSold: salesData.statistics.totalItemsSold,
    };
  }, [revenueEligibleTransactions, calculateDayEndSales]);

  // Calculate monthly statistics with items sold and day-wise breakdown (revenue includes paid college/branch transfers)
  const monthlyStats = useMemo(() => {
    const revenueTransactions = revenueEligibleTransactions;
    const monthMap = new Map();

    revenueTransactions.forEach(transaction => {
      const date = getReportDate(transaction);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const dayKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: monthName,
          monthKey,
          transactions: [],
          totalAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          paidCount: 0,
          unpaidCount: 0,
          itemsSold: [],
          dayWiseBreakdown: new Map(),
        });
      }

      const monthData = monthMap.get(monthKey);
      monthData.transactions.push(transaction);

      const isTransfer = transaction.transactionType === 'college_transfer' || transaction.transactionType === 'branch_transfer';

      // Only add to main revenue if it's not a transfer
      if (!isTransfer) {
        monthData.totalAmount += transaction.totalAmount || 0;
        if (transaction.isPaid) {
          monthData.paidAmount += transaction.totalAmount || 0;
          monthData.paidCount++;
        } else {
          monthData.unpaidAmount += transaction.totalAmount || 0;
          monthData.unpaidCount++;
        }
      }

      // Calculate day-wise breakdown for this month
      if (!monthData.dayWiseBreakdown.has(dayKey)) {
        monthData.dayWiseBreakdown.set(dayKey, {
          date: dayKey,
          dayName,
          transactions: [],
          totalAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          paidCount: 0,
          unpaidCount: 0,
          itemsSold: [],
        });
      }
      const dayData = monthData.dayWiseBreakdown.get(dayKey);
      dayData.transactions.push(transaction);

      // Only add to daily revenue if it's not a transfer
      if (!isTransfer) {
        dayData.totalAmount += transaction.totalAmount || 0;
        if (transaction.isPaid) {
          dayData.paidAmount += transaction.totalAmount || 0;
          dayData.paidCount++;
        } else {
          dayData.unpaidAmount += transaction.totalAmount || 0;
          dayData.unpaidCount++;
        }
      }

      // Calculate items sold for this day
      if (transaction.items && Array.isArray(transaction.items)) {
        transaction.items.forEach(item => {
          const setQuantity = Number(item.quantity) || 0;
          const setComponents = Array.isArray(item.setComponents) ? item.setComponents : [];
          const isSet = item.isSet || setComponents.length > 0;

          if (isSet && setComponents.length > 0) {
            // If it's a set, expand into component items
            setComponents.forEach(component => {
              const componentName = component.name || component.productNameSnapshot || 'N/A';
              const componentQty = Number(component.quantity) || 1;
              const totalQuantity = componentQty * setQuantity;

              const existingItem = dayData.itemsSold.find(i => i.name === componentName);
              if (existingItem) {
                existingItem.quantity += totalQuantity;
              } else {
                dayData.itemsSold.push({ name: componentName, quantity: totalQuantity });
              }
            });
          } else {
            // Regular item (not a set)
            const itemName = item.name || 'N/A';
            const quantity = setQuantity;

            const existingItem = dayData.itemsSold.find(i => i.name === itemName);
            if (existingItem) {
              existingItem.quantity += quantity;
            } else {
              dayData.itemsSold.push({ name: itemName, quantity });
            }
          }
        });
      }

      // Calculate items sold for this transaction
      if (transaction.items && Array.isArray(transaction.items)) {
        transaction.items.forEach(item => {
          const setQuantity = Number(item.quantity) || 0;
          const setComponents = Array.isArray(item.setComponents) ? item.setComponents : [];
          const isSet = item.isSet || setComponents.length > 0;

          if (isSet && setComponents.length > 0) {
            // If it's a set, expand into component items
            setComponents.forEach(component => {
              const componentName = component.name || component.productNameSnapshot || 'N/A';
              const componentQty = Number(component.quantity) || 1;
              const totalQuantity = componentQty * setQuantity;

              const existingItem = monthData.itemsSold.find(i => i.name === componentName);
              if (existingItem) {
                existingItem.quantity += totalQuantity;
              } else {
                monthData.itemsSold.push({ name: componentName, quantity: totalQuantity });
              }
            });
          } else {
            // Regular item (not a set)
            const itemName = item.name || 'N/A';
            const quantity = setQuantity;

            const existingItem = monthData.itemsSold.find(i => i.name === itemName);
            if (existingItem) {
              existingItem.quantity += quantity;
            } else {
              monthData.itemsSold.push({ name: itemName, quantity });
            }
          }
        });
      }
    });

    // Sort items sold by quantity for each month and convert dayWiseBreakdown Map to Array
    monthMap.forEach(monthData => {
      monthData.itemsSold.sort((a, b) => b.quantity - a.quantity);
      const dayWiseArray = Array.from(monthData.dayWiseBreakdown.values())
        .sort((a, b) => b.date.localeCompare(a.date));
      // Sort items sold for each day
      dayWiseArray.forEach(day => {
        day.itemsSold.sort((a, b) => b.quantity - a.quantity);
      });
      monthData.dayWiseBreakdown = dayWiseArray;
    });

    return Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [revenueEligibleTransactions, getReportDate]);

  // Set default to current month when switching to daily breakdown sub-tab or when monthlyStats is available
  useEffect(() => {
    if (activeTab === 'monthly' && monthlyReportSubTab === 'daily-breakdown' && monthlyStats.length > 0) {
      // Only set default if no month is currently selected or if the selected month is invalid
      if (!selectedMonthForDaily || !monthlyStats.some(m => m.monthKey === selectedMonthForDaily)) {
        const currentMonthKey = getCurrentMonthKey();
        // Check if current month exists in monthlyStats
        const currentMonthExists = monthlyStats.some(m => m.monthKey === currentMonthKey);

        if (currentMonthExists) {
          // If current month exists, set it
          setSelectedMonthForDaily(currentMonthKey);
        } else {
          // If current month doesn't exist, select the most recent month
          const mostRecentMonth = monthlyStats[0]; // monthlyStats is sorted by most recent first
          if (mostRecentMonth) {
            setSelectedMonthForDaily(mostRecentMonth.monthKey);
          }
        }
      }
    }
  }, [activeTab, monthlyReportSubTab, monthlyStats]);

  // Enhanced Monthly Sales Report - Comprehensive table with all items and months
  const comprehensiveMonthlyReport = useMemo(() => {
    const allTransactions = revenueEligibleTransactions;
    const itemMonthMap = new Map(); // itemName -> { monthKey -> quantity }
    const allMonthsSet = new Set();
    const monthlyRevenue = new Map();
    const monthlyTransferRevenue = new Map(); // Track transfers separately
    const monthlyTotals = new Map();
    const itemMonthlySales = new Map();

    // Process all transactions
    allTransactions.forEach((transaction) => {
      const transDate = getReportDate(transaction);
      // Ensure transDate is a Date object if getReportDate returns a string or similar
      const d = transDate instanceof Date ? transDate : new Date(transDate);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      allMonthsSet.add(monthKey);

      const isTransfer = transaction.transactionType === 'branch_transfer' || transaction.transactionType === 'college_transfer';

      // Items Breakdown (All transactions that have items)
      if (transaction.items && Array.isArray(transaction.items)) {
        const salesData = calculateDayEndSales([transaction]);
        salesData.itemsSold.forEach((item) => {
          if (!itemMonthMap.has(item.name)) {
            itemMonthMap.set(item.name, new Map());
          }
          const monthMap = itemMonthMap.get(item.name);
          const currentQty = monthMap.get(monthKey) || 0;
          monthMap.set(monthKey, currentQty + item.quantity);

          // Item Monthly Sales
          if (!itemMonthlySales.has(item.name)) {
            itemMonthlySales.set(item.name, new Map());
          }
          const itemSalesMap = itemMonthlySales.get(item.name);
          const currentItemQty = itemSalesMap.get(monthKey) || 0;
          itemSalesMap.set(monthKey, currentItemQty + item.quantity);
        });
      }

      // Revenue Breakdown (Only paid transactions)
      if (transaction.isPaid && transaction.totalAmount) {
        if (isTransfer) {
          // Paid transfers go to a separate pool
          const currentTransferRev = monthlyTransferRevenue.get(monthKey) || 0;
          monthlyTransferRevenue.set(monthKey, currentTransferRev + transaction.totalAmount);
        } else {
          // Regular sales (student/employee) go to monthly income
          const currentRev = monthlyRevenue.get(monthKey) || 0;
          monthlyRevenue.set(monthKey, currentRev + transaction.totalAmount);
        }
      }
    });

    // Convert to sorted arrays
    const sortedMonths = Array.from(allMonthsSet).sort((a, b) => a.localeCompare(b));
    const sortedItems = Array.from(itemMonthMap.keys()).sort();

    // Calculate monthly totals (quantities)
    sortedMonths.forEach(monthKey => {
      let total = 0;
      itemMonthlySales.forEach((salesMap) => {
        total += salesMap.get(monthKey) || 0;
      });
      monthlyTotals.set(monthKey, total);
    });

    // Format month names
    const monthNames = sortedMonths.map(monthKey => {
      const [year, month] = monthKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return {
        key: monthKey,
        name: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        fullName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      };
    });

    return {
      months: monthNames,
      items: sortedItems,
      itemMonthlySales,
      monthlyRevenue,
      monthlyTransferRevenue,
      monthlyTotals,
    };
  }, [revenueEligibleTransactions, getReportDate, calculateDayEndSales]);

  // Get product price for an item name
  const getProductPrice = useCallback((itemName) => {
    if (!itemName || !products.length) return 0;
    const product = products.find(p =>
      p.name && p.name.toLowerCase().trim() === itemName.toLowerCase().trim()
    );
    return product ? (product.price || 0) : 0;
  }, [products]);

  // Calculate daily breakdown with items as rows and days as columns for selected month
  const dailyBreakdownReport = useMemo(() => {
    if (!selectedMonthForDaily) return null;

    const selectedMonth = monthlyStats.find(m => m.monthKey === selectedMonthForDaily);
    if (!selectedMonth || !selectedMonth.dayWiseBreakdown || selectedMonth.dayWiseBreakdown.length === 0) {
      return null;
    }

    const allDays = new Set();
    const itemDailySales = new Map(); // itemName -> { dayKey -> quantity }
    const allItems = new Set();
    const dailyRevenue = new Map(); // dayKey -> revenue (includes student + paid college/branch transfers)
    const dailyTransferRevenue = new Map(); // dayKey -> revenue from college/branch transfers only (for table row)

    selectedMonth.dayWiseBreakdown.forEach(day => {
      const dayKey = day.date; // Format: YYYY-MM-DD
      const dayName = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      allDays.add(dayKey);
      const txs = day.transactions || [];
      // Filter out transfers for dailyRevenue (DAILY INCOME row)
      const nonTransferTxs = txs.filter(t => t.transactionType !== 'college_transfer' && t.transactionType !== 'branch_transfer');
      const dayRev = nonTransferTxs.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      dailyRevenue.set(dayKey, dayRev);

      const transferRev = txs
        .filter(t => t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer')
        .reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      dailyTransferRevenue.set(dayKey, transferRev);

      // Process items sold on this day
      if (day.itemsSold && Array.isArray(day.itemsSold)) {
        day.itemsSold.forEach(item => {
          const itemName = item.name || 'N/A';
          const quantity = Number(item.quantity) || 0;

          allItems.add(itemName);
          if (!itemDailySales.has(itemName)) {
            itemDailySales.set(itemName, new Map());
          }
          const itemMap = itemDailySales.get(itemName);
          itemMap.set(dayKey, quantity);
        });
      }
    });

    // Convert to sorted arrays
    const sortedDays = Array.from(allDays).sort((a, b) => a.localeCompare(b));
    const sortedItems = Array.from(allItems).sort();

    // Format day names
    const dayNames = sortedDays.map(dayKey => {
      const date = new Date(dayKey);
      const dayNumber = date.getDate();
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      return {
        key: dayKey,
        name: `${dayNumber}-${monthName}`,
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      };
    });

    // Calculate daily totals (total items sold per day)
    const dailyTotals = new Map();
    sortedDays.forEach(dayKey => {
      let total = 0;
      itemDailySales.forEach((salesMap) => {
        total += salesMap.get(dayKey) || 0;
      });
      dailyTotals.set(dayKey, total);
    });

    return {
      items: sortedItems,
      days: dayNames,
      itemDailySales: itemDailySales,
      dailyTotals: dailyTotals,
      dailyRevenue: dailyRevenue,
      dailyTransferRevenue: dailyTransferRevenue,
      monthName: selectedMonth.month
    };
  }, [selectedMonthForDaily, monthlyStats]);

  // Calculate day-wise breakdown (revenue includes paid college/branch transfers)
  const dayWiseBreakdown = useMemo(() => {
    const revenueTransactions = revenueEligibleTransactions;
    const dayMap = new Map();

    revenueTransactions.forEach(transaction => {
      const date = getReportDate(transaction);
      const dayKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          date: dayKey,
          dayName,
          transactions: [],
          totalAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          paidCount: 0,
          unpaidCount: 0,
        });
      }

      const dayData = dayMap.get(dayKey);
      dayData.transactions.push(transaction);
      dayData.totalAmount += transaction.totalAmount || 0;
      if (transaction.isPaid) {
        dayData.paidAmount += transaction.totalAmount || 0;
        dayData.paidCount++;
      } else {
        dayData.unpaidAmount += transaction.totalAmount || 0;
        dayData.unpaidCount++;
      }
    });

    return Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [revenueEligibleTransactions, getReportDate]);

  const generateDayEndReport = async (transactions, collegeId = null) => {
    // Filter transactions by date range if specified
    let filteredTransactions = transactions;
    if (reportFilters.startDate || reportFilters.endDate) {
      filteredTransactions = transactions.filter(transaction => {
        const transDate = new Date(transaction.transactionDate);
        if (reportFilters.startDate && transDate < new Date(reportFilters.startDate)) return false;
        if (reportFilters.endDate && transDate > new Date(reportFilters.endDate + 'T23:59:59')) return false;
        return true;
      });
    }

    // Calculate day-wise breakdown for filtered transactions
    const dayMap = new Map();
    filteredTransactions.forEach(transaction => {
      const date = new Date(transaction.transactionDate);
      const dayKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          date: dayKey,
          dayName,
          transactions: [],
          totalAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          cashAmount: 0,
          onlineAmount: 0,
        });
      }

      const dayData = dayMap.get(dayKey);
      dayData.transactions.push(transaction);
      dayData.totalAmount += transaction.totalAmount || 0;
      if (transaction.isPaid) {
        dayData.paidAmount += transaction.totalAmount || 0;
        // Tracking cash vs online for paid amounts
        const method = (transaction.paymentMethod || '').toLowerCase();
        if (method === 'cash') {
          dayData.cashAmount += transaction.totalAmount || 0;
        } else if (method === 'online' || method === 'gpay' || method === 'phonepe' || method === 'net banking') {
          dayData.onlineAmount += transaction.totalAmount || 0;
        }
      } else {
        dayData.unpaidAmount += transaction.totalAmount || 0;
      }
    });

    const dayWiseData = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a5'
    });

    const isGeneral = reportFilters.stockType === 'distribute';

    // Headers
    pdf.setFontSize(18);
    pdf.setTextColor(44, 62, 80);
    const headerText = selectedCollegeData ? selectedCollegeData.name.toUpperCase() : receiptSettings.receiptHeader;
    pdf.text(headerText, 74, 20, { align: 'center' }); // Fixed A5 Center

    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(undefined, 'bold');
    pdf.text(isGeneral ? 'Day-End Distribution Report' : 'Day-End Transaction Report', 74, 24, { align: 'center' });

    // Draw line under header
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, 28, 134, 28);

    let yPos = 34;

    // Report Info Section - Date Range
    if (reportFilters.startDate || reportFilters.endDate) {
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      const dateRangeText = reportFilters.startDate && reportFilters.endDate
        ? `Date Range: ${reportFilters.startDate} to ${reportFilters.endDate}`
        : reportFilters.startDate
          ? `From: ${reportFilters.startDate}`
          : `Until: ${reportFilters.endDate}`;
      pdf.text(dateRangeText, 14, yPos);
      yPos += 5;
    }

    // Report Info Section
    const showStats =
      filteredTransactions.length > 0 &&
      (reportFilters.includeSummary || reportFilters.onlyStatistics);

    if (showStats) {
      // Revenue: student (all) + paid college/branch transfers
      const revenueTransactions = filteredTransactions.filter(t => {
        if (t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer') return t.isPaid === true;
        return true;
      });
      const totalAmount = revenueTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      const paidCount = revenueTransactions.filter(t => t.isPaid).length;
      const paidAmount = revenueTransactions.filter(t => t.isPaid).reduce((sum, t) => sum + (t.totalAmount || 0), 0);

      // Cash/Online statistics for filtered range
      const totalCash = revenueTransactions.filter(t => t.isPaid && (t.paymentMethod || '').toLowerCase() === 'cash').reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      const totalOnline = revenueTransactions.filter(t => t.isPaid && ['online', 'gpay', 'phonepe', 'net banking'].includes((t.paymentMethod || '').toLowerCase())).reduce((sum, t) => sum + (t.totalAmount || 0), 0);

      // Calculate day-end sales summary if enabled
      let salesSummary = null;
      if (reportFilters.includeDayEndSales) {
        salesSummary = calculateDayEndSales(filteredTransactions);
      }

      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text(isGeneral ? 'Statistics (Filtered)' : 'Statistics (Filtered)', 14, yPos);

      const statsY = yPos + 4;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(8);
      if (!isGeneral) {
        pdf.text(`Trx: ${revenueTransactions.length}`, 14, statsY);
        pdf.text(`Amount: ${formatCurrencyForPDF(totalAmount)}`, 35, statsY);
        pdf.text(`Cash: ${formatCurrencyForPDF(totalCash)}`, 75, statsY);
        pdf.text(`Online: ${formatCurrencyForPDF(totalOnline)}`, 110, statsY);
      } else {
        pdf.text(`Distributions: ${filteredTransactions.length}`, 14, statsY);
        // Hide financial summary for general stock distributions if needed, but keeping count is fine
      }

      yPos += 8;

      // Add Day-wise Breakdown if date range is selected
      if (dayWiseData.length > 0 && (reportFilters.startDate || reportFilters.endDate)) {
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.text(isGeneral ? 'Day-wise Distribution' : 'Day-wise Breakdown', 14, yPos);
        yPos += 5;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(7);
        pdf.setFillColor(240, 240, 240);
        pdf.rect(14, yPos - 3, 120, 4, 'F');
        pdf.setFont(undefined, 'bold');
        pdf.text('Date', 14, yPos);
        pdf.text(isGeneral ? 'Dist' : 'Trx', 50, yPos);
        if (!isGeneral) {
          pdf.text('Total', 75, yPos, { align: 'right' });
          pdf.text('Cash', 105, yPos, { align: 'right' });
          pdf.text('Online', 135, yPos, { align: 'right' });
        }
        yPos += 4;

        pdf.setFont(undefined, 'normal');
        dayWiseData.forEach((day, idx) => {
          if (yPos > 180) {
            pdf.addPage();
            yPos = 14;
          }
          const dateStr = day.dayName.substring(0, 15);
          pdf.text(dateStr, 14, yPos);
          pdf.text(`${day.transactions.length}`, 50, yPos);
          if (!isGeneral) {
            pdf.text(formatCurrencyForPDF(day.totalAmount), 75, yPos, { align: 'right' });
            pdf.text(formatCurrencyForPDF(day.cashAmount), 105, yPos, { align: 'right' });
            pdf.text(formatCurrencyForPDF(day.onlineAmount), 135, yPos, { align: 'right' });
          }
          yPos += 4;
        });
        yPos += 3;
      }

      // Add Day-End Sales Summary in statistics if enabled
      if (salesSummary && salesSummary.itemsSold.length > 0) {
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'bold');
        pdf.text(isGeneral ? 'Day-End Sales Summary' : 'Day-End Sales Summary', 14, yPos);
        yPos += 5;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(7);
        pdf.text(`Total Items Sold: ${salesSummary.statistics.totalItemsSold}`, 16, yPos);
        if (!isGeneral) {
          pdf.text(`Cash: ${formatCurrencyForPDF(salesSummary.statistics.cashAmount)}`, 50, yPos);
          pdf.text(`Online: ${formatCurrencyForPDF(salesSummary.statistics.onlineAmount)}`, 90, yPos);
        }
        yPos += 4;

        // Show top items (limit to fit on page)
        const topItems = salesSummary.itemsSold.slice(0, 10);
        pdf.setFontSize(6);
        topItems.forEach((item, idx) => {
          if (yPos > 180) {
            pdf.addPage();
            yPos = 14;
          }
          const itemName = item.name.substring(0, 30);
          pdf.text(`${idx + 1}. ${itemName}: ${item.quantity}`, 18, yPos);
          yPos += 3.5;
        });

        if (salesSummary.itemsSold.length > 10) {
          pdf.setFontSize(6);
          pdf.text(`... and ${salesSummary.itemsSold.length - 10} more items`, 18, yPos);
          yPos += 3;
        }
      }

      yPos += 8;
    }


    // Transactions Table Header
    if (!reportFilters.onlyStatistics && filteredTransactions.length > 0) {
      pdf.setFontSize(11);
      pdf.setFont(undefined, 'bold');
      pdf.setFillColor(240, 240, 240);
      pdf.rect(14, yPos - 4, 120, 6, 'F');
      pdf.text(isGeneral ? 'Distribution Details' : 'Transaction Details', 14, yPos);
      yPos += 6;

      // Table Headers
      pdf.setFontSize(7);
      pdf.setFont(undefined, 'bold');
      pdf.setFillColor(230, 230, 230);
      pdf.rect(14, yPos - 3, 120, 5, 'F');
      const colPositions = {
        date: 16,
        student: 44,
        course: isGeneral ? 94 : 76,
        payment: 102,
        amount: 128,
      };

      pdf.text('Date', colPositions.date, yPos);
      pdf.text(isGeneral ? 'Recipient' : 'Student', colPositions.student, yPos);
      pdf.text(isGeneral ? 'Department' : 'Course', colPositions.course, yPos);
      if (!isGeneral) {
        pdf.text('Payment', colPositions.payment, yPos);
        pdf.text('Amount', colPositions.amount, yPos, { align: 'right' });
      }
      yPos += 5;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(7);

      filteredTransactions.forEach((transaction, index) => {
        // Check if we need a new page
        if (yPos > 180) {
          pdf.addPage();
          yPos = 14;
          // Redraw table headers on new page
          pdf.setFont(undefined, 'bold');
          pdf.setFontSize(8);
          pdf.setFillColor(230, 230, 230);
          pdf.rect(14, yPos - 3, 120, 5, 'F');
          pdf.text('Date', colPositions.date, yPos);
          pdf.text(isGeneral ? 'Recipient' : 'Student', colPositions.student, yPos);
          pdf.text(isGeneral ? 'Department' : 'Course', colPositions.course, yPos);
          if (!isGeneral) {
            pdf.text('Payment', colPositions.payment, yPos);
            pdf.text('Amount', colPositions.amount, yPos, { align: 'right' });
          }
          yPos += 5;
          pdf.setFont(undefined, 'normal');
        }

        const date = new Date(transaction.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const studentName = (transaction.student?.name || transaction.employee?.name || 'N/A').substring(0, isGeneral ? 25 : 16);
        const course = (transaction.student?.course || transaction.employee?.department || 'N/A').toUpperCase().substring(0, isGeneral ? 15 : 8);
        const amount = formatCurrencyForPDF(transaction.totalAmount);
        const payment = transaction.paymentMethod ? transaction.paymentMethod.toUpperCase() : 'N/A';

        // Alternate row background
        if (index % 2 === 0) {
          pdf.setFillColor(250, 250, 250);
          pdf.rect(14, yPos - 3, 120, 5, 'F');
        }

        pdf.text(date, colPositions.date, yPos);
        pdf.text(studentName, colPositions.student, yPos);
        pdf.text(course, colPositions.course, yPos);
        if (!isGeneral) {
          pdf.text(payment, colPositions.payment, yPos);
          pdf.text(amount, colPositions.amount, yPos, { align: 'right' });
        }
        yPos += 5;

        // Draw separator line
        if (index < filteredTransactions.length - 1) {
          pdf.setDrawColor(220, 220, 220);
          pdf.line(14, yPos, 134, yPos);
          yPos += 2;
        }
      });

      yPos += 5;

      // Item Details Section (if enabled)
      if (reportFilters.includeItems) {
        pdf.setFontSize(11);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(240, 240, 240);
        pdf.rect(14, yPos - 4, 120, 6, 'F');
        pdf.text('Item Details', 14, yPos);
        yPos += 6;

        filteredTransactions.forEach((transaction, transIndex) => {
          if (transaction.items && transaction.items.length > 0) {
            // Check if we need a new page
            if (yPos > 180) {
              pdf.addPage();
              yPos = 14;
            }

            pdf.setFontSize(9);
            pdf.setFont(undefined, 'bold');
            pdf.text(`Transaction: ${transaction.transactionId || 'N/A'}`, 16, yPos);
            yPos += 4;

            // Item table header
            pdf.setFontSize(6);
            pdf.setFont(undefined, 'bold');
            pdf.setFillColor(245, 245, 245);
            pdf.rect(16, yPos - 2, 112, 4, 'F');
            pdf.text('Item Name', 18, yPos);
            pdf.text('Qty', 78, yPos);
            pdf.text('Unit Price', 92, yPos);
            pdf.text('Total', 112, yPos);
            yPos += 4;

            pdf.setFont(undefined, 'normal');
            transaction.items.forEach((item, itemIndex) => {
              if (yPos > 180) {
                pdf.addPage();
                yPos = 14;
              }

              const itemName = (item.name || 'N/A').substring(0, 25);
              const itemQty = item.quantity || 0;
              const itemPrice = formatCurrencyForPDF(item.price || 0);
              const itemTotal = formatCurrencyForPDF(item.total || 0);

              pdf.text(`${itemIndex + 1}. ${itemName}`, 18, yPos);
              pdf.text(itemQty.toString(), 78, yPos);
              pdf.text(itemPrice, 92, yPos);
              pdf.text(itemTotal, 112, yPos);
              yPos += 4;
            });

            yPos += 3;
          }
        });
      }
    } else if (!showStats) {
      pdf.setFontSize(10);
      pdf.text('No transactions found for the selected filters.', 20, yPos);
    }

    // Footer
    const pageCount = pdf.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${i} of ${pageCount}`, 74, 197, { align: 'center' });
      pdf.text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 74, 202, { align: 'center' });
    }

    const fileName = `Day_End_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
  };

  const generateStockReport = async () => {
    try {
      setProductsLoading(true);
      const isGeneral = reportFilters.stockType === 'distribute';
      const selectedCollegeId = reportFilters.collegeId || selectedCollege;

      let url;
      if (selectedCollegeId) {
        url = isGeneral
          ? apiUrl(`/api/general-products/colleges/${selectedCollegeId}/stock`)
          : apiUrl(`/api/stock-transfers/colleges/${selectedCollegeId}/stock`);
      } else {
        url = isGeneral ? apiUrl('/api/general-products') : apiUrl('/api/products');
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch products for report');

      const data = await response.json();
      let products = [];

      if (selectedCollegeId) {
        if (isGeneral) {
          // General stock response structure: { _id, name, generalStock: [...] }
          products = (data.generalStock || []).map(item => ({
            ...item.product,
            stock: item.quantity
          }));
        } else {
          // College stock (Academic) response structure: { _id, name, stock: [...] }
          products = (data.stock || []).map(item => ({
            ...item.product,
            stock: item.quantity
          }));
        }
      } else {
        const allProducts = data;
        products = Array.isArray(allProducts) ? allProducts.filter(product => !product?.isSet) : [];
      }

      // Apply existing filters
      if (reportFilters.productCategory) {
        products = products.filter(p => p.category === reportFilters.productCategory);
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Header Section
      pdf.setFontSize(18);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'bold');

      const collegeData = selectedCollegeId ? colleges.find(c => c._id === selectedCollegeId) : null;
      const headerText = collegeData ? collegeData.name.toUpperCase() : receiptSettings.receiptHeader;

      pdf.text(headerText, 105, 15, { align: 'center' });
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
      pdf.text(receiptSettings.receiptSubheader, 105, 22, { align: 'center' });
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'bold');

      const reportTitle = isGeneral ? 'General/Distribute Stock Report' : 'Academic Stock Report';
      pdf.text(reportTitle, 105, 30, { align: 'center' });

      // Draw line under header
      pdf.setDrawColor(200, 200, 200);
      pdf.line(20, 35, 190, 35);

      let yPos = 42;

      // Report Info Section - REMOVED

      // Summary Section
      if (reportFilters.includeSummary && products.length > 0) {
        const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
        const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
        const lowStockCount = products.filter(p => (p.stock || 0) < 10).length;
        const outOfStockCount = products.filter(p => (p.stock || 0) === 0).length;

        pdf.setFontSize(9); // Slightly smaller to fit all info
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(245, 245, 245);
        pdf.rect(20, yPos - 4, 170, 8, 'F'); // Background for single line stats
        pdf.text('Summary:', 22, yPos);

        pdf.setFont(undefined, 'normal');
        // Combined stats on one line
        const statsText = isGeneral
          ? `Products: ${products.length} | Stock: ${totalStock} | LowStock: ${lowStockCount} | OutOfStock: ${outOfStockCount}`
          : `Products: ${products.length} | Stock: ${totalStock} | Val: ${formatCurrencyForPDF(totalValue)} | LowStock: ${lowStockCount} | OutOfStock: ${outOfStockCount}`;
        pdf.text(statsText, 45, yPos);

        yPos += 10;
      }

      // Stock Details Table
      if (products.length > 0) {
        // Table Headers
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(230, 230, 230);
        pdf.rect(20, yPos - 3, 170, 6, 'F');
        pdf.text('Product Name', 22, yPos + 1);
        if (!isGeneral) {
          pdf.text('Price', 110, yPos + 1);
          pdf.text('Stock', 140, yPos + 1);
          pdf.text('Value', 170, yPos + 1);
        } else {
          pdf.text('Stock', 170, yPos + 1);
        }
        yPos += 8;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(8);

        products.forEach((product, index) => {
          // Check if we need a new page
          if (yPos > 275) {
            pdf.addPage();
            yPos = 20;
            // Redraw table headers on new page
            pdf.setFont(undefined, 'bold');
            pdf.setFontSize(8);
            pdf.setFillColor(230, 230, 230);
            pdf.rect(20, yPos - 3, 170, 6, 'F');
            pdf.text('Product Name', 22, yPos + 1);
            if (!isGeneral) {
              pdf.text('Price', 110, yPos + 1);
              pdf.text('Stock', 140, yPos + 1);
              pdf.text('Value', 170, yPos + 1);
            } else {
              pdf.text('Stock', 170, yPos + 1);
            }
            yPos += 8;
            pdf.setFont(undefined, 'normal');
          }

          const productName = (product.name || 'N/A').substring(0, 45);
          const price = formatCurrencyForPDF(product.price || 0);
          const stock = product.stock || 0;
          const value = formatCurrencyForPDF((product.stock || 0) * (product.price || 0));

          // Alternate row background
          if (index % 2 === 0) {
            pdf.setFillColor(252, 252, 252);
            pdf.rect(20, yPos - 4, 170, 6, 'F');
          }

          pdf.text(productName, 22, yPos);
          if (!isGeneral) {
            pdf.text(price, 110, yPos);
            pdf.text(stock.toString(), 140, yPos);
            pdf.text(value, 170, yPos);
          } else {
            pdf.text(stock.toString(), 170, yPos);
          }
          yPos += 6;

          // Removed underlines
        });
      } else {
        pdf.setFontSize(10);
        pdf.text('No products found for the selected filters.', 20, yPos);
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

      const fileName = `Stock_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating stock report:', error);
      throw error;
    }
  };

  const generateVendorPurchaseReport = async () => {
    try {
      const isGeneral = reportFilters.stockType === 'distribute';
      const queryParams = new URLSearchParams();
      if (selectedCollege) queryParams.append(isGeneral ? 'college' : 'college', selectedCollege);

      const endpoint = isGeneral ? '/api/general-purchases' : '/api/stock-entries';
      // Fetch entries with college context
      const response = await fetch(apiUrl(`${endpoint}?${queryParams.toString()}`));
      if (!response.ok) throw new Error(`Failed to fetch ${isGeneral ? 'general purchases' : 'stock entries'} for report`);

      let stockEntries = await response.json();

      if (isGeneral) {
        // Normalize general purchase data to match stock entry structure for the report template
        // General purchases return a list of purchases, each with multiple items. 
        // Stock entries are usually flattened (one entry per product).
        // To keep it simple, we'll flatten the general purchases items.
        const flattenedEntries = [];
        stockEntries.forEach(purchase => {
          purchase.items.forEach(item => {
            flattenedEntries.push({
              ...purchase,
              product: item.product || { name: item.name },
              quantity: item.quantity,
              purchasePrice: item.purchasePrice,
              totalCost: item.quantity * item.purchasePrice,
              createdAt: purchase.invoiceDate || purchase.createdAt
            });
          });
        });
        stockEntries = flattenedEntries;
      }

      // Apply filters on client side
      if (reportFilters.vendor) {
        stockEntries = stockEntries.filter(entry => {
          const entryVendorId = entry.vendor?._id || entry.vendor;
          return String(entryVendorId) === String(reportFilters.vendor);
        });
      }

      if (reportFilters.productCategory) {
        stockEntries = stockEntries.filter(entry => {
          const cat = entry.product?.category || entry.category;
          return cat === reportFilters.productCategory;
        });
      }

      // Filter by date range on client side
      if (reportFilters.startDate || reportFilters.endDate) {
        stockEntries = stockEntries.filter(entry => {
          const entryDate = new Date(entry.invoiceDate || entry.createdAt);
          if (reportFilters.startDate && entryDate < new Date(reportFilters.startDate)) return false;
          if (reportFilters.endDate && entryDate > new Date(reportFilters.endDate + 'T23:59:59')) return false;
          return true;
        });
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Header Section
      pdf.setFontSize(18);
      pdf.setTextColor(30, 58, 138);
      pdf.setFont(undefined, 'bold');
      const headerText = selectedCollegeData ? selectedCollegeData.name.toUpperCase() : receiptSettings.receiptHeader;
      pdf.text(headerText, 105, 15, { align: 'center' });
      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      pdf.setFont(undefined, 'normal');
      pdf.text(receiptSettings.receiptSubheader, 105, 22, { align: 'center' });
      pdf.setFontSize(14);
      pdf.setTextColor(30, 58, 138);
      pdf.setFont(undefined, 'bold');
      pdf.text(isGeneral ? 'Vendor General Purchase Report' : 'Vendor Purchase Report', 105, 30, { align: 'center' });

      // Draw line under header
      pdf.setDrawColor(200, 200, 200);
      pdf.line(20, 35, 190, 35);

      let yPos = 42;

      // Report Info Section
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'bold');
      pdf.text('Report Information', 20, yPos);
      yPos += 6;
      pdf.setFont(undefined, 'normal');

      if (reportFilters.startDate || reportFilters.endDate) {
        pdf.text(`Date Range: ${reportFilters.startDate || 'All'} to ${reportFilters.endDate || 'All'}`, 25, yPos);
        yPos += 5;
      }
      if (reportFilters.vendor) {
        const vendorName = vendors.find(v => v._id === reportFilters.vendor)?.name || 'N/A';
        pdf.text(`Vendor: ${vendorName}`, 25, yPos);
        yPos += 5;
      }
      pdf.text(`Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 25, yPos);
      yPos += 8;

      // Summary Section
      if (reportFilters.includeSummary && stockEntries.length > 0) {
        const totalQuantity = stockEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);
        const totalCost = stockEntries.reduce((sum, e) => sum + (e.totalCost || 0), 0);
        const uniqueVendors = new Set(stockEntries.map(e => {
          const vendorId = e.vendor?._id || e.vendor;
          return vendorId ? String(vendorId) : null;
        }).filter(Boolean)).size;

        pdf.setFontSize(11);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(240, 240, 240);
        pdf.rect(20, yPos - 4, 170, 6, 'F');
        pdf.text('Summary Statistics', 20, yPos);
        yPos += 7;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(9);
        pdf.text(`Total Purchase Entries: ${stockEntries.length}`, 25, yPos);
        yPos += 5;
        pdf.text(`Total Quantity Purchased: ${totalQuantity}`, 25, yPos);
        yPos += 5;
        pdf.text(`Total Purchase Cost: ${formatCurrencyForPDF(totalCost)}`, 25, yPos);
        yPos += 5;
        pdf.text(`Number of Vendors: ${uniqueVendors}`, 25, yPos);
        yPos += 8;
      }

      // Purchase Entries Table
      if (stockEntries.length > 0) {
        pdf.setFontSize(11);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(240, 240, 240);
        pdf.rect(20, yPos - 4, 170, 6, 'F');
        pdf.text('Purchase Entries', 20, yPos);
        yPos += 7;

        // Table Headers
        pdf.setFontSize(8);
        pdf.setFont(undefined, 'bold');
        pdf.setFillColor(230, 230, 230);
        pdf.rect(20, yPos - 3, 170, 5, 'F');
        pdf.text('Date', 22, yPos);
        pdf.text('Invoice', 50, yPos);
        pdf.text('Product', 80, yPos);
        pdf.text('Vendor', 120, yPos);
        pdf.text('Qty', 150, yPos);
        pdf.text('Unit Price', 160, yPos);
        pdf.text('Total', 175, yPos);
        yPos += 6;

        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(8);

        stockEntries.forEach((entry, index) => {
          // Check if we need a new page
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
            // Redraw table headers on new page
            pdf.setFont(undefined, 'bold');
            pdf.setFontSize(8);
            pdf.setFillColor(230, 230, 230);
            pdf.rect(20, yPos - 3, 170, 5, 'F');
            pdf.text('Date', 22, yPos);
            pdf.text('Invoice', 50, yPos);
            pdf.text('Product', 80, yPos);
            pdf.text('Vendor', 120, yPos);
            pdf.text('Qty', 150, yPos);
            pdf.text('Unit Price', 160, yPos);
            pdf.text('Total', 175, yPos);
            yPos += 6;
            pdf.setFont(undefined, 'normal');
          }

          const date = new Date(entry.invoiceDate || entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const invoiceNumber = (entry.invoiceNumber || 'N/A').substring(0, 12);
          const productName = (entry.product?.name || 'N/A').substring(0, 15);
          const vendorName = (entry.vendor?.name || 'N/A').substring(0, 15);
          const quantity = entry.quantity || 0;
          const purchasePrice = formatCurrencyForPDF(entry.purchasePrice || 0);
          const totalCost = formatCurrencyForPDF(entry.totalCost || 0);

          // Alternate row background
          if (index % 2 === 0) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(20, yPos - 3, 170, 5, 'F');
          }

          pdf.text(date, 22, yPos);
          pdf.text(invoiceNumber, 50, yPos);
          pdf.text(productName, 80, yPos);
          pdf.text(vendorName, 120, yPos);
          pdf.text(quantity.toString(), 150, yPos);
          pdf.text(purchasePrice, 160, yPos);
          pdf.text(totalCost, 175, yPos);
          yPos += 5;

          // Draw separator line
          if (index < stockEntries.length - 1) {
            pdf.setDrawColor(220, 220, 220);
            pdf.line(20, yPos, 190, yPos);
            yPos += 2;
          }
        });
      } else {
        pdf.setFontSize(10);
        pdf.text('No purchase entries found for the selected filters.', 20, yPos);
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

      const fileName = `Vendor_Purchase_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating vendor purchase report:', error);
      throw error;
    }
  };

  const handlePrintSalesSummary = useReactToPrint({
    contentRef: salesSummaryPrintRef,
    documentTitle: `Day-End_Sales_Summary_${new Date().toISOString().split('T')[0]}`,
  });

  const generatePDF = async () => {
    if (generatingPDF) return;
    try {
      setGeneratingPDF(true);
      if (!reportType) {
        alert('Please select a report type');
        return;
      }

      if (reportType === 'day-end') {
        const isGeneral = reportFilters.stockType === 'distribute';
        // Fetch transactions based on report filters
        const queryParams = new URLSearchParams();
        if (reportFilters.course && !isGeneral) queryParams.append('course', reportFilters.course);
        if (reportFilters.paymentMethod) queryParams.append('paymentMethod', reportFilters.paymentMethod);
        if (reportFilters.isPaid !== '') queryParams.append('isPaid', reportFilters.isPaid);
        if (reportFilters.startDate) queryParams.append('startDate', reportFilters.startDate);
        if (reportFilters.endDate) queryParams.append('endDate', reportFilters.endDate);

        const selectedCollegeId = reportFilters.collegeId || selectedCollege;
        if (selectedCollegeId) {
          queryParams.append(isGeneral ? 'collegeId' : 'collegeId', selectedCollegeId);
        }

        const endpoint = isGeneral ? '/api/general-distributions' : '/api/transactions';
        const response = await fetch(apiUrl(`${endpoint}?${queryParams.toString()}`));
        if (!response.ok) throw new Error(`Failed to fetch ${isGeneral ? 'distributions' : 'transactions'} for report`);

        let reportTransactions = await response.json();

        if (isGeneral) {
          // Normalize distribution data to match transaction structure for the report template
          reportTransactions = reportTransactions.map(dist => ({
            ...dist,
            transactionId: dist.distributionId,
            transactionDate: dist.distributionDate,
            student: {
              name: dist.recipientName,
              course: dist.department || '-'
            },
            transactionType: 'distribution',
            items: dist.items.map(item => ({
              ...item,
              name: item.productId?.name || item.name,
              price: item.price || 0,
              total: item.total || 0,
              category: item.productId?.category || 'General'
            }))
          }));
        } else {
          // For Academic stock transactions, items might not have category in the DB response
          // Augment with categories from the products state
          reportTransactions = reportTransactions.map(trans => ({
            ...trans,
            items: (trans.items || []).map(item => {
              if (item.category) return item;
              const prod = products.find(p => p._id === (item.product?._id || item.product));
              return { ...item, category: prod?.category || 'Academic' };
            })
          }));
        }

        // Apply product category filter if selected
        if (reportFilters.productCategory) {
          reportTransactions = reportTransactions.map(trans => {
            const filteredItems = trans.items.filter(item => item.category === reportFilters.productCategory);
            if (filteredItems.length === 0) return null;

            // Recalculate total for the transaction based on filtered items if it's a category-specific report
            const newTotal = filteredItems.reduce((sum, item) => sum + (item.total || 0), 0);
            return {
              ...trans,
              items: filteredItems,
              totalAmount: newTotal
            };
          }).filter(Boolean);
        }

        // Filter by date range on client side (keeping existing logic for safety)
        if (reportFilters.startDate || reportFilters.endDate) {
          reportTransactions = reportTransactions.filter(transaction => {
            const transDate = new Date(transaction.distributionDate || transaction.transactionDate);
            if (reportFilters.startDate && transDate < new Date(reportFilters.startDate)) return false;
            if (reportFilters.endDate && transDate > new Date(reportFilters.endDate + 'T23:59:59')) return false;
            return true;
          });
        }

        // Check if only day-end sales summary is selected (without PDF generation)
        // Show print option if only day-end sales is selected and other options are disabled
        if (reportFilters.includeDayEndSales &&
          !reportFilters.includeSummary &&
          !reportFilters.includeItems) {
          // Show print option instead of PDF
          const salesData = calculateDayEndSales(reportTransactions);
          setSalesSummaryData({
            ...salesData,
            dateRange: {
              start: reportFilters.startDate,
              end: reportFilters.endDate,
            },
            filters: {
              course: reportFilters.course,
              paymentMethod: reportFilters.paymentMethod,
              isPaid: reportFilters.isPaid,
            }
          });
          setShowSalesSummaryPrint(true);
          setShowReportModal(false);
          setReportType('');
          return;
        }

        await generateDayEndReport(reportTransactions, selectedCollegeId);
      } else if (reportType === 'stock') {
        await generateStockReport();
      } else if (reportType === 'vendor-purchase') {
        await generateVendorPurchaseReport();
      }

      setShowReportModal(false);
      setReportType('');
      alert('PDF report generated successfully!');
    } catch (error) {
      console.error('Error generating PDF report:', error);
      alert('Error generating report: ' + error.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto">
        {/* Header with Tabs */}
        <div className="mb-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left Side: Title and Description */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <FileText className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
                {/* <p className="text-gray-600 mt-1">Monitor transactions and generate consolidated reports</p> */}
              </div>
            </div>

            {/* Right Side: Tabs and Actions */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-4">
              {/* College Selector (SuperAdmin only) */}
              {isSuperAdmin && (
                <div className="relative min-w-[200px]">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <select
                    value={selectedCollege}
                    onChange={(e) => setSelectedCollege(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none cursor-pointer text-sm font-medium"
                  >
                    <option value="">Central Warehouse (Global)</option>
                    {colleges.map(college => (
                      <option key={college._id} value={college._id}>
                        {college.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronDown size={16} className="text-gray-500" />
                  </div>
                </div>
              )}

              {/* Campus Indicator (SubAdmin only) */}
              {!isSuperAdmin && selectedCollegeData && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                  <Building2 className="text-blue-600" size={18} />
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Campus:</span>
                  <span className="text-sm font-bold text-blue-900">{selectedCollegeData.name}</span>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('daily')}
                  className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${activeTab === 'daily'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>Daily</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('monthly')}
                  className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${activeTab === 'monthly'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span>Monthly</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('stock')}
                  className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${activeTab === 'stock'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Package size={16} />
                    <span>Stock</span>
                  </div>
                </button>
              </div>

              {/* Generate Report Button */}
              <button
                onClick={() => {
                  setReportFilters(prev => ({
                    ...prev,
                    collegeId: selectedCollege || ''
                  }));
                  setTimeout(() => {
                    setShowReportModal(true);
                  }, 200);
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-lg hover:shadow-xl font-medium whitespace-nowrap"
              >
                <Download size={18} />
                Generate Report
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Daily Report Tab */}
          {activeTab === 'daily' && (
            <>
              {/* Filters Section */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 mr-auto">
                    <Filter className="text-blue-600" size={18} />
                    <span className="text-sm font-medium text-gray-700">Filters:</span>
                  </div>
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search by transaction ID, student name, or student ID..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <select
                    value={filters.course}
                    onChange={(e) => setFilters({ ...filters, course: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
                  >
                    <option value="">All Courses</option>
                    {courseOptions.map(course => (
                      <option key={course} value={course}>{course.toUpperCase()}</option>
                    ))}
                  </select>
                  <select
                    value={filters.transactionType}
                    onChange={(e) => setFilters({ ...filters, transactionType: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[180px]"
                  >
                    <option value="">All Transactions</option>
                    <option value="student">Student Transactions</option>
                    <option value="employee">Employee Transactions</option>
                    <option value="college_transfer">College Transfers</option>
                  </select>
                  <select
                    value={filters.paymentMethod}
                    onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[170px]"
                  >
                    <option value="">All Payment Methods</option>
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="split">Split</option>
                    <option value="transfer">Transfer</option>
                  </select>

                  {/* Expandable Filters Section */}
                  {filtersExpanded && (
                    <>
                      <select
                        value={filters.isPaid}
                        onChange={(e) => setFilters({ ...filters, isPaid: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[160px]"
                      >
                        <option value="">All Payment Status</option>
                        <option value="true">Paid</option>
                        <option value="false">Unpaid</option>
                      </select>
                      <div className="relative min-w-[160px]">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                        <input
                          type="date"
                          placeholder="Start Date"
                          value={filters.startDate}
                          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="relative min-w-[160px]">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                        <input
                          type="date"
                          placeholder="End Date"
                          value={filters.endDate}
                          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
                  >
                    {filtersExpanded ? (
                      <>
                        <ChevronUp size={16} />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} />
                        <span>More</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Statistics Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100 mb-1">Total Amount</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(statistics.totalAmount)}</p>
                      <p className="text-xs text-blue-100 mt-2">{statistics.totalTransactions} transaction{statistics.totalTransactions !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-400/30 rounded-lg flex items-center justify-center">
                      <DollarSign size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-100 mb-1">Paid Amount</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(statistics.paidAmount)}</p>
                      <p className="text-xs text-green-100 mt-2">{statistics.paidCount} paid transaction{statistics.paidCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-12 h-12 bg-green-400/30 rounded-lg flex items-center justify-center">
                      <TrendingUp size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-red-100 mb-1">Unpaid Amount</p>
                      <p className="text-2xl font-bold text-white">{formatCurrency(statistics.unpaidAmount)}</p>
                      <p className="text-xs text-red-100 mt-2">{statistics.unpaidCount} unpaid transaction{statistics.unpaidCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-12 h-12 bg-red-400/30 rounded-lg flex items-center justify-center">
                      <AlertCircle size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-purple-100 mb-1">Items Sold</p>
                      <p className="text-2xl font-bold text-white">{statistics.totalItemsSold}</p>
                      <p className="text-xs text-purple-100 mt-2">{statistics.itemsSold.length} unique item{statistics.itemsSold.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-400/30 rounded-lg flex items-center justify-center">
                      <ShoppingCart size={24} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Sold Details - Expandable */}
              {/* {statistics.itemsSold.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div
                    className="px-6 py-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setItemsSoldExpanded(!itemsSoldExpanded)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart size={20} className="text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Items Sold ({statistics.itemsSold.length} unique items)
                        </h3>
                        <p className="text-sm text-gray-500">Click to {itemsSoldExpanded ? 'collapse' : 'expand'} individual items sold</p>
                      </div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                      {itemsSoldExpanded ? (
                        <>
                          <ChevronUp size={18} />
                          <span>Collapse</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={18} />
                          <span>Expand</span>
                        </>
                      )}
                    </button>
                  </div>
                  {itemsSoldExpanded && (
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                        {statistics.itemsSold.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                            </div>
                            <div className="ml-3">
                              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 text-purple-700 font-semibold text-base">
                                {item.quantity}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )} */}

              {/* Student Transactions Table */}
              {(filters.transactionType === '' || filters.transactionType === 'student') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Transaction Details</h3>
                      <p className="text-sm text-gray-500">Review student transactions and manage receipts</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        {studentTransactions.length} transactions
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Show:</label>
                        <select
                          value={itemsPerPage}
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                      <p className="text-gray-600">Loading transactions...</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        {studentTransactions.length === 0 ? (
                          <div className="p-12 text-center">
                            <div className="text-6xl mb-4">📋</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">No student transactions found</h3>
                            <p className="text-gray-600">
                              {searchTerm || Object.values(filters).some(f => f !== '')
                                ? 'Try adjusting your search criteria'
                                : 'No student transactions have been created yet'}
                            </p>
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {paginatedStudentTransactions.map(transaction => (
                                <tr key={transaction._id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-gray-900">{transaction.student?.name || transaction.employee?.name || 'N/A'}</span>
                                      <span className="text-xs text-gray-500">{transaction.student?.studentId || transaction.employee?.empNo || ''}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-900">{(transaction.student?.course || transaction.employee?.department || 'N/A').toUpperCase()}</span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-900">{(transaction.student?.branch || transaction.employee?.division || 'N/A').toUpperCase()}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm text-gray-900">
                                      {transaction.items?.length || 0} item{transaction.items?.length !== 1 ? 's' : ''}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(transaction.totalAmount)}</span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {transaction.transactionType === 'branch_transfer' || transaction.transactionType === 'college_transfer' ? (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.isPaid
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                        }`}>
                                        {transaction.isPaid ? 'Paid' : 'Unpaid'}
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.paymentMethod === 'cash'
                                        ? 'bg-green-100 text-green-800'
                                        : transaction.paymentMethod === 'online'
                                          ? 'bg-blue-100 text-blue-800'
                                          : transaction.paymentMethod === 'split'
                                            ? 'bg-indigo-100 text-indigo-800'
                                            : 'bg-purple-100 text-purple-800'
                                        }`}>
                                        {transaction.paymentMethod === 'cash' ? 'Cash' : transaction.paymentMethod === 'online' ? 'Online' : transaction.paymentMethod === 'split' ? 'Split' : 'Transfer'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.isPaid
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                      }`}>
                                      {transaction.isPaid ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-500">{formatDate(transaction.transactionDate)}</span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleViewDetails(transaction)}
                                        className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                      >
                                        <Eye size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(transaction._id)}
                                        className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {studentTransactions.length > 0 && studentTotalPages > 1 && (
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                              Showing <span className="font-medium">{studentStartIndex + 1}</span> to{' '}
                              <span className="font-medium">{Math.min(studentEndIndex, studentTransactions.length)}</span> of{' '}
                              <span className="font-medium">{studentTransactions.length}</span> transactions
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                              >
                                <ChevronLeft size={16} />
                                Previous
                              </button>

                              <div className="flex items-center gap-1">
                                {Array.from({ length: studentTotalPages }, (_, i) => i + 1).map(page => {
                                  if (
                                    page === 1 ||
                                    page === studentTotalPages ||
                                    (page >= currentPage - 1 && page <= currentPage + 1)
                                  ) {
                                    return (
                                      <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${currentPage === page
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                          }`}
                                      >
                                        {page}
                                      </button>
                                    );
                                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                                    return <span key={page} className="px-2 text-gray-500">...</span>;
                                  }
                                  return null;
                                })}
                              </div>

                              <button
                                onClick={() => setCurrentPage(prev => Math.min(studentTotalPages, prev + 1))}
                                disabled={currentPage === studentTotalPages}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                              >
                                Next
                                <ChevronRight size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* College Transfers Table */}
              {(filters.transactionType === '' || filters.transactionType === 'branch_transfer' || filters.transactionType === 'college_transfer') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">College Transfers</h3>
                      <p className="text-sm text-gray-500">Review stock transfers to colleges</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        {branchTransfers.length} transfers
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600">Show:</label>
                        <select
                          value={itemsPerPage}
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setBranchTransferPage(1);
                          }}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                      <p className="text-gray-600">Loading transfers...</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        {branchTransfers.length === 0 ? (
                          <div className="p-12 text-center">
                            <div className="text-6xl mb-4">📦</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">No college transfers found</h3>
                            <p className="text-gray-600">
                              {searchTerm || Object.values(filters).some(f => f !== '')
                                ? 'Try adjusting your search criteria'
                                : 'No college transfers have been created yet'}
                            </p>
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">College</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {paginatedBranchTransfers.map(transaction => (
                                <tr key={transaction._id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-gray-900">{transaction.collegeTransfer?.collegeName || transaction.branchTransfer?.branchName || 'N/A'}</span>
                                      <span className="text-xs text-gray-500">College Transfer</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-900">{transaction.collegeTransfer?.collegeLocation || transaction.branchTransfer?.branchLocation || 'N/A'}</span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-sm text-gray-900">
                                      {transaction.items?.length || 0} item{transaction.items?.length !== 1 ? 's' : ''}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(transaction.totalAmount)}</span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${transaction.isPaid
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                      }`}>
                                      {transaction.isPaid ? 'Paid' : 'Unpaid'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-sm text-gray-500">{formatDate(transaction.transactionDate)}</span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleViewDetails(transaction)}
                                        className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                      >
                                        <Eye size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(transaction._id)}
                                        className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {branchTransfers.length > 0 && branchTransferTotalPages > 1 && (
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                              Showing <span className="font-medium">{branchTransferStartIndex + 1}</span> to{' '}
                              <span className="font-medium">{Math.min(branchTransferEndIndex, branchTransfers.length)}</span> of{' '}
                              <span className="font-medium">{branchTransfers.length}</span> transfers
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setBranchTransferPage(prev => Math.max(1, prev - 1))}
                                disabled={branchTransferPage === 1}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                              >
                                <ChevronLeft size={16} />
                                Previous
                              </button>

                              <div className="flex items-center gap-1">
                                {Array.from({ length: branchTransferTotalPages }, (_, i) => i + 1).map(page => {
                                  if (
                                    page === 1 ||
                                    page === branchTransferTotalPages ||
                                    (page >= branchTransferPage - 1 && page <= branchTransferPage + 1)
                                  ) {
                                    return (
                                      <button
                                        key={page}
                                        onClick={() => setBranchTransferPage(page)}
                                        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${branchTransferPage === page
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                          }`}
                                      >
                                        {page}
                                      </button>
                                    );
                                  } else if (
                                    page === branchTransferPage - 2 ||
                                    page === branchTransferPage + 2
                                  ) {
                                    return (
                                      <span key={page} className="px-2 text-gray-500">
                                        ...
                                      </span>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                              <button
                                onClick={() => setBranchTransferPage(prev => Math.min(branchTransferTotalPages, prev + 1))}
                                disabled={branchTransferPage === branchTransferTotalPages}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                              >
                                Next
                                <ChevronRight size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Monthly Report Tab - Enhanced Comprehensive View */}
          {activeTab === 'monthly' && (
            <div className="space-y-6">
              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100 mb-1">Total Items</p>
                      <p className="text-2xl font-bold text-white">{comprehensiveMonthlyReport.items.length}</p>
                      <p className="text-xs text-blue-100 mt-2">Unique products sold</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-400/30 rounded-lg flex items-center justify-center">
                      <Package size={24} />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-green-100 mb-1">Months Covered</p>
                      <p className="text-2xl font-bold text-white">{comprehensiveMonthlyReport.months.length}</p>
                      <p className="text-xs text-green-100 mt-2">Active months</p>
                    </div>
                    <div className="w-12 h-12 bg-green-400/30 rounded-lg flex items-center justify-center">
                      <Calendar size={24} />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-purple-100 mb-1">Total Transactions</p>
                      <p className="text-2xl font-bold text-white">{studentTransactions.length}</p>
                      <p className="text-xs text-purple-100 mt-2">All time transactions</p>
                    </div>
                    <div className="w-12 h-12 bg-purple-400/30 rounded-lg flex items-center justify-center">
                      <Receipt size={24} />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-orange-100 mb-1">Total Revenue</p>
                      <p className="text-2xl font-bold text-white">
                        {formatCurrency(studentTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0))}
                      </p>
                      <p className="text-xs text-orange-100 mt-2">All time revenue</p>
                    </div>
                    <div className="w-12 h-12 bg-orange-400/30 rounded-lg flex items-center justify-center">
                      <DollarSign size={24} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Report Content with Unified Header */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Unified Header with Toggle */}
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {monthlyReportSubTab === 'monthly-sale' ? (
                        <>
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="text-blue-600" size={20} />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold text-gray-900">Monthly Sale Report</h2>
                            <p className="text-sm text-gray-600 mt-1">
                              Comprehensive view of all items sold across all months
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <Calendar className="text-green-600" size={20} />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold text-gray-900">Daily Breakdown per Month</h2>
                            <p className="text-sm text-gray-600 mt-1">
                              Daily breakdown of sales for selected month
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Month Selector - Show only when Daily Breakdown is selected */}
                      {monthlyReportSubTab === 'daily-breakdown' && (
                        <select
                          value={selectedMonthForDaily || ''}
                          onChange={(e) => setSelectedMonthForDaily(e.target.value || null)}
                          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-sm font-medium"
                        >
                          <option value="">Select a month</option>
                          {monthlyStats.map((month) => (
                            <option key={month.monthKey} value={month.monthKey}>
                              {month.month}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-sm">
                        <button
                          onClick={() => setMonthlyReportSubTab('monthly-sale')}
                          className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${monthlyReportSubTab === 'monthly-sale'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={16} />
                            <span>Monthly Sale</span>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            setMonthlyReportSubTab('daily-breakdown');
                            // Auto-select current month when switching to daily breakdown
                            if (monthlyStats.length > 0) {
                              const currentMonthKey = getCurrentMonthKey();
                              const currentMonthExists = monthlyStats.some(m => m.monthKey === currentMonthKey);
                              if (currentMonthExists) {
                                setSelectedMonthForDaily(currentMonthKey);
                              } else if (monthlyStats.length > 0) {
                                // Select most recent month if current month doesn't have data
                                setSelectedMonthForDaily(monthlyStats[0].monthKey);
                              }
                            }
                          }}
                          className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${monthlyReportSubTab === 'daily-breakdown'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <Calendar size={16} />
                            <span>Daily Breakdown</span>
                          </div>
                        </button>
                      </div>
                      {productsLoading && (
                        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Monthly Sale Report Content */}
                {monthlyReportSubTab === 'monthly-sale' && (
                  <div>
                    {comprehensiveMonthlyReport.items.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No monthly data available</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                S.No
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[300px]">
                                Item Name
                              </th>
                              {comprehensiveMonthlyReport.months.map((month, idx) => (
                                <th
                                  key={month.key}
                                  className={`px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider ${idx < comprehensiveMonthlyReport.months.length - 1 ? 'border-r border-gray-200' : ''
                                    }`}
                                  title={month.fullName}
                                >
                                  {month.name}
                                </th>
                              ))}
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-100">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {/* Monthly Revenue/Income Summary Row */}
                            <tr className="bg-gradient-to-r from-green-50 to-emerald-50 font-bold border-b border-green-200">
                              <td colSpan={2} className="px-4 py-3 text-gray-900 border-r border-gray-300">
                                MONTHLY INCOME
                              </td>
                              {comprehensiveMonthlyReport.months.map((month, monthIdx) => {
                                const monthRevenue = comprehensiveMonthlyReport.monthlyRevenue.get(month.key) || 0;
                                return (
                                  <td
                                    key={month.key}
                                    className={`px-3 py-3 whitespace-nowrap text-right text-green-700 font-bold ${monthIdx < comprehensiveMonthlyReport.months.length - 1 ? 'border-r border-gray-300' : ''
                                      }`}
                                  >
                                    {monthRevenue > 0 ? formatCurrency(monthRevenue) : '-'}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 whitespace-nowrap text-right text-green-800 font-bold bg-green-100">
                                {formatCurrency(
                                  Array.from(comprehensiveMonthlyReport.monthlyRevenue.values()).reduce(
                                    (sum, revenue) => sum + revenue,
                                    0
                                  )
                                )}
                              </td>
                            </tr>
                            {/* College Transfers row per month */}
                            <tr className="bg-amber-50/80 font-bold border-b-2 border-amber-300">
                              <td colSpan={2} className="px-4 py-3 text-amber-800 border-r border-gray-300">
                                COLLEGE TRANSFERS
                              </td>
                              {comprehensiveMonthlyReport.months.map((month, monthIdx) => {
                                const transferRev = comprehensiveMonthlyReport.monthlyTransferRevenue.get(month.key) || 0;
                                return (
                                  <td
                                    key={month.key}
                                    className={`px-3 py-3 whitespace-nowrap text-right text-amber-700 font-bold ${monthIdx < comprehensiveMonthlyReport.months.length - 1 ? 'border-r border-gray-300' : ''
                                      }`}
                                  >
                                    {transferRev > 0 ? formatCurrency(transferRev) : '-'}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 whitespace-nowrap text-right text-amber-800 font-bold bg-amber-100/50">
                                {formatCurrency(
                                  Array.from(comprehensiveMonthlyReport.monthlyTransferRevenue.values()).reduce(
                                    (sum, rev) => sum + rev,
                                    0
                                  )
                                )}
                              </td>
                            </tr>
                            {comprehensiveMonthlyReport.items.map((itemName, itemIndex) => {
                              const itemSales = comprehensiveMonthlyReport.itemMonthlySales.get(itemName) || new Map();
                              const currentPrice = getProductPrice(itemName);
                              const rowTotal = Array.from(itemSales.values()).reduce((sum, qty) => sum + qty, 0);
                              const isEven = itemIndex % 2 === 0;

                              return (
                                <tr
                                  key={itemIndex}
                                  className={`hover:bg-blue-50 transition-colors ${isEven ? 'bg-white' : 'bg-gray-50/50'}`}
                                >
                                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 font-medium border-r border-gray-200">
                                    {itemIndex + 1}
                                  </td>
                                  <td className="px-4 py-3 text-gray-900 font-medium border-r border-gray-200">
                                    {itemName}
                                    {currentPrice > 0 && (
                                      <span className="text-gray-600 font-normal ml-2">
                                        ({formatCurrency(currentPrice)})
                                      </span>
                                    )}
                                  </td>
                                  {comprehensiveMonthlyReport.months.map((month, monthIdx) => {
                                    const qty = itemSales.get(month.key) || 0;
                                    return (
                                      <td
                                        key={month.key}
                                        className={`px-3 py-3 whitespace-nowrap text-right font-medium ${qty > 0 ? 'text-gray-900' : 'text-gray-400'
                                          } ${monthIdx < comprehensiveMonthlyReport.months.length - 1 ? 'border-r border-gray-200' : ''}`}
                                      >
                                        {qty > 0 ? qty : '-'}
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-gray-900 bg-gray-100">
                                    {rowTotal > 0 ? rowTotal : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                            {/* Total Row */}
                            <tr className="bg-gray-100 font-bold">
                              <td colSpan={2} className="px-4 py-3 text-gray-900 border-r border-gray-300">
                                GRAND TOTAL
                              </td>
                              {comprehensiveMonthlyReport.months.map((month, monthIdx) => {
                                const monthTotal = comprehensiveMonthlyReport.monthlyTotals.get(month.key) || 0;
                                return (
                                  <td
                                    key={month.key}
                                    className={`px-3 py-3 whitespace-nowrap text-right text-gray-900 ${monthIdx < comprehensiveMonthlyReport.months.length - 1 ? 'border-r border-gray-300' : ''
                                      }`}
                                  >
                                    {monthTotal > 0 ? monthTotal : '-'}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 bg-blue-100">
                                {Array.from(comprehensiveMonthlyReport.monthlyTotals.values()).reduce((sum, total) => sum + total, 0)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Daily Breakdown Content */}
                {monthlyReportSubTab === 'daily-breakdown' && (
                  <div className="p-6">
                    {selectedMonthForDaily && (
                      (() => {
                        const selectedMonth = monthlyStats.find(m => m.monthKey === selectedMonthForDaily);
                        if (!selectedMonth || !selectedMonth.dayWiseBreakdown || selectedMonth.dayWiseBreakdown.length === 0) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              No daily data available for this month
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-4">
                            {/* Month Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                              <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                                <p className="text-lg font-bold text-blue-700">{formatCurrency(selectedMonth.totalAmount)}</p>
                              </div>
                              <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Paid Amount</p>
                                <p className="text-lg font-bold text-green-700">{formatCurrency(selectedMonth.paidAmount)}</p>
                              </div>
                              <div className="bg-red-50 rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Unpaid Amount</p>
                                <p className="text-lg font-bold text-red-700">{formatCurrency(selectedMonth.unpaidAmount)}</p>
                              </div>
                              <div className="bg-purple-50 rounded-lg p-4">
                                <p className="text-xs text-gray-600 mb-1">Transactions</p>
                                <p className="text-lg font-bold text-purple-700">{selectedMonth.transactions.length}</p>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mb-4">Revenue includes student sales and paid college/branch transfers.</p>

                            {/* Daily Sales Table - Items as Rows, Days as Columns */}
                            {dailyBreakdownReport ? (
                              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                        S.No
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-gray-200 min-w-[300px]">
                                        Item Name
                                      </th>
                                      {dailyBreakdownReport.days.map((day, idx) => (
                                        <th
                                          key={day.key}
                                          className={`px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider ${idx < dailyBreakdownReport.days.length - 1 ? 'border-r border-gray-200' : ''
                                            }`}
                                          title={day.fullDate}
                                        >
                                          {day.name}
                                        </th>
                                      ))}
                                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-100">
                                        Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {/* Daily Revenue/Income Summary Row */}
                                    <tr className="bg-gradient-to-r from-green-50 to-emerald-50 font-bold border-b-2 border-green-300">
                                      <td colSpan={2} className="px-4 py-3 text-gray-900 border-r border-gray-300">
                                        DAILY INCOME
                                      </td>
                                      {dailyBreakdownReport.days.map((day, dayIdx) => {
                                        const dayRevenue = dailyBreakdownReport.dailyRevenue.get(day.key) || 0;
                                        return (
                                          <td
                                            key={day.key}
                                            className={`px-3 py-3 whitespace-nowrap text-right text-green-700 font-bold ${dayIdx < dailyBreakdownReport.days.length - 1 ? 'border-r border-gray-300' : ''
                                              }`}
                                          >
                                            {dayRevenue > 0 ? formatCurrency(dayRevenue) : '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="px-4 py-3 whitespace-nowrap text-right text-green-800 font-bold bg-green-100">
                                        {formatCurrency(
                                          Array.from(dailyBreakdownReport.dailyRevenue.values()).reduce(
                                            (sum, revenue) => sum + revenue,
                                            0
                                          )
                                        )}
                                      </td>
                                    </tr>
                                    {/* College Transfers row (amount per day in table) */}
                                    <tr className="bg-amber-50/80 font-medium border-b border-amber-200">
                                      <td className="px-4 py-2 text-gray-600 border-r border-gray-200"></td>
                                      <td className="px-4 py-2 text-amber-800 border-r border-gray-200">College Transfers</td>
                                      {dailyBreakdownReport.days.map((day, dayIdx) => {
                                        const transferRev = dailyBreakdownReport.dailyTransferRevenue?.get(day.key) || 0;
                                        return (
                                          <td
                                            key={day.key}
                                            className={`px-3 py-2 whitespace-nowrap text-right ${transferRev > 0 ? 'text-amber-800 font-medium' : 'text-gray-400'} ${dayIdx < dailyBreakdownReport.days.length - 1 ? 'border-r border-gray-200' : ''}`}
                                          >
                                            {transferRev > 0 ? formatCurrency(transferRev) : '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="px-4 py-2 whitespace-nowrap text-right text-amber-800 font-medium bg-amber-100">
                                        {formatCurrency(
                                          Array.from(dailyBreakdownReport.dailyTransferRevenue?.values() || []).reduce(
                                            (sum, rev) => sum + rev,
                                            0
                                          )
                                        )}
                                      </td>
                                    </tr>
                                    {/* Item Rows */}
                                    {dailyBreakdownReport.items.map((itemName, itemIndex) => {
                                      const itemSales = dailyBreakdownReport.itemDailySales.get(itemName) || new Map();
                                      const currentPrice = getProductPrice(itemName);
                                      const rowTotal = Array.from(itemSales.values()).reduce((sum, qty) => sum + qty, 0);
                                      const isEven = itemIndex % 2 === 0;

                                      return (
                                        <tr
                                          key={itemIndex}
                                          className={`hover:bg-blue-50 transition-colors ${isEven ? 'bg-white' : 'bg-gray-50/50'}`}
                                        >
                                          <td className="px-4 py-3 whitespace-nowrap text-gray-600 font-medium border-r border-gray-200">
                                            {itemIndex + 1}
                                          </td>
                                          <td className="px-4 py-3 text-gray-900 font-medium border-r border-gray-200">
                                            {itemName}
                                            {currentPrice > 0 && (
                                              <span className="text-gray-600 font-normal ml-2">
                                                ({formatCurrency(currentPrice)})
                                              </span>
                                            )}
                                          </td>
                                          {dailyBreakdownReport.days.map((day, dayIdx) => {
                                            const qty = itemSales.get(day.key) || 0;
                                            return (
                                              <td
                                                key={day.key}
                                                className={`px-3 py-3 whitespace-nowrap text-right font-medium ${qty > 0 ? 'text-gray-900' : 'text-gray-400'
                                                  } ${dayIdx < dailyBreakdownReport.days.length - 1 ? 'border-r border-gray-200' : ''}`}
                                              >
                                                {qty > 0 ? qty : '-'}
                                              </td>
                                            );
                                          })}
                                          <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-gray-900 bg-gray-100">
                                            {rowTotal > 0 ? rowTotal : '-'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {/* Total Row */}
                                    <tr className="bg-gray-100 font-bold">
                                      <td colSpan={2} className="px-4 py-3 text-gray-900 border-r border-gray-300">
                                        GRAND TOTAL
                                      </td>
                                      {dailyBreakdownReport.days.map((day, dayIdx) => {
                                        const dayTotal = dailyBreakdownReport.dailyTotals.get(day.key) || 0;
                                        return (
                                          <td
                                            key={day.key}
                                            className={`px-3 py-3 whitespace-nowrap text-right text-gray-900 ${dayIdx < dailyBreakdownReport.days.length - 1 ? 'border-r border-gray-300' : ''
                                              }`}
                                          >
                                            {dayTotal > 0 ? dayTotal : '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 bg-blue-100">
                                        {Array.from(dailyBreakdownReport.dailyTotals.values()).reduce(
                                          (sum, total) => sum + total,
                                          0
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500">
                                Loading daily breakdown data...
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stock Report Tab */}
          {activeTab === 'stock' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Stock Report</h2>
                <p className="text-gray-600 mb-6">View stock entries statistics and total amount collected from stock purchases.</p>

                {stockEntriesLoading ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading stock statistics...</p>
                  </div>
                ) : (
                  <>
                    {/* Stock Statistics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      {/* Total Stock Entries */}
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-blue-100 mb-1">Total Entries</p>
                            <p className="text-2xl font-bold text-white">{stockEntries.length}</p>
                            <p className="text-xs text-blue-100 mt-2">Stock purchase entries</p>
                          </div>
                          <div className="w-12 h-12 bg-blue-400/30 rounded-lg flex items-center justify-center">
                            <Package size={24} />
                          </div>
                        </div>
                      </div>

                      {/* Total Quantity */}
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-green-100 mb-1">Total Quantity</p>
                            <p className="text-2xl font-bold text-white">
                              {stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0).toLocaleString()}
                            </p>
                            <p className="text-xs text-green-100 mt-2">Items purchased</p>
                          </div>
                          <div className="w-12 h-12 bg-green-400/30 rounded-lg flex items-center justify-center">
                            <ShoppingCart size={24} />
                          </div>
                        </div>
                      </div>

                      {/* Total Cost */}
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-purple-100 mb-1">Total Cost</p>
                            <p className="text-2xl font-bold text-white">
                              {formatCurrency(stockEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0))}
                            </p>
                            <p className="text-xs text-purple-100 mt-2">Amount spent</p>
                          </div>
                          <div className="w-12 h-12 bg-purple-400/30 rounded-lg flex items-center justify-center">
                            <DollarSign size={24} />
                          </div>
                        </div>
                      </div>

                      {/* Unique Vendors */}
                      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-orange-100 mb-1">Vendors</p>
                            <p className="text-2xl font-bold text-white">
                              {new Set(stockEntries.map(e => e.vendor?._id || e.vendor).filter(Boolean)).size}
                            </p>
                            <p className="text-xs text-orange-100 mt-2">Unique vendors</p>
                          </div>
                          <div className="w-12 h-12 bg-orange-400/30 rounded-lg flex items-center justify-center">
                            <Building2 size={24} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Statistics */}
                    {stockEntries.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <p className="text-sm text-gray-600 mb-1">Average Quantity per Entry</p>
                          <p className="text-xl font-bold text-gray-900">
                            {Math.round(stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0) / stockEntries.length)}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <p className="text-sm text-gray-600 mb-1">Average Cost per Entry</p>
                          <p className="text-xl font-bold text-gray-900">
                            {formatCurrency(stockEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0) / stockEntries.length)}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                          <p className="text-sm text-gray-600 mb-1">Average Unit Price</p>
                          <p className="text-xl font-bold text-gray-900">
                            {(() => {
                              const totalQty = stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
                              const totalCost = stockEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0);
                              return totalQty > 0 ? formatCurrency(totalCost / totalQty) : formatCurrency(0);
                            })()}
                          </p>
                        </div>
                      </div>
                    )}

                    {stockEntries.length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No stock entries found</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Details Modal */}
      {
        selectedTransaction && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedTransaction(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Transaction Details</h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Transaction ID</p>
                    <p className="font-semibold">{selectedTransaction.transactionId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-semibold">{formatDate(selectedTransaction.transactionDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Student Name</p>
                    <p className="font-semibold">{selectedTransaction.student?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Student ID</p>
                    <p className="font-semibold">{selectedTransaction.student?.studentId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Course</p>
                    <p className="font-semibold">{selectedTransaction.student?.course?.toUpperCase()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Branch</p>
                    <p className="font-semibold">{selectedTransaction.student?.branch?.toUpperCase() || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Year</p>
                    <p className="font-semibold">{selectedTransaction.student?.year || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Semester</p>
                    <p className="font-semibold">{selectedTransaction.student?.semester || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment Method</p>
                    <p className="font-semibold capitalize">{selectedTransaction.paymentMethod}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedTransaction.isPaid
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                      }`}>
                      {selectedTransaction.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="font-semibold text-lg">{formatCurrency(selectedTransaction.totalAmount)}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Items</h3>
                  <table className="w-full border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Item Name</th>
                        <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Quantity</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Unit Price</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransaction.items?.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-200">
                          <td className="px-4 py-2">{item.name}</td>
                          <td className="px-4 py-2 text-center">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedTransaction.remarks && (
                  <div className="mb-6">
                    <p className="text-sm text-gray-500 mb-1">Remarks</p>
                    <p className="text-gray-900">{selectedTransaction.remarks}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Reports Modal */}
      {
        showReportModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }} onClick={() => {
            setShowReportModal(false);
            setReportType('');
          }}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-900">Generate Report</h2>
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setReportType('');
                  }}
                  className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
                >
                  <X size={18} className="text-gray-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {!reportType ? (
                  // Report Type Selection
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600 mb-4">Select the type of report you want to generate</p>
                    <div className="grid grid-cols-1 gap-4">
                      <button
                        onClick={() => {
                          setReportType('day-end');
                          // Reset to today's date when selecting day-end report
                          setReportFilters(prev => ({
                            ...prev,
                            startDate: getTodayDate(),
                            endDate: getTodayDate(),
                          }));
                        }}
                        className="p-6 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Receipt className="text-purple-600" size={24} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">Day-End Report</h3>
                            <p className="text-sm text-gray-600">Transaction report with date filters</p>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setReportType('stock')}
                        className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Package className="text-blue-600" size={24} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">Stock Report</h3>
                            <p className="text-sm text-gray-600">Current stock levels for all products</p>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setReportType('vendor-purchase')}
                        className="p-6 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <Building2 className="text-green-600" size={24} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">Vendor Purchase Report</h3>
                            <p className="text-sm text-gray-600">Purchase entries from vendors</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  // Report Filters based on type
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <button
                        onClick={() => setReportType('')}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        ← Back
                      </button>
                      <span className="text-gray-400">|</span>
                      <span className="text-sm font-medium text-gray-700">
                        {reportType === 'day-end' && 'Day-End Report'}
                        {reportType === 'stock' && 'Stock Report'}
                        {reportType === 'vendor-purchase' && 'Vendor Purchase Report'}
                      </span>
                    </div>

                    {/* Shared College Selector (SuperAdmin only) */}
                    {isSuperAdmin && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">College / Campus</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                          <select
                            value={reportFilters.collegeId}
                            onChange={(e) => setReportFilters({ ...reportFilters, collegeId: e.target.value })}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                          >
                            <option value="">Central Warehouse (Global)</option>
                            {colleges.map(college => (
                              <option key={college._id} value={college._id}>
                                {college.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Day-End Report Filters */}
                    {reportType === 'day-end' && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Stock Type</label>
                          <div className="flex gap-4">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="academic"
                                checked={reportFilters.stockType === 'academic'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              Academic Stock
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="distribute"
                                checked={reportFilters.stockType === 'distribute'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              General/Distribute Stock
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="date"
                                value={reportFilters.startDate}
                                onChange={(e) => setReportFilters({ ...reportFilters, startDate: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="date"
                                value={reportFilters.endDate}
                                onChange={(e) => setReportFilters({ ...reportFilters, endDate: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                        {reportFilters.stockType === 'academic' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                              <select
                                value={reportFilters.course}
                                onChange={(e) => setReportFilters({ ...reportFilters, course: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                <option value="">All Courses</option>
                                {courseOptions.map(course => (
                                  <option key={course} value={course}>{course.toUpperCase()}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                              <select
                                value={reportFilters.paymentMethod}
                                onChange={(e) => setReportFilters({ ...reportFilters, paymentMethod: e.target.value })}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                <option value="">All Payment Methods</option>
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                              </select>
                            </div>
                          </>
                        )}
                        {reportFilters.stockType === 'academic' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                            <select
                              value={reportFilters.productCategory}
                              onChange={(e) => setReportFilters({ ...reportFilters, productCategory: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">All Categories</option>
                              {availableCategories.map(category => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {reportFilters.stockType === 'academic' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                            <select
                              value={reportFilters.isPaid}
                              onChange={(e) => setReportFilters({ ...reportFilters, isPaid: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">All Payment Status</option>
                              <option value="true">Paid</option>
                              <option value="false">Unpaid</option>
                            </select>
                          </div>
                        )}
                        <div className="pt-4 border-t border-gray-200 space-y-3">
                          <h3 className="text-sm font-semibold text-gray-700 mb-3">Report Options</h3>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeItems"
                              checked={reportFilters.includeItems}
                              onChange={(e) => setReportFilters({ ...reportFilters, includeItems: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="includeItems" className="text-sm font-medium text-gray-700 cursor-pointer">
                              Include item details in report
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeSummary"
                              checked={reportFilters.includeSummary}
                              onChange={(e) => setReportFilters({
                                ...reportFilters,
                                includeSummary: e.target.checked,
                                onlyStatistics: e.target.checked ? false : reportFilters.onlyStatistics
                              })}
                              disabled={reportFilters.onlyStatistics}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <label htmlFor="includeSummary" className={`text-sm font-medium cursor-pointer ${reportFilters.onlyStatistics ? 'text-gray-400' : 'text-gray-700'}`}>
                              Include summary statistics (with transaction details table)
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="onlyStatistics"
                              checked={reportFilters.onlyStatistics}
                              onChange={(e) =>
                                setReportFilters({
                                  ...reportFilters,
                                  onlyStatistics: e.target.checked,
                                  includeSummary: e.target.checked ? true : reportFilters.includeSummary,
                                  includeItems: e.target.checked ? false : reportFilters.includeItems,
                                })
                              }
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="onlyStatistics" className="text-sm font-medium text-gray-700 cursor-pointer">
                              Statistics only mode (no transaction details table)
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeDayEndSales"
                              checked={reportFilters.includeDayEndSales}
                              onChange={(e) => setReportFilters({ ...reportFilters, includeDayEndSales: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="includeDayEndSales" className="text-sm font-medium text-gray-700 cursor-pointer">
                              Include day-end sales summary (items sold with quantities)
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Stock Report Filters */}
                    {reportType === 'stock' && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Stock Type</label>
                          <div className="flex gap-4">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="academic"
                                checked={reportFilters.stockType === 'academic'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              Academic Stock
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="distribute"
                                checked={reportFilters.stockType === 'distribute'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              Distribute Stock
                            </label>
                          </div>
                        </div>

                        {reportFilters.stockType === 'academic' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                            <select
                              value={reportFilters.course}
                              onChange={(e) => setReportFilters({ ...reportFilters, course: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">All Courses</option>
                              {courseOptions.map(course => (
                                <option key={course} value={course}>{course.toUpperCase()}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {reportFilters.stockType === 'academic' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Product Category</label>
                            <select
                              value={reportFilters.productCategory}
                              onChange={(e) => setReportFilters({ ...reportFilters, productCategory: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">All Categories</option>
                              {availableCategories.map(category => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="pt-4 border-t border-gray-200 space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeSummaryStock"
                              checked={reportFilters.includeSummary}
                              onChange={(e) => setReportFilters({ ...reportFilters, includeSummary: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="includeSummaryStock" className="text-sm font-medium text-gray-700 cursor-pointer">
                              Include summary statistics
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Vendor Purchase Report Filters */}
                    {reportType === 'vendor-purchase' && (
                      <>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Stock Type</label>
                          <div className="flex gap-4">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="academic"
                                checked={reportFilters.stockType === 'academic'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              Academic Stock
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="radio"
                                value="distribute"
                                checked={reportFilters.stockType === 'distribute'}
                                onChange={(e) => setReportFilters({ ...reportFilters, stockType: e.target.value })}
                                className="mr-2 text-blue-600 focus:ring-blue-500"
                              />
                              General/Distribute Stock
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="date"
                                value={reportFilters.startDate}
                                onChange={(e) => setReportFilters({ ...reportFilters, startDate: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <div className="relative">
                              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="date"
                                value={reportFilters.endDate}
                                onChange={(e) => setReportFilters({ ...reportFilters, endDate: e.target.value })}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
                          <select
                            value={reportFilters.vendor}
                            onChange={(e) => setReportFilters({ ...reportFilters, vendor: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">All Vendors</option>
                            {vendors.map(vendor => (
                              <option key={vendor._id} value={vendor._id}>{vendor.name}</option>
                            ))}
                          </select>
                        </div>
                        {reportFilters.stockType === 'academic' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                            <select
                              value={reportFilters.productCategory}
                              onChange={(e) => setReportFilters({ ...reportFilters, productCategory: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">All Categories</option>
                              {availableCategories.map(category => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="pt-4 border-t border-gray-200 space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="includeSummaryVendor"
                              checked={reportFilters.includeSummary}
                              onChange={(e) => setReportFilters({ ...reportFilters, includeSummary: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="includeSummaryVendor" className="text-sm font-medium text-gray-700 cursor-pointer">
                              Include summary statistics
                            </label>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setShowReportModal(false);
                          setReportType('');
                        }}
                        className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={generatePDF}
                        disabled={generatingPDF}
                        className={`px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all font-medium flex items-center gap-2 ${generatingPDF ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {generatingPDF ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Download size={18} />
                        )}
                        {generatingPDF ? 'Generating...' : 'Generate PDF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Day-End Sales Summary Print Modal */}
      {
        showSalesSummaryPrint && salesSummaryData && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSalesSummaryPrint(false)}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-900">Day-End Sales Summary</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePrintSalesSummary}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Printer size={18} />
                    Print
                  </button>
                  <button
                    onClick={() => setShowSalesSummaryPrint(false)}
                    className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
                  >
                    <X size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="p-6">
                {/* Preview */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview</h3>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>Date Range: {salesSummaryData.dateRange.start} to {salesSummaryData.dateRange.end}</p>
                    {salesSummaryData.filters.course && <p>Course: {salesSummaryData.filters.course.toUpperCase()}</p>}
                    <p>Total Transactions: {salesSummaryData.statistics.totalTransactions}</p>
                    <p>Total Items Sold: {salesSummaryData.statistics.totalItemsSold}</p>
                    <p>Cash Amount: {formatCurrency(salesSummaryData.statistics.cashAmount)}</p>
                    <p>Online Amount: {formatCurrency(salesSummaryData.statistics.onlineAmount)}</p>
                    <p>Total Amount: {formatCurrency(salesSummaryData.statistics.totalAmount)}</p>
                  </div>
                </div>

                {/* Thermal Printable Content */}
                <div ref={salesSummaryPrintRef} className="hidden print:block thermal-receipt" data-thermal-print="true">
                  <style>{`
                  /* Thermal Printer Optimized - 80mm paper */
                  @page {
                    size: 80mm auto;
                    margin: 2mm 3mm;
                  }
                  @media print {
                    *, *::before, *::after {
                      box-shadow: none !important;
                      text-shadow: none !important;
                    }
                    html, body {
                      width: 80mm !important;
                      max-width: 80mm !important;
                      margin: 0 !important;
                      padding: 0 !important;
                      font-family: 'Arial Black', 'Helvetica Bold', 'Arial', sans-serif !important;
                      font-size: 11px !important;
                      font-weight: 700 !important;
                      line-height: 1.4 !important;
                      color: #000 !important;
                      background: #fff !important;
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                      -webkit-font-smoothing: none !important;
                    }
                    .thermal-receipt {
                      width: 100% !important;
                      max-width: 74mm !important;
                      margin: 0 auto !important;
                      padding: 2mm !important;
                      font-weight: 700 !important;
                    }
                    .thermal-header {
                      text-align: center !important;
                      border-bottom: 2px solid #000 !important;
                      padding-bottom: 2mm !important;
                      margin-bottom: 2mm !important;
                    }
                    .thermal-header h1 {
                      font-size: 13px !important;
                      font-weight: 900 !important;
                      margin: 0 0 1mm 0 !important;
                      text-transform: uppercase !important;
                      letter-spacing: 0.5px !important;
                    }
                    .thermal-header p {
                      font-size: 10px !important;
                      font-weight: 700 !important;
                      margin: 0 !important;
                    }
                    .thermal-info {
                      border-bottom: 2px solid #000 !important;
                      padding-bottom: 2mm !important;
                      margin-bottom: 2mm !important;
                    }
                    .thermal-info p {
                      font-size: 10px !important;
                      font-weight: 700 !important;
                      margin: 1mm 0 !important;
                      display: flex !important;
                      justify-content: space-between !important;
                    }
                    .thermal-table {
                      width: 100% !important;
                      border-collapse: collapse !important;
                      font-size: 10px !important;
                      font-weight: 700 !important;
                      margin: 2mm 0 !important;
                    }
                    .thermal-table th,
                    .thermal-table td {
                      padding: 1.5mm 0.5mm !important;
                      text-align: left !important;
                      border: none !important;
                      vertical-align: top !important;
                      font-weight: 700 !important;
                    }
                    .thermal-table th {
                      border-bottom: 2px solid #000 !important;
                      font-weight: 900 !important;
                      font-size: 10px !important;
                    }
                    .thermal-table tbody tr {
                      border-bottom: none !important;
                    }
                    .thermal-table th:last-child,
                    .thermal-table td:last-child {
                      text-align: right !important;
                    }
                    .thermal-total {
                      border-top: 2px solid #000 !important;
                      padding-top: 2mm !important;
                      margin-top: 2mm !important;
                      display: flex !important;
                      justify-content: space-between !important;
                      font-weight: 900 !important;
                      font-size: 12px !important;
                    }
                    .thermal-footer {
                      text-align: center !important;
                      margin-top: 3mm !important;
                      padding-top: 2mm !important;
                      border-top: 2px solid #000 !important;
                      font-size: 9px !important;
                      font-weight: 700 !important;
                    }
                    .no-print {
                      display: none !important;
                    }
                  }
                `}</style>

                  {/* Thermal Header */}
                  <div className="thermal-header">
                    <h1>{receiptSettings.receiptHeader}</h1>
                    <p style={{ textAlign: 'center', fontSize: '10px', marginTop: '1mm' }}>
                      Day-End Sales Summary | {new Date(salesSummaryData.dateRange.start).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                      {salesSummaryData.dateRange.start !== salesSummaryData.dateRange.end &&
                        ` - ${new Date(salesSummaryData.dateRange.end).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}`
                      }
                    </p>
                  </div>

                  {/* Statistics Info */}
                  <div className="thermal-info">
                    <p>
                      <span>Transactions: {salesSummaryData.statistics.totalTransactions}</span>
                      <span>Amount: ₹{Number(salesSummaryData.statistics.totalAmount).toFixed(2)}</span>
                    </p>
                    <p>
                      <span>Cash: ₹{Number(salesSummaryData.statistics.cashAmount).toFixed(2)}</span>
                      <span>Online: ₹{Number(salesSummaryData.statistics.onlineAmount).toFixed(2)}</span>
                    </p>
                    {salesSummaryData.filters.course && (
                      <p><span>Course:</span> <span>{salesSummaryData.filters.course.toUpperCase()}</span></p>
                    )}
                  </div>

                  {/* Items Sold Table */}
                  <table className="thermal-table">
                    <thead>
                      <tr>
                        <th style={{ width: '85%' }}>Item Name</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesSummaryData.itemsSold.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Total Items Sold */}
                  <div className="thermal-total">
                    <span>TOTAL ITEMS SOLD:</span>
                    <span>{salesSummaryData.statistics.totalItemsSold}</span>
                  </div>

                  {/* Footer */}
                  <div className="thermal-footer">
                    <p>Generated on {new Date().toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</p>
                    <p>Thank you! 💖 PydahSoft 💖</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default Reports;