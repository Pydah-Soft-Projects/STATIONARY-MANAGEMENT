import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Package, ArrowRight, Calendar, CheckCircle, XCircle, Clock, Trash2, Plus, AlertCircle, Printer, DollarSign } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasFullAccess } from '../utils/permissions';

const StockTransfers = ({ currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const canEdit = isSuperAdmin || hasFullAccess(currentUser?.permissions || [], 'stock-transfers');
  const [stockTransfers, setStockTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    product: '',
    toCollege: '',
    status: '',
    startDate: '',
    endDate: '',
  });
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [products, setProducts] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    items: [{ product: '', quantity: '', collegeStock: 0 }],
    fromCollege: '', // Empty means Central Warehouse
    toCollege: '',
    transferDate: new Date().toISOString().split('T')[0],
    isPaid: false,
    deductFromCentral: true,
    includeInRevenue: true,
    remarks: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [receiptSettings, setReceiptSettings] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });

  useEffect(() => {
    fetchStockTransfers();
    fetchProducts();
    fetchColleges();
  }, []);

  // Load receipt header/subheader for print
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/settings'));
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setReceiptSettings({
              receiptHeader: data.receiptHeader || 'PYDAH GROUP OF INSTITUTIONS',
              receiptSubheader: data.receiptSubheader || 'Stationery Management System',
            });
          }
        }
      } catch (err) {
        console.warn('Could not load receipt settings for transfer print', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    fetchStockTransfers();
  }, [filters]);

  const fetchStockTransfers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.product) queryParams.append('product', filters.product);
      if (filters.toCollege) queryParams.append('toCollege', filters.toCollege);
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);

      const res = await fetch(apiUrl(`/api/stock-transfers?${queryParams.toString()}`));
      if (!res.ok) {
        throw new Error(`Failed to fetch transfers: ${res.statusText}`);
      }
      const data = await res.json();
      setStockTransfers(data);
    } catch (err) {
      console.error('Error fetching stock transfers:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load stock transfers: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(apiUrl('/api/products'));
      if (!res.ok) {
        throw new Error(`Failed to fetch products: ${res.statusText}`);
      }
      const data = await res.json();
      // Filter out set products for transfers (only individual products)
      setProducts(data.filter(p => !p.isSet));
    } catch (err) {
      console.error('Error fetching products:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load products: ' + err.message });
    }
  };

  const fetchColleges = async () => {
    try {
      const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true&withStock=true'));
      if (!res.ok) {
        throw new Error(`Failed to fetch colleges: ${res.statusText}`);
      }
      const data = await res.json();
      setColleges(data);
    } catch (err) {
      console.error('Error fetching colleges:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load colleges: ' + err.message });
    }
  };



  const fetchCollegeStock = async (collegeId, productId) => {
    if (!collegeId || !productId) return 0;
    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock/${productId}`));
      if (!res.ok) {
        throw new Error(`Failed to fetch college stock: ${res.statusText}`);
      }
      const data = await res.json();
      return data.quantity || 0;
    } catch (err) {
      console.error('Error fetching college stock:', err);
      return 0;
    }
  };

  // Helper to get stock for the selected source (Central or College)
  const getSourceStock = async (productId) => {
    if (!formData.fromCollege) {
      // Return central stock from products array
      const product = products.find(p => p._id === productId);
      return product ? product.stock : 0;
    } else {
      // Return college stock
      return await fetchCollegeStock(formData.fromCollege, productId);
    }
  };

  const filteredTransfers = useMemo(() => {
    return stockTransfers.filter(transfer => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const productNames = transfer.items?.map(item => item.product?.name?.toLowerCase() || '').join(' ') || '';
        const toBranch = transfer.toBranch?.name?.toLowerCase() || '';

        if (!productNames.includes(query) && !toBranch.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [stockTransfers, searchQuery]);

  const handlePrintTransfer = (transfer) => {
    if (!transfer) return;

    const safe = (val) => (val ?? '').toString();
    const fmtDate = (val) => (val ? new Date(val).toLocaleString() : 'N/A');

    const items = Array.isArray(transfer.items) ? transfer.items : [];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const hasTransaction = !!transfer.transactionId;
    const totalAmount = hasTransaction ? Number(transfer.transactionId.totalAmount || 0) : 0;

    const html = `
      <html>
        <head>
          <title>Stock Transfer</title>
          <style>
            @page { size: auto; margin: 0mm; }
            body { font-family: 'Inter', Arial, sans-serif; padding: 18mm 16mm; margin: 0; color: #0f172a; background: #fff; }
            .wrapper { max-width: 960px; margin: 0 auto; padding: 0; background: #fff; }
            .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 18px; }
            .brand { font-size: 20px; font-weight: 800; color: #1d4ed8; letter-spacing: 0.5px; }
            .subhead { font-size: 12px; color: #475569; margin-top: 4px; }
            .title { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 6px; }
            .meta { margin-top: 8px; font-size: 11px; color: #475569; }
            .section-title { font-size: 14px; font-weight: 700; margin: 12px 0 8px; color: #0f172a; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 18px; }
            .item { background: #fff; border: none; border-radius: 0; padding: 0; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 2px; }
            .value { font-size: 14px; font-weight: 700; color: #0f172a; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
            .table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            .table th, .table td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; }
            .table th { background: #f8fafc; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #64748b; }
            .table tfoot td { font-weight: 700; }
            .remarks { margin-top: 16px; font-size: 13px; color: #0f172a; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
            .badge-status { background: #e0f2fe; color: #0369a1; }
            .badge-paid { background: #dcfce7; color: #15803d; }
            .badge-unpaid { background: #fee2e2; color: #b91c1c; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <div class="brand">${safe(receiptSettings.receiptHeader)}</div>
              <div class="subhead">${safe(receiptSettings.receiptSubheader)}</div>
              <div class="title">Stock Transfer</div>
              <div class="meta">
                <div><strong>Generated:</strong> ${fmtDate(new Date())}</div>
                <div><strong>Transfer ID:</strong> ${safe(transfer._id || '')}</div>
              </div>
            </div>

            <div class="section-title">Overview</div>
            <div class="grid">
              <div class="item">
                <div class="label">From</div>
                <div class="value">${transfer.fromCollege
        ? safe(transfer.fromCollege.name || 'College')
        : 'Central Warehouse'
      }</div>
              </div>
              <div class="item">
                <div class="label">To College</div>
                <div class="value">${safe(
        transfer.toCollege?.name || transfer.toBranch?.name || 'N/A'
      )}</div>
              </div>
              <div class="item">
                <div class="label">Transfer Date</div>
                <div class="value">${fmtDate(transfer.transferDate)}</div>
              </div>
              <div class="item">
                <div class="label">Status</div>
                <div class="value">
                  <span class="badge badge-status">${safe(
        (transfer.status || 'pending').toUpperCase()
      )}</span>
                </div>
              </div>
              <div class="item">
                <div class="label">Payment</div>
                <div class="value">
                  <span class="badge ${transfer.isPaid ? 'badge-paid' : 'badge-unpaid'}">
                    ${transfer.isPaid ? 'PAID' : 'UNPAID'}
                  </span>
                </div>
              </div>
            </div>

            <div class="section-title">Items</div>
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  ${hasTransaction ? '<th>Price</th><th>Subtotal</th>' : '<th></th><th></th>'}
                </tr>
              </thead>
              <tbody>
                ${items
        .map((item, index) => {
          const price = item.product?.price || 0;
          const subtotal = price * (item.quantity || 0);
          return `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${safe(item.product?.name || 'N/A')}</td>
                        <td>${safe(item.quantity)}</td>
                        ${hasTransaction
              ? `<td>₹${Number(price).toFixed(2)}</td><td>₹${Number(
                subtotal
              ).toFixed(2)}</td>`
              : '<td></td><td></td>'
            }
                      </tr>
                    `;
        })
        .join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Totals</td>
                  <td>${safe(totalQuantity)}</td>
                  <td></td>
                  <td>${hasTransaction ? `₹${totalAmount.toFixed(2)}` : ''}</td>
                </tr>
              </tfoot>
            </table>

            ${hasTransaction
        ? `
            <div class="section-title">Transaction</div>
            <div class="grid">
              <div class="item">
                <div class="label">Transaction ID</div>
                <div class="value">${safe(transfer.transactionId.transactionId || '')}</div>
              </div>
              <div class="item">
                <div class="label">Payment Method</div>
                <div class="value">${safe(transfer.transactionId.paymentMethod || '')}</div>
              </div>
            </div>
            `
        : ''
      }

            ${transfer.remarks
        ? `
            <div class="section-title">Remarks</div>
            <div class="remarks">${safe(transfer.remarks)}</div>
            `
        : ''
      }
          </div>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };
  };

  const addProductItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { product: '', quantity: '', collegeStock: 0 }]
    }));
  };

  const removeProductItem = (index) => {
    if (formData.items.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateProductItem = (index, field, value) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index] = { ...updatedItems[index], [field]: value };

      // Fetch college stock if product and college are selected
      if (field === 'product' && value && prev.toCollege) {
        fetchCollegeStock(prev.toCollege, value).then(stock => {
          updatedItems[index].collegeStock = stock || 0;
        });
      }
      if (field === 'toCollege' && value && updatedItems[index].product) {
        fetchCollegeStock(value, updatedItems[index].product).then(stock => {
          updatedItems[index].collegeStock = stock || 0;
        });
      }

      return { ...prev, items: updatedItems };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all items
    const validItems = formData.items.filter(item => item.product && item.quantity && Number(item.quantity) >= 1);

    if (validItems.length === 0) {
      setStatusMsg({ type: 'error', message: 'Please add at least one product with valid quantity' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      return;
    }

    if (!formData.toCollege) {
      setStatusMsg({ type: 'error', message: 'Please select a destination college' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        items: validItems.map(item => ({
          product: item.product,
          quantity: Number(item.quantity),
        })),
        fromCollege: formData.fromCollege || null,
        toCollege: formData.toCollege,
        transferDate: formData.transferDate || new Date().toISOString(),
        isPaid: formData.isPaid || false,
        deductFromCentral: formData.deductFromCentral !== false,
        includeInRevenue: formData.includeInRevenue !== false,
        remarks: formData.remarks || '',
      };

      const res = await fetch(apiUrl('/api/stock-transfers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create stock transfer');
      }

      const newTransfer = await res.json();
      setStockTransfers(prev => [newTransfer, ...prev]);
      setShowAddModal(false);
      setFormData({
        items: [{ product: '', quantity: '', collegeStock: 0 }],
        fromCollege: '',
        toCollege: '',
        transferDate: new Date().toISOString().split('T')[0],
        isPaid: false,
        deductFromCentral: true,
        includeInRevenue: true,
        remarks: '',
      });
      setStatusMsg({ type: 'success', message: 'Stock transfer created successfully' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (error) {
      console.error('Error creating stock transfer:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Failed to create stock transfer' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (transferId) => {
    if (!window.confirm('Mark this transfer as completed?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/${transferId}/complete`), {
        method: 'POST',
      });

      if (res.ok) {
        const updated = await res.json();
        setStockTransfers(prev => prev.map(t => t._id === transferId ? updated : t));
      } else {
        throw new Error('Failed to complete transfer');
      }
    } catch (error) {
      console.error('Error completing transfer:', error);
      alert('Error completing transfer');
    }
  };

  const handleCancel = async (transferId) => {
    if (!window.confirm('Cancel this transfer?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/${transferId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (res.ok) {
        const updated = await res.json();
        setStockTransfers(prev => prev.map(t => t._id === transferId ? updated : t));
      } else {
        throw new Error('Failed to cancel transfer');
      }
    } catch (error) {
      console.error('Error cancelling transfer:', error);
      alert('Error cancelling transfer');
    }
  };

  const handleMarkAsPaid = async (transferId) => {
    if (!window.confirm('Mark this transfer as PAID?')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/${transferId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: true }),
      });

      if (res.ok) {
        const updated = await res.json();
        setStockTransfers(prev => prev.map(t => t._id === transferId ? updated : t));
        if (selectedTransfer && selectedTransfer._id === transferId) {
          setSelectedTransfer(updated);
        }
        setStatusMsg({ type: 'success', message: 'Transfer marked as Paid successfully' });
        setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      } else {
        throw new Error('Failed to update payment status');
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      setStatusMsg({ type: 'error', message: 'Error updating payment status' });
    }
  };

  const handleDelete = async (transferId, transferStatus) => {
    let confirmMessage = 'Are you sure you want to delete this transfer? This action cannot be undone.';

    if (transferStatus === 'completed') {
      confirmMessage = 'Are you sure you want to delete this completed transfer? This will revert all stock changes (add stock back to central and remove from college). This action cannot be undone.';
    } else if (transferStatus === 'cancelled') {
      confirmMessage = 'Are you sure you want to delete this cancelled transfer? This action cannot be undone.';
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/${transferId}`), {
        method: 'DELETE',
      });

      if (res.ok) {
        setStockTransfers(prev => prev.filter(t => t._id !== transferId));
        setStatusMsg({ type: 'success', message: 'Transfer deleted successfully. Stock changes have been reverted if applicable.' });
        setTimeout(() => setStatusMsg({ type: '', message: '' }), 5000);
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to delete transfer');
      }
    } catch (error) {
      console.error('Error deleting transfer:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Error deleting transfer' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 5000);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Pending' },
      completed: { icon: CheckCircle, color: 'bg-green-100 text-green-800 border-green-200', label: 'Completed' },
      cancelled: { icon: XCircle, color: 'bg-red-100 text-red-800 border-red-200', label: 'Cancelled' },
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
        <Icon size={12} />
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString) => {
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Package className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stock Transfers</h1>
              <p className="text-gray-600 mt-1">Manage stock transfers between colleges</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <>

                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl font-medium"
                >
                  <Plus size={20} />
                  New Transfer
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Message */}
        {statusMsg.message && (
          <div
            className={`px-4 py-3 rounded-lg border ${statusMsg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
              }`}
          >
            {statusMsg.message}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by product, colleges..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Products</option>
              {products.map(product => (
                <option key={product._id} value={product._id}>{product.name}</option>
              ))}
            </select>
            <select
              value={filters.toCollege}
              onChange={(e) => setFilters({ ...filters, toCollege: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Colleges</option>
              {colleges.filter(c => c.isActive).map(college => (
                <option key={college._id} value={college._id}>{college.name}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="Start Date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="End Date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Transfers Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Transfer History</h3>
            <p className="text-sm text-gray-500">All stock transfers between colleges</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600">Loading transfers...</p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📦</div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">No transfers found</h4>
              <p className="text-gray-600">
                {searchQuery || Object.values(filters).some(f => f !== '')
                  ? 'Try adjusting your search criteria'
                  : 'Create your first stock transfer to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Products</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To College</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTransfers.map(transfer => {
                    // Calculate total amount if not available in transaction
                    const totalAmount = transfer.transactionId?.totalAmount || transfer.items?.reduce((sum, item) => sum + ((item.quantity || 0) * (item.product?.price || 0)), 0) || 0;

                    // Get college name from live data or historical snapshot
                    const collegeName = transfer.toCollege?.name || transfer.transactionId?.collegeTransfer?.collegeName || transfer.transactionId?.branchTransfer?.branchName || transfer.toBranch?.name || 'N/A';
                    const collegeLocation = transfer.toCollege?.location || transfer.transactionId?.collegeTransfer?.collegeLocation || transfer.transactionId?.branchTransfer?.branchLocation || transfer.toBranch?.location || '';

                    // Get from college name
                    const fromCollegeName = transfer.fromCollege?.name || 'Central Warehouse';

                    return (
                      <tr
                        key={transfer._id}
                        onClick={() => setSelectedTransfer(transfer)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-900">
                            {transfer.items?.length || 0} {transfer.items?.length === 1 ? 'Product' : 'Products'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">{fromCollegeName}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Package size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{collegeName}</span>
                            {collegeLocation && (
                              <span className="text-xs text-gray-500">({collegeLocation})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-gray-900">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(totalAmount)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${transfer.isPaid || transfer.transactionId?.isPaid
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                            }`}>
                            {transfer.isPaid || transfer.transactionId?.isPaid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-500">{formatDate(transfer.transferDate)}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(transfer.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintTransfer(transfer);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Print Transfer"
                          >
                            <Printer size={14} />
                            Print
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Transfer Modal */}
        {showAddModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setShowAddModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-900">Create Stock Transfer</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
                >
                  <XCircle size={18} className="text-gray-600" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* From College */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transfer From
                    </label>
                    <select
                      value={formData.fromCollege}
                      onChange={(e) => {
                        setFormData({ ...formData, fromCollege: e.target.value });
                        // Clear items source stock since source changed
                        setFormData(prev => ({
                          ...prev,
                          fromCollege: e.target.value,
                          items: prev.items.map(item => ({ ...item, sourceStock: 0 })) // Reset stock
                        }));
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Central Warehouse</option>
                      {colleges.filter(c => c.isActive && c._id !== formData.toCollege).map(college => (
                        <option key={college._id} value={college._id}>{college.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* To College */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transfer To <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.toCollege} // FIXED: was toBranch
                      onChange={(e) => {
                        setFormData({ ...formData, toCollege: e.target.value });
                        // Update branch stock for all items when branch changes
                        formData.items.forEach((item, idx) => {
                          if (item.product && e.target.value) {
                            fetchCollegeStock(e.target.value, item.product).then(stock => {
                              updateProductItem(idx, 'collegeStock', stock); // FIXED: field name and function name
                            });
                          }
                        });
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select Destination</option>
                      {colleges.filter(c => c.isActive && c._id !== formData.fromCollege).map(college => (
                        <option key={college._id} value={college._id}>{college.name}{college.location ? ` - ${college.location}` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                  <ArrowRight size={16} />
                  <span>Moving stock from <b>{formData.fromCollege ? colleges.find(c => c._id === formData.fromCollege)?.name : 'Central Warehouse'}</b> to <b>{formData.toCollege ? colleges.find(c => c._id === formData.toCollege)?.name : '...'}</b></span>
                </div>

                {/* Products Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Products <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        {formData.items.length} {formData.items.length === 1 ? 'product' : 'products'} added
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addProductItem}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors font-medium text-sm border border-indigo-200"
                      title="Add another product to this transfer"
                    >
                      <Plus size={18} />
                      Add Product
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
                        <div className="col-span-1 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
                            {index + 1}
                          </div>
                        </div>
                        <div className="col-span-5">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Product {index + 1}
                          </label>
                          <select
                            value={item.product}
                            onChange={async (e) => {
                              const value = e.target.value;
                              updateProductItem(index, 'product', value);

                              if (value) {
                                // Fetch Source Stock
                                const sourceQty = await getSourceStock(value);
                                updateProductItem(index, 'sourceStock', sourceQty);

                                // Fetch Destination Stock
                                if (formData.toCollege) {
                                  const destQty = await fetchCollegeStock(formData.toCollege, value);
                                  updateProductItem(index, 'collegeStock', destQty);
                                }
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                            required={index === 0}
                          >
                            <option value="">Select Product</option>
                            {products
                              .filter(p => !formData.items.some((itm, idx) => idx !== index && itm.product === p._id))
                              .map(product => (
                                <option key={product._id} value={product._id}>
                                  {product.name}
                                </option>
                              ))}
                          </select>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500">
                            <span>Available: <b className="text-gray-900">{item.sourceStock !== undefined ? item.sourceStock : '-'}</b></span>
                            {formData.toCollege && (
                              <span>Destination Stock: <b>{item.collegeStock || 0}</b></span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateProductItem(index, 'quantity', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                            placeholder="Qty"
                            required={index === 0}
                          />
                        </div>
                        <div className="col-span-3 flex items-end justify-end gap-2">
                          {formData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeProductItem(index)}
                              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300 flex items-center gap-1 text-sm"
                              title="Remove this product"
                            >
                              <Trash2 size={16} />
                              Remove
                            </button>
                          )}
                          {formData.items.length === 1 && (
                            <span className="text-xs text-gray-400 italic">At least 1 product required</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {formData.items.length === 0 && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                      <p className="text-sm text-yellow-800">No products added. Click "Add Product" to start.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Payment Status
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.isPaid}
                            onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
                            className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-700">Mark as Paid</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Transfer Date <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.transferDate}
                        onChange={(e) => setFormData({ ...formData, transferDate: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Transfer Options</h4>
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.deductFromCentral}
                          onChange={(e) => setFormData({ ...formData, deductFromCentral: e.target.checked })}
                          className="w-5 h-5 mt-0.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Deduct Stock from Central Store</span>
                          <p className="text-xs text-gray-600 mt-1">If checked, stock will be deducted from central inventory when transfer is completed.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.includeInRevenue}
                          onChange={(e) => setFormData({ ...formData, includeInRevenue: e.target.checked })}
                          className="w-5 h-5 mt-0.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">Include Amount in Revenue</span>
                          <p className="text-xs text-gray-600 mt-1">If checked, this transfer will be counted as revenue and appear in transaction reports.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Remarks
                  </label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Optional notes about this transfer..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus size={18} />
                        Create Transfer
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Transfer Details Modal */}
        {selectedTransfer && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setSelectedTransfer(null)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-900">Transfer Details</h2>
                <button
                  onClick={() => setSelectedTransfer(null)}
                  className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
                >
                  <XCircle size={18} className="text-gray-600" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500 mb-2">Products</p>
                    <div className="space-y-2">
                      {selectedTransfer.items && selectedTransfer.items.length > 0 ? (
                        selectedTransfer.items.map((item, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="font-semibold text-gray-900">{item.product?.name || 'N/A'}</p>
                            <p className="text-sm text-gray-600">
                              Quantity: {item.quantity} | Price: ₹{item.product?.price?.toFixed(2) || '0.00'} |
                              Total: ₹{((item.quantity || 0) * (item.product?.price || 0)).toFixed(2)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500">No products</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Quantity</p>
                    <p className="font-semibold text-gray-900">
                      {selectedTransfer.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Payment Status</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${selectedTransfer.isPaid || selectedTransfer.transactionId?.isPaid
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                      {selectedTransfer.isPaid || selectedTransfer.transactionId?.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Deduct from Central</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${selectedTransfer.deductFromCentral !== false
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                      {selectedTransfer.deductFromCentral !== false ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Include in Revenue</p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${selectedTransfer.includeInRevenue !== false
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                      {selectedTransfer.includeInRevenue !== false ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Source</p>
                    <p className="font-semibold text-gray-900">Central Stock</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">To College</p>
                    <p className="font-semibold text-gray-900">{selectedTransfer.toCollege?.name || selectedTransfer.toBranch?.name || 'N/A'}</p>
                    {(selectedTransfer.toCollege?.location || selectedTransfer.toBranch?.location) && (
                      <p className="text-xs text-gray-500 mt-1">{selectedTransfer.toCollege?.location || selectedTransfer.toBranch?.location}</p>
                    )}
                  </div>
                  {selectedTransfer.transactionId && (
                    <>
                      <div>
                        <p className="text-sm text-gray-500">Transaction ID</p>
                        <p className="font-semibold text-gray-900">{selectedTransfer.transactionId?.transactionId || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Transaction Amount</p>
                        <p className="font-semibold text-gray-900">₹{selectedTransfer.transactionId?.totalAmount?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Payment Method</p>
                        <p className="font-semibold text-gray-900 capitalize">{selectedTransfer.transactionId?.paymentMethod || 'N/A'}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Transfer Date</p>
                    <p className="font-semibold text-gray-900">{formatDate(selectedTransfer.transferDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <div className="mt-1">{getStatusBadge(selectedTransfer.status)}</div>
                  </div>
                  {selectedTransfer.completedAt && (
                    <div>
                      <p className="text-sm text-gray-500">Completed At</p>
                      <p className="font-semibold text-gray-900">{formatDateTime(selectedTransfer.completedAt)}</p>
                    </div>
                  )}
                  {selectedTransfer.cancelledAt && (
                    <div>
                      <p className="text-sm text-gray-500">Cancelled At</p>
                      <p className="font-semibold text-gray-900">{formatDateTime(selectedTransfer.cancelledAt)}</p>
                    </div>
                  )}
                  {selectedTransfer.remarks && (
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Remarks</p>
                      <p className="font-semibold text-gray-900">{selectedTransfer.remarks}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      {selectedTransfer.status === 'pending' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleComplete(selectedTransfer._id);
                              setSelectedTransfer(null);
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                            title="Complete Transfer"
                          >
                            <CheckCircle size={16} />
                            Complete
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(selectedTransfer._id);
                              setSelectedTransfer(null);
                            }}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium flex items-center gap-2"
                            title="Cancel Transfer"
                          >
                            <XCircle size={16} />
                            Cancel
                          </button>
                        </>
                      )}

                      {!selectedTransfer.isPaid && !selectedTransfer.transactionId?.isPaid && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsPaid(selectedTransfer._id);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                          title="Mark as Paid"
                        >
                          <DollarSign size={16} />
                          Mark Paid
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(selectedTransfer._id, selectedTransfer.status);
                          setSelectedTransfer(null);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                        title="Delete Transfer"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-3 py-2 rounded-lg">
                      View Only
                    </span>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTransfer(null);
                      }}
                      className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



      </div>
    </div>
  );
};

export default StockTransfers;

