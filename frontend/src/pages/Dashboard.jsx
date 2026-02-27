import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, Package, ShoppingCart, DollarSign,
  TrendingUp, AlertCircle, Activity, Calendar, ArrowRight,
  CreditCard, Wallet, TrendingDown, FileText, BarChart3, Lock, X, Building2, PackageSearch
} from 'lucide-react';
import { apiUrl } from '../utils/api';

const Dashboard = () => {
  // Get current user from localStorage
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const permissions = currentUser?.permissions || [];
  const hasStudentDashboardPermission = isSuperAdmin || permissions.includes('student-dashboard') || permissions.includes('course-dashboard');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    paidStudents: 0,
    unpaidStudents: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    totalProducts: 0,
    totalStockValue: 0,
    lowStockItems: 0,
    totalVendors: 0,
    todayTransactions: 0,
    todayRevenue: 0,
    zeroStockDuesStudents: 0,
  });
  const [zeroStockDuesData, setZeroStockDuesData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [activeModal, setActiveModal] = useState(null); // 'products', 'stockValue', 'lowStock', 'vendors', 'zeroStock'
  const navigate = useNavigate();

  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState(''); // '' means Central/Global view

  // Load initial view preference for SubAdmins
  useEffect(() => {
    if (!isSuperAdmin && currentUser?.assignedCollege) {
      // Handle both ObjectId string or populated object
      setSelectedCollege(typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege);
    }
  }, [isSuperAdmin, currentUser]);

  // Fetch Colleges
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const res = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));
        if (!res.ok) throw new Error('Failed to load colleges');
        const data = await res.json();
        setColleges(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching colleges:', err);
      }
    };
    fetchColleges();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const statsUrl = selectedCollege
          ? apiUrl(`/api/dashboard/stats?collegeId=${selectedCollege}&t=${Date.now()}`)
          : apiUrl(`/api/dashboard/stats?t=${Date.now()}`);

        const res = await fetch(statsUrl);
        if (!res.ok) throw new Error('Failed to fetch dashboard stats');

        const data = await res.json();

        setStats(data);
        if (data.zeroStockDuesData) setZeroStockDuesData(data.zeroStockDuesData);
        if (data.recentTransactions) setRecentTransactions(data.recentTransactions);

        // Fetch products and vendors (small lists)
        const [productsRes, vendorsRes] = await Promise.all([
          fetch(apiUrl(`/api/products?t=${Date.now()}`)),
          fetch(apiUrl(`/api/vendors?t=${Date.now()}`))
        ]);

        if (productsRes.ok) setProducts(await productsRes.json());
        if (vendorsRes.ok) setVendors(await vendorsRes.json());


        // Cleanup Part 1



      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCollege, colleges]);

  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate low stock products
  const lowStockProducts = products.filter(product => {
    const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 10;
    return (product.stock || 0) < threshold;
  });

  // Calculate products with stock value
  const productsWithValue = products.map(product => ({
    ...product,
    stockValue: (product.stock || 0) * (product.price || 0),
  })).sort((a, b) => b.stockValue - a.stockValue);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Welcome to Stationery Management System</p>
          </div>

          {isSuperAdmin && (
            <div className="relative min-w-[250px]">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none cursor-pointer"
              >
                <option value="">Central Warehouse (Global)</option>
                {colleges.map(college => (
                  <option key={college._id} value={college._id}>
                    {college.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          )}
          {!isSuperAdmin && currentUser?.assignedCollege && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 shadow-sm">
              <Building2 className="text-blue-600" size={18} />
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Campus:</span>
              <span className="text-sm font-bold text-blue-900">
                {colleges.find(c => c._id === (typeof currentUser.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser.assignedCollege))?.name || 'Loading...'}
              </span>
            </div>
          )}
        </div>

        {/* Key Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Students */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Users size={24} />
              </div>
              <TrendingUp size={20} className="opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? (
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                stats.totalStudents.toLocaleString()
              )}
            </div>
            <div className="text-blue-100 text-sm font-medium">Total Students</div>
          </div>

          {/* Total Transactions */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <ShoppingCart size={24} />
              </div>
              <Activity size={20} className="opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? (
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                stats.totalTransactions.toLocaleString()
              )}
            </div>
            <div className="text-purple-100 text-sm font-medium">Total Transactions</div>
          </div>

          {/* Total Revenue */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <DollarSign size={24} />
              </div>
              <TrendingUp size={20} className="opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? (
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                formatCurrency(stats.totalRevenue)
              )}
            </div>
            <div className="text-green-100 text-sm font-medium">Total Revenue (Paid)</div>
          </div>

          {/* Pending Revenue */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <CreditCard size={24} />
              </div>
              <TrendingDown size={20} className="opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {loading ? (
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                formatCurrency(stats.pendingRevenue)
              )}
            </div>
            <div className="text-orange-100 text-sm font-medium">Pending Payments</div>
          </div>
        </div>

        {/* Secondary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Products */}
          <div
            onClick={() => setActiveModal('products')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package size={24} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : stats.totalProducts}
                </div>
                <div className="text-sm text-gray-600">Total Products</div>
              </div>
              <ArrowRight size={20} className="text-gray-400" />
            </div>
          </div>

          {/* Stock Value */}
          <div
            onClick={() => setActiveModal('stockValue')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-green-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <BarChart3 size={24} className="text-green-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : formatCurrency(stats.totalStockValue)}
                </div>
                <div className="text-sm text-gray-600">Stock Value</div>
              </div>
              <ArrowRight size={20} className="text-gray-400" />
            </div>
          </div>

          {/* Low Stock Alert */}
          <div
            onClick={() => setActiveModal('lowStock')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-red-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle size={24} className="text-red-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : stats.lowStockItems}
                </div>
                <div className="text-sm text-gray-600">Low Stock Items</div>
              </div>
              <ArrowRight size={20} className="text-gray-400" />
            </div>
          </div>

          {/* Zero-Stock Dues Card */}
          <div
            onClick={() => setActiveModal('zeroStock')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md hover:border-orange-300 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <PackageSearch size={24} className="text-orange-600" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : stats.zeroStockDuesStudents}
                </div>
                <div className="text-sm text-gray-600">Zero-Stock Dues</div>
              </div>
              <ArrowRight size={20} className="text-gray-400" />
            </div>
          </div>
        </div>

        {/* Today's Performance & Course Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Today's Performance */}
          <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Calendar size={20} className="text-white" />
                </div>
                Today's Performance
              </h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-sm text-teal-100 mb-1">Transactions</p>
                  <p className="text-2xl font-bold text-white">{stats.todayTransactions}</p>
                </div>
                <div className="w-12 h-12 bg-white/30 rounded-lg flex items-center justify-center">
                  <ShoppingCart size={24} className="text-white" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-sm text-teal-100 mb-1">Revenue</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(stats.todayRevenue)}</p>
                </div>
                <div className="w-12 h-12 bg-white/30 rounded-lg flex items-center justify-center">
                  <DollarSign size={24} className="text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Student Overview */}
          <div className={`bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-6 shadow-lg transition-shadow relative ${!hasStudentDashboardPermission ? 'opacity-60' : 'hover:shadow-xl'}`}>
            {!hasStudentDashboardPermission && (
              <div className="absolute inset-0 bg-gray-900/30 rounded-xl flex items-center justify-center z-10 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Lock size={24} className="text-white" />
                  </div>
                  <p className="text-white font-semibold text-sm">Locked</p>
                  <p className="text-indigo-100 text-xs">No access permission</p>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <GraduationCap size={20} className="text-white" />
                </div>
                Student Overview
                {!hasStudentDashboardPermission && (
                  <Lock size={16} className="text-white/80" />
                )}
              </h3>
              {hasStudentDashboardPermission && (
                <button
                  onClick={() => navigate('/students-dashboard')}
                  className="text-sm text-white hover:text-indigo-100 font-medium flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  View Student Dashboard
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-sm text-indigo-100">Total Students</p>
                  <p className="text-2xl font-bold text-white">{stats.totalStudents.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-sm text-indigo-100">Paid Students</p>
                  <p className="text-2xl font-bold text-white">{stats.paidStudents.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <div>
                  <p className="text-sm text-indigo-100">Pending Students</p>
                  <p className="text-2xl font-bold text-white">{stats.unpaidStudents.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <div className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="p-6 border-b border-white/20 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Activity size={20} className="text-white" />
                </div>
                Recent Transactions
              </h3>
              <button
                onClick={() => navigate('/transactions')}
                className="text-sm text-white hover:text-purple-100 font-medium flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                View All
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
                </div>
              ) : recentTransactions.length > 0 ? (
                <div className="space-y-4">
                  {recentTransactions.map((transaction) => (
                    <div
                      key={transaction._id}
                      className="flex items-center justify-between p-4 bg-white/20 rounded-lg hover:bg-white/30 transition-colors cursor-pointer backdrop-blur-sm"
                      onClick={() => navigate('/transactions')}
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-white">{transaction.student?.name || 'N/A'}</p>
                        <p className="text-sm text-purple-100">
                          {transaction.student?.course?.toUpperCase()} • {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-white">{formatCurrency(transaction.totalAmount)}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${transaction.isPaid
                          ? 'bg-green-400/30 text-green-100 border border-green-300/50'
                          : 'bg-red-400/30 text-red-100 border border-red-300/50'
                          }`}>
                          {transaction.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-white/50 mx-auto mb-2" />
                  <p className="text-purple-100">No recent transactions</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="p-6 border-b border-white/20">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Activity size={20} className="text-white" />
                </div>
                Quick Actions
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate('/add-student')}
                  className="flex flex-col items-center justify-center p-4 bg-white/20 rounded-xl hover:bg-white/30 transition-colors group backdrop-blur-sm"
                >
                  <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Users size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">Add Student</span>
                </button>
                <button
                  onClick={() => navigate('/manage-stock')}
                  className="flex flex-col items-center justify-center p-4 bg-white/20 rounded-xl hover:bg-white/30 transition-colors group backdrop-blur-sm"
                >
                  <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Package size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">Manage Stock</span>
                </button>
                <button
                  onClick={() => navigate('/transactions')}
                  className="flex flex-col items-center justify-center p-4 bg-white/20 rounded-xl hover:bg-white/30 transition-colors group backdrop-blur-sm"
                >
                  <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <ShoppingCart size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">Transactions</span>
                </button>
                <button
                  onClick={() => navigate('/student-management')}
                  className="flex flex-col items-center justify-center p-4 bg-white/20 rounded-xl hover:bg-white/30 transition-colors group backdrop-blur-sm"
                >
                  <div className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Activity size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">Manage Students</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {/* Zero-Stock Dues Modal */}
      {activeModal === 'zeroStock' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <PackageSearch size={20} className="text-orange-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Zero-Stock Pending Dues</h2>
                  <p className="text-sm text-gray-500">{zeroStockDuesData.length} students waiting for items</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {zeroStockDuesData.length === 0 ? (
                <div className="text-center py-12">
                  <PackageSearch className="w-16 h-16 text-green-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No pending dues due to zero stock!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {zeroStockDuesData.map((data, idx) => (
                    <div
                      key={idx}
                      className="p-4 border border-gray-200 rounded-lg hover:border-orange-300 transition-colors cursor-pointer"
                      onClick={() => navigate(`/student/${data.studentId}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900">{data.student?.name}</h3>
                          <p className="text-xs text-gray-500 uppercase tracking-wider">
                            {data.student?.studentId} • {data.student?.course} {data.student?.branch ? `(${data.student.branch})` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Paid on {formatDate(data.transactionDate)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {data.items.map((itemName, i) => (
                          <span key={i} className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-semibold rounded border border-orange-100">
                            {itemName}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-end text-orange-600 text-xs font-bold gap-1">
                        View Details <ArrowRight size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Products Modal */}
      {activeModal === 'products' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">All Products</h2>
                  <p className="text-sm text-gray-500">Total: {products.length} products</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {products.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map((product) => (
                    <div key={product._id} className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{product.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${(product.stock || 0) < (product.lowStockThreshold || 10)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                          }`}>
                          Stock: {product.stock || 0}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>Price: {formatCurrency(product.price)}</p>
                        <p>Value: {formatCurrency((product.stock || 0) * (product.price || 0))}</p>
                        {product.forCourse && <p>Course: {product.forCourse}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Value Modal */}
      {activeModal === 'stockValue' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <BarChart3 size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Stock Value Breakdown</h2>
                  <p className="text-sm text-gray-500">Total Value: {formatCurrency(stats.totalStockValue)}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {productsWithValue.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No products found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {productsWithValue.map((product) => (
                        <tr key={product._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{product.stock || 0}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(product.price || 0)}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(product.stockValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan="3" className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">Total Stock Value:</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(stats.totalStockValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Low Stock Items Modal */}
      {activeModal === 'lowStock' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle size={20} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Low Stock Items</h2>
                  <p className="text-sm text-gray-500">{lowStockProducts.length} items need restocking</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">All products are well stocked!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Threshold</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {lowStockProducts.map((product) => {
                        const threshold = typeof product.lowStockThreshold === 'number' ? product.lowStockThreshold : 10;
                        const stock = product.stock || 0;
                        const isOutOfStock = stock === 0;
                        return (
                          <tr key={product._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-semibold ${isOutOfStock ? 'text-red-600' : 'text-orange-600'}`}>
                                {stock}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-right">{threshold}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(product.price || 0)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isOutOfStock
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                                }`}>
                                {isOutOfStock ? 'Out of Stock' : 'Low Stock'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Vendors Modal */}
      {activeModal === 'vendors' && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <GraduationCap size={20} className="text-purple-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">All Vendors</h2>
                  <p className="text-sm text-gray-500">Total: {vendors.length} vendors</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            <div className="p-6">
              {vendors.length === 0 ? (
                <div className="text-center py-12">
                  <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No vendors found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {vendors.map((vendor) => (
                    <div key={vendor._id} className="p-4 border border-gray-200 rounded-lg hover:border-purple-300 transition-colors">
                      <h3 className="font-semibold text-gray-900 mb-2">{vendor.name}</h3>
                      <div className="text-sm text-gray-600 space-y-1">
                        {vendor.email && <p>Email: {vendor.email}</p>}
                        {vendor.phone && <p>Phone: {vendor.phone}</p>}
                        {vendor.address && <p>Address: {vendor.address}</p>}
                        {vendor.contactPerson && <p>Contact: {vendor.contactPerson}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;