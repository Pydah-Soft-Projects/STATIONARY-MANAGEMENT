import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, ChevronLeft, ChevronRight, Loader2, Briefcase } from 'lucide-react';
import { apiUrl } from '../utils/api';
import useOnlineStatus from '../hooks/useOnlineStatus';

const EmployeeDashboard = ({ currentUser }) => {
    const navigate = useNavigate();
    const isOnline = useOnlineStatus();

    // -- State --
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Metadata for filters
    const [divisions, setDivisions] = useState([]);
    const [departments, setDepartments] = useState([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedDivision, setSelectedDivision] = useState('all');
    const [selectedDepartment, setSelectedDepartment] = useState('all');

    // Pagination
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 25,
        totalPages: 0,
        totalRecords: 0
    });

    const searchTimeoutRef = useRef(null);

    // -- Effects --

    // 0. Fetch Metadata
    const fetchMetadata = useCallback(async () => {
        try {
            const [divRes, deptRes] = await Promise.all([
                fetch(apiUrl('/api/employees/metadata/divisions')),
                fetch(apiUrl('/api/employees/metadata/departments'))
            ]);

            if (divRes.ok) setDivisions(await divRes.json());
            if (deptRes.ok) setDepartments(await deptRes.json());
        } catch (err) {
            console.error('Failed to fetch employee metadata:', err);
        }
    }, []);

    useEffect(() => {
        fetchMetadata();
    }, [fetchMetadata]);

    // 1. Debounce Search
    useEffect(() => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            if (searchTerm !== debouncedSearchTerm) {
                setPagination(prev => ({ ...prev, page: 1 }));
            }
        }, 500);
        return () => clearTimeout(searchTimeoutRef.current);
    }, [searchTerm]);

    // 2. Fetch Employees
    const fetchEmployees = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({
                page: pagination.page,
                limit: pagination.limit,
                search: debouncedSearchTerm,
                division: selectedDivision,
                department: selectedDepartment,
            });

            const res = await fetch(apiUrl(`/api/employees?${params.toString()}`));
            if (res.ok) {
                const data = await res.json();
                setEmployees(Array.isArray(data.rows) ? data.rows : []);
                setPagination(prev => ({
                    ...prev,
                    totalRecords: data.count || 0,
                    totalPages: data.pagination?.totalPages || 0
                }));
            } else {
                setEmployees([]);
            }
        } catch (err) {
            console.error('Failed to fetch employees:', err);
            setEmployees([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [debouncedSearchTerm, pagination.page, pagination.limit, selectedDivision, selectedDepartment]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            setPagination(prev => ({ ...prev, page: newPage }));
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
                            <Briefcase size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Employee Dashboard</h1>
                            <p className="text-gray-600 mt-1">
                                View employee records from HRMS
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters Section */}
                <div className="mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search Name or ID..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Division Filters */}
                        <select
                            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            value={selectedDivision}
                            onChange={(e) => {
                                setSelectedDivision(e.target.value);
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                        >
                            <option value="all">All Divisions</option>
                            {divisions.map(div => (
                                <option key={div} value={div}>{div}</option>
                            ))}
                        </select>

                        {/* Department Filters */}
                        <select
                            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            value={selectedDepartment}
                            onChange={(e) => {
                                setSelectedDepartment(e.target.value);
                                setPagination(prev => ({ ...prev, page: 1 }));
                            }}
                        >
                            <option value="all">All Departments</option>
                            {departments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table Content */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-700 font-semibold">
                            <span>Employee List</span>
                            {pagination.totalRecords > 0 && (
                                <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                                    {pagination.totalRecords}
                                </span>
                            )}
                        </div>
                        {refreshing && <Loader2 className="animate-spin text-indigo-600" size={20} />}
                    </div>

                    <div className="overflow-x-auto min-h-[400px]">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24">
                                <Loader2 className="animate-spin text-indigo-600 mb-4" size={40} />
                                <p className="text-gray-500 font-medium">Loading records...</p>
                            </div>
                        ) : employees.length === 0 ? (
                            <div className="text-center py-24">
                                <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                <p className="text-gray-500 font-medium">No employees found matching your search.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left font-medium">
                                <thead>
                                    <tr className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-6 py-4">Employee ID</th>
                                        <th className="px-6 py-4">Division</th>
                                        <th className="px-6 py-4">Department</th>
                                        <th className="px-6 py-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {employees.map((emp) => (
                                        <tr
                                            key={emp.id}
                                            className="hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                                            onClick={() => navigate(`/employees/${emp.id}`)}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shadow-sm group-hover:scale-110 transition-transform">
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold text-gray-900">{emp.name}</div>
                                                        <div className="text-xs text-gray-400">{emp.designation}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-mono">
                                                    {emp.empNo}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{emp.division}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600">{emp.department}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${emp.status === 'Active'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {emp.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <div className="text-sm text-gray-500">
                                Showing page {pagination.page} of {pagination.totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    onClick={() => handlePageChange(pagination.page - 1)}
                                    disabled={pagination.page === 1}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="flex items-center gap-1">
                                    {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                                        let pageNum = i + 1;
                                        // Simple sliding window for pagination
                                        if (pagination.totalPages > 5 && pagination.page > 3) {
                                            pageNum = pagination.page - 3 + i + 1;
                                            if (pageNum > pagination.totalPages) pageNum = pagination.totalPages - (4 - i);
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${pagination.page === pageNum
                                                        ? 'bg-indigo-600 text-white shadow-md scale-105'
                                                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                                    }`}
                                                onClick={() => handlePageChange(pageNum)}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    onClick={() => handlePageChange(pagination.page + 1)}
                                    disabled={pagination.page === pagination.totalPages}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeDashboard;
