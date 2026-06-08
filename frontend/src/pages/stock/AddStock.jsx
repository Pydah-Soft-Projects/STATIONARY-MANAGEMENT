import { useState, useEffect } from 'react';
import { Plus, Package, Building2, FileText, Calendar, DollarSign, Save, AlertCircle, MapPin } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import { hasFullAccess } from '../../utils/permissions';

const AddStock = ({ products = [], setProducts, currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];

  // Check for legacy manage-stock permission
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });

  const canEdit = isSuperAdmin || hasLegacyPermission || hasFullAccess(permissions, 'stock-add');

  // Helper: Format Date for Input
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // MAIN FORM STATE (Invoice Details)
  const [formData, setFormData] = useState({
    vendor: '',
    invoiceNumber: '',
    invoiceDate: getTodayStr(),
    remarks: '',
    targetLocation: '', // '' = Central, 'collegeId' = College
  });

  // ITEM FORM STATE (Current Item being added)
  const [itemData, setItemData] = useState({
    product: '',
    quantity: '',
    purchasePrice: '',
    gstPercent: 0,
  });

  const calcLineTotal = (quantity, purchasePrice, gstPercent = 0) => {
    const qty = Number(quantity) || 0;
    const price = Number(purchasePrice) || 0;
    const gst = Number(gstPercent) || 0;
    return qty * price * (1 + gst / 100);
  };

  // ADDED ITEMS LIST
  const [addedItems, setAddedItems] = useState([]);

  const [vendors, setVendors] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Shared input styles
  const inputCls = 'w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const selectCls = `${inputCls} appearance-none bg-white`;
  const textAreaCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y';

  useEffect(() => {
    fetchVendors();
    fetchColleges();
  }, []);

  // Set default college for SubAdmin
  useEffect(() => {
    if (!isSuperAdmin && currentUser?.assignedCollege) {
      // Handle both populated object and ID string
      const collegeId = typeof currentUser.assignedCollege === 'object'
        ? currentUser.assignedCollege._id
        : currentUser.assignedCollege;
      setFormData(prev => ({ ...prev, targetLocation: collegeId }));
    }
  }, [isSuperAdmin, currentUser]);

  // Update selected product display
  useEffect(() => {
    if (itemData.product) {
      const product = products.find(p => p._id === itemData.product);
      setSelectedProduct(product);
    } else {
      setSelectedProduct(null);
    }
  }, [itemData.product, products]);

  // Fetch college stock to show context
  const [collegeStockMap, setCollegeStockMap] = useState({});

  useEffect(() => {
    const targetId = formData.targetLocation;
    if (targetId) {
      (async () => {
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
        } catch (e) { console.error(e); }
      })();
    } else {
      setCollegeStockMap({});
    }
  }, [formData.targetLocation]);

  const getDisplayStock = (productId) => {
    const product = products.find(p => p._id === productId);
    if (!product) return 'N/A';

    if (formData.targetLocation) {
      return `College: ${collegeStockMap[product._id] || 0}`;
    }
    return `Central: ${product.stock || 0}`;
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(apiUrl('/api/vendors?active=true'));
      if (!res.ok) throw new Error('Failed to load vendors');
      const data = await res.json();
      setVendors(data);
    } catch (err) {
      console.error('Error fetching vendors:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load vendors' });
    }
  };

  const fetchColleges = async () => {
    try {
      const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
      if (!res.ok) throw new Error(`Failed to load colleges (${res.status})`);
      const data = await res.json();
      setColleges(data);
    } catch (err) {
      console.error('Error fetching colleges:', err);
      setStatusMsg({ type: 'error', message: 'Failed to load colleges list' });
    }
  };

  // HANDLERS
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (e) => {
    const { name, value } = e.target;
    setItemData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddItem = () => {
    if (!itemData.product || !itemData.quantity || Number(itemData.quantity) < 1) {
      setStatusMsg({ type: 'error', message: 'Please select a product and valid quantity.' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 2000);
      return;
    }

    // Check for duplicate in list
    if (addedItems.some(item => item.product === itemData.product)) {
      setStatusMsg({ type: 'error', message: 'This product is already in the list.' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 2000);
      return;
    }

    const productObj = products.find(p => p._id === itemData.product);

    const itemQty = Number(itemData.quantity);
    const itemPrice = Number(itemData.purchasePrice) || 0;
    const itemGst = Number(itemData.gstPercent) || 0;

    const newItem = {
      ...itemData,
      productName: productObj?.name || 'Unknown',
      quantity: itemQty,
      purchasePrice: itemPrice,
      gstPercent: itemGst,
      total: calcLineTotal(itemQty, itemPrice, itemGst),
    };

    setAddedItems([...addedItems, newItem]);
    setItemData({ product: '', quantity: '', purchasePrice: '', gstPercent: 0 });
  };

  const handleRemoveItem = (index) => {
    const newItems = [...addedItems];
    newItems.splice(index, 1);
    setAddedItems(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canEdit) {
      setStatusMsg({ type: 'error', message: 'You do not have permission to add stock entries' });
      return;
    }

    if (!isSuperAdmin) {
      const userCollegeId = currentUser.assignedCollege
        ? (typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege)
        : null;

      if (String(formData.targetLocation || '') !== String(userCollegeId || '')) {
        setStatusMsg({ type: 'error', message: 'You can only add stock to your assigned college.' });
        return;
      }
    }

    if (!formData.vendor) {
      setStatusMsg({ type: 'error', message: 'Vendor is required.' });
      return;
    }

    if (addedItems.length === 0) {
      setStatusMsg({ type: 'error', message: 'Please add at least one product to the list.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        vendor: formData.vendor,
        invoiceNumber: formData.invoiceNumber || '',
        invoiceDate: formData.invoiceDate || new Date().toISOString(),
        remarks: formData.remarks || '',
        college: formData.targetLocation || null,
        createdBy: currentUser?.name || 'System',
        items: addedItems.map(i => ({
          product: i.product,
          quantity: i.quantity,
          purchasePrice: i.purchasePrice,
          gstPercent: i.gstPercent || 0,
        }))
      };

      const res = await fetch(apiUrl('/api/stock-entries'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to add stock');
      }

      // Success
      setStatusMsg({ type: 'success', message: 'Stock added successfully!' });

      // Clear Form
      setAddedItems([]);
      setFormData(prev => ({
        ...prev,
        invoiceNumber: '',
        remarks: '',
        invoiceDate: getTodayStr(),
        // Keep vendor and location as user might perform multiple entries from same source
      }));

      // Trigger Updates
      if (formData.targetLocation) {
        // Refetch college stock logic
        const targetId = formData.targetLocation;
        fetch(apiUrl(`/api/stock-transfers/colleges/${targetId}/stock`))
          .then(r => r.json())
          .then(data => {
            const map = {};
            (data.stock || []).forEach(item => {
              const pId = typeof item.product === 'object' ? item.product._id : item.product;
              map[pId] = item.quantity;
            });
            setCollegeStockMap(map);
          });
      }

      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (err) {
      console.error('Error adding stock:', err);
      setStatusMsg({ type: 'error', message: err.message || 'Failed to add stock' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-md">
            <Plus size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add Stock</h2>
            <p className="text-gray-600 text-sm mt-1">Record new stock entries into Central or College inventory</p>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg.message && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${statusMsg.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {statusMsg.message}
          </div>
        </div>
      )}

      {/* Main Grid: Left (Invoice Info) | Right (Items) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Invoice Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-blue-500" /> Invoice Details
            </h3>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* Target Location */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Receive At</label>
                <div className="relative">
                  {isSuperAdmin ? (
                    <>
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <select
                        name="targetLocation"
                        value={formData.targetLocation}
                        onChange={handleInputChange}
                        className={selectCls}
                      >
                        <option value="">Central Warehouse (Global)</option>
                        {colleges.map(college => (
                          <option key={college._id} value={college._id}>{college.name}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <div className="w-full pl-3 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 flex items-center gap-2">
                      <Building2 size={16} className="text-blue-500" />
                      <span className="font-medium">
                        {formData.targetLocation === ''
                          ? 'Central Warehouse (Global)'
                          : (colleges.find(c => c._id === formData.targetLocation)?.name || 'Loading College...')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Vendor */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Vendor <span className="text-red-500">*</span></label>
                <select
                  name="vendor"
                  value={formData.vendor}
                  onChange={handleInputChange}
                  className={selectCls}
                  required
                >
                  <option value="">Select Vendor</option>
                  {vendors.map(vendor => (
                    <option key={vendor._id} value={vendor._id}>{vendor.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice Number */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Invoice Number</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={formData.invoiceNumber}
                    onChange={handleInputChange}
                    placeholder="INV-001"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="date"
                    name="invoiceDate"
                    value={formData.invoiceDate}
                    onChange={handleInputChange}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Remarks</label>
                <textarea
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleInputChange}
                  rows="3"
                  className={textAreaCls}
                  placeholder="Optional notes..."
                ></textarea>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Add Items & List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Add Item Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={18} className="text-blue-500" /> Add Products
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Product Select */}
              <div className="md:col-span-4 space-y-2">
                <label className="block text-sm font-medium text-gray-800">Product</label>
                <select
                  name="product"
                  value={itemData.product}
                  onChange={handleItemChange}
                  className={selectCls}
                >
                  <option value="">Select Product</option>
                  {products.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
                {selectedProduct && (
                  <p className="text-xs text-blue-600 font-medium">
                    Current Stock: {getDisplayStock(selectedProduct._id)}
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm font-medium text-gray-800">Qty</label>
                <input
                  type="number"
                  name="quantity"
                  value={itemData.quantity}
                  onChange={handleItemChange}
                  min="1"
                  className={inputCls}
                  placeholder="0"
                />
              </div>

              {/* Price (excl. GST) */}
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm font-medium text-gray-800">Unit Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="number"
                    name="purchasePrice"
                    value={itemData.purchasePrice}
                    onChange={handleItemChange}
                    min="0"
                    step="0.01"
                    className={`${inputCls} pl-8`}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* GST % */}
              <div className="md:col-span-2 space-y-2">
                <label className="block text-sm font-medium text-gray-800">GST %</label>
                <input
                  type="number"
                  name="gstPercent"
                  value={itemData.gstPercent}
                  onChange={handleItemChange}
                  min="0"
                  step="0.1"
                  className={inputCls}
                  placeholder="0"
                />
              </div>

              {/* Add Button */}
              <div className="md:col-span-1">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full h-[42px] bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 flex items-center justify-center transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800">Items ({addedItems.length})</h3>
              <span className="text-sm font-medium text-gray-600">
                Total: ₹{addedItems.reduce((acc, curr) => acc + curr.total, 0).toLocaleString()}
              </span>
            </div>

            {addedItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Package size={48} className="mx-auto text-gray-300 mb-3 opacity-50" />
                <p>No items added yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium text-right">Qty</th>
                      <th className="px-6 py-3 font-medium text-right">Price</th>
                      <th className="px-6 py-3 font-medium text-right">GST %</th>
                      <th className="px-6 py-3 font-medium text-right">Total</th>
                      <th className="px-6 py-3 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {addedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">{item.productName}</td>
                        <td className="px-6 py-3 text-right">{item.quantity}</td>
                        <td className="px-6 py-3 text-right">₹{item.purchasePrice}</td>
                        <td className="px-6 py-3 text-right">{item.gstPercent || 0}%</td>
                        <td className="px-6 py-3 text-right">₹{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                          >
                            <Plus size={18} className="rotate-45" /> {/* X icon via rotation */}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Submit Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || addedItems.length === 0}
                className={`px-6 py-2.5 rounded-lg flex items-center gap-2 text-white font-medium shadow-sm transition-all
                                ${loading || addedItems.length === 0
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95'
                  }`}
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save Stock Entry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


export default AddStock;
