import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, DollarSign, PieChart, Calendar, ChevronLeft, ChevronRight, Download, Filter, Search, FileText, Building2, ChevronDown, Package, AlertCircle } from 'lucide-react';
import { apiUrl } from '../utils/api';

const ProfitReport = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState('monthly'); // 'monthly', 'daily'
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({
        monthly: [],
        daily: [],
        summary: { totalRevenue: 0, totalCOGS: 0, grossProfit: 0, margin: 0, totalTransactions: 0 },
        availableMonths: []
    });
    const [expandedProducts, setExpandedProducts] = useState(new Set()); // Track expanded products in sets: "date-productId"
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        collegeId: ''
    });
    const [tableMonth, setTableMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [colleges, setColleges] = useState([]);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const isSuperAdmin = currentUser?.role === 'Administrator';

    const monthOptions = useMemo(() => {
        const optionsMap = new Map();

        // Add current month always
        const now = new Date();
        const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        optionsMap.set(currentMonthVal, now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));

        // Add backend available months
        (data.availableMonths || []).forEach(m => {
            if (!optionsMap.has(m)) {
                const [year, month] = m.split('-');
                const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                optionsMap.set(m, d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
            }
        });

        return Array.from(optionsMap.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => b.value.localeCompare(a.value));
    }, [data.availableMonths]);

    const filteredDailyData = useMemo(() => {
        if (!tableMonth) return data.daily;
        return data.daily.filter(row => row.date && row.date.startsWith(tableMonth));
    }, [data.daily, tableMonth]);



    useEffect(() => {
        fetchColleges();
        fetchProfitStats();
    }, [filters]);

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

    const fetchProfitStats = async () => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams();
            if (filters.startDate) queryParams.append('startDate', filters.startDate);
            if (filters.endDate) queryParams.append('endDate', filters.endDate);
            if (filters.collegeId) queryParams.append('collegeId', filters.collegeId);

            const res = await fetch(apiUrl(`/api/profit/stats?${queryParams.toString()}`));
            if (res.ok) {
                const stats = await res.json();
                setData(stats);
            }
        } catch (err) {
            console.error('Error fetching profit stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const formatDisplayDate = (dateStr, isMonthly = false) => {
        if (!dateStr) return 'N/A';
        try {
            if (isMonthly) {
                const [year, month] = dateStr.split('-');
                const date = new Date(year, parseInt(month) - 1);
                return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            }
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    };

    const toggleRow = (id) => {
        const newExpandedRows = new Set(expandedRows);
        if (newExpandedRows.has(id)) {
            newExpandedRows.delete(id);
        } else {
            newExpandedRows.add(id);
        }
        setExpandedRows(newExpandedRows);
    };

    const toggleProduct = (date, productId) => {
        const key = `${date}-${productId}`;
        const newExpandedProducts = new Set(expandedProducts);
        if (newExpandedProducts.has(key)) {
            newExpandedProducts.delete(key);
        } else {
            newExpandedProducts.add(key);
        }
        setExpandedProducts(newExpandedProducts);
    };

    const StatCard = ({ title, value, icon: Icon, gradient, subtext, subIcon: SubIcon }) => (
        <div className={`bg-gradient-to-br ${gradient} rounded-xl shadow-lg p-6 text-white transition-all hover:scale-105 duration-300`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wide font-semibold mb-1 text-white/90">{title}</p>
                    <p className="text-2xl font-bold text-white">{value}</p>
                    {subtext && (
                        <div className="flex items-center gap-1 mt-2 text-xs font-medium text-white/90">
                            {SubIcon && <SubIcon size={12} />}
                            <span>{subtext}</span>
                        </div>
                    )}
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <Icon size={24} className="text-white" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto">
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                                <TrendingUp className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Profit Report</h1>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-4">
                            {/* College Selector */}
                            {isSuperAdmin && (
                                <div className="relative min-w-[200px]">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <select
                                        value={filters.collegeId}
                                        onChange={(e) => setFilters(prev => ({ ...prev, collegeId: e.target.value }))}
                                        className="w-full pl-10 pr-10 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none cursor-pointer text-sm font-medium"
                                    >
                                        <option value="">All Colleges</option>
                                        {colleges.map(college => (
                                            <option key={college._id} value={college._id}>{college.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <ChevronDown size={16} />
                                    </div>
                                </div>
                            )}

                            {/* Tab Navigation */}
                            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveTab('monthly')}
                                    className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${activeTab === 'monthly'
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <FileText size={16} />
                                        <span>Monthly</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setActiveTab('daily')}
                                    className={`px-4 py-2 text-sm font-medium transition-colors rounded-md ${activeTab === 'daily'
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Calendar size={16} />
                                        <span>Daily</span>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={fetchProfitStats}
                                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-lg hover:shadow-xl font-medium whitespace-nowrap"
                            >
                                <TrendingUp size={18} />
                                Refresh Data
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">

                    {/* Statistics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Total Revenue"
                            value={formatCurrency(data.summary?.totalRevenue)}
                            icon={DollarSign}
                            gradient="from-blue-500 to-blue-600"
                            subtext={`${data.summary?.totalTransactions || 0} Transactions (without transfers)`}
                        />
                        <StatCard
                            title="Total COGS"
                            value={formatCurrency(data.summary?.totalCOGS)}
                            icon={Package}
                            gradient="from-amber-500 to-amber-600"
                            subtext="Cost of Goods Sold"
                        />
                        <StatCard
                            title="Gross Profit"
                            value={formatCurrency(data.summary?.grossProfit)}
                            icon={TrendingUp}
                            gradient="from-emerald-500 to-emerald-600"
                            subIcon={TrendingUp}
                            subtext="Gross Earnings"
                        />
                        <StatCard
                            title="Profit Margin"
                            value={`${Number(data.summary?.margin || 0).toFixed(2)}%`}
                            icon={PieChart}
                            gradient="from-purple-500 to-purple-600"
                            subtext="Average Operating Margin"
                        />
                    </div>

                    {/* Main Table Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">{activeTab === 'monthly' ? 'Monthly Profit Breakdown' : 'Daily Profit Breakdown'}</h3>
                                <p className="text-sm text-gray-500">Detailed financial performance by {activeTab === 'monthly' ? 'month' : 'day'}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                {activeTab === 'daily' && (
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600" size={14} />
                                            <select
                                                value={tableMonth}
                                                onChange={(e) => setTableMonth(e.target.value)}
                                                className="pl-8 pr-8 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm cursor-pointer appearance-none"
                                            >
                                                <option value="">All Time</option>
                                                {monthOptions.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                <ChevronDown size={12} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
                                    {activeTab === 'monthly' ? data.monthly.length : filteredDailyData.length} records
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-widest">{activeTab === 'monthly' ? 'Month' : 'Date'}</th>
                                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Txns</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">Revenue</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">COGS</th>
                                        <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-widest">Profit</th>
                                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">Margin</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-12 text-center text-gray-500 font-medium">
                                                <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4"></div>
                                                Calculating profit statistics...
                                            </td>
                                        </tr>
                                    ) : (activeTab === 'monthly' ? data.monthly : filteredDailyData).length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                                <div className="text-4xl mb-4">📊</div>
                                                <p className="font-semibold text-gray-900">No data available</p>
                                                <p className="text-sm">Try adjusting your filters or date range</p>
                                            </td>
                                        </tr>
                                    ) : (activeTab === 'monthly' ? data.monthly : filteredDailyData).map((row, idx) => {
                                        const margin = row.revenue > 0 ? ((row.revenue - row.cogs) / row.revenue) * 100 : 0;
                                        const rowId = activeTab === 'monthly' ? row.month : row.date;
                                        const isExpanded = expandedRows.has(rowId);

                                        return (
                                            <React.Fragment key={idx}>
                                                <tr
                                                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-emerald-50/30' : ''}`}
                                                    onClick={() => toggleRow(rowId)}
                                                >
                                                    <td className="px-6 py-4 font-bold text-gray-900">
                                                        <div className="flex items-center gap-2">
                                                            <ChevronRight
                                                                size={16}
                                                                className={`text-emerald-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                                            />
                                                            {formatDisplayDate(activeTab === 'monthly' ? row.month : row.date, activeTab === 'monthly')}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center text-gray-600 font-medium">{row.count}</td>
                                                    <td className="px-6 py-4 text-right text-blue-700 font-bold">{formatCurrency(row.revenue)}</td>
                                                    <td className="px-6 py-4 text-right text-amber-700 font-semibold">{formatCurrency(row.cogs)}</td>
                                                    <td className={`px-6 py-4 text-right font-bold ${row.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                        {formatCurrency(row.profit)}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${margin >= 20 ? 'bg-emerald-100 text-emerald-800' : margin >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                                            {margin.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-white border-b border-gray-100">
                                                        <td colSpan="6" className="px-8 py-4">
                                                            <div className="bg-emerald-50/20 rounded-xl border border-emerald-100/50 overflow-hidden shadow-inner">
                                                                <div className="px-4 py-2 bg-emerald-50/50 border-b border-emerald-100/30 text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                                                                    Product Breakdown
                                                                </div>
                                                                <table className="w-full">
                                                                    <thead>
                                                                        <tr className="text-left">
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase">Product Name</th>
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Qty</th>
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Revenue</th>
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase text-right">COGS</th>
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Profit</th>
                                                                            <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Margin</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-emerald-100/20">
                                                                        {(row.items || []).map((item, pIdx) => {
                                                                            const itemMargin = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
                                                                            const productKey = `${rowId}-${item.productId}`;
                                                                            const isProductExpanded = expandedProducts.has(productKey);

                                                                            return (
                                                                                <React.Fragment key={pIdx}>
                                                                                    <tr
                                                                                        className={`hover:bg-emerald-50/40 transition-colors ${item.isSet ? 'cursor-pointer' : ''}`}
                                                                                        onClick={() => item.isSet && toggleProduct(rowId, item.productId)}
                                                                                    >
                                                                                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">
                                                                                            <div className="flex items-center gap-2">
                                                                                                {item.isSet && (
                                                                                                    <ChevronRight size={12} className={`text-emerald-500 transition-transform ${isProductExpanded ? 'rotate-90' : ''}`} />
                                                                                                )}
                                                                                                {item.name}
                                                                                                {item.isSet && (
                                                                                                    <span className="bg-blue-50 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-tighter">Set</span>
                                                                                                )}
                                                                                            </div>
                                                                                        </td>
                                                                                        <td className="px-4 py-2.5 text-xs text-center text-gray-500 font-medium">{item.quantity}</td>
                                                                                        <td className="px-4 py-2.5 text-xs text-right text-blue-600 font-bold">{formatCurrency(item.revenue)}</td>
                                                                                        <td className="px-4 py-2.5 text-xs text-right text-amber-600 font-semibold">{formatCurrency(item.cogs)}</td>
                                                                                        <td className={`px-4 py-2.5 text-xs text-right font-bold ${item.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                                            {formatCurrency(item.profit)}
                                                                                        </td>
                                                                                        <td className="px-4 py-2.5 text-center">
                                                                                            <span className={`text-[10px] font-bold ${itemMargin >= 15 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                                                {itemMargin.toFixed(1)}%
                                                                                            </span>
                                                                                        </td>
                                                                                    </tr>
                                                                                    {isProductExpanded && item.isSet && (
                                                                                        <tr>
                                                                                            <td colSpan="6" className="px-6 py-2">
                                                                                                <div className="bg-white/50 rounded-lg border border-emerald-100/30 overflow-hidden">
                                                                                                    <table className="w-full">
                                                                                                        <thead className="bg-emerald-50/30">
                                                                                                            <tr>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-left">Component</th>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-center">Qty</th>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-right">Revenue</th>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-right">COGS</th>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-right">Profit</th>
                                                                                                                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-600 uppercase text-center">Margin</th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody className="divide-y divide-gray-50">
                                                                                                            {(item.components || []).map((comp, cIdx) => {
                                                                                                                const compMargin = comp.revenue > 0 ? (comp.profit / comp.revenue) * 100 : 0;
                                                                                                                return (
                                                                                                                    <tr key={cIdx}>
                                                                                                                        <td className="px-3 py-1.5 text-[10px] text-gray-800 font-medium pl-6">{comp.name}</td>
                                                                                                                        <td className="px-3 py-1.5 text-[10px] text-center text-gray-700 font-medium">{comp.quantity}</td>
                                                                                                                        <td className="px-3 py-1.5 text-[10px] text-right text-gray-700 font-medium">{formatCurrency(comp.revenue)}</td>
                                                                                                                        <td className="px-3 py-1.5 text-[10px] text-right text-amber-700 font-medium">{formatCurrency(comp.cogs)}</td>
                                                                                                                        <td className={`px-3 py-1.5 text-[10px] text-right font-medium ${comp.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                                                                                            {formatCurrency(comp.profit)}
                                                                                                                        </td>
                                                                                                                        <td className="px-3 py-1.5 text-center">
                                                                                                                            <span className="text-[9px] text-gray-700 font-medium">{compMargin.toFixed(1)}%</span>
                                                                                                                        </td>
                                                                                                                    </tr>
                                                                                                                );
                                                                                                            })}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfitReport;
