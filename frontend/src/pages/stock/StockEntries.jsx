import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Package, Building2, FileText, Calendar, DollarSign, Eye, Trash2, X, Edit2, Save, Printer } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import { hasFullAccess } from '../../utils/permissions';

const StockEntries = ({ currentUser, viewContext = 'central' }) => {
  // Check access level - use currentUser prop if provided, otherwise fallback to localStorage
  const user = currentUser || JSON.parse(localStorage.getItem('currentUser') || 'null');
  const isSuperAdmin = user?.role === 'Administrator';
  const permissions = user?.permissions || [];

  // Check for legacy manage-stock permission
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  const canEditStockEntries = isSuperAdmin || hasLegacyPermission || hasFullAccess(permissions, 'stock-entries');

  const [stockEntries, setStockEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    product: '',
    vendor: '',
    startDate: '',
    endDate: '',
  });
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editFormData, setEditFormData] = useState({
    quantity: '',
    invoiceNumber: '',
    invoiceDate: '',
    purchasePrice: '',
    gstPercent: 0,
    remarks: '',
  });

  const calcLineTotal = (quantity, purchasePrice, gstPercent = 0) => {
    const qty = Number(quantity) || 0;
    const price = Number(purchasePrice) || 0;
    const gst = Number(gstPercent) || 0;
    return qty * price * (1 + gst / 100);
  };
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });

  // Active college context: sub-admins are locked to their assigned college,
  // super-admins can toggle via `viewContext` (central vs specific college)
  const [activeCollegeId, setActiveCollegeId] = useState(null);

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
        // fallback to defaults silently
        console.warn('Could not load receipt settings for stock print', err);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Resolve active college based on user role and viewContext
  useEffect(() => {
    let targetCollegeId = null;

    if (!isSuperAdmin && user?.assignedCollege) {
      // Sub-admin: always their assigned college
      targetCollegeId =
        typeof user.assignedCollege === 'object'
          ? user.assignedCollege._id
          : user.assignedCollege;
    } else if (isSuperAdmin && viewContext !== 'central') {
      // Super-admin viewing a specific college
      targetCollegeId = viewContext;
    }

    setActiveCollegeId(targetCollegeId);
  }, [isSuperAdmin, user, viewContext]);

  const handlePrintInvoice = (group) => {
    if (!group) return;

    const safe = (val) => (val ?? '').toString();
    const fmtDate = (val) => (val ? new Date(val).toLocaleString() : '—');

    const items = Array.isArray(group.items) && group.items.length > 0 ? group.items : [];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalCostValue = items.reduce((sum, item) => sum + (item.totalCost || 0), 0);

    const html = `
      <html>
        <head>
          <title>Stock Invoice</title>
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
            .summary { margin-bottom: 12px; font-size: 12px; color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 18px; }
            .item { background: #fff; border: none; border-radius: 0; padding: 0; }
            .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin-bottom: 2px; }
            .value { font-size: 14px; font-weight: 700; color: #0f172a; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
            .table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            .table th, .table td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; }
            .table th { background: #f8fafc; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: #64748b; }
            .table tfoot td { font-weight: 700; }
            .remarks { margin-top: 16px; background: #fff; border: none; border-radius: 0; padding: 0; color: #0f172a; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              <div class="brand">${safe(receiptSettings.receiptHeader)}</div>
              <div class="subhead">${safe(receiptSettings.receiptSubheader)}</div>
              <div class="title">Stock Invoice</div>
              <div class="meta">
                <div><strong>Generated:</strong> ${fmtDate(new Date())}</div>
                <div><strong>Invoice:</strong> ${safe(group.invoiceNumber || '—')}</div>
              </div>
            </div>

            <div class="section-title">Overview</div>
            <div class="grid">
              <div class="item">
                <div class="label">Vendor</div>
                <div class="value">${safe(group.vendor?.name || 'Unknown Vendor')}</div>
              </div>
              <div class="item">
                <div class="label">Invoice Number</div>
                <div class="value">${safe(group.invoiceNumber || '—')}</div>
              </div>
              <div class="item">
                <div class="label">Invoice Date</div>
                <div class="value">${fmtDate(group.invoiceDate || group.createdAt)}</div>
              </div>
              <div class="item">
                <div class="label">Location</div>
                <div class="value">${
                  group.college
                    ? safe(group.college.name)
                    : 'Central Warehouse'
                }</div>
              </div>
            </div>

            <div class="section-title">Line Items</div>
            <div class="summary">
              <div><strong>Total Quantity:</strong> ${safe(totalQuantity)}</div>
              <div><strong>Total Cost:</strong> ₹${Number(totalCostValue).toFixed(2)}</div>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>GST %</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map((item, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${safe(item.product?.name || 'Unknown Product')}</td>
                      <td>${safe(item.quantity)}</td>
                      <td>₹${Number(item.purchasePrice || 0).toFixed(2)}${Number(item.gstPercent) > 0 ? ` (+${item.gstPercent}%)` : ''}</td>
                      <td>${Number(item.gstPercent) || 0}%</td>
                      <td>₹${Number(item.totalCost || calcLineTotal(item.quantity, item.purchasePrice, item.gstPercent)).toFixed(2)}</td>
                    </tr>
                  `)
                  .join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Totals</td>
                  <td>${safe(totalQuantity)}</td>
                  <td></td>
                  <td></td>
                  <td>₹${Number(totalCostValue).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            ${group.remarks ? `
              <div class="section-title">Remarks</div>
              <div class="remarks">${safe(group.remarks)}</div>
            ` : ''}
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

  useEffect(() => {
    fetchStockEntries();
    fetchProducts();
    fetchVendors();
  }, []);

  useEffect(() => {
    fetchStockEntries();
  }, [filters, activeCollegeId]);

  const fetchStockEntries = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (filters.product) queryParams.append('product', filters.product);
      if (filters.vendor) queryParams.append('vendor', filters.vendor);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (activeCollegeId) {
        queryParams.append('college', activeCollegeId);
      } else {
        // Explicitly filter for central warehouse when super-admin is in central view
        if (isSuperAdmin && viewContext === 'central') {
          queryParams.append('college', 'central');
        }
      }

      const res = await fetch(apiUrl(`/api/stock-entries?${queryParams.toString()}`));
      if (res.ok) {
        const data = await res.json();
        setStockEntries(data);
      }
    } catch (err) {
      console.error('Error fetching stock entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(apiUrl('/api/products'));
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(apiUrl('/api/vendors?active=true'));
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
      }
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setEditFormData({
      quantity: entry.quantity || '',
      invoiceNumber: entry.invoiceNumber || '',
      invoiceDate: entry.invoiceDate ? new Date(entry.invoiceDate).toISOString().split('T')[0] : '',
      purchasePrice: entry.purchasePrice || '',
      gstPercent: entry.gstPercent || 0,
      remarks: entry.remarks || '',
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingEntry) return;

    setUpdating(true);
    try {
      const updateData = {
        quantity: Number(editFormData.quantity),
        invoiceNumber: editFormData.invoiceNumber,
        invoiceDate: editFormData.invoiceDate || undefined,
        purchasePrice: Number(editFormData.purchasePrice) || 0,
        gstPercent: Number(editFormData.gstPercent) || 0,
        remarks: editFormData.remarks,
      };

      const res = await fetch(apiUrl(`/api/stock-entries/${editingEntry._id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        const updated = await res.json();
        setStockEntries(prev => prev.map(e => e._id === editingEntry._id ? updated : e));
        setEditingEntry(null);
        setEditFormData({
          quantity: '',
          invoiceNumber: '',
          invoiceDate: '',
          purchasePrice: '',
          gstPercent: 0,
          remarks: '',
        });
        // Refresh products to update stock
        fetchProducts();
        alert('Stock entry updated successfully');
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update stock entry');
      }
    } catch (err) {
      console.error('Error updating stock entry:', err);
      alert(err.message || 'Error updating stock entry');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this stock entry? This will restore the product stock.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-entries/${entryId}`), {
        method: 'DELETE',
      });

      if (res.ok) {
        setStockEntries(prev => prev.filter(e => e._id !== entryId));
        // Refresh products to update stock
        fetchProducts();
      } else {
        throw new Error('Failed to delete stock entry');
      }
    } catch (err) {
      console.error('Error deleting stock entry:', err);
      alert('Error deleting stock entry');
    }
  };

  const filteredEntries = useMemo(() => {
    return stockEntries.filter(entry => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesProduct = entry.product?.name?.toLowerCase().includes(query);
        const matchesVendor = entry.vendor?.name?.toLowerCase().includes(query);
        const matchesInvoice = entry.invoiceNumber?.toLowerCase().includes(query);
        if (!matchesProduct && !matchesVendor && !matchesInvoice) return false;
      }
      return true;
    });
  }, [stockEntries, searchQuery]);

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
    return `₹${Number(amount || 0).toFixed(2)}`;
  };

  const totalQuantity = useMemo(() => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0);
  }, [filteredEntries]);

  const totalCost = useMemo(() => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0);
  }, [filteredEntries]);

  // Group entries by Invoice
  const groupedEntries = useMemo(() => {
    const groups = [];
    const invoiceMap = new Map();

    filteredEntries.forEach(entry => {
      // Use Invoice Number as grouping key if present
      const invoiceNum = entry.invoiceNumber ? entry.invoiceNumber.trim() : null;

      if (invoiceNum) {
        // Compound key to be safe: Invoice + Vendor
        const key = `${invoiceNum}-${entry.vendor?._id || 'unknown'}`;

        if (!invoiceMap.has(key)) {
          const group = {
            id: key,
            isGroup: true,
            invoiceNumber: invoiceNum,
            invoiceDate: entry.invoiceDate,
            vendor: entry.vendor,
            college: entry.college, // Assuming homogenous location for invoice
            createdAt: entry.createdAt,
            items: [],
            totalCost: 0,
            totalQuantity: 0,
            remarks: entry.remarks // Use first remark
          };
          invoiceMap.set(key, group);
          groups.push(group);
        }

        const group = invoiceMap.get(key);
        group.items.push(entry);
        group.totalCost += (entry.totalCost || 0);
        group.totalQuantity += (entry.quantity || 0);
      } else {
        // No invoice number -> Treat as standalone
        groups.push({
          id: entry._id,
          isGroup: false,
          ...entry,
          items: [entry]
        });
      }
    });

    // Sort by most recent
    return groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [filteredEntries]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Stock Entries</h2>
            <p className="text-gray-600 text-sm mt-1">View and manage stock history (grouped by Invoice)</p>
          </div>
        </div>
        {filteredEntries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-gray-600 mb-1">Total Quantity</p>
              <p className="text-2xl font-bold text-blue-700">{totalQuantity}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-gray-600 mb-1">Total Cost</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totalCost)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by product, vendor, or invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Product Filter */}
          <div className="relative">
            <Package className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="">All Products</option>
              {products.map(product => (
                <option key={product._id} value={product._id}>{product.name}</option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={filters.vendor}
              onChange={(e) => setFilters({ ...filters, vendor: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="">All Vendors</option>
              {vendors.map(vendor => (
                <option key={vendor._id} value={vendor._id}>{vendor.name}</option>
              ))}
            </select>
          </div>

          {/* Date Range - Simplified */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Start Date"
            />
          </div>
        </div>
      </div>

      {/* Stock Entries List (Grouped) */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading stock entries...</p>
        </div>
      ) : groupedEntries.length > 0 ? (
        <div className="space-y-4">
          {groupedEntries.map((group) => (
            <div
              key={group.id}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${group.isGroup ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                    {group.isGroup ? <FileText size={18} /> : <Package size={18} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      {group.invoiceNumber ? `Invoice #${group.invoiceNumber}` : 'Direct Entry'}
                      <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-600">
                        {formatDate(group.createdAt)}
                      </span>
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-0.5">
                      <span className="font-medium text-gray-800">{group.vendor?.name || 'Unknown Vendor'}</span>
                      <span>•</span>
                      <span className={`flex items-center gap-1 ${group.college ? 'text-purple-600' : 'text-blue-600'}`}>
                        {group.college ? (
                          <><Building2 size={12} /> {group.college.name}</>
                        ) : (
                          <><Building2 size={12} /> Central Warehouse</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Total Cost</p>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(group.totalCost || group.totalCost)}</p>
                  <button
                    onClick={() => handlePrintInvoice(group)}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Print full invoice"
                  >
                    <Printer size={14} />
                    Print
                  </button>
                </div>
              </div>

              {/* Card Body - Items List */}
              <div className="divide-y divide-gray-100">
                {group.items.map((entry) => (
                  <div key={entry._id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{entry.product?.name || 'Unknown Product'}</span>
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                          +{entry.quantity} Qty
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
                        <span>Unit: {formatCurrency(entry.purchasePrice)}</span>
                        {Number(entry.gstPercent) > 0 && (
                          <span>GST: {entry.gstPercent}%</span>
                        )}
                        <span>Subtotal: {formatCurrency(entry.totalCost)}</span>
                      </div>
                    </div>

                    {/* Actions for Line Item */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSelectedEntry(entry)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      {canEditStockEntries && (
                        <>
                          <button
                            onClick={() => handleEdit(entry)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Edit Item"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry._id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Delete Item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {group.remarks && (
                  <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 italic border-t border-gray-100">
                    Note: {group.remarks}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No stock entries found</h3>
          <p className="text-gray-600">
            {searchQuery || filters.product || filters.vendor || filters.startDate
              ? 'Try adjusting your filters'
              : 'No stock entries have been recorded yet'}
          </p>
        </div>
      )}

      {/* View Details Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 backdrop-blur-sm bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Stock Entry Details</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Product</p>
                  <p className="font-semibold text-gray-900">{selectedEntry.product?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Vendor</p>
                  <p className="font-semibold text-gray-900">{selectedEntry.vendor?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Quantity</p>
                  <p className="font-semibold text-green-600 text-lg">+{selectedEntry.quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Date Added</p>
                  <p className="font-semibold text-gray-900">{formatDate(selectedEntry.createdAt)}</p>
                </div>
                {selectedEntry.purchasePrice > 0 && (
                  <>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Unit Price (excl. GST)</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(selectedEntry.purchasePrice)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">GST</p>
                      <p className="font-semibold text-gray-900">{Number(selectedEntry.gstPercent) || 0}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Total Cost (incl. GST)</p>
                      <p className="font-semibold text-gray-900 text-lg">{formatCurrency(selectedEntry.totalCost)}</p>
                    </div>
                  </>
                )}
                {selectedEntry.invoiceNumber && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Invoice Number</p>
                    <p className="font-semibold text-gray-900">{selectedEntry.invoiceNumber}</p>
                  </div>
                )}
                {selectedEntry.invoiceDate && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Invoice Date</p>
                    <p className="font-semibold text-gray-900">{formatDate(selectedEntry.invoiceDate)}</p>
                  </div>
                )}
              </div>

              {selectedEntry.remarks && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Remarks</p>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedEntry.remarks}</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stock Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 backdrop-blur-sm bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 p-4" onClick={() => {
          setEditingEntry(null);
          setEditFormData({
            quantity: '',
            invoiceNumber: '',
            invoiceDate: '',
            purchasePrice: '',
            gstPercent: 0,
            remarks: '',
          });
        }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Edit2 size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Edit Stock Entry</h2>
                  <p className="text-sm text-gray-500">{editingEntry.product?.name || 'Unknown Product'}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingEntry(null);
                  setEditFormData({
                    quantity: '',
                    invoiceNumber: '',
                    invoiceDate: '',
                    purchasePrice: '',
                    gstPercent: 0,
                    remarks: '',
                  });
                }}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingEntry.product?.name || 'Unknown Product'}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingEntry.vendor?.name || 'Unknown Vendor'}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Note: Changing quantity will adjust product stock</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Purchase Price (excl. GST)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editFormData.purchasePrice}
                      onChange={(e) => setEditFormData({ ...editFormData, purchasePrice: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST %
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editFormData.gstPercent}
                    onChange={(e) => setEditFormData({ ...editFormData, gstPercent: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={editFormData.invoiceNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter invoice number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="date"
                      value={editFormData.invoiceDate}
                      onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remarks
                </label>
                <textarea
                  value={editFormData.remarks}
                  onChange={(e) => setEditFormData({ ...editFormData, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter any remarks or notes..."
                />
              </div>

              {editFormData.quantity && editFormData.purchasePrice && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Calculated Total Cost (incl. GST):</p>
                  <p className="text-xl font-bold text-green-700">
                    {formatCurrency(
                      calcLineTotal(
                        editFormData.quantity,
                        editFormData.purchasePrice,
                        editFormData.gstPercent
                      )
                    )}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingEntry(null);
                    setEditFormData({
                      quantity: '',
                      invoiceNumber: '',
                      invoiceDate: '',
                      purchasePrice: '',
                      gstPercent: 0,
                      remarks: '',
                    });
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Updating...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Update Entry
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockEntries;
