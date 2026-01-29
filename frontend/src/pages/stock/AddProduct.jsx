import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Filter, Package, Eye, Edit, Trash2, X, Save, Calendar, DollarSign, FileText, Layers, MinusCircle, LayoutGrid, Table, Archive, Users } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import { hasFullAccess } from '../../utils/permissions';

const AddProduct = ({ itemCategories, addItemCategory, setItemCategories, currentCourse, products = [], setProducts, currentUser, viewContext = 'central' }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];

  // Check for legacy manage-stock permission
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  const canEdit = isSuperAdmin || hasLegacyPermission || hasFullAccess(permissions, 'stock-products');
  const [selectedCourse, setSelectedCourse] = useState(currentCourse || '');
  const [selectedYear, setSelectedYear] = useState('');
  const [config, setConfig] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    stock: 0,
    remarks: '',
    forCourse: selectedCourse || '',
    years: [],
    branch: [],
    semesters: [],
    isSet: false,
    setItems: [],
    lowStockThreshold: 10,
    applicabilityMode: 'rules', // 'rules' or 'students'
    applicableStudents: [], // Array of student objects { _id, name, studentId }
  });
  // Student Selection State (Filter Mode)
  const [studentFilters, setStudentFilters] = useState({ course: '', year: '', branch: '' });
  const [fetchedStudents, setFetchedStudents] = useState([]); // Students fetched from backend based on filters
  const [isFetchingStudents, setIsFetchingStudents] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState(''); // Search query for filtering fetched students

  // Filter fetched students based on search query
  const filteredFetchedStudents = useMemo(() => {
    const list = (Array.isArray(fetchedStudents) ? fetchedStudents : []).filter(s => s != null);
    if (!studentSearchQuery.trim()) {
      return list;
    }
    const query = studentSearchQuery.toLowerCase().trim();
    return list.filter(student =>
      (student.name || '').toLowerCase().includes(query) ||
      (student.studentId || '').toLowerCase().includes(query)
    );
  }, [fetchedStudents, studentSearchQuery]);

  const handleOpenAssignModal = (product) => {
    setSelectedProduct(product);
    // Initialize form data just for assignment purposes
    setFormData(prev => ({
      ...prev,
      applicabilityMode: product.applicabilityMode || 'rules',
      applicableStudents: (Array.isArray(product.applicableStudents) ? product.applicableStudents : []).filter(s => s != null),
    }));
    // Reset filters
    setStudentFilters({ course: '', year: '', branch: '' });
    setFetchedStudents([]);
    setStudentSearchQuery(''); // Reset search query
    setShowAssignModal(true);
    setShowProductDetail(false);
    setShowAddProduct(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/config/academic'));
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          // Default to "All Courses" (empty string) instead of first course
          if (!selectedCourse) {
            setSelectedCourse('');
          }
        }
      } catch (_) { }
    })();
  }, []);

  // when the global products change, sync categories
  useEffect(() => {
    const cats = Array.from(new Set((products || []).map(p => p.name.toLowerCase().replace(/\s+/g, '_'))));
    setItemCategories && setItemCategories(cats);
  }, [products, setItemCategories]);

  const [productTypeFilter, setProductTypeFilter] = useState(''); // 'single', 'set', or ''

  const filteredProducts = useMemo(() => {
    return (products || []).filter(p => {
      // Course filter
      if (selectedCourse && p.forCourse && p.forCourse !== selectedCourse) return false;

      // Year filter - check both year (old) and years (new) array
      if (selectedYear) {
        const productYears = p.years || (p.year ? [p.year] : []);
        if (productYears.length > 0 && !productYears.includes(Number(selectedYear))) {
          return false;
        }
      }

      if (productTypeFilter) {
        if (productTypeFilter === 'single' && p.isSet) return false;
        if (productTypeFilter === 'set' && !p.isSet) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(query);
        const matchesDescription = p.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) return false;
      }

      return true;
    });
  }, [products, selectedCourse, selectedYear, searchQuery, productTypeFilter]);

  // Fetch college stock for sub-admins OR super-admins viewing specific college
  const [collegeStockMap, setCollegeStockMap] = useState({});
  const [activeCollegeId, setActiveCollegeId] = useState(null);

  const fetchCollegeStock = async (targetId) => {
    if (!targetId) {
      setCollegeStockMap({});
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${targetId}/stock`));
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.stock || []).forEach(item => {
          const pId = typeof item.product === 'object' ? item.product._id : item.product;
          map[pId] = item.quantity;
        });
        setCollegeStockMap(map);
      }
    } catch (err) {
      console.error("Error fetching college stock:", err);
      setCollegeStockMap({});
    }
  };

  useEffect(() => {
    let targetCollegeId = null;

    if (!isSuperAdmin && currentUser?.assignedCollege) {
      targetCollegeId = typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege;
    } else if (isSuperAdmin && viewContext !== 'central') {
      targetCollegeId = viewContext;
    }

    setActiveCollegeId(targetCollegeId);
    fetchCollegeStock(targetCollegeId);
  }, [isSuperAdmin, currentUser, viewContext]);

  // Helper to get display stock
  const getDisplayStock = (product) => {
    if (product.isSet) return { label: 'Set', value: 'N/A' };

    // Central Stock (SuperAdmin default view)
    if (!activeCollegeId) {
      return { label: 'Central Stock', value: product.stock || 0 };
    }

    // College Stock (SubAdmin or SuperAdmin viewing college)
    return { label: 'College Stock', value: collegeStockMap[product._id] || 0 };
  };
  const [setItemToAdd, setSetItemToAdd] = useState('');
  const availableSetProducts = useMemo(() => {
    const selectedIds = new Set((formData.setItems || []).map(item => item.productId));
    return (products || []).filter(p => {
      if (p.isSet) return false;
      if (selectedProduct && p._id === selectedProduct._id) return false;
      if (selectedIds.has(p._id)) return false;
      return true;
    });
  }, [products, selectedProduct, formData.setItems]);

  const handleProductCreate = (createdProduct) => {
    setProducts && setProducts(prev => [...(prev || []), createdProduct]);
    setStatusMsg('Product created successfully!');
    setShowAddProduct(false);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  const handleDelete = async (productId, productName) => {
    if (!window.confirm(`Are you sure you want to delete "${productName}"?`)) return;
    try {
      const res = await fetch(apiUrl(`/api/products/${productId}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setProducts && setProducts(prev => (prev || []).filter(p => p._id !== productId));
      setItemCategories && setItemCategories(prev => prev.filter(i => i !== productName));
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleViewDetails = (product) => {
    setSelectedProduct(product);
    setShowProductDetail(true);
    setShowAddProduct(false); // Ensure Add modal is closed when viewing/editing
  };

  const handleProductUpdate = (updatedProduct) => {
    setProducts && setProducts(prev =>
      prev.map(p => p._id === updatedProduct._id ? updatedProduct : p)
    );
    setSelectedProduct(updatedProduct);
    setIsEditing(false);
  };

  useEffect(() => {
    if (selectedProduct && showProductDetail) {
      const productYears = selectedProduct.years || (selectedProduct.year ? [selectedProduct.year] : []);
      const displayStockInfo = getDisplayStock(selectedProduct);
      setFormData({
        name: selectedProduct.name || '',
        description: selectedProduct.description || '',
        price: selectedProduct.price || 0,
        stock: displayStockInfo.value || 0,
        remarks: selectedProduct.remarks || '',
        forCourse: selectedProduct.forCourse || '',
        years: productYears,

        branch: Array.isArray(selectedProduct.branch) ? selectedProduct.branch : (selectedProduct.branch ? [selectedProduct.branch] : []),
        semesters: selectedProduct.semesters || [],
        isSet: Boolean(selectedProduct.isSet),
        setItems: (selectedProduct.setItems || []).map(item => ({
          productId: item?.product?._id || item?.product || '',
          quantity: item?.quantity || 1,
          productName: item?.product?.name || item?.productNameSnapshot || '',
        })).filter(item => item.productId),
        lowStockThreshold: selectedProduct.lowStockThreshold ?? 10,
        applicabilityMode: selectedProduct.applicabilityMode || 'rules',
        applicableStudents: (Array.isArray(selectedProduct.applicableStudents)
          ? selectedProduct.applicableStudents
          : []).filter(s => s != null),
      });
      setSetItemToAdd('');
      setIsEditing(false);
    }
  }, [selectedProduct, showProductDetail, collegeStockMap]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (showAddProduct) {
      setFormData({
        name: '',
        description: '',
        price: 0,
        stock: 0,
        remarks: '',
        forCourse: selectedCourse || '',
        years: selectedYear ? [Number(selectedYear)] : [],

        branch: [],
        semesters: [],
        isSet: false,
        setItems: [],
        lowStockThreshold: 10,
        applicabilityMode: 'rules',
        applicableStudents: [],
      });
      setStudentFilters({ course: '', year: '', branch: '' });
      setFetchedStudents([]);
      setError('');
      setSetItemToAdd('');
    }
  }, [showAddProduct, selectedCourse, selectedYear]);

  useEffect(() => {
    if (setItemToAdd && !availableSetProducts.some(p => p._id === setItemToAdd)) {
      setSetItemToAdd('');
    }
  }, [setItemToAdd, availableSetProducts]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newData = {
        ...prev,
        [name]: name === 'description'
          ? value.slice(0, 250)
          : (name === 'price' || name === 'stock' || name === 'lowStockThreshold')
            ? (value === '' ? 0 : Number(value))
            : value,
      };
      if (name === 'forCourse') {
        newData.years = [];
        newData.branch = []; // Reset branches when course changes
      }
      return newData;
    });
  };

  const handleYearToggle = (year) => {
    setFormData(prev => {
      const currentYears = prev.years || [];
      const yearNum = Number(year);
      const isSelected = currentYears.includes(yearNum);

      let newYears;
      if (isSelected) {
        newYears = currentYears.filter(y => y !== yearNum);
      } else {
        newYears = [...currentYears, yearNum].sort((a, b) => a - b);
      }

      return {
        ...prev,
        years: newYears
      };
    });
  };

  const handleBranchToggle = (branch) => {
    setFormData(prev => {
      const currentBranches = prev.branch || [];
      const isSelected = currentBranches.includes(branch);

      let newBranches;
      if (isSelected) {
        newBranches = currentBranches.filter(b => b !== branch);
      } else {
        newBranches = [...currentBranches, branch].sort((a, b) => a.localeCompare(b));
      }

      return {
        ...prev,
        branch: newBranches
      };
    });
  };

  const handleSemesterToggle = (semester) => {
    setFormData(prev => {
      const currentSemesters = prev.semesters || [];
      const semNum = Number(semester);
      const isSelected = currentSemesters.includes(semNum);

      let newSemesters;
      if (isSelected) {
        newSemesters = currentSemesters.filter(s => s !== semNum);
      } else {
        newSemesters = [...currentSemesters, semNum].sort((a, b) => a - b);
      }

      return {
        ...prev,
        semesters: newSemesters
      };
    });
  };

  const handleSetToggle = (checked) => {
    setFormData(prev => ({
      ...prev,
      isSet: checked,
      setItems: checked ? prev.setItems : [],
    }));
    if (!checked) {
      setSetItemToAdd('');
    }
  };

  const handleAddSetItem = () => {
    if (!setItemToAdd) return;
    const targetProduct = availableSetProducts.find(p => p._id === setItemToAdd);
    if (!targetProduct) return;

    setFormData(prev => {
      if ((prev.setItems || []).some(item => item.productId === targetProduct._id)) {
        return prev;
      }
      const newItems = [
        ...(prev.setItems || []),
        {
          productId: targetProduct._id,
          quantity: 1,
          productName: targetProduct.name,
        },
      ];
      return {
        ...prev,
        setItems: newItems,
      };
    });
    setSetItemToAdd('');
  };

  const handleRemoveSetItem = (productId) => {
    setFormData(prev => ({
      ...prev,
      setItems: (prev.setItems || []).filter(item => item.productId !== productId),
    }));
  };

  const handleSetItemQuantityChange = (productId, quantity) => {
    const parsedQuantity = Number(quantity);
    setFormData(prev => ({
      ...prev,
      setItems: (prev.setItems || []).map(item => {
        if (item.productId !== productId) return item;
        const safeQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? Math.round(parsedQuantity) : 1;
        return {
          ...item,
          quantity: safeQuantity,
        };
      }),
    }));
  };

  const resolveProductName = (productId, fallback) => {
    const match = (products || []).find(p => p._id === productId);
    return match?.name || fallback || 'Unknown product';
  };

  const resolveProductPrice = (productId, fallback) => {
    const match = (products || []).find(p => p._id === productId);
    return match?.price ?? fallback ?? 0;
  };

  const isCardView = viewMode === 'cards';
  const productType = formData.isSet ? 'set' : 'single';

  const handleProductTypeSelect = (type) => {
    setFormData(prev => ({
      ...prev,
      isSet: type === 'set',
      setItems: type === 'set' ? prev.setItems : [],
      lowStockThreshold: type === 'set' ? 0 : (prev.lowStockThreshold || 10),
      // Kits/Sets must be Rule Based
      applicabilityMode: type === 'set' ? 'rules' : prev.applicabilityMode,
    }));
    if (type !== 'set') {
      setSetItemToAdd('');
    }
  };

  // Student Fetching Logic
  const handleFetchStudents = async () => {
    setIsFetchingStudents(true);
    setFetchedStudents([]);
    try {
      const queryParams = new URLSearchParams();
      if (studentFilters.course) queryParams.append('course', studentFilters.course);
      if (studentFilters.year) queryParams.append('year', studentFilters.year);
      if (studentFilters.branch) queryParams.append('branch', studentFilters.branch);

      const res = await fetch(apiUrl(`/api/users?${queryParams.toString()}`));
      if (res.ok) {
        const data = await res.json();
        const students = Array.isArray(data) ? data : [];
        setFetchedStudents(students);

        // "All students are checked initially"
        // We merge these students into the existing applicableStudents.
        // Identify new students to add
        const currentIds = new Set(formData.applicableStudents.filter(s => s && s._id).map(s => s._id));
        const newStudents = students.filter(s => !currentIds.has(s._id));

        if (newStudents.length > 0) {
          setFormData(prev => ({
            ...prev,
            applicableStudents: [...prev.applicableStudents, ...newStudents]
          }));
        }
      }
    } catch (err) {
      console.error("Error fetching students", err);
    } finally {
      setIsFetchingStudents(false);
    }
  };

  const toggleStudentSelection = (student) => {
    const isSelected = formData.applicableStudents.some(s => s._id === student._id);
    if (isSelected) {
      // Remove
      setFormData(prev => ({
        ...prev,
        applicableStudents: prev.applicableStudents.filter(s => s._id !== student._id)
      }));
    } else {
      // Add
      setFormData(prev => ({
        ...prev,
        applicableStudents: [...prev.applicableStudents, student]
      }));
    }
  };

  const handleSelectAllFetched = () => {
    const currentIds = new Set(formData.applicableStudents.filter(s => s && s._id).map(s => s._id));
    // Use filtered students instead of all fetched students
    const newStudents = filteredFetchedStudents.filter(s => !currentIds.has(s._id));
    setFormData(prev => ({
      ...prev,
      applicableStudents: [...prev.applicableStudents, ...newStudents]
    }));
  };

  const handleDeselectAllFetched = () => {
    // Use filtered students instead of all fetched students
    const fetchedIds = new Set(filteredFetchedStudents.map(s => s._id));
    setFormData(prev => ({
      ...prev,
      applicableStudents: prev.applicableStudents.filter(s => !fetchedIds.has(s._id))
    }));
  };


  const handleSaveProduct = async () => {
    try {
      setSaving(true);
      setError('');

      if (!formData.name.trim()) {
        setError('Product name is required');
        setSaving(false);
        return;
      }

      if (formData.isSet && (!formData.setItems || formData.setItems.length === 0)) {
        setError('Select at least one existing product to include in the set');
        setSaving(false);
        return;
      }

      if (!formData.isSet && (formData.lowStockThreshold === undefined || formData.lowStockThreshold === null || Number.isNaN(Number(formData.lowStockThreshold)) || Number(formData.lowStockThreshold) < 0)) {
        setError('Please enter a valid low stock threshold (0 or higher)');
        setSaving(false);
        return;
      }

      // Determine if this is an update or create operation
      // Update: when viewing/editing an existing product (selectedProduct exists with valid _id)
      // Create: when adding a new product (showAddProduct is true and no selectedProduct)
      const isUpdateOperation = selectedProduct && selectedProduct._id && showProductDetail;
      const isCreateOperation = showAddProduct && !selectedProduct;

      if (isUpdateOperation) {
        // Update existing product
        console.log('Updating product:', selectedProduct._id, selectedProduct.name);
        const response = await fetch(apiUrl(`/api/products/${selectedProduct._id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            setItems: formData.isSet
              ? (formData.setItems || []).map(item => ({
                productId: item.productId,
                quantity: item.quantity,
              }))
              : [],
            lowStockThreshold: formData.isSet ? 0 : formData.lowStockThreshold,
            collegeId: activeCollegeId || undefined,
            applicabilityMode: formData.applicabilityMode,
            applicableStudents: formData.applicabilityMode === 'students' ? formData.applicableStudents.filter(s => s && s._id).map(s => s._id) : [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update product');
        }

        const updated = await response.json();
        if (activeCollegeId) {
          fetchCollegeStock(activeCollegeId);
        }

        handleProductUpdate(updated);
      } else if (isCreateOperation) {
        // Create new product (with price, but stock stays 0)
        console.log('Creating new product:', formData.name);
        const response = await fetch(apiUrl('/api/products'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description || '',
            price: formData.price || 0,
            stock: formData.stock || 0,
            remarks: formData.remarks || '',
            forCourse: formData.forCourse || undefined,
            years: formData.years || [],
            branch: formData.branch,
            semesters: formData.semesters || [],
            isSet: formData.isSet || undefined,
            setItems: formData.isSet
              ? (formData.setItems || []).map(item => ({
                productId: item.productId,
                quantity: item.quantity,
              }))
              : [],
            lowStockThreshold: formData.isSet ? 0 : formData.lowStockThreshold,
            collegeId: activeCollegeId || undefined,
            applicabilityMode: formData.applicabilityMode,
            applicableStudents: formData.applicabilityMode === 'students' ? formData.applicableStudents.filter(s => s && s._id).map(s => s._id) : [],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create product');
        }

        const created = await response.json();
        if (activeCollegeId) {
          fetchCollegeStock(activeCollegeId);
        }
        handleProductCreate(created);
        setShowAddProduct(false);
      } else {
        // Fallback: shouldn't happen, but log for debugging
        console.error('Save operation failed: Invalid state', { showAddProduct, showProductDetail, selectedProduct: selectedProduct?._id });
        throw new Error('Unable to determine save operation. Please close and reopen the form.');
      }
    } catch (err) {
      setError(err.message || 'Failed to save product');
      console.error('Error saving product:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not available';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/products/${selectedProduct._id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicabilityMode: 'students',
          applicableStudents: formData.applicableStudents.filter(s => s && s._id).map(s => s._id),
          // Preserve other core fields just in case backend requires them or to avoid overwriting partials if patch not supported properly
          // Generally we should just send what changed if backend supports PATCH, but we reused PUT.
          // Let's send key fields to be safe, or trust current PUT implementation.
          // Our existing updateProduct implementation uses `req.body` to overwrite what is provided, keeping others.
          // So we can send partials safely.
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save assignments');
      }

      const updated = await response.json();
      handleProductUpdate(updated);
      setShowAssignModal(false);
      setStatusMsg('Applicable students updated successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      {/* ... prev search filters ... */}

      {/* Assign Students Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setShowAssignModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Assign Students: {selectedProduct?.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Currently assigned to {formData.applicableStudents.length} student{formData.applicableStudents.length !== 1 ? 's' : ''}.
                </p>
              </div>
              <button onClick={() => setShowAssignModal(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">{error}</div>}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                {/* Reusing existing filter logic UI but streamlined */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Course</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={studentFilters.course}
                    onChange={(e) => setStudentFilters({ ...studentFilters, course: e.target.value, branch: '' })}
                  >
                    <option value="">Select Course</option>
                    {(config?.courses || []).map(c => (
                      <option key={c.name} value={c.name}>{c.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={studentFilters.year}
                    onChange={(e) => setStudentFilters({ ...studentFilters, year: e.target.value })}
                  >
                    <option value="">Select Year</option>
                    {[1, 2, 3, 4].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Branch</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                    value={studentFilters.branch}
                    onChange={(e) => setStudentFilters({ ...studentFilters, branch: e.target.value })}
                    disabled={!studentFilters.course}
                  >
                    <option value="">Select Branch</option>
                    {studentFilters.course && (config?.courses?.find(c => c.name === studentFilters.course)?.branches || []).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleFetchStudents}
                    disabled={isFetchingStudents || !studentFilters.course || !studentFilters.year}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isFetchingStudents ? 'Fetching...' : 'Fetch Students'}
                  </button>
                </div>
              </div>

              {fetchedStudents.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-700">
                      Fetched Students ({filteredFetchedStudents.length} of {fetchedStudents.length})
                    </h4>
                    <div className="space-x-2">
                      <button onClick={handleSelectAllFetched} className="text-xs text-blue-600 hover:underline">Select All</button>
                      <button onClick={handleDeselectAllFetched} className="text-xs text-red-600 hover:underline">Deselect All</button>
                    </div>
                  </div>
                  
                  {/* Search Bar for Fetched Students */}
                  <div className="mb-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        placeholder="Search students by name or ID..."
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      {studentSearchQuery && (
                        <button
                          onClick={() => setStudentSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">ID</th>
                          <th className="px-4 py-2 text-center">Assigned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredFetchedStudents.length > 0 ? (
                          filteredFetchedStudents.map(student => {
                          const isSelected = formData.applicableStudents.some(s => s._id === student._id);
                          return (
                            <tr key={student._id} className={isSelected ? 'bg-blue-50' : ''} onClick={() => toggleStudentSelection(student)}>
                              <td className="px-4 py-2">{student.name}</td>
                              <td className="px-4 py-2 text-gray-500">{student.studentId}</td>
                              <td className="px-4 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => { }} // handled by row click
                                  className="w-4 h-4 text-blue-600 rounded"
                                />
                              </td>
                            </tr>
                          );
                        })
                        ) : (
                          <tr>
                            <td colSpan="3" className="px-4 py-8 text-center text-gray-500">
                              No students found matching "{studentSearchQuery}"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Currently Assigned List Preview */}
              {formData.applicableStudents.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">Currently Assigned ({formData.applicableStudents.length})</h4>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-gray-100 rounded-lg">
                    {formData.applicableStudents.filter(s => s != null).map(s => (
                      <div key={s._id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                        <span>{s.name}</span>
                        <button onClick={() => toggleStudentSelection(s)} className="hover:text-red-600"><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
              <button
                onClick={handleSaveAssignments}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                Save Assignments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* existing UI follows ... */}
      {/* Search and Filters */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Filters & Display</p>
            <p className="text-xs text-gray-500">Search, refine and switch between table or card layouts.</p>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <button
                onClick={() => {
                  setShowAddProduct(true);
                  setShowProductDetail(false); // Ensure View modal is closed when adding
                  setSelectedProduct(null);    // Clear any selected product
                  setIsEditing(false);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg text-sm font-medium"
              >
                <Plus size={20} />
                Add Product
              </button>
            )}
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isCardView ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <LayoutGrid size={16} />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${!isCardView ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Table size={16} />
                Table
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Course Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              <option value="">All Courses</option>
              {(config?.courses || []).map(c => (
                <option key={c.name} value={c.name}>{c.displayName}</option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div>
            <select
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">All Years</option>
              {(config?.courses?.find(c => c.name === selectedCourse)?.years || []).map(y => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </div>

          {/* Product Type Filter */}
          <div>
            <select
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              value={productTypeFilter}
              onChange={(e) => setProductTypeFilter(e.target.value)}
            >
              <option value="">All Product Types</option>
              <option value="single">Single Products</option>
              <option value="set">Set / Kit Products</option>
            </select>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${statusMsg.includes('successfully')
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          {statusMsg}
        </div>
      )}

      {/* Products Listing */}
      {filteredProducts.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-600 mb-6">
            {searchQuery || selectedCourse || selectedYear
              ? 'Try adjusting your filters'
              : 'Get started by adding your first product'}
          </p>
          {!searchQuery && !selectedCourse && !selectedYear && (
            <button
              onClick={() => {
                setShowAddProduct(true);
                setShowProductDetail(false);
                setSelectedProduct(null);
                setIsEditing(false);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md hover:shadow-lg"
            >
              <Plus size={20} />
              Add Product
            </button>
          )}
        </div>
      ) : isCardView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const productYears = product.years || (product.year ? [product.year] : []);
            const yearsDisplay = productYears.length === 0
              ? 'All Years'
              : productYears.sort((a, b) => a - b).join(', ');

            return (
              <div
                key={product._id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow transition-all duration-200 group"
              >
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      {product.price !== undefined && (
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-md font-medium text-xs whitespace-nowrap">
                          ₹{product.price.toFixed(2)}
                        </span>
                      )}
                      {product.isSet && (
                        <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 rounded-md font-medium text-xs whitespace-nowrap">
                          Set
                        </span>
                      )}
                    </div>
                  </div>
                  {product.description && (
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Course</span>
                    <span className="font-medium text-gray-900 truncate max-w-[120px] text-right">{product.forCourse || 'All'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Years</span>
                    <span className="font-medium text-gray-900 truncate max-w-[120px] text-right">{yearsDisplay}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Semesters</span>
                    <span className="font-medium text-gray-900 truncate max-w-[120px] text-right">
                      {(product.semesters || []).length > 0 ? (product.semesters || []).join(', ') : 'All'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{getDisplayStock(product).label}</span>
                    <span className={`font-semibold ${getDisplayStock(product).value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {getDisplayStock(product).value}
                    </span>
                  </div>
                  {product.isSet && (
                    <div className="text-xs text-gray-600">
                      <p className="text-gray-500 mb-1">Includes</p>
                      <ul className="space-y-1">
                        {(product.setItems || []).map(item => {
                          const itemName = item?.product?.name || item?.productNameSnapshot || 'Unknown';
                          const itemQty = item?.quantity || 1;
                          return (
                            <li key={`${product._id}-${item?.product?._id || item?.product || itemName}`} className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-semibold">
                                {itemQty}
                              </span>
                              <span className="text-gray-700 truncate text-xs">{itemName}</span>
                            </li>
                          );
                        })}
                        {(product.setItems || []).length === 0 && (
                          <li className="text-[11px] text-gray-400">No items linked</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 px-4 pb-4 pt-0">
                  {/* View/Edit Button */}
                  <button
                    onClick={() => handleViewDetails(product)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium"
                  >
                    {canEdit ? <Edit size={16} /> : <Eye size={16} />}
                    {canEdit ? 'Edit' : 'View'}
                  </button>

                  {/* Assign Button */}
                  {canEdit && (
                    <button
                      onClick={() => handleOpenAssignModal(product)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 transition-all text-sm font-medium"
                      title="Assign to specific students"
                    >
                      <Users size={16} />
                    </button>
                  )}

                  {/* Delete Button */}
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(product._id, product.name)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-all text-sm font-medium"
                      title="Delete product"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Course</th>
                  <th className="px-6 py-4">Years</th>
                  <th className="px-6 py-4">Semesters</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {filteredProducts.map(product => {
                  const productYears = product.years || (product.year ? [product.year] : []);
                  const yearsDisplay = productYears.length === 0
                    ? 'All Years'
                    : productYears.sort((a, b) => a - b).map(y => `Year ${y}`).join(', ');

                  return (
                    <tr key={product._id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{product.name}</span>
                          {product.description && (
                            <span className="text-xs text-gray-500 line-clamp-1">{product.description}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{product.forCourse || 'All'}</td>
                      <td className="px-6 py-4 text-gray-600">{yearsDisplay}</td>
                      <td className="px-6 py-4 text-gray-600">
                        {(product.semesters || []).length > 0
                          ? (product.semesters || []).map(s => `Sem ${s}`).join(', ')
                          : 'All Semesters'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">₹{product.price?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4">
                        {product.isSet ? (
                          <span className="text-sm font-medium text-purple-600">Derived</span>
                        ) : (
                          <span className={`font-semibold ${getDisplayStock(product).value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {getDisplayStock(product).value}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {product.isSet ? (
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
                            Set
                            <span className="font-medium text-purple-500">{product.setItems?.length || 0} items</span>
                          </span>
                        ) : (
                          <span className="inline-flex px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">Single</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenAssignModal(product)}
                              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Assign to specific students"
                            >
                              <Users size={18} />
                            </button>
                          )}
                          <button
                            onClick={() => handleViewDetails(product)}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            {canEdit ? <Edit size={16} /> : <Eye size={16} />}
                            {canEdit ? 'Edit' : 'View'}
                          </button>
                          {canEdit ? (
                            <button
                              onClick={() => handleDelete(product._id, product.name)}
                              className="inline-flex items-center justify-center p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">
                              View Only
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Detail Modal - View/Edit */}
      {showProductDetail && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 overflow-hidden flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between rounded-t-xl flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold">Product Details</h2>
                <p className="text-blue-100 text-sm mt-1">View and edit product information</p>
              </div>
              <button
                onClick={() => {
                  setShowProductDetail(false);
                  setSelectedProduct(null);
                  setIsEditing(false);
                }}
                className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white hover:text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex-1 overflow-y-auto">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Product Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleFormChange}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter product name..."
                      />
                    ) : (
                      <p className="text-gray-900 font-medium text-lg">{selectedProduct.name}</p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description
                      <span className="text-gray-500 font-normal ml-2">
                        ({formData.description.length}/250 characters)
                      </span>
                    </label>
                    {isEditing ? (
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleFormChange}
                        maxLength={250}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        placeholder="Enter product description (max 250 characters)..."
                      />
                    ) : (
                      <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {selectedProduct.description || 'No description provided'}
                      </p>
                    )}
                  </div>

                  {/* Price Section */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign size={18} className="text-blue-600" />
                      <label className="block text-sm font-semibold text-gray-700">Price</label>
                    </div>
                    {isEditing ? (
                      <div>
                        <input
                          type="number"
                          name="price"
                          value={formData.price}
                          onChange={handleFormChange}
                          min="0"
                          step="0.01"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                          placeholder="0.00"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-2xl font-bold text-blue-700 mb-2">
                          ₹{selectedProduct.price?.toFixed(2) || '0.00'}
                        </p>
                      </div>
                    )}

                    {selectedProduct.lastPriceUpdated && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                        <Calendar size={14} />
                        <span className="font-medium">Last Updated:</span>
                        <span>{formatDate(selectedProduct.lastPriceUpdated)}</span>
                      </div>
                    )}
                  </div>

                  {/* Stock */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{getDisplayStock(selectedProduct).label}</label>
                    {isEditing ? (
                      formData.isSet ? (
                        <p className="text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                          Set availability is managed by its component items. Update individual item stock from the stock management tab.
                        </p>
                      ) : (
                        <input
                          type="number"
                          name="stock"
                          value={formData.stock}
                          onChange={handleFormChange}
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="0"
                        />
                      )
                    ) : (
                      selectedProduct.isSet ? (
                        <p className="text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                          Derived from component items
                        </p>
                      ) : (
                        <p className="text-gray-700 bg-gray-50 p-2 rounded-lg">{getDisplayStock(selectedProduct).value}</p>
                      )
                    )}
                  </div>

                  {/* Low Stock Threshold */}
                  {!formData.isSet && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Low Stock Threshold</label>
                      {isEditing ? (
                        <input
                          type="number"
                          name="lowStockThreshold"
                          value={formData.lowStockThreshold}
                          onChange={handleFormChange}
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="e.g. 10"
                        />
                      ) : (
                        <p className="text-gray-700 bg-gray-50 p-2 rounded-lg">{selectedProduct.lowStockThreshold ?? 0}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Set Composition */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <Layers size={18} className="text-purple-600" />
                        <h3 className="text-sm font-semibold text-purple-700">Set Composition</h3>
                      </div>
                      {isEditing ? (
                        <label className="flex items-center gap-2 text-xs font-medium text-purple-700">
                          <input
                            type="checkbox"
                            checked={formData.isSet}
                            onChange={(e) => handleSetToggle(e.target.checked)}
                            className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                          />
                          Treat as Set
                        </label>
                      ) : (
                        <span className={`text-xs font-semibold ${selectedProduct.isSet ? 'text-purple-700' : 'text-gray-500'}`}>
                          {selectedProduct.isSet ? 'Set Product' : 'Single Product'}
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-4">
                        <p className="text-xs text-purple-700">
                          Link existing products to create a bundled kit. The set price you configure above overrides individual item prices.
                        </p>

                        {formData.isSet && (
                          <>
                            <div className="flex flex-col md:flex-row gap-3">
                              <select
                                className="flex-1 px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-sm"
                                value={setItemToAdd}
                                onChange={(e) => setSetItemToAdd(e.target.value)}
                              >
                                <option value="">Select product to include</option>
                                {availableSetProducts.map(p => (
                                  <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={handleAddSetItem}
                                type="button"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                              >
                                <Plus size={16} />
                                Add Item
                              </button>
                            </div>
                            {availableSetProducts.length === 0 && (
                              <p className="text-xs text-purple-600 bg-purple-100/60 px-3 py-2 rounded-lg">
                                Create individual products first to build sets.
                              </p>
                            )}
                          </>
                        )}

                        {formData.isSet && (
                          <div className="space-y-3">
                            {(formData.setItems || []).map(item => {
                              const name = resolveProductName(item.productId, item.productName);
                              return (
                                <div
                                  key={item.productId}
                                  className="bg-white border border-purple-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm"
                                >
                                  <div>
                                    <p className="font-medium text-gray-800 text-sm">{name}</p>
                                    <p className="text-xs text-gray-500">Qty inside kit</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => handleSetItemQuantityChange(item.productId, e.target.value)}
                                      className="w-20 px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSetItem(item.productId)}
                                      className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800"
                                    >
                                      <MinusCircle size={16} />
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {(formData.setItems || []).length === 0 && (
                              <p className="text-xs text-purple-600 bg-purple-100/60 px-3 py-2 rounded-lg">
                                No items selected yet.
                              </p>
                            )}
                          </div>
                        )}
                        {!formData.isSet && (
                          <p className="text-xs text-gray-600 bg-white border border-purple-100 rounded-lg px-3 py-2">
                            Keep this unchecked for standalone items. Toggle to bundle existing products.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedProduct.isSet ? (
                          <ul className="space-y-2">
                            {(selectedProduct.setItems || []).map(item => {
                              const name = resolveProductName(item?.product?._id || item?.product, item?.productNameSnapshot);
                              const price = resolveProductPrice(item?.product?._id || item?.product, item?.productPriceSnapshot);
                              return (
                                <li key={`${selectedProduct._id}-${item?.product?._id || item?.product || name}`} className="bg-white border border-purple-200 rounded-lg px-3 py-2">
                                  <div className="flex items-center justify-between text-sm text-gray-700">
                                    <span>{name}</span>
                                    <span className="font-semibold">Qty: {item?.quantity || 1}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">₹{Number(price).toFixed(2)} each</p>
                                </li>
                              );
                            })}
                            {(selectedProduct.setItems || []).length === 0 && (
                              <li className="text-xs text-gray-500">No items linked yet.</li>
                            )}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-600">This product is not configured as a set.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Remarks Section */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={18} className="text-yellow-600" />
                      <label className="block text-sm font-semibold text-gray-700">Remarks</label>
                      <span className="text-xs text-gray-500">(Internal/Admin Notes)</span>
                    </div>
                    {isEditing ? (
                      <textarea
                        name="remarks"
                        value={formData.remarks}
                        onChange={handleFormChange}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                        placeholder="Enter internal notes..."
                      />
                    ) : (
                      <p className="text-gray-700">
                        {selectedProduct.remarks || 'No remarks available'}
                      </p>
                    )}
                  </div>

                  {/* Course/Year */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Product Applicability</h3>

                    {/* Course */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Course</label>
                      {isEditing ? (
                        <select
                          name="forCourse"
                          value={formData.forCourse}
                          onChange={handleFormChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">All Courses</option>
                          {(config?.courses || []).map(c => (
                            <option key={c.name} value={c.name}>{c.displayName}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-700 bg-gray-50 p-2 rounded-lg">{selectedProduct.forCourse || 'All Courses'}</p>
                      )}
                    </div>

                    {/* Years */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Years</label>
                      {isEditing ? (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                          <div className="flex flex-wrap gap-3">
                            {(config?.courses?.find(c => c.name === formData.forCourse)?.years || []).map(y => {
                              const isChecked = (formData.years || []).includes(y);
                              return (
                                <label
                                  key={y}
                                  className="flex items-center gap-2 px-4 py-2 bg-white border-2 rounded-lg cursor-pointer transition-all hover:border-blue-400"
                                  style={{
                                    borderColor: isChecked ? '#3b82f6' : '#d1d5db',
                                    backgroundColor: isChecked ? '#eff6ff' : 'white'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleYearToggle(y)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="font-medium text-gray-700">Year {y}</span>
                                </label>
                              );
                            })}
                            {(config?.courses?.find(c => c.name === formData.forCourse)?.years || []).length === 0 && (
                              <p className="text-sm text-gray-500">Select a course to see available years</p>
                            )}
                          </div>
                          {(formData.years || []).length === 0 && (
                            <p className="text-xs text-gray-500 mt-2">No years selected - product applies to all years</p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                          {(() => {
                            const productYears = selectedProduct.years || (selectedProduct.year ? [selectedProduct.year] : []);
                            const yearsDisplay = productYears.length === 0
                              ? 'All Years'
                              : productYears.sort((a, b) => a - b).map(y => `Year ${y}`).join(', ');
                            return <p className="text-gray-700 font-medium">{yearsDisplay}</p>;
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Branches */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Branches</label>
                      {isEditing ? (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                          <div className="flex flex-wrap gap-3">
                            {(config?.courses?.find(c => c.name === formData.forCourse)?.branches || []).map(branch => {
                              const isChecked = (formData.branch || []).includes(branch);
                              return (
                                <label
                                  key={branch}
                                  className="flex items-center gap-2 px-4 py-2 bg-white border-2 rounded-lg cursor-pointer transition-all hover:border-blue-400"
                                  style={{
                                    borderColor: isChecked ? '#3b82f6' : '#d1d5db',
                                    backgroundColor: isChecked ? '#eff6ff' : 'white'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleBranchToggle(branch)}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="font-medium text-gray-700">{branch}</span>
                                </label>
                              );
                            })}
                            {(config?.courses?.find(c => c.name === formData.forCourse)?.branches || []).length === 0 && (
                              <p className="text-sm text-gray-500">Select a course to see available branches</p>
                            )}
                          </div>
                          {(formData.branch || []).length === 0 && (
                            <p className="text-xs text-gray-500 mt-2">No branches selected - product applies to all branches</p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                          {(() => {
                            const productBranches = Array.isArray(selectedProduct.branch)
                              ? selectedProduct.branch
                              : (selectedProduct.branch ? [selectedProduct.branch] : []);
                            const branchesDisplay = productBranches.length === 0
                              ? 'All Branches'
                              : productBranches.sort((a, b) => a.localeCompare(b)).join(', ');
                            return <p className="text-gray-700 font-medium">{branchesDisplay}</p>;
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Semesters */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Semesters</label>
                      {isEditing ? (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                          <div className="flex flex-wrap gap-3">
                            {formData.forCourse ? (
                              [1, 2].map(sem => {
                                const isChecked = (formData.semesters || []).includes(sem);
                                return (
                                  <label
                                    key={sem}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 rounded-lg cursor-pointer transition-all hover:border-blue-400"
                                    style={{
                                      borderColor: isChecked ? '#3b82f6' : '#d1d5db',
                                      backgroundColor: isChecked ? '#eff6ff' : 'white'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleSemesterToggle(sem)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="font-medium text-gray-700">Semester {sem}</span>
                                  </label>
                                );
                              })
                            ) : (
                              <p className="text-sm text-gray-500">Select a course to see available semesters</p>
                            )}
                          </div>
                          {(formData.semesters || []).length === 0 && (
                            <p className="text-xs text-gray-500 mt-2">No semesters selected - product applies to all semesters</p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3">
                          {(() => {
                            const productSemesters = selectedProduct.semesters || [];
                            const semestersDisplay = productSemesters.length === 0
                              ? 'All Semesters'
                              : productSemesters.sort((a, b) => a - b).map(s => `Sem ${s}`).join(', ');
                            return <p className="text-gray-700 font-medium">{semestersDisplay}</p>;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between rounded-b-xl flex-shrink-0">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Edit size={16} />
                {isEditing ? 'Cancel Edit' : 'Edit Product'}
              </button>
              {isEditing && (
                <button
                  onClick={handleSaveProduct}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal - Create New (without price and stock) */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 overflow-hidden flex flex-col max-h-[95vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between rounded-t-xl flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold">Add New Product</h2>
                <p className="text-blue-100 text-sm mt-1">Fill in all product information</p>
              </div>
              <button
                onClick={() => {
                  setShowAddProduct(false);
                  setError('');
                }}
                className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white hover:text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-100">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-6">
                  {error}
                </div>
              )}

              <div className="max-w-4xl mx-auto space-y-4">
                <section className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900">Select Product Type</h3>
                    <p className="text-sm text-gray-500">Choose whether you’re adding a single item or bundling existing products into a set.</p>
                  </div>
                  <div className="px-5 py-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleProductTypeSelect('single')}
                      className={`text-left p-4 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${productType === 'single' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}
                    >
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 mb-4">
                        <Package size={20} />
                      </span>
                      <h4 className="text-base font-semibold text-gray-900">Single Product</h4>
                      <p className="mt-1 text-sm text-gray-600">Add a standalone item with pricing that applies per unit.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProductTypeSelect('set')}
                      className={`text-left p-5 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${productType === 'set' ? 'border-purple-500 bg-purple-50 shadow-sm' : 'border-gray-200 bg-white hover:border-purple-300'}`}
                    >
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-600 mb-4">
                        <Layers size={20} />
                      </span>
                      <h4 className="text-base font-semibold text-gray-900">Set / Kit</h4>
                      <p className="mt-1 text-sm text-gray-600">Bundle multiple existing products together with a combined price.</p>
                    </button>
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <section className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-900">General Details</h3>
                        <p className="text-sm text-gray-500">Give your product a recognizable name and description.</p>
                      </div>
                      <div className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Product Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleFormChange}
                            required
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                            placeholder="e.g. B.Tech 1st Year Starter Kit"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-semibold text-gray-700">Description</label>
                            <span className="text-xs text-gray-500">{formData.description.length}/250</span>
                          </div>
                          <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleFormChange}
                            maxLength={250}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-sm"
                            placeholder="Share a short overview of what this product or kit includes..."
                          />
                        </div>
                      </div>
                    </section>

                    <section className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex flex-col gap-1">
                        <h3 className="text-lg font-semibold text-gray-900">Pricing & Notes</h3>
                        <p className="text-sm text-gray-500">Set the selling price and capture any internal notes.</p>
                      </div>
                      <div className="px-5 py-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600">
                              <DollarSign size={18} />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-gray-700">Price</p>
                              <p className="text-xs text-gray-500">Required • visible to students</p>
                            </div>
                          </div>
                          <input
                            type="number"
                            name="price"
                            value={formData.price}
                            onChange={handleFormChange}
                            min="0"
                            step="0.01"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                            placeholder="0.00"
                            required
                          />
                        </div>
                        {!formData.isSet && (
                          <div className="md:col-span-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600">
                                <Archive size={18} />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-700">Initial {getDisplayStock({ _id: 'new', isSet: false }).label}</p>
                                <p className="text-xs text-gray-500">Starting quantity at this location</p>
                              </div>
                            </div>
                            <input
                              type="number"
                              name="stock"
                              value={formData.stock}
                              onChange={handleFormChange}
                              min="0"
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent shadow-sm"
                              placeholder="0"
                            />
                          </div>
                        )}
                        {!formData.isSet && (
                          <div className="md:col-span-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600">
                                <Plus size={18} />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-gray-700">Low Stock Threshold</p>
                                <p className="text-xs text-gray-500">Trigger low-stock alerts below this qty</p>
                              </div>
                            </div>
                            <input
                              type="number"
                              name="lowStockThreshold"
                              value={formData.lowStockThreshold}
                              onChange={handleFormChange}
                              min="0"
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
                              placeholder="e.g. 10"
                            />
                          </div>
                        )}
                        <div className="md:col-span-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-600">
                              <FileText size={18} />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-gray-700">Remarks</p>
                              <p className="text-xs text-gray-500">Optional • internal only</p>
                            </div>
                          </div>
                          <textarea
                            name="remarks"
                            value={formData.remarks}
                            onChange={handleFormChange}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none shadow-sm"
                            placeholder="Add internal admin notes, procurement details, etc."
                          />
                        </div>
                      </div>
                    </section>

                    {formData.isSet && (
                      <section className="bg-white/90 backdrop-blur border border-purple-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-purple-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-600">
                              <Layers size={18} />
                            </span>
                            <div>
                              <h3 className="text-lg font-semibold text-purple-800">Set Composition</h3>
                              <p className="text-sm text-purple-500">Bundle existing products into curated kits.</p>
                            </div>
                          </div>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                          <p className="text-sm text-purple-600 bg-purple-50 border border-purple-100 rounded-lg px-4 py-3">
                            Select ready-to-sell products from your catalog, then adjust quantities to build the perfect kit.
                          </p>
                          <div className="flex flex-col gap-2.5 lg:flex-row">
                            <select
                              className="flex-1 px-4 py-2.5 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-sm shadow-sm"
                              value={setItemToAdd}
                              onChange={(e) => setSetItemToAdd(e.target.value)}
                            >
                              <option value="">Select product to include</option>
                              {availableSetProducts.map(p => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={handleAddSetItem}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm shadow-sm"
                            >
                              <Plus size={16} />
                              Add Item
                            </button>
                          </div>
                          {availableSetProducts.length === 0 && (
                            <p className="text-xs text-purple-600 bg-purple-100/60 px-4 py-2 rounded-lg">
                              Create individual products first to build sets.
                            </p>
                          )}
                          <div className="space-y-2.5">
                            {(formData.setItems || []).map(item => {
                              const name = resolveProductName(item.productId, item.productName);
                              const price = resolveProductPrice(item.productId, 0);
                              return (
                                <div
                                  key={`new-${item.productId}`}
                                  className="bg-white border border-purple-100 rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 shadow-sm"
                                >
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                                    <p className="text-xs text-gray-500">Current price: ₹{Number(price).toFixed(2)}</p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => handleSetItemQuantityChange(item.productId, e.target.value)}
                                      className="w-20 px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSetItem(item.productId)}
                                      className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800"
                                    >
                                      <MinusCircle size={16} />
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {(formData.setItems || []).length === 0 && (
                              <p className="text-xs text-purple-600 bg-purple-100/60 px-4 py-2.5 rounded-lg text-center">
                                No items selected yet. Add products to build your set.
                              </p>
                            )}
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Applicability</h3>
                          <p className="text-sm text-gray-500">Who is this product for?</p>
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, applicabilityMode: 'rules' }))}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${formData.applicabilityMode === 'rules'
                              ? 'bg-white text-gray-900 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                              }`}
                          >
                            Rule Based
                          </button>
                          <button
                            type="button"
                            disabled={formData.isSet}
                            onClick={() => setFormData(prev => ({ ...prev, applicabilityMode: 'students' }))}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${formData.applicabilityMode === 'students'
                              ? 'bg-white text-purple-600 shadow-sm'
                              : formData.isSet
                                ? 'text-gray-300 cursor-not-allowed'
                                : 'text-gray-500 hover:text-gray-700'
                              }`}
                            title={formData.isSet ? "Specific student selection is not available for Kits" : ""}
                          >
                            Specific Students
                          </button>
                        </div>
                      </div>

                      <div className="px-5 py-4 space-y-4">
                        {formData.isSet && formData.applicabilityMode === 'students' && (
                          // Fallback/Warning if somehow in student mode while being a set (e.g. toggled set after)
                          <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm mb-4">
                            Note: Kits cannot be assigned to specific students. Please switch to "Rule Based" or disable "Set" mode.
                          </div>
                        )}
                        {formData.applicabilityMode === 'rules' ? (
                          <>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Course</label>
                              <select
                                name="forCourse"
                                value={formData.forCourse}
                                onChange={handleFormChange}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                              >
                                <option value="">All Courses</option>
                                {(config?.courses || []).map(c => (
                                  <option key={c.name} value={c.name}>{c.displayName}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Years</label>
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                                <div className="flex flex-wrap gap-2.5">
                                  {(config?.courses?.find(c => c.name === formData.forCourse)?.years || []).map(y => {
                                    const isChecked = (formData.years || []).includes(y);
                                    return (
                                      <label
                                        key={y}
                                        className={`flex items-center gap-2 px-3.5 py-1.5 border-2 rounded-lg cursor-pointer transition-all ${isChecked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleYearToggle(y)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <span className="font-medium text-sm">Year {y}</span>
                                      </label>
                                    );
                                  })}
                                  {(config?.courses?.find(c => c.name === formData.forCourse)?.years || []).length === 0 && (
                                    <p className="text-sm text-gray-500">Select a course to see available years.</p>
                                  )}
                                </div>
                                {(formData.years || []).length === 0 && (
                                  <p className="text-xs text-gray-500 mt-2">No years selected — product visible to all years.</p>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Branches</label>
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                                <div className="flex flex-wrap gap-2.5">
                                  {(config?.courses?.find(c => c.name === formData.forCourse)?.branches || []).map(branch => {
                                    const isChecked = (formData.branch || []).includes(branch);
                                    return (
                                      <label
                                        key={branch}
                                        className={`flex items-center gap-2 px-3.5 py-1.5 border-2 rounded-lg cursor-pointer transition-all ${isChecked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleBranchToggle(branch)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <span className="font-medium text-sm">{branch}</span>
                                      </label>
                                    );
                                  })}
                                  {(config?.courses?.find(c => c.name === formData.forCourse)?.branches || []).length === 0 && (
                                    <p className="text-sm text-gray-500">Select a course to see available branches.</p>
                                  )}
                                </div>
                                {(formData.branch || []).length === 0 && (
                                  <p className="text-xs text-gray-500 mt-2">No branches selected — product visible to all branches.</p>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">Semesters</label>
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5">
                                <div className="flex flex-wrap gap-2.5">
                                  {formData.forCourse ? (
                                    [1, 2].map(sem => {
                                      const isChecked = (formData.semesters || []).includes(sem);
                                      return (
                                        <label
                                          key={sem}
                                          className={`flex items-center gap-2 px-3.5 py-1.5 border-2 rounded-lg cursor-pointer transition-all ${isChecked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleSemesterToggle(sem)}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                          />
                                          <span className="font-medium text-sm">Semester {sem}</span>
                                        </label>
                                      );
                                    })
                                  ) : (
                                    <p className="text-sm text-gray-500">Select a course to see available semesters.</p>
                                  )}
                                </div>
                                {(formData.semesters || []).length === 0 && (
                                  <p className="text-xs text-gray-500 mt-2">No semesters selected — product applies to all semesters.</p>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-4">
                            <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 mb-4">
                              <p className="text-sm text-purple-800">
                                <strong>Specific Student Mode:</strong> Use filters below to find students. All found students will be selected by default. You can uncheck any you wish to exclude.
                              </p>
                            </div>

                            {/* Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Filter Course</label>
                                <select
                                  value={studentFilters.course}
                                  onChange={(e) => setStudentFilters(prev => ({ ...prev, course: e.target.value, branch: '' }))} // Reset branch when course changes
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                >
                                  <option value="">Select Course</option>
                                  {(config?.courses || []).map(c => (
                                    <option key={c.name} value={c.name}>{c.displayName}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Filter Year</label>
                                <select
                                  value={studentFilters.year}
                                  onChange={(e) => setStudentFilters(prev => ({ ...prev, year: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                >
                                  <option value="">Select Year</option>
                                  {[1, 2, 3, 4].map(y => (
                                    <option key={y} value={y}>Year {y}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Filter Branch</label>
                                <select
                                  value={studentFilters.branch}
                                  onChange={(e) => setStudentFilters(prev => ({ ...prev, branch: e.target.value }))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                                  disabled={!studentFilters.course}
                                >
                                  <option value="">Select Branch</option>
                                  {studentFilters.course && (config?.courses?.find(c => c.name === studentFilters.course)?.branches || []).map(b => (
                                    <option key={b} value={b}>{b}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={handleFetchStudents}
                                disabled={isFetchingStudents || (!studentFilters.course && !studentFilters.year && !studentFilters.branch)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isFetchingStudents || (!studentFilters.course && !studentFilters.year && !studentFilters.branch)
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                                  }`}
                              >
                                {isFetchingStudents ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Fetching...
                                  </>
                                ) : (
                                  <>
                                    <Search size={16} />
                                    Fetch Students
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Fetch Results / Selection Table */}
                            {fetchedStudents.length > 0 && (
                              <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                  <h4 className="font-semibold text-gray-700 text-sm">Found {fetchedStudents.length} Students</h4>
                                  <div className="space-x-2">
                                    <button
                                      type="button"
                                      onClick={handleSelectAllFetched}
                                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                                    >
                                      Select All
                                    </button>
                                    <span className="text-gray-300">|</span>
                                    <button
                                      type="button"
                                      onClick={handleDeselectAllFetched}
                                      className="text-xs text-gray-500 hover:text-gray-700"
                                    >
                                      Deselect All
                                    </button>
                                  </div>
                                </div>
                                <div className="max-h-60 overflow-y-auto">
                                  {fetchedStudents.map(student => {
                                    const isSelected = formData.applicableStudents.some(s => s._id === student._id);
                                    return (
                                      <label key={student._id} className={`flex items-center justify-between px-4 py-2 hover:bg-purple-50 cursor-pointer border-b border-gray-50 last:border-0 ${isSelected ? 'bg-purple-50/50' : ''}`}>
                                        <div className="flex items-center gap-3">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleStudentSelection(student)}
                                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                          />
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">{student.name}</p>
                                            <p className="text-xs text-gray-500">{student.studentId} • {student.branch || student.course} {student.year ? `• Year ${student.year}` : ''}</p>
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Summary of Total Selected */}
                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                              <p className="text-sm font-medium text-gray-700">
                                Total Applicable Students: <span className="text-purple-600 font-bold">{formData.applicableStudents.length}</span>
                              </p>
                              {formData.applicableStudents.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setFormData(prev => ({ ...prev, applicableStudents: [] }))}
                                  className="text-xs text-red-600 hover:text-red-700 bg-red-50 px-2 py-1 rounded"
                                >
                                  Clear All Selections
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="space-y-4">
                    <div className="bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 text-white rounded-xl p-5 shadow-lg">
                      <p className="text-xs uppercase tracking-wide text-blue-100 font-semibold">Quick Preview</p>
                      <h3 className="mt-2 text-xl font-bold">{formData.name || 'Untitled Product'}</h3>
                      <p className="mt-2 text-xs text-blue-100 leading-relaxed">
                        {formData.description || 'Add a description to help admins recognize this product instantly.'}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-blue-100">Price</p>
                          <p className="text-base font-semibold">₹{Number(formData.price || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-blue-100">Type</p>
                          <p className="text-base font-semibold">{formData.isSet ? 'Set Product' : 'Single Item'}</p>
                        </div>
                        <div>
                          <p className="text-blue-100">Course</p>
                          <p className="text-sm font-semibold">{formData.forCourse || 'All Courses'}</p>
                        </div>
                        <div>
                          <p className="text-blue-100">Years</p>
                          <p className="text-sm font-semibold">{(formData.years || []).length > 0 ? formData.years.sort((a, b) => a - b).map(y => `Y${y}`).join(', ') : 'All Years'}</p>
                        </div>
                        <div>
                          <p className="text-blue-100">Branches</p>
                          <p className="text-sm font-semibold">{(formData.branch || []).length > 0 ? formData.branch.sort((a, b) => a.localeCompare(b)).join(', ') : 'All Branches'}</p>
                        </div>
                        {!formData.isSet && (
                          <div className="col-span-2">
                            <p className="text-blue-100">Low Stock Threshold</p>
                            <p className="text-sm font-semibold">{Number(formData.lowStockThreshold || 0)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl p-5 shadow-sm">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Set Summary</h4>
                      {formData.isSet ? (
                        <ul className="space-y-3">
                          {(formData.setItems || []).map(item => {
                            const name = resolveProductName(item.productId, item.productName);
                            return (
                              <li key={`summary-${item.productId}`} className="flex items-center justify-between text-sm text-gray-700">
                                <div className="flex flex-col">
                                  <span className="font-medium text-gray-900">{name}</span>
                                  <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
                                </div>
                                <span className="text-xs text-gray-400">#{String(item.productId || '').slice(-4) || '----'}</span>
                              </li>
                            );
                          })}
                          {(formData.setItems || []).length === 0 && (
                            <li className="text-xs text-gray-500">No items selected yet.</li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">Toggle "Create as Set" to bundle existing products.</p>
                      )}
                    </div>

                    <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-xl p-5 shadow-sm">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Launch Checklist</h4>
                      <ul className="space-y-1.5 text-xs text-gray-600">
                        <li className={`${formData.name ? 'text-green-600 font-semibold' : ''}`}>• Product name {formData.name ? 'added' : 'missing'}</li>
                        <li className={`${formData.price ? 'text-green-600 font-semibold' : ''}`}>• Price {formData.price ? 'configured' : 'not set'}</li>
                        <li className={`${!formData.isSet || (formData.setItems || []).length > 0 ? 'text-green-600 font-semibold' : ''}`}>
                          • {formData.isSet ? 'Set composition ready' : 'Single product'}
                        </li>
                      </ul>
                    </div>
                  </aside>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 border-t border-gray-200 p-6 flex items-center justify-between rounded-b-xl flex-shrink-0">
              <button
                onClick={() => {
                  setShowAddProduct(false);
                  setError('');
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={saving || !formData.name.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                {saving ? 'Creating...' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddProduct;
