import { useState, useEffect } from 'react';
import { Plus, Building2, Edit, Trash2, Mail, Phone, MapPin, FileText, Search, X, History, Package, Calendar, DollarSign } from 'lucide-react';
import { apiUrl } from '../../utils/api';
import { hasFullAccess } from '../../utils/permissions';

const VendorManagement = ({ currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];
  
  // Check for legacy manage-stock permission
  const hasLegacyPermission = permissions.some(p => {
    if (typeof p !== 'string') return false;
    return p === 'manage-stock' || p.startsWith('manage-stock:');
  });
  
  const canEdit = isSuperAdmin || hasLegacyPermission || hasFullAccess(permissions, 'stock-vendors');
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [stockEntries, setStockEntries] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    gstNumber: '',
    paymentTerms: '',
    remarks: '',
    isActive: true,
    accountHolderName: '',
    bankName: '',
    branchName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/vendors'));
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
      }
    } catch (err) {
      console.error('Error fetching vendors:', err);
      setStatusMsg({ type: 'error', message: 'Failed to fetch vendors' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.name.trim()) {
      setStatusMsg({ type: 'error', message: 'Vendor name is required' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      return;
    }

    setLoading(true);
    try {
      const url = editingVendor 
        ? apiUrl(`/api/vendors/${editingVendor._id}`)
        : apiUrl('/api/vendors');
      
      const method = editingVendor ? 'PUT' : 'POST';
      
      const payload = {
        name: formData.name,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        gstNumber: formData.gstNumber,
        paymentTerms: formData.paymentTerms,
        remarks: formData.remarks,
        isActive: formData.isActive,
        bankDetails: {
          accountHolderName: formData.accountHolderName,
          bankName: formData.bankName,
          branchName: formData.branchName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          upiId: formData.upiId,
        },
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to save vendor');
      }

      const savedVendor = await res.json();
      
      if (editingVendor) {
        setVendors(prev => prev.map(v => v._id === savedVendor._id ? savedVendor : v));
        setStatusMsg({ type: 'success', message: 'Vendor updated successfully!' });
      } else {
        setVendors(prev => [savedVendor, ...prev]);
        setStatusMsg({ type: 'success', message: 'Vendor added successfully!' });
      }

      resetForm();
      setShowModal(false);
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (err) {
      console.error('Error saving vendor:', err);
      setStatusMsg({ type: 'error', message: err.message || 'Failed to save vendor' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || '',
      contactPerson: vendor.contactPerson || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      gstNumber: vendor.gstNumber || '',
      paymentTerms: vendor.paymentTerms || '',
      remarks: vendor.remarks || '',
      isActive: vendor.isActive !== undefined ? vendor.isActive : true,
      accountHolderName: vendor.bankDetails?.accountHolderName || '',
      bankName: vendor.bankDetails?.bankName || '',
      branchName: vendor.bankDetails?.branchName || '',
      accountNumber: vendor.bankDetails?.accountNumber || '',
      ifscCode: vendor.bankDetails?.ifscCode || '',
      upiId: vendor.bankDetails?.upiId || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (vendorId, vendorName) => {
    if (!window.confirm(`Are you sure you want to delete "${vendorName}"?`)) return;
    
    try {
      const res = await fetch(apiUrl(`/api/vendors/${vendorId}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete vendor');
      
      setVendors(prev => prev.filter(v => v._id !== vendorId));
      setStatusMsg({ type: 'success', message: 'Vendor deleted successfully!' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (err) {
      console.error('Error deleting vendor:', err);
      setStatusMsg({ type: 'error', message: 'Failed to delete vendor' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      gstNumber: '',
      paymentTerms: '',
      remarks: '',
      isActive: true,
      accountHolderName: '',
      bankName: '',
      branchName: '',
      accountNumber: '',
      ifscCode: '',
      upiId: '',
    });
    setEditingVendor(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const filteredVendors = vendors.filter(vendor => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      vendor.name?.toLowerCase().includes(query) ||
      vendor.contactPerson?.toLowerCase().includes(query) ||
      vendor.email?.toLowerCase().includes(query) ||
      vendor.phone?.toLowerCase().includes(query) ||
      vendor.bankDetails?.accountNumber?.toLowerCase?.().includes(query) ||
      vendor.bankDetails?.ifscCode?.toLowerCase?.().includes(query) ||
      vendor.bankDetails?.upiId?.toLowerCase?.().includes(query)
    );
  });

  const handleViewHistory = async (vendor) => {
    setSelectedVendor(vendor);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(apiUrl(`/api/stock-entries?vendor=${vendor._id}`));
      if (res.ok) {
        const data = await res.json();
        setStockEntries(data);
      }
    } catch (err) {
      console.error('Error fetching stock entries:', err);
      setStatusMsg({ type: 'error', message: 'Failed to fetch stock history' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setLoadingHistory(false);
    }
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

  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toFixed(2)}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Vendor Management</h2>
            <p className="text-gray-600 text-sm mt-1">Manage your vendor information and contacts</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg font-medium"
          >
            <Plus size={20} />
            Add New Vendor
          </button>
        )}
      </div>

      {/* Status Message */}
      {statusMsg.message && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-medium ${
          statusMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {statusMsg.message}
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />
          </div>
        </div>
      </div>

      {/* Vendors Grid */}
      {loading && vendors.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading vendors...</p>
        </div>
      ) : filteredVendors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVendors.map((vendor) => (
            <div 
              key={vendor._id} 
              className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all duration-200 hover:shadow-md ${
                vendor.isActive ? 'border-gray-200 hover:border-blue-300' : 'border-gray-300 opacity-75'
              }`}
            >
              {/* Vendor Header */}
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {vendor.name}
                    </h3>
                    {vendor.contactPerson && (
                      <p className="text-sm text-gray-600">
                        Contact: {vendor.contactPerson}
                      </p>
                    )}
                  </div>
                  {!vendor.isActive && (
                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium ml-2">
                      Inactive
                    </span>
                  )}
                </div>
              </div>

              {/* Vendor Info */}
              <div className="p-6 space-y-3">
                {vendor.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={16} className="text-gray-400" />
                    <span className="text-gray-600 truncate">{vendor.email}</span>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={16} className="text-gray-400" />
                    <span className="text-gray-600">{vendor.phone}</span>
                  </div>
                )}
                {vendor.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={16} className="text-gray-400 mt-0.5" />
                    <span className="text-gray-600 line-clamp-2">{vendor.address}</span>
                  </div>
                )}
                {vendor.gstNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-gray-600">GST: {vendor.gstNumber}</span>
                  </div>
                )}
                {vendor.paymentTerms && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Payment Terms:</p>
                    <p className="text-sm text-gray-700">{vendor.paymentTerms}</p>
                  </div>
                )}
                {(vendor.bankDetails && (vendor.bankDetails.accountHolderName || vendor.bankDetails.bankName || vendor.bankDetails.accountNumber || vendor.bankDetails.upiId)) && (
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <p className="text-xs text-gray-500 mb-1">Bank Details:</p>
                    {vendor.bankDetails.accountHolderName && (
                      <p className="text-xs text-gray-600">Account Holder: <span className="font-medium">{vendor.bankDetails.accountHolderName}</span></p>
                    )}
                    {vendor.bankDetails.bankName && (
                      <p className="text-xs text-gray-600">
                        Bank: <span className="font-medium">{vendor.bankDetails.bankName}{vendor.bankDetails.branchName ? `, ${vendor.bankDetails.branchName}` : ''}</span>
                      </p>
                    )}
                    {vendor.bankDetails.accountNumber && (
                      <p className="text-xs text-gray-600">Account No: <span className="font-medium">{vendor.bankDetails.accountNumber}</span></p>
                    )}
                    {vendor.bankDetails.ifscCode && (
                      <p className="text-xs text-gray-600">IFSC: <span className="font-medium">{vendor.bankDetails.ifscCode}</span></p>
                    )}
                    {vendor.bankDetails.upiId && (
                      <p className="text-xs text-gray-600">UPI ID: <span className="font-medium">{vendor.bankDetails.upiId}</span></p>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-6 pt-0 flex gap-2">
                <button
                  onClick={() => handleViewHistory(vendor)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm"
                >
                  <History size={16} />
                  History
                </button>
                {canEdit ? (
                  <>
                    <button
                      onClick={() => handleEdit(vendor)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                    >
                      <Edit size={16} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(vendor._id, vendor.name)}
                      className="px-4 py-2.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-medium text-blue-600 bg-blue-100 px-3 py-2 rounded-lg">
                    View Only
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No vendors found</h3>
          <p className="text-gray-600 mb-6">
            {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first vendor'}
          </p>
          {!searchQuery && canEdit && (
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md hover:shadow-lg"
            >
              <Plus size={20} />
              Add Vendor
            </button>
          )}
        </div>
      )}

      {/* Add/Edit Vendor Modal */}
      {showModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold">
                  {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </h3>
                <p className="text-orange-100 text-sm mt-1">
                  {editingVendor ? 'Update vendor information' : 'Fill in all vendor details'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vendor Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter vendor name"
                  required
                />
              </div>

              {/* Contact Person */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Person
                </label>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Contact person name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="vendor@example.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Phone number"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                  placeholder="Vendor address"
                />
              </div>

              {/* GST Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GST Number
                </label>
                <input
                  type="text"
                  name="gstNumber"
                  value={formData.gstNumber}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="GST number"
                />
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Terms
                </label>
                <input
                  type="text"
                  name="paymentTerms"
                  value={formData.paymentTerms}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Net 30, COD, etc."
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remarks
                </label>
                <textarea
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                  placeholder="Any additional notes..."
                />
              </div>

              {/* Bank Details */}
              <div className="pt-2 border-t border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-3">Bank Details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      name="accountHolderName"
                      value={formData.accountHolderName}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Name as per bank"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      name="bankName"
                      value={formData.bankName}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Bank name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      name="branchName"
                      value={formData.branchName}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Branch"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      name="accountNumber"
                      value={formData.accountNumber}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Account number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      name="ifscCode"
                      value={formData.ifscCode}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="IFSC code"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      UPI ID
                    </label>
                    <input
                      type="text"
                      name="upiId"
                      value={formData.upiId}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="UPI ID (optional)"
                    />
                  </div>
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label className="text-sm font-medium text-gray-700">
                  Active Vendor
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.name.trim()}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                >
                  {loading ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Exchange History Modal */}
      {showHistoryModal && selectedVendor && (
        <div className="fixed inset-0 backdrop-blur-sm bg-gray-900 bg-opacity-30 flex items-center justify-center z-50 p-4" onClick={() => {
          setShowHistoryModal(false);
          setSelectedVendor(null);
          setStockEntries([]);
        }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div>
                <h3 className="text-xl font-bold">Stock Exchange History</h3>
                <p className="text-green-100 text-sm mt-1">{selectedVendor.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedVendor(null);
                  setStockEntries([]);
                }}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-6">
              {loadingHistory ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading history...</p>
                </div>
              ) : stockEntries.length > 0 ? (
                <>
                  {/* Summary */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6 border border-blue-100">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Total Entries</p>
                        <p className="text-lg font-bold text-gray-900">{stockEntries.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Total Quantity</p>
                        <p className="text-lg font-bold text-gray-900">
                          {stockEntries.reduce((sum, entry) => sum + (entry.quantity || 0), 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Total Cost</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(stockEntries.reduce((sum, entry) => sum + (entry.totalCost || 0), 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Avg. Price</p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(
                            stockEntries.length > 0
                              ? stockEntries.reduce((sum, entry) => sum + (entry.purchasePrice || 0), 0) / stockEntries.length
                              : 0
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* History List */}
                  <div className="space-y-4">
                    {stockEntries.map((entry) => (
                      <div
                        key={entry._id}
                        className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Package size={16} className="text-gray-400" />
                              <span className="font-semibold text-gray-900">
                                {entry.product?.name || 'N/A'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar size={14} className="text-gray-400" />
                              <span>{formatDate(entry.invoiceDate || entry.createdAt)}</span>
                            </div>
                            {entry.invoiceNumber && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <FileText size={14} className="text-gray-400" />
                                <span>Invoice: {entry.invoiceNumber}</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2 text-right">
                            <div>
                              <span className="text-sm text-gray-600">Quantity: </span>
                              <span className="font-semibold text-gray-900">{entry.quantity || 0}</span>
                            </div>
                            <div>
                              <span className="text-sm text-gray-600">Unit Price: </span>
                              <span className="font-semibold text-gray-900">
                                {formatCurrency(entry.purchasePrice || 0)}
                                {Number(entry.gstPercent) > 0 && ` (+${entry.gstPercent}% GST)`}
                              </span>
                            </div>
                            <div className="pt-2 border-t border-gray-200">
                              <span className="text-sm text-gray-600">Total Cost: </span>
                              <span className="font-bold text-lg text-blue-600">
                                {formatCurrency(entry.totalCost || 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {entry.remarks && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-1">Remarks:</p>
                            <p className="text-sm text-gray-700">{entry.remarks}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Stock History</h3>
                  <p className="text-gray-600">
                    No stock entries found for this vendor
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;

