import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Package, Receipt, History, Calendar, DollarSign, Printer, Loader2, Briefcase } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { apiUrl } from '../utils/api';
import EmployeeReceiptModal from './EmployeeReceiptModal';

const EmployeeDetail = ({ products = [], setProducts, currentUser, isOnline }) => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [employee, setEmployee] = useState(null);
    const [loadingEmployee, setLoadingEmployee] = useState(false);
    const [error, setError] = useState(null);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [rawTransactions, setRawTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [receiptConfig, setReceiptConfig] = useState({
        receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
        receiptSubheader: 'Stationery Management System',
    });

    // Fetch employee details
    const fetchEmployee = useCallback(async () => {
        setLoadingEmployee(true);
        setError(null);
        try {
            const res = await fetch(apiUrl(`/api/employees/${id}`));
            if (!res.ok) throw new Error('Employee not found');
            const data = await res.json();
            setEmployee(data);
            setAvatarFailed(false);
        } catch (err) {
            console.error("Failed to fetch employee details:", err);
            setError(err.message);
        } finally {
            setLoadingEmployee(false);
        }
    }, [id]);

    // Fetch employee transactions
    const fetchEmployeeTransactions = useCallback(async (forceRefresh = false) => {
        if (!id) return;
        setLoadingTransactions(true);
        try {
            const res = await fetch(apiUrl(`/api/transactions?transactionType=employee&studentId=${id}`));
            if (res.ok) {
                const data = await res.json();
                setRawTransactions(data);
            }
        } catch (err) {
            console.error("Failed to fetch transactions:", err);
        } finally {
            setLoadingTransactions(false);
        }
    }, [id]);

    useEffect(() => {
        fetchEmployee();
        fetchEmployeeTransactions();
    }, [fetchEmployee, fetchEmployeeTransactions]);

    const refreshProducts = useCallback(async () => {
        if (typeof setProducts !== 'function') return;
        try {
            // Determine college ID based on current user
            let collegeId = null;
            if (currentUser?.assignedCollege) {
                collegeId = typeof currentUser.assignedCollege === 'object'
                    ? currentUser.assignedCollege._id
                    : currentUser.assignedCollege;
            } else if (currentUser?.assignedBranch) {
                collegeId = typeof currentUser.assignedBranch === 'object'
                    ? currentUser.assignedBranch._id
                    : currentUser.assignedBranch;
            }

            // Always fetch global products first
            const productsRes = await fetch(apiUrl('/api/products'));
            if (!productsRes.ok) return;
            const globalProducts = await productsRes.json();

            if (collegeId) {
                // Fetch college-specific stock
                const stockRes = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock`));
                if (stockRes.ok) {
                    const stockData = await stockRes.json();
                    const collegeStockMap = {};
                    (stockData.stock || []).forEach(item => {
                        const pId = typeof item.product === 'object' ? item.product._id : item.product;
                        collegeStockMap[pId] = item.quantity;
                    });

                    const productsWithCollegeStock = (globalProducts || []).map(product => ({
                        ...product,
                        stock: collegeStockMap[product._id] !== undefined ? collegeStockMap[product._id] : 0
                    }));
                    setProducts(productsWithCollegeStock);
                } else {
                    const productsWithZeroStock = (globalProducts || []).map(product => ({ ...product, stock: 0 }));
                    setProducts(productsWithZeroStock);
                }
            } else {
                setProducts(globalProducts);
            }
        } catch (err) {
            console.warn('Failed to refresh products:', err);
        }
    }, [setProducts, currentUser]);

    useEffect(() => {
        refreshProducts();
    }, [refreshProducts]);

    useEffect(() => {
        const fetchReceiptSettings = async () => {
            try {
                const response = await fetch(apiUrl('/api/settings'));
                if (response.ok) {
                    const data = await response.json();
                    setReceiptConfig({
                        receiptHeader: data.receiptHeader || 'PYDAH COLLEGE OF ENGINEERING',
                        receiptSubheader: data.receiptSubheader || 'Stationery Management System',
                    });
                }
            } catch (error) {
                console.warn('Could not load receipt settings:', error);
            }
        };
        fetchReceiptSettings();
    }, []);

    if (loadingEmployee) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-600" size={48} />
            </div>
        );
    }

    if (error || !employee) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                        <div className="text-6xl mb-4">❓</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">Employee not found</h2>
                        <p className="text-gray-600 mb-6">{error || "Either the employee doesn't exist or it hasn't loaded yet."}</p>
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            onClick={() => navigate(-1)}
                        >
                            Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const avatarDisplay = employee.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 py-8 px-4">
            <div className="mx-auto space-y-6">
                {/* Header */}
                <header className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-2xl shadow-xl p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-white/80">Employee Profile</p>
                            <h1 className="text-2xl font-bold text-white">{employee.name}</h1>
                            <p className="text-sm text-white/80 mt-1">{employee.designation} • {employee.department} • {employee.division}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 self-end lg:self-center">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm border border-white/20 ${employee.status === 'Active' ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'}`}>
                            {employee.status}
                        </span>
                        <button
                            onClick={() => navigate('/employees-dashboard')}
                            className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-sm font-semibold hover:bg-white/15 transition-colors"
                        >
                            <ArrowLeft size={16} />
                            Back
                        </button>
                        {(currentUser?.role === 'Administrator' || (currentUser?.permissions && currentUser.permissions.some(p => p === 'employee-dashboard:full' || p === 'employee-dashboard'))) && (
                            <button
                                onClick={() => setShowTransactionModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-800 rounded-xl hover:bg-blue-50 transition-all font-semibold shadow-lg"
                            >
                                <Receipt size={18} />
                                New Transaction
                            </button>
                        )}
                    </div>
                </header>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
                    {/* Left Sidebar - Employee Info */}
                    <aside className="bg-white rounded-2xl border border-blue-100 shadow-lg h-fit sticky top-8">
                        <div className="px-6 py-5 border-b border-blue-50 flex items-center gap-2">
                            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-semibold overflow-hidden border border-blue-200 shadow-sm">
                                {avatarDisplay}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold ">Employee Snapshot</h3>
                                <p className="text-xs text-gray-500">Key job details</p>
                            </div>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Employee ID</p>
                                    <p className="text-sm font-medium text-gray-800 font-mono">{employee.empNo}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Division</p>
                                    <p className="text-sm font-medium text-gray-800">{employee.division}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Department</p>
                                    <p className="text-sm font-medium text-gray-800">{employee.department}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Designation</p>
                                    <p className="text-sm font-medium text-gray-800">{employee.designation}</p>
                                </div>
                                {employee.phoneNumber && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Phone Number</p>
                                        <p className="text-sm font-medium text-gray-800">{employee.phoneNumber}</p>
                                    </div>
                                )}
                                {employee.email && employee.email !== 'N/A' && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Email</p>
                                        <p className="text-sm font-medium text-gray-800 truncate" title={employee.email}>{employee.email}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>

                    {/* Main Space - History */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl border border-blue-100 shadow-lg overflow-hidden">
                            <div className="px-6 py-5 border-b border-blue-50 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                                        <History size={20} />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
                                </div>
                                {rawTransactions.length > 0 && (
                                    <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                                        {rawTransactions.length} Total
                                    </span>
                                )}
                            </div>

                            {loadingTransactions ? (
                                <div className="p-12 text-center">
                                    <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
                                    <p className="text-gray-500 mt-2 font-medium">Fetching records...</p>
                                </div>
                            ) : rawTransactions.length === 0 ? (
                                <div className="p-16 text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                        <Receipt size={32} />
                                    </div>
                                    <h4 className="text-gray-900 font-bold mb-1">No Transactions Found</h4>
                                    <p className="text-gray-500 text-sm">This employee hasn't made any purchases yet.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-blue-50 px-6">
                                    {rawTransactions.map((transaction) => {
                                        const TransactionPrintComponent = ({ transaction }) => {
                                            const transactionRef = useRef(null);
                                            const triggerPrint = useReactToPrint({
                                                contentRef: transactionRef,
                                                documentTitle: `Receipt-${transaction.transactionId}`,
                                            });

                                            return (
                                                <div className="py-6 group">
                                                    <div className="flex items-start justify-between">
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-gray-900">
                                                                    #{transaction.transactionId.split('-').pop()}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${transaction.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {transaction.isPaid ? 'Paid' : 'Unpaid'}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${transaction.paymentMethod === 'cash' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                                                    }`}>
                                                                    {transaction.paymentMethod}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-xs text-gray-600">
                                                                <div className="flex items-center gap-1">
                                                                    <Calendar size={12} />
                                                                    <span>{new Date(transaction.createdAt).toLocaleDateString(undefined, {
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        year: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Package size={12} />
                                                                    <span>{transaction.items?.length || 0} item{transaction.items?.length !== 1 ? 's' : ''}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <button
                                                                onClick={() => triggerPrint()}
                                                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors text-xs font-semibold shadow-sm no-print"
                                                                title="Print Receipt"
                                                            >
                                                                <Printer size={14} />
                                                                Print
                                                            </button>
                                                            <div className="text-right">
                                                                <p className="text-lg font-bold text-blue-700">₹{transaction.totalAmount.toFixed(2)}</p>
                                                                {transaction.remarks && (
                                                                    <p className="text-[10px] text-gray-500 mt-1 max-w-[200px] truncate">{transaction.remarks}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Items List */}
                                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {transaction.items?.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center text-xs p-2.5 bg-gray-50 rounded-xl border border-gray-100 group-hover:border-blue-100 transition-colors">
                                                                <span className="text-gray-700 font-medium">{item.name} <span className="text-gray-400 ml-1">× {item.quantity}</span></span>
                                                                <span className="text-gray-900 font-bold">₹{item.total.toFixed(2)}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Hidden Thermal Print Content */}
                                                    <div ref={transactionRef} className="hidden print:block thermal-receipt" data-thermal-print="true">
                                                        <style>{`
                                                            @page { size: 80mm auto; margin: 2mm 3mm; }
                                                            @media print {
                                                                *, *::before, *::after { box-shadow: none !important; text-shadow: none !important; }
                                                                html, body {
                                                                    width: 80mm !important;
                                                                    max-width: 80mm !important;
                                                                    margin: 0 !important;
                                                                    padding: 0 !important;
                                                                    font-family: 'Arial Black', 'Helvetica Bold', 'Arial', sans-serif !important;
                                                                    font-size: 11px !important;
                                                                    font-weight: 700 !important;
                                                                    line-height: 1.4 !important;
                                                                    color: #000 !important;
                                                                    background: #fff !important;
                                                                    -webkit-print-color-adjust: exact !important;
                                                                    print-color-adjust: exact !important;
                                                                }
                                                                .thermal-receipt { width: 100% !important; max-width: 74mm !important; margin: 0 auto !important; padding: 2mm !important; font-weight: 700 !important; }
                                                                .thermal-header { text-align: center !important; border-bottom: 2px solid #000 !important; padding-bottom: 2mm !important; margin-bottom: 2mm !important; }
                                                                .thermal-header h2 { font-size: 13px !important; font-weight: 900 !important; margin: 0 0 1mm 0 !important; text-transform: uppercase !important; }
                                                                .thermal-header p { font-size: 9px !important; font-weight: 700 !important; margin: 0 !important; }
                                                                .thermal-info { border-bottom: 1px dashed #000 !important; padding-bottom: 2mm !important; margin-bottom: 2mm !important; }
                                                                .thermal-info p { font-size: 10px !important; font-weight: 700 !important; margin: 1mm 0 !important; display: flex !important; justify-content: space-between !important; }
                                                                .thermal-items { width: 100% !important; margin: 2mm 0 !important; }
                                                                .thermal-items table { width: 100% !important; border-collapse: collapse !important; }
                                                                .thermal-items th, .thermal-items td { font-size: 10px !important; padding: 1mm 0.5mm !important; text-align: left !important; }
                                                                .thermal-items th { border-bottom: 1.5px solid #000 !important; }
                                                                .thermal-total { border-top: 2px solid #000 !important; padding-top: 2mm !important; margin-top: 2mm !important; display: flex !important; justify-content: space-between !important; font-weight: 900 !important; font-size: 12px !important; }
                                                                .thermal-payment { margin-top: 2mm !important; padding-top: 1.5mm !important; border-top: 1px dashed #000 !important; font-size: 10px !important; }
                                                                .thermal-payment p { margin: 0.5mm 0 !important; display: flex !important; justify-content: space-between !important; }
                                                                .thermal-footer { text-align: center !important; margin-top: 3mm !important; padding-top: 2mm !important; border-top: 2px solid #000 !important; font-size: 9px !important; }
                                                            }
                                                        `}</style>

                                                        <div className="thermal-header">
                                                            <h2>{receiptConfig.receiptHeader}</h2>
                                                            <p>{receiptConfig.receiptSubheader}</p>
                                                            <p style={{ marginTop: '1mm', fontSize: '8px' }}>
                                                                {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                                                                    day: '2-digit',
                                                                    month: '2-digit',
                                                                    year: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </p>
                                                        </div>

                                                        <div className="thermal-info">
                                                            <p><span>NAME:</span> <span>{employee.name}</span></p>
                                                            <p><span>EMP ID:</span> <span>{employee.empNo}</span></p>
                                                            <p><span>DEPT:</span> <span>{employee.department}</span></p>
                                                        </div>

                                                        <div className="thermal-items">
                                                            <table>
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ width: '50%' }}>ITEM</th>
                                                                        <th style={{ width: '15%', textAlign: 'center' }}>QTY</th>
                                                                        <th style={{ width: '15%', textAlign: 'right' }}>RATE</th>
                                                                        <th style={{ width: '20%', textAlign: 'right' }}>AMT</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {transaction.items?.map((item, idx) => (
                                                                        <tr key={idx}>
                                                                            <td>{item.name}</td>
                                                                            <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                                                            <td style={{ textAlign: 'right' }}>₹{item.price.toFixed(0)}</td>
                                                                            <td style={{ textAlign: 'right' }}>₹{item.total.toFixed(0)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className="thermal-total">
                                                            <span>TOTAL:</span>
                                                            <span>₹{transaction.totalAmount.toFixed(2)}</span>
                                                        </div>

                                                        <div className="thermal-payment">
                                                            <p><span>PAYMENT:</span> <span className="uppercase">{transaction.paymentMethod}</span></p>
                                                            <p><span>STATUS:</span> <span className="uppercase">{transaction.isPaid ? 'PAID' : 'UNPAID'}</span></p>
                                                            {transaction.remarks && (
                                                                <p style={{ display: 'block', marginTop: '1mm' }}>
                                                                    <span>NOTE: {transaction.remarks}</span>
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="thermal-footer">
                                                            <p>--------------------------------</p>
                                                            <p>Thank you for your purchase!</p>
                                                            <p>Keep this receipt for records</p>
                                                            <p>--------------------------------</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        };

                                        return <TransactionPrintComponent key={transaction._id} transaction={transaction} />;
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showTransactionModal && (
                <EmployeeReceiptModal
                    employee={employee}
                    products={products}
                    currentUser={currentUser}
                    isOnline={isOnline}
                    onClose={() => setShowTransactionModal(false)}
                    onTransactionSaved={() => {
                        fetchEmployeeTransactions(true);
                    }}
                    onProductsUpdated={refreshProducts}
                />
            )}
        </div>
    );
};

export default EmployeeDetail;
