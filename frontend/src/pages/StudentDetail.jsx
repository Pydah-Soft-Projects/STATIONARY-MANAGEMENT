import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Package, Receipt, History, Calendar, DollarSign, Printer, Lock, Loader2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import StudentReceiptModal from './StudentReceipt.jsx';
import { apiUrl } from '../utils/api';
import { canRecordCounterTransactions } from '../utils/permissions';
import {
  productMatchesStudentRules,
  formatAcademicYearsDisplay,
  getProductYears,
} from '../utils/productApplicability';

const formatKitApplicability = (product) => {
  if (!product?.isSet) return null;
  const parts = [];
  const acadYear = formatAcademicYearsDisplay(product);
  if (acadYear) parts.push(`Acad. year: ${acadYear}`);
  const studyYears = getProductYears(product);
  if (studyYears.length > 0) {
    parts.push(`Study year: ${studyYears.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' • ') : null;
};

const StudentDetail = ({
  students = [],
  setStudents,
  products = [],
  setProducts,
  onQueueTransaction,
  isOnline,
  pendingTransactions = [],
  currentUser,
}) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [error, setError] = useState(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [rawTransactions, setRawTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [prefillProducts, setPrefillProducts] = useState([]);
  const [transactionMode, setTransactionMode] = useState('mapped');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [componentUpdating, setComponentUpdating] = useState('');
  const [componentUpdateStatus, setComponentUpdateStatus] = useState({ type: '', message: '' });
  const [receiptConfig, setReceiptConfig] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });
  const canManageTransactions =
    currentUser?.role === 'Administrator' ||
    canRecordCounterTransactions(currentUser?.permissions || []);

  const normalizeCourse = (value) => {
    if (!value) return '';
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const refreshProducts = useCallback(async () => {
    if (typeof setProducts !== 'function') return;
    try {
      // Determine college ID based on user or student's course
      let collegeId = null;

      // Priority 1: Check if current user has an assigned college (for sub-admins)
      if (currentUser?.assignedCollege) {
        collegeId = typeof currentUser.assignedCollege === 'object'
          ? currentUser.assignedCollege._id
          : currentUser.assignedCollege;
      }
      // Priority 2: Legacy support for assignedBranch
      else if (currentUser?.assignedBranch) {
        collegeId = typeof currentUser.assignedBranch === 'object'
          ? currentUser.assignedBranch._id
          : currentUser.assignedBranch;
      }
      // Priority 3: Find college by student's course
      else if (student?.course) {
        try {
          const collegesRes = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
          if (collegesRes.ok) {
            const colleges = await collegesRes.json();
            const studentCollege = colleges.find(c =>
              Array.isArray(c.courses) && c.courses.some(course =>
                String(course).toLowerCase().trim() === String(student.course).toLowerCase().trim()
              )
            );
            if (studentCollege) {
              collegeId = studentCollege._id;
            }
          }
        } catch (err) {
          console.warn('Failed to find college for student course:', err);
        }
      }

      // Always fetch global products first (for product details)
      const productsRes = await fetch(apiUrl('/api/products'));
      if (!productsRes.ok) return;
      const globalProducts = await productsRes.json();

      if (collegeId) {
        // Fetch college-specific stock
        const stockRes = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock`));
        if (stockRes.ok) {
          const stockData = await stockRes.json();

          // Create a map of productId -> college stock quantity
          const collegeStockMap = {};
          (stockData.stock || []).forEach(item => {
            const pId = typeof item.product === 'object' ? item.product._id : item.product;
            collegeStockMap[pId] = item.quantity;
          });

          // Merge college stock with global products
          const productsWithCollegeStock = (globalProducts || []).map(product => ({
            ...product,
            stock: collegeStockMap[product._id] !== undefined ? collegeStockMap[product._id] : 0
          }));

          setProducts(Array.isArray(productsWithCollegeStock) ? productsWithCollegeStock : []);
        } else {
          // If college stock fetch fails, use global products with zero stock
          const productsWithZeroStock = (globalProducts || []).map(product => ({
            ...product,
            stock: 0
          }));
          setProducts(Array.isArray(productsWithZeroStock) ? productsWithZeroStock : []);
        }
      } else {
        // No college context - use global/central stock
        setProducts(Array.isArray(globalProducts) ? globalProducts : []);
      }
    } catch (error) {
      console.warn('Failed to refresh products after transaction:', error);
    }
  }, [setProducts, currentUser, student?.course]);

  // Fetch student details from SQL API
  useEffect(() => {
    if (!id) return;

    // Check if we have the student in props first (optional optimization, but since we want SQL source of truth, better to fetch or verify)
    // Actually, the prompt says "fetch the student details ... from the MySQL only".
    // So we should prioritize the API fetch.

    const fetchStudent = async () => {
      setLoadingStudent(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/sql/students/${id}`));
        if (!res.ok) {
          throw new Error('Student not found');
        }
        const data = await res.json();
        setStudent(data);
        setAvatarFailed(false);
      } catch (err) {
        console.error("Failed to fetch student details:", err);
        setError(err.message);
        setStudent(null);
      } finally {
        setLoadingStudent(false);
      }
    };

    if (isOnline) {
      fetchStudent();
    } else {
      // Offline fallback: try to find in students prop or cache
      const s = students.find(s => String(s.id) === String(id) || String(s.studentId) === String(id));
      if (s) setStudent(s);
    }
  }, [id, isOnline]);

  // Refresh products when student changes to get college-specific stock
  useEffect(() => {
    if (student?.course) {
      refreshProducts();
    }
  }, [student?.course, refreshProducts]);

  // Fetch course-specific receipt settings
  useEffect(() => {
    if (!student?.course) return;

    let isMounted = true;
    const fetchReceiptSettings = async () => {
      try {
        const url = apiUrl(`/api/settings?course=${encodeURIComponent(student.course)}`);
        const response = await fetch(url);
        if (response.ok && isMounted) {
          const data = await response.json();
          setReceiptConfig({
            receiptHeader: data.receiptHeader || 'PYDAH GROUP OF INSTITUTIONS',
            receiptSubheader: data.receiptSubheader || 'Stationery Management System',
          });
        }
      } catch (error) {
        console.warn('Could not load receipt settings:', error.message || error);
      }
    };

    fetchReceiptSettings();
    return () => { isMounted = false; };
  }, [student?.course]);

  const lastFetchedStudentId = useRef(null);
  const transactionsCache = useRef(new Map());

  const fetchStudentTransactions = useCallback(async (forceRefresh = false) => {
    if (!student || (!student.id && !student._id)) return;

    const studentId = String(student.id || student._id || '');

    // If we already have cached transactions for this student and not forcing refresh, skip
    if (!forceRefresh && lastFetchedStudentId.current === studentId && transactionsCache.current.has(studentId)) {
      const cached = transactionsCache.current.get(studentId);
      if (cached && cached.length >= 0) {
        setRawTransactions(cached);
        return;
      }
    }

    // Only show loading if we don't have cached data
    if (!transactionsCache.current.has(studentId)) {
      setLoadingTransactions(true);
    }

    try {
      const response = await fetch(apiUrl(`/api/transactions/student/${studentId}`));
      if (response.ok) {
        const data = await response.json();
        const transactions = data || [];
        setRawTransactions(transactions);
        // Cache transactions for this student
        transactionsCache.current.set(studentId, transactions);
        lastFetchedStudentId.current = studentId;
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoadingTransactions(false);
    }
  }, [student]);

  // Initial load - check cache first
  useEffect(() => {
    if (!student) return;
    const studentId = String(student.id || student._id || '');

    // Load from cache if available
    if (transactionsCache.current.has(studentId)) {
      const cached = transactionsCache.current.get(studentId);
      setRawTransactions(cached || []);
      lastFetchedStudentId.current = studentId;
    }

    // Fetch in background if online (only if cache is stale or missing)
    if (isOnline && (!transactionsCache.current.has(studentId) || lastFetchedStudentId.current !== studentId)) {
      fetchStudentTransactions(false);
    }
  }, [student?.id, student?._id, isOnline, fetchStudentTransactions]);

  const currentStudentId = student ? String(student.id || student._id || '') : '';

  // Only re-fetch if student actually changed and we're online
  useEffect(() => {
    if (isOnline && student && currentStudentId !== lastFetchedStudentId.current) {
      // Only fetch if we don't have cached data for this student
      if (!transactionsCache.current.has(currentStudentId)) {
        fetchStudentTransactions(false);
      }
    }
  }, [isOnline, currentStudentId, fetchStudentTransactions]);

  useEffect(() => {
    if (!componentUpdateStatus.message) return;
    const timer = setTimeout(() => setComponentUpdateStatus({ type: '', message: '' }), 4000);
    return () => clearTimeout(timer);
  }, [componentUpdateStatus]);

  // derive visible items for this student's course/year
  const studentCourseNormalized = normalizeCourse(student?.course);
  const avatarUrl = student?.avatarUrl || student?.profileImage || student?.photoUrl || student?.photo || '';

  const visibleItems = (products || []).filter(p => {
    if (!student) return false;

    // 1. Specific Student Applicability: show to all students; mapped vs addon is decided in isAddOnProduct
    if (p.applicabilityMode === 'students') {
      return true;
    }

    // 2. Rule-Based Applicability (course, study year, branch, semester)
    return productMatchesStudentRules(p, student);
  });

  const isAddOnProduct = (product) => {
    // If explicitly assigned to specific students: mapped (required) for those students, addon for others
    if (product.applicabilityMode === 'students') {
      if (!student) return true;
      const studentId = student.id || student._id;
      const applicableList = product.applicableStudents || [];
      const isAssigned = applicableList.some(s => {
        const sId = (s && typeof s === 'object') ? s._id : s;
        return String(sId) === String(studentId);
      });
      return !isAssigned;
    }

    const courseValue = normalizeCourse(product?.forCourse || '');
    return courseValue === '';
  };

  const mappedProducts = visibleItems.filter((product) => !isAddOnProduct(product));
  const addOnProducts = visibleItems.filter(isAddOnProduct);

  const productMap = useMemo(() => {
    const map = new Map();
    (products || []).forEach((product) => {
      map.set(String(product._id), product);
    });
    return map;
  }, [products]);

  const enrichItems = useCallback(
    (items = []) =>
      items.map((item) => {
        const productId =
          item.productId?._id ||
          item.product?._id ||
          item.productId ||
          item?._id;
        const product = productMap.get(String(productId));
        let setComponents = Array.isArray(item.setComponents) ? item.setComponents : [];

        if (product?.isSet) {
          if (setComponents.length > 0) {
            const productComponentMap = new Map(
              (product.setItems || []).map((setItem) => {
                const compId =
                  setItem?.product?._id ||
                  setItem?.productId ||
                  setItem?.product?._id?.toString?.() ||
                  null;
                return [
                  compId ? String(compId) : null,
                  {
                    name:
                      setItem?.product?.name ||
                      setItem?.productNameSnapshot ||
                      'Unknown item',
                    quantity: Number(setItem?.quantity) || 1,
                  },
                ];
              })
            );

            setComponents = setComponents.map((component) => {
              const componentId = String(component.productId || component._id || '');
              const fallback = productComponentMap.get(componentId) || {};
              return {
                ...component,
                productId: component.productId || component._id || null,
                name: component.name || fallback.name || 'Unknown item',
                quantity: Number(component.quantity) || Number(fallback.quantity) || 1,
                taken: component.taken !== undefined ? component.taken : true,
                reason: component.reason || '',
              };
            });
          } else {
            setComponents = (product.setItems || []).map((setItem) => ({
              productId:
                setItem?.product?._id ||
                setItem?.productId ||
                setItem?.product?._id?.toString?.() ||
                null,
              name:
                setItem?.product?.name ||
                setItem?.productNameSnapshot ||
                'Unknown item',
              quantity: Number(setItem?.quantity) || 1,
              taken: true,
              reason: '',
            }));
          }
        }

        return {
          ...item,
          isSet: Boolean(product?.isSet || item.isSet),
          status: item.status || 'fulfilled',
          setComponents,
        };
      }),
    [productMap]
  );

  const enrichTransaction = useCallback(
    (transaction) => ({
      ...transaction,
      items: enrichItems(transaction?.items || []),
    }),
    [enrichItems]
  );

  const handleMarkAsPaid = async (transaction) => {
    if (!isOnline) {
      setComponentUpdateStatus({
        type: 'error',
        message: 'Re-connect to the network before marking transactions as paid.',
      });
      return;
    }

    const transactionId = transaction._id || transaction.id;
    const actionKey = `paid:${transactionId}`;
    setComponentUpdating(actionKey);
    setComponentUpdateStatus({ type: '', message: '' });

    try {
      const response = await fetch(apiUrl(`/api/transactions/${transactionId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPaid: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to update transaction' }));
        throw new Error(errorData.message || 'Failed to update transaction.');
      }

      await fetchStudentTransactions(true); // Force refresh
      await refreshProducts();
      setComponentUpdateStatus({
        type: 'success',
        message: 'Transaction marked as paid successfully.',
      });
    } catch (error) {
      console.error('Failed to mark transaction as paid:', error);
      setComponentUpdateStatus({
        type: 'error',
        message: error.message || 'Unable to mark transaction as paid.',
      });
    } finally {
      if (componentUpdating === actionKey) {
        setComponentUpdating('');
      }
    }
  };

  const handleMarkComponentTaken = useCallback(
    async (transaction, item, component) => {
      if (!isOnline) {
        setComponentUpdateStatus({
          type: 'error',
          message: 'Re-connect to the network before marking items as taken.',
        });
        return;
      }

      const normalizeId = (value) => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
        if (typeof value === 'object' && value.toString) return value.toString();
        return String(value);
      };

      const transactionId = transaction._id || transaction.id;
      const itemProductId = normalizeId(item.productId || item._id);
      const targetComponentId = normalizeId(component.productId || component._id);

      if (!transactionId || !itemProductId || !targetComponentId) {
        setComponentUpdateStatus({
          type: 'error',
          message: 'Unable to determine component identifiers for this transaction.',
        });
        return;
      }

      const updateKey = `${transactionId}:${itemProductId}:${targetComponentId}`;
      setComponentUpdating(updateKey);
      setComponentUpdateStatus({ type: '', message: '' });

      try {
        const payloadItems = transaction.items.map((txItem) => {
          const txItemProductId = normalizeId(txItem.productId || txItem._id);
          const baseItem = {
            productId: txItemProductId,
            quantity: Number(txItem.quantity) || 0,
            price: Number(txItem.price) || 0,
            name: txItem.name,
            status: txItem.status,
          };

          if (txItem.isSet) {
            baseItem.setComponents = (txItem.setComponents || []).map((comp) => {
              const compId = normalizeId(comp.productId || comp._id || comp.id);
              const isTarget =
                txItemProductId === itemProductId && compId && compId === targetComponentId;
              return {
                productId: compId || undefined,
                name: comp.name,
                quantity: Number(comp.quantity) || 1,
                taken: isTarget ? true : comp.taken !== undefined ? comp.taken : true,
                reason: isTarget ? '' : comp.reason || '',
              };
            });
          }

          return baseItem;
        });

        const response = await fetch(apiUrl(`/api/transactions/${transactionId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: payloadItems,
            paymentMethod: transaction.paymentMethod || 'cash',
            isPaid: Boolean(transaction.isPaid),
            remarks: transaction.remarks || '',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to update transaction.');
        }

        await fetchStudentTransactions(true); // Force refresh after update
        await refreshProducts();
        setComponentUpdateStatus({
          type: 'success',
          message: `${component.name} marked as taken successfully.`,
        });
      } catch (error) {
        console.error('Failed to mark component as taken:', error);
        setComponentUpdateStatus({
          type: 'error',
          message: error.message || 'Unable to mark component as taken.',
        });
      } finally {
        setComponentUpdating('');
      }
    },
    [isOnline, fetchStudentTransactions, refreshProducts]
  );

  const handleMarkItemFulfilled = useCallback(
    async (transaction, item) => {
      if (!isOnline) {
        setComponentUpdateStatus({
          type: 'error',
          message: 'Re-connect to the network before marking items as fulfilled.',
        });
        return;
      }

      const normalizeId = (value) => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
        if (typeof value === 'object' && value.toString) return value.toString();
        return String(value);
      };

      const transactionId = transaction._id || transaction.id;
      const itemProductId = normalizeId(item.productId || item._id);

      if (!transactionId || !itemProductId) {
        setComponentUpdateStatus({
          type: 'error',
          message: 'Unable to determine item identifiers for this transaction.',
        });
        return;
      }

      const updateKey = `fulfill:${transactionId}:${itemProductId}`;
      setComponentUpdating(updateKey);
      setComponentUpdateStatus({ type: '', message: '' });

      try {
        const payloadItems = transaction.items.map((txItem) => {
          const txItemProductId = normalizeId(txItem.productId || txItem._id);
          const isTarget = txItemProductId === itemProductId;

          const baseItem = {
            productId: txItemProductId,
            quantity: Number(txItem.quantity) || 0,
            price: Number(txItem.price) || 0,
            name: txItem.name,
            status: isTarget ? 'fulfilled' : (txItem.status || 'fulfilled'),
          };

          if (txItem.isSet) {
            baseItem.setComponents = (txItem.setComponents || []).map((comp) => ({
              productId: normalizeId(comp.productId || comp._id || comp.id) || undefined,
              name: comp.name,
              quantity: Number(comp.quantity) || 1,
              taken: comp.taken !== undefined ? comp.taken : true,
              reason: comp.reason || '',
            }));
          }

          return baseItem;
        });

        const response = await fetch(apiUrl(`/api/transactions/${transactionId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: payloadItems,
            paymentMethod: transaction.paymentMethod || 'cash',
            isPaid: Boolean(transaction.isPaid),
            remarks: transaction.remarks || '',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to update transaction.');
        }

        await fetchStudentTransactions(true); // Force refresh after update
        await refreshProducts();
        setComponentUpdateStatus({
          type: 'success',
          message: `${item.name} marked as fulfilled successfully.`,
        });
      } catch (error) {
        console.error('Failed to mark item as fulfilled:', error);
        setComponentUpdateStatus({
          type: 'error',
          message: error.message || 'Unable to mark item as fulfilled.',
        });
      } finally {
        setComponentUpdating('');
      }
    },
    [isOnline, fetchStudentTransactions, refreshProducts]
  );

  const transactions = useMemo(
    () => rawTransactions.map(enrichTransaction),
    [rawTransactions, enrichTransaction]
  );

  const relevantItems = mappedProducts.map((product) => {
    const key = product.name?.toLowerCase().replace(/\s+/g, '_');
    const received = Boolean(student.items && key && student.items[key]);
    return {
      product,
      received,
      key,
    };
  });

  const receivedCount = relevantItems.filter(item => item.received).length;

  const pendingItems = relevantItems.filter(({ received }) => !received);
  const issuedItems = relevantItems.filter(({ received }) => received);

  const handleOpenTransaction = (products = [], mode = 'mapped') => {
    setTransactionMode(mode);
    setPrefillProducts(products);
    setShowTransactionModal(true);
  };

  const pendingTransactionsForStudent = useMemo(() => {
    if (!currentStudentId) return [];
    return (pendingTransactions || [])
      .filter((entry) => String(entry?.payload?.studentId) === currentStudentId)
      .map((entry) => {
        const items = enrichItems(entry?.payload?.items || []);
        const totalAmount = items.reduce((sum, item) => {
          const total = Number(item?.total);
          if (Number.isFinite(total)) return sum + total;
          return sum + Number(item?.price || 0) * Number(item?.quantity || 0);
        }, 0);
        return {
          _id: entry.id,
          transactionId: `PENDING-${entry.id}`,
          transactionDate: entry.createdAt || new Date().toISOString(),
          items,
          totalAmount,
          paymentMethod: entry?.payload?.paymentMethod || 'cash',
          isPaid: Boolean(entry?.payload?.isPaid),
          remarks: entry?.payload?.remarks || '',
          isPending: true,
        };
      });
  }, [pendingTransactions, currentStudentId, enrichItems]);

  useEffect(() => {
    if (!isOnline) return;
    if (pendingTransactionsForStudent.length === 0 && (student?.id || student?._id)) {
      // Only fetch if we don't have cached data
      const studentId = String(student.id || student._id);
      if (!transactionsCache.current.has(studentId)) {
        fetchStudentTransactions(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTransactionsForStudent.length, isOnline]);

  const buildSignature = useCallback((transaction) => {
    if (!transaction) return '';
    const items = Array.isArray(transaction.items) ? transaction.items : [];
    const normalizedItems = items
      .map((item) => ({
        name: item?.name || '',
        quantity: Number(item?.quantity) || 0,
        total: Number(item?.total) || Number(item?.price || 0) * Number(item?.quantity || 0) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return JSON.stringify({
      totalAmount: Number(transaction?.totalAmount) || 0,
      paymentMethod: transaction?.paymentMethod || '',
      isPaid: Boolean(transaction?.isPaid),
      items: normalizedItems,
    });
  }, []);

  const displayTransactions = useMemo(() => {
    const normalizedSource = Array.isArray(transactions) ? transactions : [];
    const normalized = normalizedSource.map((tx) => ({
      ...tx,
      isPending: Boolean(tx.isPending),
    }));

    const serverSignatures = new Set(normalized.map(buildSignature));
    const uniquePending = pendingTransactionsForStudent.filter((pending) => {
      const signature = buildSignature(pending);
      return !serverSignatures.has(signature);
    });

    return [...uniquePending, ...normalized].sort((a, b) => {
      const dateA = new Date(a?.transactionDate || a?.createdAt || 0).getTime();
      const dateB = new Date(b?.transactionDate || b?.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [transactions, pendingTransactionsForStudent, buildSignature]);

  if (loadingStudent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="text-6xl mb-4">❓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Student not found</h2>
            <p className="text-gray-600 mb-6">{error || "Either the student doesn't exist or it hasn't loaded yet."}</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              onClick={() => navigate(-1)}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 py-8 px-4">
      <div className="mx-auto space-y-6">
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-2xl shadow-xl p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-white">Student Profile</p>
              <h1 className="text-2xl font-semibold text-white">{student.name}</h1>
              <p className="text-sm text-white/80 mt-1">
                {student.course?.toUpperCase()}
                {' • Year '}{student.year}
                {student.semester ? ` • Sem ${student.semester}` : ''}
                {student.branch ? ` • ${student.branch}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end lg:self-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-sm font-semibold hover:bg-white/15 transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {canManageTransactions && (
              <button
                onClick={() => handleOpenTransaction(addOnProducts, 'addon')}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-800 rounded-xl hover:bg-blue-50 transition-all font-semibold shadow-lg"
              >
                <Receipt size={18} />
                Add-On Items
              </button>
            )}
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-2">
          {/* Left Sidebar - Student Info */}
          <aside className="bg-white rounded-2xl border border-blue-100 shadow-lg">
            <div className="px-6 py-5 border-b border-blue-50 flex items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-semibold overflow-hidden border border-blue-200 shadow-sm">
                {avatarUrl && !avatarFailed ? (
                  <img
                    src={avatarUrl}
                    alt={`${student.name} avatar`}
                    className="w-full h-full object-cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  student.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold ">Student Snapshot</h3>
                <p className="text-xs text-gray-500">Key academic details</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <p className="  uppercase tracking-wide">Admission Number</p>
                  <p className="text-sm font-medium text-gray-500">{student.alternateId || student.studentId}</p>
                </div>
                {student.pin && (
                  <div className="space-y-1">
                    <p className=" uppercase tracking-wide">PIN Number</p>
                    <p className="text-sm font-medium text-gray-500">{student.pin}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className=" uppercase tracking-wide">Course</p>
                  <p className="text-sm font-medium text-gray-500">{student.course.toUpperCase()}</p>
                </div>
                <div className="space-y-1">
                  <p className=" uppercase tracking-wide">Year</p>
                  <p className="text-sm font-medium text-gray-500">Year {student.year}</p>
                </div>
                {student.semester && (
                  <div className="space-y-1">
                    <p className=" uppercase tracking-wide">Semester</p>
                    <p className="text-sm font-medium text-gray-500">Semester {student.semester}</p>
                  </div>
                )}
                {student.branch && (
                  <div className="space-y-1">
                    <p className=" uppercase tracking-wide">Branch</p>
                    <p className="text-sm font-medium text-gray-500">{student.branch}</p>
                  </div>
                )}
                {student.phoneNumber && (
                  <div className="space-y-1">
                    <p className=" uppercase tracking-wide">Phone Number</p>
                    <p className="text-sm font-medium text-gray-500">{student.phoneNumber}</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="space-y-6">
            {/* Stationery Items Section */}
            <section className="bg-white rounded-2xl border border-blue-100 shadow-lg">
              <div className="px-6 py-5 border-b border-blue-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                    <Package size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Stationery Items</h3>
                    <p className="text-xs text-gray-500">Mapped kit items and add-ons</p>
                  </div>
                </div>
                <div className="text-xs text-gray-600 flex items-center gap-3">
                  <span>Mapped: {relevantItems.length}</span>
                  <span>Issued: {receivedCount}</span>
                  <span>Pending: {pendingItems.length}</span>
                </div>
              </div>

              <div className="px-6 py-5 space-y-6">
                {relevantItems.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                    <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No stationery items are configured for this student's course/year yet.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Allocation</h4>
                      {canManageTransactions && pendingItems.length > 0 && (
                        <button
                          onClick={() => handleOpenTransaction(pendingItems.map(({ product }) => product), 'mapped')}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors shadow"
                        >
                          <Receipt size={14} />
                          Make Transaction
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {pendingItems.length === 0 ? (
                        <p className="text-sm text-gray-600/70">All mapped items have been issued.</p>
                      ) : (
                        pendingItems.map(({ product }) => (
                          <div
                            key={product._id || product.name}
                            className="p-4 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h5 className="text-sm font-semibold text-blue-900 line-clamp-1">{product.name}</h5>
                                {formatKitApplicability(product) && (
                                  <p className="text-[11px] font-medium text-blue-700/90 mt-1">
                                    {formatKitApplicability(product)}
                                  </p>
                                )}
                                {product.description && (
                                  <p className="text-xs text-blue-700/70 mt-1 line-clamp-2">{product.description}</p>
                                )}
                              </div>
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-white px-2 py-1 rounded-full border border-blue-200">
                                {product.isSet ? 'Pending · Kit' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {issuedItems.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-blue-500 uppercase tracking-wider flex items-center gap-2">
                          <Lock size={12} />
                          Issued Items (Locked)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {issuedItems.map(({ product }) => (
                            <div
                              key={`${product._id || product.name}-issued`}
                              className="p-4 rounded-xl border border-blue-100 bg-blue-50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h5 className="text-sm font-semibold text-blue-800 line-clamp-1">{product.name}</h5>
                                  {formatKitApplicability(product) && (
                                    <p className="text-[11px] font-medium text-blue-700/90 mt-1">
                                      {formatKitApplicability(product)}
                                    </p>
                                  )}
                                  {product.description && (
                                    <p className="text-xs text-blue-700/70 mt-1 line-clamp-2">{product.description}</p>
                                  )}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-white px-2 py-1 rounded-full border border-blue-200">
                                  <Lock size={10} /> {product.isSet ? 'Kit' : 'Locked'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Add-on products are accessible via the top “Add-On Items” button */}

            {/* Transaction History Section */}
            <div className="bg-white rounded-2xl border border-blue-100 shadow-lg p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-50">
                <div className="w-8 h-8 bg-blue-600/10 text-blue-600 rounded-lg flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-gray-800">Transaction History</h3>
                {displayTransactions.length > 0 && (
                  <span className="ml-auto text-xs text-gray-700 bg-blue-100 px-3 py-1 rounded-full">
                    {displayTransactions.length} {displayTransactions.length === 1 ? 'transaction' : 'transactions'}
                  </span>
                )}
              </div>

              {componentUpdateStatus.message && (
                <div
                  className={`mb-4 text-xs font-semibold rounded-lg px-3 py-2 border ${componentUpdateStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                >
                  {componentUpdateStatus.message}
                </div>
              )}

              {loadingTransactions ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="ml-3 text-sm text-blue-600">Loading transactions...</span>
                </div>
              ) : displayTransactions.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-10 h-10 text-blue-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No transactions found for this student.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayTransactions.map((transaction) => {
                    const TransactionPrintComponent = ({ transaction }) => {
                      const transactionRef = useRef(null);
                      const triggerPrint = useReactToPrint({
                        contentRef: transactionRef,
                        documentTitle: `Receipt-${transaction.transactionId}`,
                      });

                      return (
                        <>
                          <div
                            key={transaction._id}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-xs font-semibold text-gray-500 truncate">
                                    {transaction.transactionId}
                                  </span>
                                  {transaction.isPending && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                      Sync Pending
                                    </span>
                                  )}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${transaction.isPaid
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-100 text-rose-700 border border-rose-200'
                                    }`}>
                                    {transaction.isPaid ? 'Paid' : 'Unpaid'}
                                  </span>
                                  {transaction.isPaid && !transaction.stockDeducted && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 animate-pulse">
                                      Stock Pending
                                    </span>
                                  )}
                                  {canManageTransactions && (!transaction.isPaid || (transaction.isPaid && !transaction.stockDeducted)) && !transaction.isPending && (
                                    <button
                                      onClick={() => handleMarkAsPaid(transaction)}
                                      disabled={!isOnline || componentUpdating === `paid:${transaction._id || transaction.id}`}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50 no-print"
                                      title={transaction.isPaid ? "Click to retry stock deduction" : "Click to deduct stock and mark as paid"}
                                    >
                                      {componentUpdating === `paid:${transaction._id || transaction.id}` ? (
                                        <Loader2 size={10} className="animate-spin" />
                                      ) : (
                                        <DollarSign size={10} />
                                      )}
                                      {transaction.isPaid ? 'Deduct Stock' : 'Mark Paid'}
                                    </button>
                                  )}
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${transaction.paymentMethod === 'cash'
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : transaction.paymentMethod === 'split'
                                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                      : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                    }`}>
                                    {transaction.paymentMethod === 'split'
                                      ? `Split (C: ₹${(transaction.cashAmount || 0).toFixed(0)}, O: ₹${(transaction.onlineAmount || 0).toFixed(0)})`
                                      : transaction.paymentMethod === 'cash' ? 'Cash' : 'Online'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-700">
                                  <div className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    <span>
                                      {new Date(transaction.transactionDate || transaction.createdAt || Date.now()).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Package size={12} />
                                    <span>{transaction.items?.length || 0} item{transaction.items?.length !== 1 ? 's' : ''}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="ml-4 flex items-center gap-2">
                                <button
                                  onClick={() => triggerPrint()}
                                  className="px-3 py-1.5 bg-blue-900 text-white hover:bg-blue-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors no-print border border-blue-200"
                                  title="Print Receipt"
                                >
                                  <Printer size={14} />
                                  Print
                                </button>
                                <div className="text-right">
                                  <div className="flex items-center gap-1 text-base font-bold text-blue-900">
                                    <DollarSign size={16} />
                                    <span>₹{Number(transaction.totalAmount).toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Transaction Items */}
                            {transaction.items && transaction.items.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-blue-100 space-y-2">
                                {transaction.items.map((item, idx) => {
                                  const itemProductKey = String(
                                    item.productId?._id ||
                                    item.productId ||
                                    item._id ||
                                    ''
                                  );
                                  return (
                                    <div
                                      key={idx}
                                      className="text-xs text-gray-800 bg-white/70 border border-blue-100 rounded-lg px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="font-semibold">
                                          ×{item.quantity} • ₹{Number(item.total).toFixed(2)}
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between mt-1 text-[11px]">
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-600 font-medium">
                                            Status:
                                            <span
                                              className={`ml-1 font-semibold ${item.status === 'partial' ? 'text-amber-600' : 'text-green-600'
                                                }`}
                                            >
                                              {item.status === 'partial' ? 'Partial' : 'Fulfilled'}
                                            </span>
                                          </span>

                                          {canManageTransactions && item.status === 'partial' && !item.isSet && (
                                            <button
                                              type="button"
                                              onClick={() => handleMarkItemFulfilled(transaction, item)}
                                              disabled={!isOnline || componentUpdating === `fulfill:${transaction._id || transaction.id}:${String(item.productId?._id || item.productId || item._id)}`}
                                              className="ml-2 px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-bold hover:bg-amber-100 transition-colors disabled:opacity-50"
                                            >
                                              {componentUpdating === `fulfill:${transaction._id || transaction.id}:${String(item.productId?._id || item.productId || item._id)}` ? (
                                                <Loader2 size={10} className="animate-spin" />
                                              ) : (
                                                'Mark as Fulfilled'
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      {item.isSet && item.setComponents?.length > 0 && (
                                        <div className="mt-1 border-t border-blue-100 pt-1">
                                          <p className="text-[11px] font-semibold text-gray-800 mb-1">
                                            Includes:
                                          </p>
                                          <ul className="space-y-0.5">
                                            {item.setComponents.map((component, componentIdx) => {
                                              const componentProductKey = String(
                                                component.productId ||
                                                component._id ||
                                                ''
                                              );
                                              const actionKey = `${transaction._id || transaction.id}:${itemProductKey}:${componentProductKey}`;
                                              return (
                                                <li
                                                  key={`${item.name}-component-inline-${componentIdx}`}
                                                  className="flex items-center justify-between text-[11px] text-gray-700 gap-2"
                                                >
                                                  <span className="truncate max-w-[200px]">
                                                    {component.name}
                                                  </span>
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-semibold">
                                                      × {component.quantity}
                                                    </span>
                                                    {canManageTransactions && component.taken === false && (
                                                      <div className="flex items-center gap-2">
                                                        <span className="uppercase font-semibold text-red-600">
                                                          Not Taken
                                                        </span>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            handleMarkComponentTaken(
                                                              transaction,
                                                              item,
                                                              component
                                                            )
                                                          }
                                                          disabled={
                                                            !isOnline ||
                                                            componentUpdating === actionKey
                                                          }
                                                          className="px-2 py-1 rounded-md border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                        >
                                                          {componentUpdating === actionKey ? (
                                                            <Loader2
                                                              size={12}
                                                              className="animate-spin"
                                                            />
                                                          ) : (
                                                            'Mark as Taken'
                                                          )}
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                </li>
                                              );
                                            })}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Remarks */}
                            {transaction.remarks && (
                              <div className="mt-2 pt-2 border-t border-blue-100">
                                <p className="text-xs text-blue-700">
                                  <span className="font-medium text-blue-900">Remarks:</span> {transaction.remarks}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Print Content - Thermal Printer Optimized */}
                          <div ref={transactionRef} className="hidden print:block thermal-receipt" data-thermal-print="true">
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
                                  border-bottom: 1px solid #000 !important;
                                }
                                .thermal-table tbody tr.single-item,
                                .thermal-table tbody tr:only-child {
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
                                .thermal-payment {
                                  margin-top: 2mm !important;
                                  padding-top: 2mm !important;
                                  border-top: 2px solid #000 !important;
                                  font-size: 10px !important;
                                  font-weight: 700 !important;
                                }
                                .thermal-payment p {
                                  margin: 1mm 0 !important;
                                  display: flex !important;
                                  justify-content: space-between !important;
                                  font-weight: 700 !important;
                                }
                                .thermal-footer {
                                  text-align: center !important;
                                  margin-top: 3mm !important;
                                  padding-top: 2mm !important;
                                  border-top: 2px solid #000 !important;
                                  font-size: 9px !important;
                                  font-weight: 700 !important;
                                }
                                .set-components {
                                  margin: 1mm 0 0 2mm !important;
                                  font-size: 9px !important;
                                  font-weight: 600 !important;
                                  list-style: none !important;
                                  padding: 0 !important;
                                }
                                .set-components li {
                                  margin: 0.5mm 0 !important;
                                }
                                .no-print {
                                  display: none !important;
                                }
                              }
                            `}</style>

                            <div className="thermal-header">
                              <h1>{receiptConfig.receiptHeader}</h1>
                              <p style={{ textAlign: 'center', fontSize: '10px', marginTop: '1mm' }}>
                                {new Date(transaction.transactionDate || transaction.createdAt || Date.now()).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>

                            <div className="thermal-info">
                              <p><span>Name:</span> <span>{transaction.student?.name || student.name}</span></p>
                              <p><span>ID: {transaction.student?.pin || student.pin || transaction.student?.studentId || student.studentId}</span> <span>{(transaction.student?.course || student.course)?.toUpperCase()}{((transaction.student?.branch || student.branch) ? ` | ${transaction.student?.branch || student.branch}` : '')} | Year {transaction.student?.year || student.year}</span></p>
                            </div>

                            <table className="thermal-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '50%' }}>Item</th>
                                  <th style={{ width: '12%', textAlign: 'center' }}>Qty</th>
                                  <th style={{ width: '18%', textAlign: 'right' }}>Rate</th>
                                  <th style={{ width: '20%', textAlign: 'right' }}>Amt</th>
                                </tr>
                              </thead>
                              <tbody>
                                {transaction.items && transaction.items.map((item, idx, arr) => (
                                  <tr key={idx} className={arr.length === 1 ? 'single-item' : ''}>
                                    <td>
                                      {item.name}
                                      {(item.isSet || item.status === 'partial') && (
                                        <span style={{ fontSize: '7px', fontWeight: 'bold' }}>
                                          {' '}[{item.status === 'partial' ? 'Partial' : 'Set'}]
                                        </span>
                                      )}
                                      {item.isSet && item.setComponents?.length > 0 && (
                                        <ul className="set-components">
                                          {item.setComponents.map((component, componentIdx) => (
                                            <li key={`${item.name}-component-print-${componentIdx}`}>
                                              - {component.name} ×{component.quantity}
                                              {component.taken === false && ' [NOT TAKEN]'}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'right' }}>₹{Number(item.price).toFixed(0)}</td>
                                    <td style={{ textAlign: 'right' }}>₹{Number(item.total).toFixed(0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <div className="thermal-total">
                              <span>TOTAL:</span>
                              <span>₹{Number(transaction.totalAmount || 0).toFixed(2)}</span>
                            </div>

                            <div className="thermal-payment" style={{ borderTop: '1px dashed #000', marginTop: '1mm', paddingTop: '1mm' }}>
                              <p>
                                <span>Method:</span>
                                <span>
                                  {transaction.paymentMethod === 'split'
                                    ? `SPLIT (Cash: ₹${(transaction.cashAmount || 0).toFixed(0)}, Online: ₹${(transaction.onlineAmount || 0).toFixed(0)})`
                                    : transaction.paymentMethod?.toUpperCase()}
                                </span>
                              </p>
                            </div>

                            {transaction.remarks && (
                              <div className="thermal-payment">
                                <p style={{ display: 'block' }}><span>Note: {transaction.remarks}</span></p>
                              </div>
                            )}

                            <div className="thermal-footer">
                              <p>Thank you! 💖 PydahSoft 💖</p>
                            </div>
                          </div>
                        </>
                      );
                    };

                    return <TransactionPrintComponent key={transaction._id || transaction.transactionId} transaction={transaction} />;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Modal */}
      {
        canManageTransactions && showTransactionModal && student && (
          <StudentReceiptModal
            student={student}
            products={products}
            prefilledItems={prefillProducts}
            mode={transactionMode}
            isOnline={isOnline}
            currentUser={currentUser}
            onClose={() => {
              setShowTransactionModal(false);
              setPrefillProducts([]);
              setTransactionMode('mapped');
            }}
            onTransactionSaved={(updatedStudent) => {
              setStudent(updatedStudent);
              // Force refresh transactions after saving
              fetchStudentTransactions(true);
            }}
            onTransactionQueued={(queuedTransaction, optimisticStudent) => {
              if (onQueueTransaction) {
                onQueueTransaction(queuedTransaction, optimisticStudent);
              }
              setStudent(optimisticStudent);
              // Force refresh to show new transaction
              fetchStudentTransactions(true);
            }}
            onProductsUpdated={refreshProducts}
          />
        )
      }
    </div >
  );
};

export default StudentDetail;