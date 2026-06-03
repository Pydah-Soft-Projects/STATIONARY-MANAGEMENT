import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Package, Search, Plus, Trash2, Eye, Save, FileText, UserPlus, Building2, ShoppingCart, Minus, X, Printer, LayoutGrid, List, History, Calendar, DollarSign, BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { apiUrl } from '../utils/api';

const emptyReportSummary = () => ({
    byAuthorizedBy: [],
    byDepartment: [],
    byPerson: [],
    byItem: [],
});

const AUTHORITIES = [
    "P. V. Surya Prakash (Engineering Principal sir)",
    "S. U. V. N. Suresh kumar (Degree Principal sir)",
    "N. P. V. S. Subba Rao (HR sir)",
    "M. Suma Medam (HOD)-TPO",
    "Dr. T. K. V. Kesava Rao (Pharmacy Principal sir)",
    "S. Karimulla Tanesha (A.O) - Engineering",
    "Bashir Hamad babu MD (A.O) - Diploma",
    "Devi. B. V. Raghava Swamy (A.O) - Degree",
    "Prasanna kumar Reddy (A.O) - Pharmacy",
    "Dean sir",
    "Ravikumar (Vice Principal)",
    "Nithya medam",
    "Sriram Sir"
];

const GeneralStock = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState('products');
    const [vendors, setVendors] = useState([]);
    const isSuperAdmin = currentUser?.role === 'Administrator';

    // College context
    const [viewContext, setViewContext] = useState('all'); // 'all' or collegeId
    const [colleges, setColleges] = useState([]);
    const [selectedCollegeName, setSelectedCollegeName] = useState('All Colleges');

    // Products state
    const [products, setProducts] = useState([]);
    const [productForm, setProductForm] = useState({
        name: '',
        description: '',
        lowStockThreshold: 10,
        initialStock: 0,
        collegeId: '',
    });
    const [editingProduct, setEditingProduct] = useState(null);
    const [productSearch, setProductSearch] = useState('');

    const filteredProducts = useMemo(() => {
        if (!productSearch) return products;
        const searchLower = productSearch.toLowerCase();
        return products.filter(p =>
            p.name?.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower)
        );
    }, [products, productSearch]);


    // Vendor Purchase state (adds stock)
    const [purchaseForm, setPurchaseForm] = useState({
        vendor: '',
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        college: '',
        remarks: '',
    });
    const [purchaseItems, setPurchaseItems] = useState([]);
    const [currentPurchaseItem, setCurrentPurchaseItem] = useState({
        product: '',
        quantity: '',
        purchasePrice: '',
        gstPercent: 0,
    });

    // Distribution state (deducts stock)
    const [distributionForm, setDistributionForm] = useState({
        recipientName: '',
        department: '',
        authorizedBy: '',
        contactNumber: '',
        remarks: '',
        collegeId: '',
        distributionDate: new Date().toISOString().split('T')[0],
    });
    const [selectedItems, setSelectedItems] = useState({});

    // History state
    const [purchases, setPurchases] = useState([]);
    const [distributions, setDistributions] = useState([]);
    const [historyFilters, setHistoryFilters] = useState({
        recipientName: '',
        department: '',
        isPaid: '',
    });
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const [loading, setLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [reportSummary, setReportSummary] = useState(emptyReportSummary);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });

    // List of colleges for dropdowns
    const fetchColleges = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
            if (res.ok) {
                const data = await res.json();
                setColleges(Array.isArray(data) ? data : []);

                // Only set initial context if it's currently at the very beginning
                if (viewContext === 'all' && !isSuperAdmin && currentUser?.assignedCollege) {
                    let assignedId = currentUser.assignedCollege;
                    if (typeof assignedId === 'object' && assignedId !== null) {
                        assignedId = assignedId._id || '';
                    }
                    const finalId = String(assignedId);
                    setViewContext(finalId);

                    const college = data.find(c => c._id === finalId);
                    if (college) setSelectedCollegeName(college.name);

                    // Also initialize productForm with the correct collegeId
                    setProductForm(prev => ({ ...prev, collegeId: finalId }));
                }
            }
        } catch (error) {
            console.error('Error fetching colleges:', error);
        }
    }, [currentUser, isSuperAdmin, viewContext]);

    // Fetch colleges on mount
    useEffect(() => {
        fetchColleges();
    }, []); // Only on mount, otherwise it might reset viewContext unexpectedly if we put dependencies

    // Fetch vendors
    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const res = await fetch(apiUrl('/api/vendors?active=true'));
                if (res.ok) {
                    const data = await res.json();
                    setVendors(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error('Error fetching vendors:', error);
            }
        };
        fetchVendors();
    }, []);

    // Update college name when context changes
    useEffect(() => {
        if (viewContext === 'all') {
            setSelectedCollegeName('All Colleges');
        } else {
            const college = colleges.find(c => c._id === viewContext);
            if (college) setSelectedCollegeName(college.name);
        }
    }, [viewContext, colleges]);

    // Fetch products with stock
    const fetchProducts = useCallback(async () => {
        setIsFetching(true);
        try {
            const productsRes = await fetch(apiUrl('/api/general-products'));
            if (!productsRes.ok) return;
            const allProducts = await productsRes.json();

            if (isSuperAdmin && viewContext === 'all') {
                // Aggregate stock from all colleges
                const aggregatedStock = {};
                for (const college of colleges) {
                    (college.generalStock || []).forEach(item => {
                        const pId = typeof item.product === 'object' ? item.product._id : item.product;
                        aggregatedStock[pId] = (aggregatedStock[pId] || 0) + item.quantity;
                    });
                }

                const productsWithStock = allProducts.map(product => ({
                    ...product,
                    stock: aggregatedStock[product._id] || 0
                }));
                setProducts(productsWithStock);
            } else if (viewContext && viewContext !== 'all') {
                // Guard against object being passed as ID
                if (typeof viewContext === 'object') {
                    console.warn('Invalid viewContext (object detected), skipping fetch:', viewContext);
                    return;
                }
                // Fetch specific college stock
                const stockRes = await fetch(apiUrl(`/api/general-products/colleges/${viewContext}/stock`));
                if (stockRes.ok) {
                    const stockData = await stockRes.json();
                    const stockMap = {};
                    (stockData.generalStock || []).forEach(item => {
                        const pId = typeof item.product === 'object' ? item.product._id : item.product;
                        stockMap[pId] = item.quantity;
                    });

                    const productsWithStock = allProducts.map(product => ({
                        ...product,
                        stock: stockMap[product._id] || 0
                    }));
                    setProducts(productsWithStock);
                } else {
                    setProducts(allProducts.map(p => ({ ...p, stock: 0 })));
                }
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setIsFetching(false);
        }
    }, [viewContext, colleges, isSuperAdmin]);

    // Fetch purchases and distributions
    const fetchTransactions = useCallback(async () => {
        if (!viewContext) return;
        
        // Guard against object being passed as ID
        if (typeof viewContext === 'object') {
            console.warn('Invalid viewContext (object detected) in fetchTransactions, skipping fetch:', viewContext);
            return;
        }

        setIsFetching(true);
        try {
            // Fetch vendor purchases
            const purchaseParams = new URLSearchParams();
            if (viewContext !== 'all') {
                purchaseParams.append('college', String(viewContext));
            }
            const purchaseRes = await fetch(apiUrl(`/api/general-purchases?${purchaseParams.toString()}`));
            if (purchaseRes.ok) {
                const data = await purchaseRes.json();
                setPurchases(data);
            }

            // Fetch distributions
            const distParams = new URLSearchParams();
            if (viewContext !== 'all') {
                distParams.append('collegeId', viewContext);
            }
            if (historyFilters.recipientName) distParams.append('recipientName', historyFilters.recipientName);
            if (historyFilters.department) distParams.append('department', historyFilters.department);
            if (historyFilters.isPaid) distParams.append('isPaid', historyFilters.isPaid);

            const distRes = await fetch(apiUrl(`/api/general-distributions?${distParams.toString()}`));
            if (distRes.ok) {
                const data = await distRes.json();
                setDistributions(data);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setIsFetching(false);
        }
    }, [viewContext, historyFilters]);

    const fetchDistributionReports = useCallback(async () => {
        if (!viewContext) return;
        setReportLoading(true);
        try {
            const params = new URLSearchParams();
            if (viewContext !== 'all') {
                params.append('collegeId', viewContext);
            }
            if (reportStartDate) params.append('startDate', reportStartDate);
            if (reportEndDate) params.append('endDate', reportEndDate);
            const q = params.toString();
            const url = apiUrl(`/api/general-distributions/reports/summary${q ? `?${q}` : ''}`);
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || 'Failed to load report');
            }
            const data = await res.json();
            setReportSummary({
                byAuthorizedBy: Array.isArray(data.byAuthorizedBy) ? data.byAuthorizedBy : [],
                byDepartment: Array.isArray(data.byDepartment) ? data.byDepartment : [],
                byPerson: Array.isArray(data.byPerson) ? data.byPerson : [],
                byItem: Array.isArray(data.byItem) ? data.byItem : [],
            });
        } catch (error) {
            console.error('Error fetching distribution reports:', error);
            setReportSummary(emptyReportSummary());
            setMessage({ type: 'error', text: error.message || 'Could not load distribution report' });
        } finally {
            setReportLoading(false);
        }
    }, [viewContext, reportStartDate, reportEndDate]);

    useEffect(() => {
        if (viewContext) {
            fetchProducts();
        }
    }, [viewContext, fetchProducts]);

    useEffect(() => {
        if (activeTab === 'history' && viewContext) {
            fetchTransactions();
        }
    }, [activeTab, viewContext, fetchTransactions]);

    useEffect(() => {
        if (activeTab === 'reports' && viewContext) {
            fetchDistributionReports();
        }
    }, [activeTab, viewContext, fetchDistributionReports]);

    const showMainLoader =
        activeTab === 'reports' ? reportLoading : isFetching;

    // Product handlers
    const handleProductSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const url = editingProduct
                ? apiUrl(`/api/general-products/${editingProduct._id}`)
                : apiUrl('/api/general-products');

            const method = editingProduct ? 'PUT' : 'POST';

            // Ensure sub-admins always use their assigned college
            const submissionData = { ...productForm };
            if (!isSuperAdmin && currentUser?.assignedCollege) {
                let assignedId = currentUser.assignedCollege;
                if (typeof assignedId === 'object' && assignedId !== null) {
                    assignedId = assignedId._id || '';
                }
                submissionData.collegeId = String(assignedId);
            } else if (!submissionData.collegeId && viewContext !== 'all') {
                submissionData.collegeId = viewContext;
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submissionData),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: editingProduct ? 'Product updated successfully' : 'Product created successfully' });
                setProductForm({
                    name: '',
                    description: '',
                    category: 'General',
                    lowStockThreshold: 10,
                    initialStock: 0,
                    collegeId: viewContext !== 'all' ? viewContext : '',
                });
                setEditingProduct(null);
                fetchProducts();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to save product' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error saving product' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteProduct = async (id) => {
        if (!window.confirm('Are you sure you want to delete this product?')) return;

        try {
            const res = await fetch(apiUrl(`/api/general-products/${id}`), {
                method: 'DELETE',
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Product deleted successfully' });
                fetchProducts();
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error deleting product' });
        }
    };

    const handleAddStock = async (productId, quantity, targetCollegeId) => {
        // Determine the actual college ID to use
        let finalCollegeId = targetCollegeId;

        if (!isSuperAdmin && currentUser?.assignedCollege) {
            let assignedId = currentUser.assignedCollege;
            if (typeof assignedId === 'object' && assignedId !== null) {
                assignedId = assignedId._id || '';
            }
            finalCollegeId = String(assignedId);
        }

        if (!finalCollegeId || finalCollegeId === 'all') {
            setMessage({ type: 'error', text: 'Please select a college to add stock' });
            return;
        }

        try {
            const res = await fetch(apiUrl(`/api/general-products/${productId}/add-stock`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, collegeId: finalCollegeId }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Stock added successfully' });
                if (isSuperAdmin) fetchColleges(); // Refresh aggregated view
                fetchProducts();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Error adding stock' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error adding stock' });
        }
    };

    // Vendor Purchase handlers (adds stock)
    const handleAddPurchaseItem = () => {
        if (!currentPurchaseItem.product || !currentPurchaseItem.quantity || Number(currentPurchaseItem.quantity) < 1) {
            setMessage({ type: 'error', text: 'Please select a product and valid quantity' });
            setTimeout(() => setMessage({ type: '', text: '' }), 2000);
            return;
        }

        if (purchaseItems.some(item => item.product === currentPurchaseItem.product)) {
            setMessage({ type: 'error', text: 'This product is already in the list' });
            setTimeout(() => setMessage({ type: '', text: '' }), 2000);
            return;
        }

        const productObj = products.find(p => p._id === currentPurchaseItem.product);
        const itemQty = Number(currentPurchaseItem.quantity);
        const itemPrice = Number(currentPurchaseItem.purchasePrice) || 0;
        const itemGst = Number(currentPurchaseItem.gstPercent) || 0;

        const newItem = {
            ...currentPurchaseItem,
            productName: productObj?.name || 'Unknown',
            quantity: itemQty,
            purchasePrice: itemPrice,
            gstPercent: itemGst,
            total: itemQty * itemPrice * (1 + itemGst / 100)
        };

        setPurchaseItems([...purchaseItems, newItem]);
        setCurrentPurchaseItem({ product: '', quantity: '', purchasePrice: '', gstPercent: 0 });
    };

    const handleRemovePurchaseItem = (index) => {
        const newItems = [...purchaseItems];
        newItems.splice(index, 1);
        setPurchaseItems(newItems);
    };

    const handlePurchaseSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        if (!purchaseForm.vendor) {
            setMessage({ type: 'error', text: 'Vendor is required' });
            setLoading(false);
            return;
        }

        if (purchaseItems.length === 0) {
            setMessage({ type: 'error', text: 'Please add at least one product' });
            setLoading(false);
            return;
        }

        let targetCollege = purchaseForm.college;

        // Ensure sub-admins always use their assigned college
        if (!isSuperAdmin && currentUser?.assignedCollege) {
            let assignedId = currentUser.assignedCollege;
            if (typeof assignedId === 'object' && assignedId !== null) {
                assignedId = assignedId._id || '';
            }
            targetCollege = String(assignedId);
        } else if (!targetCollege || targetCollege === 'all') {
            // For super admin, if nothing selected in form, use viewContext if it's a specific college
            targetCollege = viewContext !== 'all' ? viewContext : null;
        }

        try {
            const totalAmount = purchaseItems.reduce((sum, item) => sum + item.total, 0);
            const res = await fetch(apiUrl('/api/general-purchases'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor: purchaseForm.vendor,
                    invoiceNumber: purchaseForm.invoiceNumber,
                    invoiceDate: purchaseForm.invoiceDate,
                    college: targetCollege,
                    items: purchaseItems.map(i => ({
                        product: i.product,
                        quantity: i.quantity,
                        purchasePrice: i.purchasePrice,
                        gstPercent: i.gstPercent
                    })),
                    totalAmount,
                    remarks: purchaseForm.remarks,
                    createdBy: currentUser?.name || 'System',
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Purchase created successfully! Stock added.' });
                setPurchaseItems([]);
                setPurchaseForm({
                    vendor: '',
                    invoiceNumber: '',
                    invoiceDate: new Date().toISOString().split('T')[0],
                    college: '',
                    remarks: '',
                });
                if (isSuperAdmin) fetchColleges(); // Refresh aggregated view
                fetchProducts();
                fetchTransactions();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to create purchase' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error creating purchase' });
        } finally {
            setLoading(false);
        }
    };

    // Distribution handlers (deducts stock)
    const handleDistributionSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        let finalCollegeId = distributionForm.collegeId;

        // Ensure sub-admins always use their assigned college
        if (!isSuperAdmin && currentUser?.assignedCollege) {
            let assignedId = currentUser.assignedCollege;
            if (typeof assignedId === 'object' && assignedId !== null) {
                assignedId = assignedId._id || '';
            }
            finalCollegeId = String(assignedId);
        } else if (!finalCollegeId || finalCollegeId === 'all') {
            finalCollegeId = viewContext !== 'all' ? viewContext : '';
        }

        if (!finalCollegeId) {
            setMessage({ type: 'error', text: 'Please select a college for this distribution' });
            setLoading(false);
            return;
        }

        const items = Object.entries(selectedItems)
            .filter(([_, qty]) => qty > 0)
            .map(([productId, quantity]) => {
                const product = products.find(p => p._id === productId);
                return {
                    productId,
                    name: product.name,
                    quantity,
                };
            });

        if (items.length === 0) {
            setMessage({ type: 'error', text: 'Please select at least one item' });
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(apiUrl('/api/general-distributions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...distributionForm,
                    items,
                    collegeId: finalCollegeId,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Distribution completed successfully' });
                setDistributionForm({
                    recipientName: '',
                    department: '',
                    authorizedBy: '',
                    contactNumber: '',
                    remarks: '',
                    collegeId: '',
                    distributionDate: new Date().toISOString().split('T')[0],
                });
                setSelectedItems({});
                if (isSuperAdmin) fetchColleges(); // Refresh aggregated view
                fetchProducts();
                fetchTransactions();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to create distribution' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error creating distribution' });
        } finally {
            setLoading(false);
        }
    };
    
    const handleDeleteDistribution = async (id) => {
        if (!window.confirm('Are you sure you want to delete this distribution record? Stock will be automatically reverted.')) return;

        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/api/general-distributions/${id}`), {
                method: 'DELETE',
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Distribution record deleted and stock reverted successfully' });
                fetchProducts();
                fetchTransactions();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to delete distribution' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error deleting distribution' });
        } finally {
            setLoading(false);
        }
    };
    
    const handleDeletePurchase = async (id) => {
        if (!window.confirm('Are you sure you want to delete this purchase record? Stock will be automatically reverted.')) return;

        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/api/general-purchases/${id}`), {
                method: 'DELETE',
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Purchase record deleted and stock reverted successfully' });
                fetchProducts();
                fetchTransactions();
            } else {
                const error = await res.json();
                setMessage({ type: 'error', text: error.message || 'Failed to delete purchase' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Error deleting purchase' });
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (productId, delta) => {
        setSelectedItems(prev => {
            const current = prev[productId] || 0;
            const newQty = Math.max(0, current + delta);
            if (newQty === 0) {
                const { [productId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [productId]: newQty };
        });
    };

    const totalAmount = 0; // Price tracking disabled for distributions



    // Available colleges for operations (exclude 'all')
    const operationColleges = useMemo(() => {
        if (!isSuperAdmin && currentUser?.assignedCollege) {
            let assignedId = currentUser.assignedCollege;
            if (typeof assignedId === 'object' && assignedId !== null) {
                assignedId = assignedId._id;
            }
            const finalAssignedId = String(assignedId);
            return colleges.filter(c => String(c._id) === finalAssignedId);
        }
        return colleges;
    }, [colleges, isSuperAdmin, currentUser]);

    if (!viewContext) {
        return (
            <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
                <div className="text-center">
                    <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-700 mb-2">Loading...</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                                <ShoppingCart className="w-7 h-7 text-white" />
                            </div>
                            <div className="flex flex-col gap-2 min-w-0 flex-1">
                                <h1 className="text-2xl font-semibold text-gray-900">General Stock</h1>
                                {isSuperAdmin && (
                                    <select
                                        className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 w-full max-w-md"
                                        value={viewContext}
                                        onChange={(e) => setViewContext(e.target.value)}
                                    >
                                        <option value="all">All Colleges (Aggregated)</option>
                                        {colleges.map(c => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex flex-wrap gap-2 w-full md:w-auto">
                            <button
                                onClick={() => setActiveTab('products')}
                                className={`flex-1 min-w-[140px] md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'products'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Package size={16} />
                                <span>All Products</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('purchase')}
                                className={`flex-1 min-w-[140px] md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'purchase'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <ShoppingCart size={16} />
                                <span>Add Stock</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('distribute')}
                                className={`flex-1 min-w-[140px] md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'distribute'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <UserPlus size={16} />
                                <span>Distribute Products</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex-1 min-w-[140px] md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <History size={16} />
                                <span>Transaction History</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('reports')}
                                className={`flex-1 min-w-[140px] md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'reports'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <BarChart3 size={16} />
                                <span>Reports</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Message */}
                {message.text && (
                    <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {message.text}
                    </div>
                )}

                {/* Tab Content */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    {showMainLoader ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-gray-500 font-medium">Crunching your data...</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'products' && (
                                <ProductsTab
                                    products={filteredProducts}
                                    allProductsCount={products.length}
                                    productSearch={productSearch}
                                    setProductSearch={setProductSearch}
                                    productForm={productForm}
                                    setProductForm={setProductForm}
                                    editingProduct={editingProduct}
                                    setEditingProduct={setEditingProduct}
                                    handleProductSubmit={handleProductSubmit}
                                    handleDeleteProduct={handleDeleteProduct}
                                    handleAddStock={handleAddStock}
                                    loading={loading}
                                    colleges={operationColleges}
                                    viewContext={viewContext}
                                    isSuperAdmin={isSuperAdmin}
                                />
                            )}

                            {activeTab === 'purchase' && (
                                <VendorPurchaseTab
                                    products={products}
                                    vendors={vendors}
                                    purchaseForm={purchaseForm}
                                    setPurchaseForm={setPurchaseForm}
                                    currentPurchaseItem={currentPurchaseItem}
                                    setCurrentPurchaseItem={setCurrentPurchaseItem}
                                    purchaseItems={purchaseItems}
                                    handleAddPurchaseItem={handleAddPurchaseItem}
                                    handleRemovePurchaseItem={handleRemovePurchaseItem}
                                    handlePurchaseSubmit={handlePurchaseSubmit}
                                    loading={loading}
                                    colleges={operationColleges}
                                    viewContext={viewContext}
                                    isSuperAdmin={isSuperAdmin}
                                />
                            )}

                            {activeTab === 'distribute' && (
                                <DistributeTab
                                    products={products}
                                    distributionForm={distributionForm}
                                    setDistributionForm={setDistributionForm}
                                    selectedItems={selectedItems}
                                    handleQuantityChange={handleQuantityChange}
                                    handleDistributionSubmit={handleDistributionSubmit}
                                    totalAmount={totalAmount}
                                    loading={loading}
                                    colleges={operationColleges}
                                    viewContext={viewContext}
                                    isSuperAdmin={isSuperAdmin}
                                />
                            )}

                            {activeTab === 'history' && (
                                <HistoryTab
                                    purchases={purchases}
                                    distributions={distributions}
                                    historyFilters={historyFilters}
                                    setHistoryFilters={setHistoryFilters}
                                    selectedTransaction={selectedTransaction}
                                    setSelectedTransaction={setSelectedTransaction}
                                    selectedCollegeName={selectedCollegeName}
                                    handleDeleteDistribution={handleDeleteDistribution}
                                    handleDeletePurchase={handleDeletePurchase}
                                />
                            )}

                            {activeTab === 'reports' && (
                                <DistributionReportsTab
                                    byAuthorizedBy={reportSummary.byAuthorizedBy}
                                    byDepartment={reportSummary.byDepartment}
                                    byPerson={reportSummary.byPerson}
                                    byItem={reportSummary.byItem}
                                    reportStartDate={reportStartDate}
                                    reportEndDate={reportEndDate}
                                    setReportStartDate={setReportStartDate}
                                    setReportEndDate={setReportEndDate}
                                    onApplyFilters={fetchDistributionReports}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Products Tab Component
const ProductsTab = ({
    products,
    allProductsCount,
    productSearch,
    setProductSearch,
    productForm,
    setProductForm,
    editingProduct,
    setEditingProduct,

    handleProductSubmit,
    handleDeleteProduct,
    handleAddStock,
    loading,
    colleges,
    viewContext,
    isSuperAdmin
}) => {
    const [isFormExpanded, setIsFormExpanded] = useState(false);

    return (
        <div className="space-y-6">
            {/* Header with Search and Add Button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-800">Products ({allProductsCount})</h3>
                    {productSearch && (
                        <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded-full font-medium">
                            Found {products.length} matches
                        </span>
                    )}
                </div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="w-full md:w-64 pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all text-sm"
                        />
                        {productSearch && (
                            <button
                                onClick={() => setProductSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setIsFormExpanded(!isFormExpanded);
                            if (!isFormExpanded) {
                                setEditingProduct(null);
                                setProductForm({
                                    name: '',
                                    description: '',
                                    category: 'General',
                                    lowStockThreshold: 10,
                                    initialStock: 0,
                                    collegeId: viewContext !== 'all' ? viewContext : '',
                                });
                            }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isFormExpanded
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                    >
                        {isFormExpanded ? (
                            <>
                                <X size={18} /> Cancel
                            </>
                        ) : (
                            <>
                                <Plus size={18} /> Add New Product
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Add/Edit Product Modal */}
            {(isFormExpanded || editingProduct) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => {
                            setEditingProduct(null);
                            setIsFormExpanded(false);
                            setProductForm({
                                name: '',
                                description: '',
                                category: 'General',
                                lowStockThreshold: 10,
                                initialStock: 0,
                                collegeId: viewContext !== 'all' ? viewContext : '',
                            });
                        }}
                    ></div>

                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">
                                    {editingProduct ? 'Edit Product Details' : 'Add New Product'}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {editingProduct ? 'Update current product information' : 'Create a new item in the general stock'}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingProduct(null);
                                    setIsFormExpanded(false);
                                }}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <form onSubmit={handleProductSubmit} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-gray-700">Product Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Enter product name"
                                        value={productForm.name}
                                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-gray-700">Low Stock Threshold</label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="10"
                                        value={productForm.lowStockThreshold || ''}
                                        onChange={(e) => setProductForm({ ...productForm, lowStockThreshold: parseInt(e.target.value) || 10 })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-gray-700">
                                        {editingProduct ? 'Current Stock Level' : 'Initial Stock Level'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        value={productForm.initialStock || ''}
                                        onChange={(e) => setProductForm({ ...productForm, initialStock: parseInt(e.target.value) || 0 })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-sm font-semibold text-gray-700">
                                        {editingProduct ? 'College' : 'Target College *'}
                                    </label>
                                    <select
                                        required={!editingProduct && productForm.initialStock > 0 && viewContext === 'all'}
                                        disabled={viewContext !== 'all' || editingProduct}
                                        value={productForm.collegeId}
                                        onChange={(e) => setProductForm({ ...productForm, collegeId: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                                    >
                                        <option value="">{viewContext === 'all' ? 'Select College' : (colleges.find(c => c._id === viewContext)?.name || 'Current College')}</option>
                                        {colleges.map(c => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="md:col-span-2 space-y-1">
                                    <label className="block text-sm font-semibold text-gray-700">Description</label>
                                    <textarea
                                        placeholder="Add any additional details about this product..."
                                        value={productForm.description}
                                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                                        rows="3"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingProduct(null);
                                        setIsFormExpanded(false);
                                    }}
                                    className="px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-8 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Save size={18} />
                                    )}
                                    {loading ? 'Processing...' : editingProduct ? 'Update Product' : 'Create Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan="3" className="px-6 py-12 text-center text-gray-500">
                                        <Package size={40} className="mx-auto text-gray-300 mb-3 opacity-50" />
                                        <p className="font-medium">No products found</p>
                                        <p className="text-xs mt-1">Try adjusting your search or add a new product</p>
                                    </td>
                                </tr>
                            ) : (
                                products.map(product => (
                                    <tr key={product._id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900">{product.name}</span>
                                                {product.description && (
                                                    <span className="text-xs text-gray-500 line-clamp-1 mt-0.5">{product.description}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${product.stock <= product.lowStockThreshold
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-green-100 text-green-700'
                                                }`}>
                                                {product.stock || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        setEditingProduct(product);
                                                        setProductForm({
                                                            name: product.name,
                                                            description: product.description,
                                                            category: product.category || 'General',
                                                            lowStockThreshold: product.lowStockThreshold,
                                                            initialStock: product.stock || 0,
                                                            collegeId: viewContext !== 'all' ? viewContext : '',
                                                        });
                                                    }}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                                    title="Edit Product"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(product._id)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                                    title="Delete Product"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// Vendor Purchase Tab Component (like Add Stock)
const VendorPurchaseTab = ({
    products,
    vendors,
    purchaseForm,
    setPurchaseForm,
    currentPurchaseItem,
    setCurrentPurchaseItem,
    purchaseItems,
    handleAddPurchaseItem,
    handleRemovePurchaseItem,
    handlePurchaseSubmit,
    loading,
    colleges,
    viewContext,
    isSuperAdmin
}) => {
    const [selectedProduct, setSelectedProduct] = useState(null);

    useEffect(() => {
        if (currentPurchaseItem.product) {
            const product = products.find(p => p._id === currentPurchaseItem.product);
            setSelectedProduct(product);
        } else {
            setSelectedProduct(null);
        }
    }, [currentPurchaseItem.product, products]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Invoice Details */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-blue-500" /> Invoice Details
                    </h3>

                    <form className="space-y-4">
                        {/* Receive At */}
                        {isSuperAdmin && (
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-1">Receive At</label>
                                <select
                                    value={purchaseForm.college}
                                    onChange={(e) => setPurchaseForm({ ...purchaseForm, college: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Central Warehouse</option>
                                    {colleges.map(c => (
                                        <option key={c._id} value={c._id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Vendor */}
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Vendor *</label>
                            <select
                                required
                                value={purchaseForm.vendor}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, vendor: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select Vendor</option>
                                {vendors.map(v => (
                                    <option key={v._id} value={v._id}>{v.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Invoice Number */}
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Invoice Number</label>
                            <input
                                type="text"
                                value={purchaseForm.invoiceNumber}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceNumber: e.target.value })}
                                placeholder="INV-001"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Date</label>
                            <input
                                type="date"
                                value={purchaseForm.invoiceDate}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, invoiceDate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Remarks */}
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Remarks</label>
                            <textarea
                                value={purchaseForm.remarks}
                                onChange={(e) => setPurchaseForm({ ...purchaseForm, remarks: e.target.value })}
                                rows="3"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-y"
                                placeholder="Optional notes..."
                            />
                        </div>
                    </form>
                </div>
            </div>

            {/* Right: Add Items & List */}
            <div className="lg:col-span-2 space-y-6">
                {/* Add Item Card */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Package size={18} className="text-blue-500" /> Add Products
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        {/* Product */}
                        <div className="md:col-span-5">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Product</label>
                            <select
                                value={currentPurchaseItem.product}
                                onChange={(e) => setCurrentPurchaseItem({ ...currentPurchaseItem, product: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select Product</option>
                                {products.map(p => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                            </select>
                            {selectedProduct && (
                                <p className="text-xs text-blue-600 font-medium mt-1">
                                    Current Stock: {selectedProduct.stock || 0}
                                </p>
                            )}
                        </div>

                        {/* Quantity */}
                        <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Qty</label>
                            <input
                                type="number"
                                min="1"
                                value={currentPurchaseItem.quantity}
                                onChange={(e) => setCurrentPurchaseItem({ ...currentPurchaseItem, quantity: e.target.value })}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Price */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Unit Price</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={currentPurchaseItem.purchasePrice}
                                onChange={(e) => setCurrentPurchaseItem({ ...currentPurchaseItem, purchasePrice: e.target.value })}
                                placeholder="0.00"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* GST % */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-800 mb-1">GST %</label>
                            <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={currentPurchaseItem.gstPercent}
                                onChange={(e) => setCurrentPurchaseItem({ ...currentPurchaseItem, gstPercent: e.target.value })}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Add Button */}
                        <div className="md:col-span-1">
                            <button
                                type="button"
                                onClick={handleAddPurchaseItem}
                                className="w-full h-[42px] bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 flex items-center justify-center"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Items List */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-800">Items ({purchaseItems.length})</h3>
                        <span className="text-sm font-medium text-gray-600">
                            Total: ₹{purchaseItems.reduce((acc, curr) => acc + curr.total, 0).toLocaleString()}
                        </span>
                    </div>

                    {purchaseItems.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <Package size={48} className="mx-auto text-gray-300 mb-3 opacity-50" />
                            <p>No items added yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b text-gray-500">
                                        <th className="px-6 py-3 font-medium">Product</th>
                                        <th className="px-6 py-3 font-medium text-right">Qty</th>
                                        <th className="px-6 py-3 font-medium text-right">Price</th>
                                        <th className="px-6 py-3 font-medium text-right">GST %</th>
                                        <th className="px-6 py-3 font-medium text-right">Total</th>
                                        <th className="px-6 py-3 font-medium text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {purchaseItems.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 text-gray-900 font-medium">{item.productName}</td>
                                            <td className="px-6 py-3 text-right">{item.quantity}</td>
                                            <td className="px-6 py-3 text-right">₹{item.purchasePrice}</td>
                                            <td className="px-6 py-3 text-right">{item.gstPercent}%</td>
                                            <td className="px-6 py-3 text-right">₹{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-3 text-center">
                                                <button
                                                    onClick={() => handleRemovePurchaseItem(idx)}
                                                    className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Submit Footer */}
                    <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
                        <button
                            type="button"
                            onClick={handlePurchaseSubmit}
                            disabled={loading || purchaseItems.length === 0}
                            className={`px-6 py-2.5 rounded-lg flex items-center gap-2 text-white font-medium shadow-sm transition-all ${loading || purchaseItems.length === 0
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
                                }`}
                        >
                            <Save size={18} />
                            {loading ? 'Saving...' : 'Save Purchase & Add Stock'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Distribute Tab Component
const DistributeTab = ({
    products,
    distributionForm,
    setDistributionForm,
    selectedItems,
    handleQuantityChange,
    handleDistributionSubmit,
    totalAmount,
    loading,
    colleges,
    viewContext,
    isSuperAdmin
}) => {
    const [productToAdd, setProductToAdd] = useState('');

    const handleAddProduct = () => {
        if (productToAdd) {
            handleQuantityChange(productToAdd, 1);
            setProductToAdd('');
        }
    };

    const selectedProductList = products.filter(p => selectedItems[p._id] > 0);

    return (
        <form onSubmit={handleDistributionSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recipient Information - Left Column */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <UserPlus size={18} className="text-blue-500" /> Recipient Details
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Recipient Name *</label>
                            <input
                                type="text"
                                required
                                value={distributionForm.recipientName}
                                onChange={(e) => setDistributionForm({ ...distributionForm, recipientName: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Department *</label>
                            <input
                                type="text"
                                required
                                value={distributionForm.department}
                                onChange={(e) => setDistributionForm({ ...distributionForm, department: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Authorized By *</label>
                            <select
                                required
                                value={distributionForm.authorizedBy}
                                onChange={(e) => setDistributionForm({ ...distributionForm, authorizedBy: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="">Select Authority</option>
                                {AUTHORITIES.map((auth, idx) => (
                                    <option key={idx} value={auth}>
                                        {auth}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Contact Number</label>
                            <input
                                type="text"
                                value={distributionForm.contactNumber}
                                onChange={(e) => setDistributionForm({ ...distributionForm, contactNumber: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        {(isSuperAdmin || viewContext === 'all') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-800 mb-1 flex items-center gap-1">
                                    <Building2 size={14} /> Distribution For College *
                                </label>
                                <select
                                    required
                                    value={distributionForm.collegeId}
                                    onChange={(e) => setDistributionForm({ ...distributionForm, collegeId: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select College</option>
                                    {colleges.map(c => (
                                        <option key={c._id} value={c._id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Distribution Date *</label>
                            <input
                                type="date"
                                required
                                value={distributionForm.distributionDate}
                                onChange={(e) => setDistributionForm({ ...distributionForm, distributionDate: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Remarks</label>
                            <textarea
                                value={distributionForm.remarks}
                                onChange={(e) => setDistributionForm({ ...distributionForm, remarks: e.target.value })}
                                rows="2"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Items Selection - Right Column */}
            <div className="lg:col-span-2 space-y-6">
                {/* Add Item Card */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Package size={18} className="text-blue-500" /> Add Products
                    </h3>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Select Product</label>
                            <select
                                value={productToAdd}
                                onChange={(e) => setProductToAdd(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Choose a product...</option>
                                {products.map(p => (
                                    <option key={p._id} value={p._id}>
                                        {p.name} (Stock: {p.stock || 0}) - ₹{p.price}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={handleAddProduct}
                            disabled={!productToAdd}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            Add
                        </button>
                    </div>
                </div>

                {/* Selected Items List */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-800">Selected Items ({selectedProductList.length})</h3>

                    </div>

                    {selectedProductList.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <ShoppingCart size={48} className="mx-auto text-gray-300 mb-3 opacity-50" />
                            <p>No items selected. Add products from above.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b text-gray-500 bg-gray-50">
                                        <th className="px-6 py-3 font-medium">Product</th>
                                        <th className="px-6 py-3 font-medium text-center">Stock</th>

                                        <th className="px-6 py-3 font-medium text-center">Quantity</th>

                                        <th className="px-6 py-3 font-medium text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {selectedProductList.map(product => {
                                        const quantity = selectedItems[product._id];
                                        return (
                                            <tr key={product._id} className="hover:bg-gray-50">
                                                <td className="px-6 py-3 font-medium text-gray-900">{product.name}</td>
                                                <td className="px-6 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${(product.stock || 0) <= product.lowStockThreshold ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                        }`}>
                                                        {product.stock || 0}
                                                    </span>
                                                </td>

                                                <td className="px-6 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuantityChange(product._id, -1)}
                                                            className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                                                        >
                                                            <Minus size={14} />
                                                        </button>
                                                        <span className="w-8 text-center font-medium">{quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleQuantityChange(product._id, 1)}
                                                            disabled={quantity >= (product.stock || 0)}
                                                            className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 disabled:opacity-50"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                </td>

                                                <td className="px-6 py-3 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleQuantityChange(product._id, -quantity)}
                                                        className="text-red-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                                                        title="Remove Item"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Submit Footer */}
                    <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
                        <button
                            type="submit"
                            disabled={loading || selectedProductList.length === 0}
                            className={`px-6 py-2.5 rounded-lg flex items-center gap-2 text-white font-medium shadow-sm transition-all ${loading || selectedProductList.length === 0
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
                                }`}
                        >
                            <Save size={18} />
                            {loading ? 'Processing...' : 'Complete Distribution'}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
};

// Actual Template Component
const ThermalReceiptTemplate = ({ transaction }) => {
    return (
        <div className="thermal-receipt" style={{ padding: '10px', width: '80mm', margin: '0 auto', fontFamily: 'Arial, sans-serif', color: '#000' }}>
            <style>{`
                @page { size: 80mm auto; margin: 0; }
                @media print {
                    body { margin: 0; padding: 0; }
                    .thermal-receipt {
                        width: 78mm !important;
                        margin: 0 auto !important;
                        padding: 5px !important;
                    }
                    * { box-shadow: none !important; }
                }
            `}</style>

            <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: '5px', marginBottom: '10px' }}>
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>Pydah Group</h1>
                <p style={{ fontSize: '12px', margin: '2px 0' }}>General Stock Receipt</p>
                <p style={{ fontSize: '10px', margin: '2px 0' }}>
                    {new Date(transaction.distributionDate || transaction.invoiceDate).toLocaleString('en-IN', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    })}
                </p>
            </div>

            <div style={{ fontSize: '12px', marginBottom: '10px' }}>
                {transaction.type === 'distribution' ? (
                    <>
                        <p style={{ margin: '2px 0' }}>
                            <strong>Recipient:</strong> {transaction.recipientName} {transaction.department && `(${transaction.department})`}
                        </p>
                        {transaction.authorizedBy && (
                            <p style={{ margin: '2px 0' }}><strong>Auth By:</strong> {transaction.authorizedBy}</p>
                        )}
                    </>
                ) : (
                    <>
                        <p style={{ margin: '2px 0' }}><strong>Vendor:</strong> {transaction.vendor?.name}</p>
                        <p style={{ margin: '2px 0' }}><strong>Ref:</strong> {transaction.invoiceNumber}</p>
                    </>
                )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '10px' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'left', padding: '2px 0', width: transaction.type === 'distribution' ? '85%' : '45%' }}>Item</th>
                        <th style={{ textAlign: 'center', padding: '2px 0', width: '15%' }}>Qty</th>
                        {transaction.type !== 'distribution' && (
                            <>
                                <th style={{ textAlign: 'right', padding: '2px 0', width: '20%' }}>Rate</th>
                                <th style={{ textAlign: 'right', padding: '2px 0', width: '20%' }}>Amt</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {transaction.items && transaction.items.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ padding: '2px 0', verticalAlign: 'top' }}>
                                {item.product?.name || item.name || 'Item'}
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'center', verticalAlign: 'top' }}>
                                {item.quantity}
                            </td>
                            {transaction.type !== 'distribution' && (
                                <>
                                    <td style={{ padding: '2px 0', textAlign: 'right', verticalAlign: 'top' }}>
                                        {Number(item.purchasePrice || 0).toFixed(0)}{item.gstPercent > 0 ? ` (+${item.gstPercent}%)` : ''}
                                    </td>
                                    <td style={{ padding: '2px 0', textAlign: 'right', verticalAlign: 'top' }}>
                                        {Number(item.total || (item.quantity * (item.purchasePrice || 0) * (1 + (item.gstPercent || 0) / 100))).toFixed(0)}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>

            {transaction.type !== 'distribution' && (
                <div style={{ borderTop: '1px dashed #000', paddingTop: '5px', marginTop: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                        <span>TOTAL:</span>
                        <span>₹{Number(transaction.totalAmount).toFixed(2)}</span>
                    </div>
                </div>
            )}

            {transaction.remarks && (
                <div style={{ marginTop: '5px', fontSize: '11px', borderTop: '1px dotted #ccc', paddingTop: '2px' }}>
                    <strong>Note:</strong> {transaction.remarks}
                </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '10px', borderTop: '1px solid #000', paddingTop: '5px' }}>
                <p style={{ margin: '2px 0' }}>Thank you!</p>
            </div>
        </div>
    );
};

// Internal component for handling print logic to avoid hook rules in loop
const PrintButton = ({ transaction }) => {
    const componentRef = useRef();
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `Receipt-${transaction.distributionId || transaction.invoiceNumber || 'Transaction'}`,
        removeAfterPrint: true
    });

    // Only show print for distributions or if needed for purchases too
    if (!transaction) return null;

    return (
        <>
            <div style={{ display: 'none' }}>
                <div ref={componentRef}>
                    <ThermalReceiptTemplate transaction={transaction} />
                </div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                title="Print Receipt"
            >
                <Printer size={16} />
            </button>
        </>
    );
};

const ReportBreakdownTable = ({
    rows,
    rowLabel,
    rowAccessor,
    detailColumnLabel = 'Item types',
    detailSectionTitle = 'Item breakdown',
}) => {
    const [expandedKeys, setExpandedKeys] = useState(() => new Set());

    const toggleKey = (key) => {
        setExpandedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    if (!rows || rows.length === 0) {
        return (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-600 text-sm">
                No rows for this breakdown.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="w-10 px-2 py-3" aria-hidden="true" />
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">{rowLabel}</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Distributions</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Total units</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">{detailColumnLabel}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => {
                        const keyVal = row[rowAccessor];
                        const rowKey = `${rowAccessor}:${String(keyVal)}`;
                        const isOpen = expandedKeys.has(rowKey);
                        const items = row.items || [];
                        const itemTypeCount = items.length;
                        const canExpand = itemTypeCount > 0;

                        return (
                            <Fragment key={rowKey}>
                                <tr
                                    className={`hover:bg-gray-50/80 ${canExpand ? 'cursor-pointer' : ''}`}
                                    onClick={() => canExpand && toggleKey(rowKey)}
                                    onKeyDown={(e) => {
                                        if (!canExpand) return;
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleKey(rowKey);
                                        }
                                    }}
                                    tabIndex={canExpand ? 0 : undefined}
                                    aria-expanded={canExpand ? isOpen : undefined}
                                    aria-label={
                                        canExpand
                                            ? `${isOpen ? 'Collapse' : 'Expand'} item breakdown for ${keyVal}`
                                            : undefined
                                    }
                                >
                                    <td className="px-2 py-3 align-middle">
                                        {canExpand ? (
                                            <span
                                                className="inline-flex p-1.5 rounded-lg text-gray-600"
                                                aria-hidden
                                            >
                                                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            </span>
                                        ) : (
                                            <span className="inline-block w-8" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900 font-medium align-middle">{keyVal}</td>
                                    <td className="px-4 py-3 text-right text-gray-800 tabular-nums align-middle">
                                        {row.distributionCount}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-800 font-semibold tabular-nums align-middle">
                                        {row.totalItemQuantity}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums align-middle">
                                        {itemTypeCount}
                                    </td>
                                </tr>
                                {isOpen && canExpand && (
                                    <tr className="bg-slate-50/90">
                                        <td colSpan={5} className="px-4 py-3 pl-12 border-t border-slate-100">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                {detailSectionTitle}
                                            </p>
                                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {items.map((it, idx) => (
                                                    <li
                                                        key={`${it.name}-${idx}`}
                                                        className="flex justify-between gap-3 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2"
                                                    >
                                                        <span className="text-gray-800 truncate">{it.name}</span>
                                                        <span className="tabular-nums font-medium text-gray-900 shrink-0">
                                                            {it.quantity}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const ItemReportBreakdownTable = ({ rows }) => {
    const [expandedItems, setExpandedItems] = useState(() => new Set());
    const [expandedAuth, setExpandedAuth] = useState(() => new Set());

    const toggleItem = (itemName) => {
        const key = `item:${itemName}`;
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleAuth = (itemName, authorizedBy) => {
        const key = `item:${itemName}|auth:${authorizedBy}`;
        setExpandedAuth((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    if (!rows || rows.length === 0) {
        return (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-600 text-sm">
                No rows for this breakdown.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th className="w-10 px-2 py-3" aria-hidden="true" />
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Distributions</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Total units</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Authorizers</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => {
                        const itemName = row.itemName;
                        const itemKey = `item:${itemName}`;
                        const isItemOpen = expandedItems.has(itemKey);
                        const authorizers = row.authorizedBy || [];
                        const canExpandItem = authorizers.length > 0;

                        return (
                            <Fragment key={itemKey}>
                                <tr
                                    className={`hover:bg-gray-50/80 ${canExpandItem ? 'cursor-pointer' : ''}`}
                                    onClick={() => canExpandItem && toggleItem(itemName)}
                                    onKeyDown={(e) => {
                                        if (!canExpandItem) return;
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleItem(itemName);
                                        }
                                    }}
                                    tabIndex={canExpandItem ? 0 : undefined}
                                    aria-expanded={canExpandItem ? isItemOpen : undefined}
                                >
                                    <td className="px-2 py-3 align-middle">
                                        {canExpandItem ? (
                                            <span className="inline-flex p-1.5 rounded-lg text-gray-600" aria-hidden>
                                                {isItemOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                            </span>
                                        ) : (
                                            <span className="inline-block w-8" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900 font-medium align-middle">{itemName}</td>
                                    <td className="px-4 py-3 text-right text-gray-800 tabular-nums align-middle">
                                        {row.distributionCount}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-800 font-semibold tabular-nums align-middle">
                                        {row.totalItemQuantity}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600 tabular-nums align-middle">
                                        {authorizers.length}
                                    </td>
                                </tr>
                                {isItemOpen && canExpandItem && (
                                    <tr className="bg-slate-50/90">
                                        <td colSpan={5} className="px-4 py-3 pl-10 border-t border-slate-100">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                By authorized
                                            </p>
                                            <div className="space-y-1 rounded-lg border border-gray-200 overflow-hidden bg-white">
                                                {authorizers.map((auth) => {
                                                    const authKey = `item:${itemName}|auth:${auth.authorizedBy}`;
                                                    const isAuthOpen = expandedAuth.has(authKey);
                                                    const recipients = auth.recipients || [];
                                                    const canExpandAuth = recipients.length > 0;

                                                    return (
                                                        <div key={authKey} className="border-b border-gray-100 last:border-b-0">
                                                            <div
                                                                role="button"
                                                                tabIndex={canExpandAuth ? 0 : undefined}
                                                                className={`flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 ${canExpandAuth ? 'cursor-pointer' : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (canExpandAuth) toggleAuth(itemName, auth.authorizedBy);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (!canExpandAuth) return;
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        toggleAuth(itemName, auth.authorizedBy);
                                                                    }
                                                                }}
                                                                aria-expanded={canExpandAuth ? isAuthOpen : undefined}
                                                            >
                                                                <span className="inline-flex p-1 text-gray-500 shrink-0" aria-hidden>
                                                                    {canExpandAuth ? (
                                                                        isAuthOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                                                                    ) : (
                                                                        <span className="w-4" />
                                                                    )}
                                                                </span>
                                                                <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                                                                    {auth.authorizedBy}
                                                                </span>
                                                                <span className="text-xs text-gray-500 tabular-nums shrink-0">
                                                                    {auth.distributionCount} dist.
                                                                </span>
                                                                <span className="text-sm font-semibold text-gray-800 tabular-nums shrink-0 min-w-[3rem] text-right">
                                                                    {auth.totalItemQuantity}
                                                                </span>
                                                            </div>
                                                            {isAuthOpen && canExpandAuth && (
                                                                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 px-3 pb-3 pl-9 bg-slate-50/80">
                                                                    {recipients.map((r, idx) => (
                                                                        <li
                                                                            key={`${r.name}-${idx}`}
                                                                            className="flex justify-between gap-3 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2"
                                                                        >
                                                                            <span className="text-gray-800 truncate">{r.name}</span>
                                                                            <span className="tabular-nums font-medium text-gray-900 shrink-0">
                                                                                {r.quantity}
                                                                            </span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const escapeReportPrintHtml = (val) =>
    String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const formatReportPrintDateRange = (startDate, endDate) => {
    if (!startDate && !endDate) return 'All dates';
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Until ${endDate}`;
};

const REPORT_PRINT_BASE_STYLES = `
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, sans-serif; padding: 0; margin: 0; color: #0f172a; background: #fff; font-size: 12px; }
  .wrapper { max-width: 100%; margin: 0 auto; }
  .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 18px; font-weight: 800; color: #1d4ed8; }
  .title { font-size: 15px; font-weight: 700; margin-top: 6px; }
  .meta { margin-top: 8px; font-size: 11px; color: #475569; }
  .section-title { font-size: 13px; font-weight: 700; margin: 16px 0 8px; color: #0f172a; page-break-after: avoid; }
  .table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
  .table th, .table td { padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; vertical-align: top; }
  .table th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em; color: #475569; }
  .table td.num, .table th.num { text-align: right; }
  .group-header { text-transform: none; font-size: 13px; color: #0f172a; background: #e2e8f0; text-align: left; letter-spacing: 0; }
  .detail-stats-row th { text-transform: none; font-weight: 600; background: #eff6ff; color: #334155; font-size: 11px; letter-spacing: 0; text-align: left; }
  .stat-label { color: #475569; font-weight: 600; margin-right: 4px; }
  .stat-highlight { color: #1d4ed8; font-weight: 800; background: #dbeafe; padding: 2px 8px; border-radius: 4px; }
  .stat-sep { color: #94a3b8; margin: 0 10px; }
  .item-cell-main { font-weight: 700; color: #0f172a; }
  .item-stats-inline { display: block; margin-top: 4px; font-size: 10px; font-weight: 600; color: #64748b; line-height: 1.35; white-space: nowrap; text-transform: none; letter-spacing: 0; }
  .item-stats-inline .stat-highlight { background: none; padding: 0; border-radius: 0; color: #1d4ed8; font-weight: 700; }
  .detail-block { margin-top: 14px; page-break-inside: avoid; }
  .detail-heading { font-size: 12px; font-weight: 700; color: #1e293b; margin: 0 0 6px; padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
  .sub-heading { font-size: 11px; font-weight: 600; color: #334155; margin: 10px 0 4px 12px; }
  .nested-table { width: 100%; margin-left: 0; }
  .item-report-print-table { width: 100%; border-collapse: collapse; }
  .item-report-print-table thead { display: table-header-group; }
  .item-print-cell { vertical-align: top; min-width: 140px; background: #f8fafc; }
  tbody.item-print-group { page-break-inside: avoid; break-inside: avoid-page; }
  .empty { color: #64748b; font-style: italic; padding: 12px; text-align: center; }
  @media print {
    .item-report-print-table thead { display: table-header-group; }
    tbody.item-print-group { page-break-inside: auto; break-inside: auto; }
  }
`;

const printReportHtmlDocument = (title, bodyContent) => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeReportPrintHtml(title)}</title><style>${REPORT_PRINT_BASE_STYLES}</style></head><body><div class="wrapper">${bodyContent}</div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        document.body.removeChild(iframe);
        return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe);
        }, 500);
    };
};

const buildPrintStatsHeaderRow = (colSpan, distributionCount, totalQuantity) => `
  <tr class="detail-stats-row">
    <th colspan="${colSpan}">
      <span class="stat-label">Distributions:</span>
      <span class="stat-highlight">${escapeReportPrintHtml(distributionCount)}</span>
      <span class="stat-sep" aria-hidden="true">·</span>
      <span class="stat-label">Total units:</span>
      <span class="stat-highlight">${escapeReportPrintHtml(totalQuantity)}</span>
    </th>
  </tr>
`;

const buildPrintItemStatsInline = (distributionCount, totalQuantity) => `
  <span class="item-stats-inline">
    <span class="stat-label">Distributions:</span>
    <span class="stat-highlight">${escapeReportPrintHtml(distributionCount)}</span>
    <span class="stat-sep" aria-hidden="true"> · </span>
    <span class="stat-label">Total units:</span>
    <span class="stat-highlight">${escapeReportPrintHtml(totalQuantity)}</span>
  </span>
`;

const buildReportPrintHeader = (reportTitle, reportStartDate, reportEndDate) => `
  <div class="header">
    <div class="brand">Pydah Group</div>
    <div class="title">General Stock — ${escapeReportPrintHtml(reportTitle)}</div>
    <div class="meta">
      <div><strong>Generated:</strong> ${escapeReportPrintHtml(new Date().toLocaleString('en-IN'))}</div>
      <div><strong>Date range:</strong> ${escapeReportPrintHtml(formatReportPrintDateRange(reportStartDate, reportEndDate))}</div>
    </div>
  </div>
`;

const printPersonDistributionReport = (rows, reportStartDate, reportEndDate) => {
    if (!rows || rows.length === 0) return;

    const detailBlocks = rows
        .map((row) => {
            const items = row.items || [];
            const itemRows =
                items.length > 0
                    ? items
                          .map(
                              (it) => `
            <tr>
              <td>${escapeReportPrintHtml(it.name)}</td>
              <td class="num">${escapeReportPrintHtml(it.quantity)}</td>
            </tr>`
                          )
                          .join('')
                    : '<tr><td colspan="2" class="empty">No item breakdown</td></tr>';

            return `
      <div class="detail-block">
        <table class="table nested-table">
          <thead>
            <tr>
              <th colspan="2" class="group-header">${escapeReportPrintHtml(row.recipientName)}</th>
            </tr>
            ${buildPrintStatsHeaderRow(2, row.distributionCount, row.totalItemQuantity)}
            <tr>
              <th>Item</th>
              <th class="num">Quantity</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>`;
        })
        .join('');

    const body = `
    ${buildReportPrintHeader('Distribution Report (By Person)', reportStartDate, reportEndDate)}
    ${detailBlocks}
  `;

    printReportHtmlDocument('General Stock Report - By Person', body);
};

const buildItemGroupPrintTableBody = (row) => {
    const authorizers = row.authorizedBy || [];
    const itemCellHtml = `
      <div class="item-cell-main">${escapeReportPrintHtml(row.itemName)}</div>
      ${buildPrintItemStatsInline(row.distributionCount, row.totalItemQuantity)}
    `;

    if (authorizers.length === 0) {
        return `<tr>
          <td class="item-print-cell">${itemCellHtml}</td>
          <td>—</td>
          <td>—</td>
          <td class="num">—</td>
        </tr>`;
    }

    const flat = [];
    for (const auth of authorizers) {
        const recipients = auth.recipients || [];
        if (recipients.length === 0) {
            flat.push({ authorizedBy: auth.authorizedBy, recipientName: '—', quantity: null });
        } else {
            for (const recipient of recipients) {
                flat.push({
                    authorizedBy: auth.authorizedBy,
                    recipientName: recipient.name,
                    quantity: recipient.quantity,
                });
            }
        }
    }

    const parts = [];
    const itemRowSpan = flat.length;
    let authStart = 0;

    while (authStart < flat.length) {
        const authorizedBy = flat[authStart].authorizedBy;
        let authEnd = authStart;
        while (authEnd < flat.length && flat[authEnd].authorizedBy === authorizedBy) {
            authEnd += 1;
        }
        const authRowSpan = authEnd - authStart;

        for (let r = authStart; r < authEnd; r += 1) {
            const line = flat[r];
            parts.push('<tr>');
            if (r === 0) {
                parts.push(`<td class="item-print-cell" rowspan="${itemRowSpan}">${itemCellHtml}</td>`);
            }
            if (r === authStart) {
                parts.push(`<td rowspan="${authRowSpan}">${escapeReportPrintHtml(line.authorizedBy)}</td>`);
            }
            parts.push(`<td>${escapeReportPrintHtml(line.recipientName)}</td>`);
            parts.push(
                `<td class="num">${line.quantity == null ? '—' : escapeReportPrintHtml(line.quantity)}</td>`
            );
            parts.push('</tr>');
        }
        authStart = authEnd;
    }

    return parts.join('');
};

const printItemDistributionReport = (rows, reportStartDate, reportEndDate) => {
    if (!rows || rows.length === 0) return;

    const itemGroups = rows
        .map((row) => `<tbody class="item-print-group">${buildItemGroupPrintTableBody(row)}</tbody>`)
        .join('');

    const body = `
    ${buildReportPrintHeader('Distribution Report (By Item)', reportStartDate, reportEndDate)}
    <table class="table item-report-print-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Authorized by</th>
          <th>Recipient</th>
          <th class="num">Quantity</th>
        </tr>
      </thead>
      ${itemGroups}
    </table>
  `;

    printReportHtmlDocument('General Stock Report - By Item', body);
};

const REPORT_BREAKDOWN_TABS = [
    {
        id: 'authorized',
        label: 'By authorized',
        rowsKey: 'byAuthorizedBy',
        rowLabel: 'Authorized by',
        rowAccessor: 'authorizedBy',
        detailColumnLabel: 'Item types',
        detailSectionTitle: 'Item breakdown',
        hint: null,
    },
    {
        id: 'department',
        label: 'By department',
        rowsKey: 'byDepartment',
        rowLabel: 'Department',
        rowAccessor: 'department',
        detailColumnLabel: 'Item types',
        detailSectionTitle: 'Item breakdown',
        hint: 'Grouped by recipient department on each distribution. Blank values appear as —.',
    },
    {
        id: 'item',
        label: 'By item',
        rowsKey: 'byItem',
        rowLabel: 'Item',
        rowAccessor: 'itemName',
        detailColumnLabel: 'Authorizers',
        detailSectionTitle: 'By authorized',
        hint: 'Expand an item to see authorizers; expand an authorizer to see recipients and unit counts.',
        useItemTable: true,
    },
    {
        id: 'person',
        label: 'By person',
        rowsKey: 'byPerson',
        rowLabel: 'Recipient',
        rowAccessor: 'recipientName',
        detailColumnLabel: 'Item types',
        detailSectionTitle: 'Item breakdown',
        hint: 'Grouped by recipient name on each distribution record.',
    },
];

// Reports: general distribution breakdowns (authorized, department, item, person)
const DistributionReportsTab = ({
    byAuthorizedBy,
    byDepartment,
    byPerson,
    byItem,
    reportStartDate,
    reportEndDate,
    setReportStartDate,
    setReportEndDate,
    onApplyFilters,
}) => {
    const [reportBreakdownTab, setReportBreakdownTab] = useState('authorized');

    const reportData = {
        byAuthorizedBy: byAuthorizedBy || [],
        byDepartment: byDepartment || [],
        byItem: byItem || [],
        byPerson: byPerson || [],
    };

    const hasAny = REPORT_BREAKDOWN_TABS.some(
        (tab) => (reportData[tab.rowsKey] || []).length > 0
    );

    const activeTabConfig =
        REPORT_BREAKDOWN_TABS.find((t) => t.id === reportBreakdownTab) || REPORT_BREAKDOWN_TABS[0];
    const activeRows = reportData[activeTabConfig.rowsKey] || [];
    const canPrintReport = reportBreakdownTab === 'item' || reportBreakdownTab === 'person';
    const hasActiveRows = activeRows.length > 0;

    const handlePrintActiveReport = () => {
        if (!hasActiveRows) return;
        if (reportBreakdownTab === 'person') {
            printPersonDistributionReport(activeRows, reportStartDate, reportEndDate);
        } else if (reportBreakdownTab === 'item') {
            printItemDistributionReport(activeRows, reportStartDate, reportEndDate);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between pb-4 border-b border-gray-100">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                        <input
                            type="date"
                            value={reportStartDate}
                            onChange={(e) => setReportStartDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                        <input
                            type="date"
                            value={reportEndDate}
                            onChange={(e) => setReportEndDate(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => onApplyFilters()}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Apply / Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setReportStartDate('');
                            setReportEndDate('');
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        Clear dates
                    </button>
                </div>
                <div
                    className="flex flex-wrap rounded-xl border border-gray-200 bg-gray-50 p-1 gap-0.5 shrink-0 sm:ml-auto max-w-full"
                    role="tablist"
                    aria-label="Report breakdown"
                >
                    {REPORT_BREAKDOWN_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={reportBreakdownTab === tab.id}
                            onClick={() => setReportBreakdownTab(tab.id)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${reportBreakdownTab === tab.id
                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {!hasAny ? (
                <div className="text-center py-14 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">No distribution data for this scope</p>
                    <p className="text-sm text-gray-500 mt-1">Try another college or date range.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {activeTabConfig.hint ? (
                            <p className="text-xs text-gray-500 flex-1 min-w-0">{activeTabConfig.hint}</p>
                        ) : (
                            <span className="flex-1" />
                        )}
                        {canPrintReport && (
                            <button
                                type="button"
                                onClick={handlePrintActiveReport}
                                disabled={!hasActiveRows}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                title="Print report with full tabular breakdown"
                            >
                                <Printer size={16} />
                                Print report
                            </button>
                        )}
                    </div>
                    {activeTabConfig.useItemTable ? (
                        <ItemReportBreakdownTable key="by-item" rows={activeRows} />
                    ) : (
                        <ReportBreakdownTable
                            key={reportBreakdownTab}
                            rows={activeRows}
                            rowLabel={activeTabConfig.rowLabel}
                            rowAccessor={activeTabConfig.rowAccessor}
                            detailColumnLabel={activeTabConfig.detailColumnLabel}
                            detailSectionTitle={activeTabConfig.detailSectionTitle}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

// History Tab Component
const HistoryTab = ({
    purchases,
    distributions,
    historyFilters,
    setHistoryFilters,
    selectedTransaction,
    setSelectedTransaction,
    selectedCollegeName,
    handleDeleteDistribution,
    handleDeletePurchase
}) => {
    // Separate state for purchase modal (vendor) vs distribution modal (recipient)
    // For simplicity, we can use the same modal structure but populate different data, or use selectedTransaction

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="border-b pb-4">
                <h3 className="text-lg font-semibold mb-4">Filters</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name</label>
                        <input
                            type="text"
                            placeholder="Search by recipient..."
                            value={historyFilters.recipientName}
                            onChange={(e) => setHistoryFilters({ ...historyFilters, recipientName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <input
                            type="text"
                            placeholder="Search by department..."
                            value={historyFilters.department}
                            onChange={(e) => setHistoryFilters({ ...historyFilters, department: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={() => setHistoryFilters({ recipientName: '', department: '', isPaid: '' })}
                            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium bg-blue-50 rounded-lg transition-colors flex items-center gap-2 mb-0.5"
                        >
                            <X size={14} /> Clear Filters
                        </button>
                    </div>
                </div>
            </div>

            {/* Purchases List */}
            {/* Distributions List */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Distribution History (Outgoing)</h3>
                {!distributions || distributions.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No distributions found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Dist ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Recipient</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {distributions.map(dist => (
                                    <tr key={dist._id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{dist.distributionId}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(dist.distributionDate).toLocaleDateString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{dist.recipientName}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{dist.department}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <PrintButton transaction={{ ...dist, type: 'distribution' }} />
                                                <button
                                                    onClick={() => setSelectedTransaction({ ...dist, type: 'distribution' })}
                                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="View Details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDistribution(dist._id)}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                    title="Delete Distribution"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Stock Added List (Vendor Purchases) */}
            <div>
                <h3 className="text-lg font-semibold mb-4">Stock Added History (Incoming)</h3>
                {!purchases || purchases.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No stock additions found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Invoice</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Without GST</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">With GST</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {purchases.map(purchase => (
                                    <tr key={purchase._id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(purchase.invoiceDate).toLocaleDateString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{purchase.vendor?.name || 'Unknown'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{purchase.invoiceNumber || '-'}</td>
                                        <td className="px-4 py-3 text-right text-sm text-gray-600">
                                            ₹{(purchase.items || []).reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                                            ₹{purchase.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <PrintButton transaction={{ ...purchase, type: 'purchase' }} />
                                                <button
                                                    onClick={() => setSelectedTransaction({ ...purchase, type: 'purchase' })}
                                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="View Details"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePurchase(purchase._id)}
                                                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                    title="Delete Purchase"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Transaction Details Modal */}
            {selectedTransaction && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={() => setSelectedTransaction(null)}
                >
                    <div
                        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-900">
                                    {selectedTransaction.type === 'distribution' ? 'Distribution Details' : 'Purchase Details'}
                                </h3>
                                <div className="flex gap-2">
                                    {/* Print Button removed from here */}
                                    <button
                                        onClick={() => setSelectedTransaction(null)}
                                        className="p-2 hover:bg-gray-100 rounded-full"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {selectedTransaction.type === 'distribution' ? (
                                        <>
                                            <div>
                                                <p className="text-sm text-gray-500">Distribution ID</p>
                                                <p className="font-semibold">{selectedTransaction.distributionId}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Date</p>
                                                <p className="font-semibold">
                                                    {new Date(selectedTransaction.distributionDate).toLocaleString('en-IN')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Recipient Name</p>
                                                <p className="font-semibold">{selectedTransaction.recipientName}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Department</p>
                                                <p className="font-semibold">{selectedTransaction.department}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Authorized By</p>
                                                <p className="font-semibold">{selectedTransaction.authorizedBy}</p>
                                            </div>
                                            {selectedTransaction.contactNumber && (
                                                <div>
                                                    <p className="text-sm text-gray-500">Contact</p>
                                                    <p className="font-semibold">{selectedTransaction.contactNumber}</p>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <p className="text-sm text-gray-500">Vendor</p>
                                                <p className="font-semibold">{selectedTransaction.vendor?.name || 'Unknown'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Invoice Date</p>
                                                <p className="font-semibold">
                                                    {new Date(selectedTransaction.invoiceDate).toLocaleString('en-IN')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Invoice Number</p>
                                                <p className="font-semibold">{selectedTransaction.invoiceNumber || '-'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Created By</p>
                                                <p className="font-semibold">{selectedTransaction.createdBy}</p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="border-t pt-4">
                                    <h4 className="font-semibold mb-3">Items</h4>
                                    <div className="space-y-2">
                                        {selectedTransaction.items.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                                <div>
                                                    <p className="font-medium">{item.name || item.product?.name || 'Item'}</p>
                                                    <p className="text-sm text-gray-600">
                                                        Qty: {item.quantity}
                                                        {' × ₹'}{item.purchasePrice?.toFixed(2)}
                                                        {item.gstPercent > 0 && ` (+${item.gstPercent}% GST)`}
                                                    </p>
                                                </div>
                                                {selectedTransaction.type !== 'distribution' && (
                                                    <p className="font-semibold text-right">
                                                        ₹{(item.total || (item.quantity * item.purchasePrice * (1 + (item.gstPercent || 0) / 100)))?.toFixed(2)}
                                                    </p>
                                                )}
                                            </div>
                                        ))}

                                    </div>
                                </div>

                                <div className="border-t pt-4">
                                    {selectedTransaction.type !== 'distribution' && (
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-semibold">Total Amount</span>
                                            <span className="text-xl font-bold">₹{selectedTransaction.totalAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {selectedTransaction.remarks && (
                                        <div className="mt-3">
                                            <p className="text-sm text-gray-500">Remarks</p>
                                            <p className="text-sm">{selectedTransaction.remarks}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Thermal Receipt Template - Hidden unless printing */}
                            <ThermalReceiptTemplate transaction={selectedTransaction} collegeName={selectedCollegeName} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



export default GeneralStock;
