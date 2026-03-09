import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Package, ShoppingCart, History, Plus, Minus, Search, Save, X, Eye, Trash2, Filter, Building2, UserPlus, FileText, Calendar, DollarSign, Printer } from 'lucide-react';
import { apiUrl } from '../utils/api';

const GeneralPurchase = ({ currentUser }) => {
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
        category: 'General',
        price: 0,
        lowStockThreshold: 10,
        initialStock: 0,
        collegeId: '',
    });
    const [editingProduct, setEditingProduct] = useState(null);


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
    });

    // Distribution state (deducts stock)
    const [distributionForm, setDistributionForm] = useState({
        recipientName: '',
        department: '',
        authorizedBy: '',
        contactNumber: '',
        paymentMethod: 'cash',
        isPaid: true,
        remarks: '',
        collegeId: '',
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
    const [message, setMessage] = useState({ type: '', text: '' });

    // Fetch colleges
    useEffect(() => {
        const fetchColleges = async () => {
            try {
                const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
                if (res.ok) {
                    const data = await res.json();
                    setColleges(Array.isArray(data) ? data : []);

                    let initialViewContext = 'all';
                    let initialCollegeName = 'All Colleges';

                    // Set initial context
                    if (!isSuperAdmin && currentUser?.assignedCollege) {
                        let assignedId = currentUser.assignedCollege;
                        // Handle case where assignedCollege is an object (populated)
                        if (typeof assignedId === 'object' && assignedId !== null) {
                            assignedId = assignedId._id || '';
                        }
                        const finalId = String(assignedId);
                        initialViewContext = finalId;

                        const college = data.find(c => c._id === finalId);
                        if (college) initialCollegeName = college.name;
                    }

                    setViewContext(initialViewContext);
                    setSelectedCollegeName(initialCollegeName);

                    // Also initialize productForm with the correct collegeId if sub-admin
                    if (initialViewContext !== 'all') {
                        setProductForm(prev => ({ ...prev, collegeId: initialViewContext }));
                    }
                }
            } catch (error) {
                console.error('Error fetching colleges:', error);
            }
        };
        fetchColleges();
    }, [currentUser, isSuperAdmin]);

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
        }
    }, [viewContext, colleges, isSuperAdmin]);

    // Fetch purchases and distributions
    const fetchTransactions = useCallback(async () => {
        try {
            // Fetch vendor purchases
            const purchaseParams = new URLSearchParams();
            if (viewContext !== 'all') {
                purchaseParams.append('college', viewContext);
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
        }
    }, [viewContext, historyFilters]);

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

            // If adding new product and viewContext is not 'all', use it as default collegeId
            const submissionData = { ...productForm };
            if (!editingProduct && !submissionData.collegeId && viewContext !== 'all') {
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
                    price: 0,
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
        if (!targetCollegeId || targetCollegeId === 'all') {
            setMessage({ type: 'error', text: 'Please select a college to add stock' });
            return;
        }

        try {
            const res = await fetch(apiUrl(`/api/general-products/${productId}/add-stock`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, collegeId: targetCollegeId }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Stock added successfully' });
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
        const newItem = {
            ...currentPurchaseItem,
            productName: productObj?.name || 'Unknown',
            quantity: Number(currentPurchaseItem.quantity),
            purchasePrice: Number(currentPurchaseItem.purchasePrice) || 0,
            total: Number(currentPurchaseItem.quantity) * (Number(currentPurchaseItem.purchasePrice) || 0)
        };

        setPurchaseItems([...purchaseItems, newItem]);
        setCurrentPurchaseItem({ product: '', quantity: '', purchasePrice: '' });
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

        const targetCollege = purchaseForm.college || (viewContext !== 'all' ? viewContext : null);

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
                        purchasePrice: i.purchasePrice
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
                fetchProducts();
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

        const targetCollegeId = distributionForm.collegeId || (viewContext !== 'all' ? viewContext : '');

        if (!targetCollegeId) {
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
                    price: product.price,
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
                    collegeId: targetCollegeId,
                }),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Distribution created successfully' });
                setDistributionForm({
                    recipientName: '',
                    department: '',
                    authorizedBy: '',
                    contactNumber: '',
                    paymentMethod: 'cash',
                    isPaid: true,
                    remarks: '',
                    collegeId: '',
                });
                setSelectedItems({});
                fetchProducts();
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

    const totalAmount = Object.entries(selectedItems).reduce((sum, [productId, qty]) => {
        const product = products.find(p => p._id === productId);
        return sum + (product ? product.price * qty : 0);
    }, 0);



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
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                                <ShoppingCart className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold text-gray-900">General Purchase</h1>
                                <p className="text-gray-600 mt-1 text-sm">Manage products and track staff/guest purchases</p>
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
                                <span>Manage Products</span>
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
                        </div>
                    </div>

                    {/* College Filter */}
                    {isSuperAdmin && (
                        <div className="mt-4 flex items-center gap-2 justify-end">
                            <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                                <Filter size={14} className="text-gray-500" /> View Stock For:
                            </span>
                            <select
                                className="text-sm border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={viewContext}
                                onChange={(e) => setViewContext(e.target.value)}
                            >
                                <option value="all">All Colleges (Aggregated)</option>
                                {colleges.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
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
                    {activeTab === 'products' && (
                        <ProductsTab
                            products={products}
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
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

// Products Tab Component
const ProductsTab = ({
    products,
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
            {/* Header with Add Button */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Products ({products.length})</h3>
                <button
                    onClick={() => {
                        setIsFormExpanded(!isFormExpanded);
                        if (!isFormExpanded) {
                            setEditingProduct(null);
                            setProductForm({
                                name: '',
                                description: '',
                                category: 'General',
                                price: 0,
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
            {/* Product Form */}
            {(isFormExpanded || editingProduct) && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 animate-fade-in-down">
                    <h3 className="text-lg font-semibold mb-4">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                    <form onSubmit={handleProductSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                            <input
                                type="text"
                                required
                                value={productForm.name}
                                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <input
                                type="text"
                                value={productForm.category}
                                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹) *</label>
                            <input
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={productForm.price}
                                onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                            <input
                                type="number"
                                min="0"
                                value={productForm.lowStockThreshold}
                                onChange={(e) => setProductForm({ ...productForm, lowStockThreshold: parseInt(e.target.value) || 10 })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        {!editingProduct && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Initial Stock</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={productForm.initialStock}
                                        onChange={(e) => setProductForm({ ...productForm, initialStock: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">College for Initial Stock</label>
                                    <select
                                        value={productForm.collegeId}
                                        onChange={(e) => setProductForm({ ...productForm, collegeId: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required={productForm.initialStock > 0 && viewContext === 'all'}
                                    >
                                        <option value="">{viewContext === 'all' ? 'Select College' : (colleges.find(c => c._id === viewContext)?.name || 'Current College')}</option>
                                        {colleges.map(c => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={productForm.description}
                                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                                rows="2"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div className="md:col-span-2 flex gap-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <Save size={16} />
                                {loading ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingProduct(null);
                                    setIsFormExpanded(false);
                                    setProductForm({
                                        name: '',
                                        description: '',
                                        category: 'General',
                                        price: 0,
                                        lowStockThreshold: 10,
                                        initialStock: 0,
                                        collegeId: viewContext !== 'all' ? viewContext : '',
                                    });
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Products List */}
            <div>
                {/* <div className="flex items-center justify-end mb-4">
                    <div className="relative">
                         <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        />
                    </div>
                </div> */}


                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Price</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Stock</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {products.map(product => (
                                <tr key={product._id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="font-medium text-gray-900">{product.name}</p>
                                            {product.description && (
                                                <p className="text-xs text-gray-500">{product.description}</p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{product.category}</td>
                                    <td className="px-4 py-3 text-right text-sm font-medium">₹{product.price.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`text-sm font-semibold ${product.stock <= product.lowStockThreshold ? 'text-red-600' : 'text-green-600'
                                            }`}>
                                            {product.stock || 0}
                                        </span>
                                    </td>

                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingProduct(product);
                                                    setProductForm({
                                                        name: product.name,
                                                        description: product.description,
                                                        category: product.category,
                                                        price: product.price,
                                                        lowStockThreshold: product.lowStockThreshold,
                                                    });
                                                }}
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteProduct(product._id)}
                                                className="p-1 text-red-600 hover:bg-red-50 rounded"
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
                        <div className="md:col-span-3">
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
                                            <td className="px-6 py-3 text-right">₹{item.total}</td>
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
                            <input
                                type="text"
                                required
                                value={distributionForm.authorizedBy}
                                onChange={(e) => setDistributionForm({ ...distributionForm, authorizedBy: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
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

                {/* Payment Information */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <DollarSign size={18} className="text-blue-500" /> Payment Details
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-2">Payment Method</label>
                            <div className="flex gap-4">
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="radio"
                                        value="cash"
                                        checked={distributionForm.paymentMethod === 'cash'}
                                        onChange={(e) => setDistributionForm({ ...distributionForm, paymentMethod: e.target.value })}
                                        className="mr-2 text-blue-600 focus:ring-blue-500"
                                    />
                                    Cash
                                </label>
                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="radio"
                                        value="online"
                                        checked={distributionForm.paymentMethod === 'online'}
                                        onChange={(e) => setDistributionForm({ ...distributionForm, paymentMethod: e.target.value })}
                                        className="mr-2 text-blue-600 focus:ring-blue-500"
                                    />
                                    Online
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={distributionForm.isPaid}
                                    onChange={(e) => setDistributionForm({ ...distributionForm, isPaid: e.target.checked })}
                                    className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Mark as Paid</span>
                            </label>
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
                        <span className="text-sm font-medium text-gray-600">
                            Total: ₹{totalAmount.toFixed(2)}
                        </span>
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
                                        <th className="px-6 py-3 font-medium text-right">Price</th>
                                        <th className="px-6 py-3 font-medium text-center">Quantity</th>
                                        <th className="px-6 py-3 font-medium text-right">Total</th>
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
                                                <td className="px-6 py-3 text-right">₹{product.price.toFixed(2)}</td>
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
                                                <td className="px-6 py-3 text-right font-medium">
                                                    ₹{(product.price * quantity).toFixed(2)}
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
                <p style={{ fontSize: '12px', margin: '2px 0' }}>General Purchase Receipt</p>
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
                        <th style={{ textAlign: 'left', padding: '2px 0', width: '45%' }}>Item</th>
                        <th style={{ textAlign: 'center', padding: '2px 0', width: '15%' }}>Qty</th>
                        <th style={{ textAlign: 'right', padding: '2px 0', width: '20%' }}>Rate</th>
                        <th style={{ textAlign: 'right', padding: '2px 0', width: '20%' }}>Amt</th>
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
                            <td style={{ padding: '2px 0', textAlign: 'right', verticalAlign: 'top' }}>
                                {Number(item.price || item.purchasePrice || 0).toFixed(0)}
                            </td>
                            <td style={{ padding: '2px 0', textAlign: 'right', verticalAlign: 'top' }}>
                                {Number(item.total || (item.quantity * (item.price || item.purchasePrice || 0))).toFixed(0)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '5px', marginTop: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                    <span>
                        TOTAL
                        {transaction.type === 'distribution' && (
                            <span style={{ fontSize: '12px', marginLeft: '2px' }}>
                                ({transaction.paymentMethod === 'cash' ? 'CASH' : 'ONLINE'})
                            </span>
                        )}:
                    </span>
                    <span>₹{Number(transaction.totalAmount).toFixed(2)}</span>
                </div>
            </div>

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

// History Tab Component
const HistoryTab = ({
    purchases,
    distributions,
    historyFilters,
    setHistoryFilters,
    selectedTransaction,
    setSelectedTransaction,
    selectedCollegeName
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name</label>
                        <input
                            type="text"
                            placeholder="Search by buyer..."
                            value={historyFilters.buyerName}
                            onChange={(e) => setHistoryFilters({ ...historyFilters, buyerName: e.target.value })}
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
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                        <select
                            value={historyFilters.isPaid}
                            onChange={(e) => setHistoryFilters({ ...historyFilters, isPaid: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        >
                            <option value="">All</option>
                            <option value="true">Paid</option>
                            <option value="false">Unpaid</option>
                        </select>
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
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Payment</th>
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
                                        <td className="px-4 py-3 text-right text-sm font-medium">₹{dist.totalAmount.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${dist.isPaid
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-red-100 text-red-700'
                                                }`}>
                                                {dist.isPaid ? 'Paid' : 'Unpaid'}
                                            </span>
                                        </td>
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
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
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
                                        <td className="px-4 py-3 text-right text-sm font-medium">₹{purchase.totalAmount.toFixed(2)}</td>
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
                                                        {selectedTransaction.type === 'distribution'
                                                            ? ` × ₹${item.price?.toFixed(2)}`
                                                            : ` × ₹${item.purchasePrice?.toFixed(2)}`
                                                        }
                                                    </p>
                                                </div>
                                                <p className="font-semibold">
                                                    {selectedTransaction.type === 'distribution'
                                                        ? `₹${item.total?.toFixed(2)}`
                                                        : `₹${(item.quantity * item.purchasePrice)?.toFixed(2)}`
                                                    }
                                                </p>
                                            </div>
                                        ))}

                                    </div>
                                </div>

                                <div className="border-t pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="font-semibold">Total Amount</span>
                                        <span className="text-xl font-bold">₹{selectedTransaction.totalAmount.toFixed(2)}</span>
                                    </div>

                                    {selectedTransaction.type === 'distribution' && (
                                        <>
                                            <div className="flex justify-between items-center text-sm">
                                                <span>Payment Method</span>
                                                <span className="font-medium">{selectedTransaction.paymentMethod?.toUpperCase()}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm mt-1">
                                                <span>Payment Status</span>
                                                <span className={`font-semibold ${selectedTransaction.isPaid ? 'text-green-600' : 'text-red-600'}`}>
                                                    {selectedTransaction.isPaid ? 'PAID' : 'UNPAID'}
                                                </span>
                                            </div>
                                        </>
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
                            <ThermalReceipt transaction={selectedTransaction} collegeName={selectedCollegeName} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



export default GeneralPurchase;
