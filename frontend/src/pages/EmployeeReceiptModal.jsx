import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Printer, X, Download, Save, Plus, Minus, Package, CreditCard, Receipt, Loader2, Search } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import { apiUrl } from '../utils/api';
import useOnlineStatus from '../hooks/useOnlineStatus';

const EmployeeReceiptModal = ({
    employee,
    products,
    onClose,
    onTransactionSaved,
    onProductsUpdated,
    isOnline: isOnlineProp,
    currentUser,
}) => {
    const receiptRef = useRef(null);
    const pdfRef = useRef(null);
    const [selectedItems, setSelectedItems] = useState({});
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [isPaid, setIsPaid] = useState(true);
    const [saving, setSaving] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [savedTransactionItems, setSavedTransactionItems] = useState([]);
    const [savedPaymentInfo, setSavedPaymentInfo] = useState({ paymentMethod: 'cash', isPaid: true, remarks: '', totalAmount: 0 });
    const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
    const [receiptConfig, setReceiptConfig] = useState({
        receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
        receiptSubheader: 'Stationery Management System',
    });
    const [itemSearch, setItemSearch] = useState('');
    const resolvedOnlineStatus = useOnlineStatus();
    const isOnline = typeof isOnlineProp === 'boolean' ? isOnlineProp : resolvedOnlineStatus;

    useEffect(() => {
        let isMounted = true;
        const fetchSettings = async () => {
            try {
                const response = await fetch(apiUrl('/api/settings'));
                if (response.ok) {
                    const data = await response.json();
                    if (isMounted) {
                        setReceiptConfig({
                            receiptHeader: data.receiptHeader || 'PYDAH COLLEGE OF ENGINEERING',
                            receiptSubheader: data.receiptSubheader || 'Stationery Management System',
                        });
                    }
                }
            } catch (error) {
                console.warn('Could not load receipt settings:', error.message || error);
            }
        };
        fetchSettings();
        return () => { isMounted = false; };
    }, []);

    const triggerPrint = useReactToPrint({
        contentRef: receiptRef,
        documentTitle: `Receipt-${employee?.empNo || 'employee'}`,
    });

    const handlePrint = () => {
        try {
            if (!receiptRef.current) {
                console.warn('Print attempted but receiptRef is not ready');
                return;
            }

            // Try using react-to-print first
            if (typeof triggerPrint === 'function') {
                triggerPrint();
                return;
            }
        } catch (error) {
            console.error('Error with react-to-print:', error);
        }

        // Manual print fallback
        const node = receiptRef.current;
        if (!node) {
            console.warn('Receipt element not found');
            return;
        }

        const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=800,height=1000');
        if (!printWindow) {
            alert('Please allow popups to print the receipt');
            return;
        }

        const styles = `
      <style>
        @page { size: 80mm auto; margin: 2mm 3mm; }
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
          -webkit-font-smoothing: none !important;
        }
        .no-print { display: none !important; }
        .thermal-receipt {
          width: 100% !important;
          max-width: 74mm !important;
          margin: 0 auto !important;
          padding: 2mm !important;
          font-weight: 700 !important;
        }
        .thermal-header {
          text-align: center !important;
          border-bottom: 2px solid #000 !important;
          padding-bottom: 3mm !important;
          margin-bottom: 3mm !important;
        }
        .thermal-header h2 {
          font-size: 13px !important;
          font-weight: 900 !important;
          margin: 0 0 1mm 0 !important;
          text-transform: uppercase !important;
        }
        .thermal-header p {
          font-size: 10px !important;
          font-weight: 700 !important;
          margin: 0 !important;
        }
        .thermal-info {
          border-bottom: 2px solid #000 !important;
          padding-bottom: 2mm !important;
          margin-bottom: 2mm !important;
        }
        .thermal-info p {
          font-size: 10px !important;
          font-weight: 700 !important;
          margin: 1mm 0 !important;
          display: flex !important;
          justify-content: space-between !important;
        }
        .thermal-items {
          margin: 2mm 0 !important;
        }
        .thermal-items table {
          width: 100% !important;
          font-weight: 700 !important;
          border-collapse: collapse !important;
          font-size: 9px !important;
        }
        .thermal-items th, .thermal-items td {
          padding: 1.5mm 0.5mm !important;
          text-align: left !important;
          border: none !important;
          vertical-align: top !important;
          font-weight: 700 !important;
        }
        .thermal-items th:last-child, .thermal-items td:last-child {
          text-align: right !important;
        }
        .thermal-items th {
          border-bottom: 2px solid #000 !important;
          font-weight: 900 !important;
          font-size: 10px !important;
        }
        .thermal-items tbody tr {
          border-bottom: 1px solid #000 !important;
        }
        .thermal-total {
          border-top: 2px solid #000 !important;
          padding-top: 2mm !important;
          margin-top: 2mm !important;
        }
        .thermal-total-row { display: flex !important; justify-content: space-between !important; width: 100% !important; margin-bottom: 1mm !important; font-weight: 700 !important; font-size: 8px !important; }
        .thermal-total-row.grand-total { font-size: 13px !important; border-top: 1px dashed #000 !important; padding-top: 1mm !important; margin-top: 1mm !important; }
        .thermal-payment {
          margin-top: 2mm !important;
          padding-top: 1.5mm !important;
          border-top: 1px dashed #000 !important;
          font-size: 10px !important;
        }
        .thermal-payment p {
          margin: 1mm 0 !important;
          display: flex !important;
          justify-content: space-between !important;
        }
        .thermal-footer {
          text-align: center !important;
          margin-top: 3mm !important;
          padding-top: 2mm !important;
          border-top: 2px solid #000 !important;
          font-size: 9px !important;
          font-weight: 700 !important;
        }
      </style>
    `;

        const itemsList = (transactionItems.length > 0 ? transactionItems : savedTransactionItems);
        const total = transactionItems.length > 0 ? totalAmount : savedPaymentInfo.totalAmount;
        const method = transactionItems.length > 0 ? paymentMethod : savedPaymentInfo.paymentMethod;
        const paid = transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid;
        const note = transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks;

        const thermalReceiptContent = `
      <div class="thermal-receipt">
        <div class="thermal-header">
          <h2>${receiptConfig.receiptHeader}</h2>
          <p style="margin-top: 2mm; font-size: 8px;">
            ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div class="thermal-info">
          <p><span>Name:</span> <span>${employee?.name || 'N/A'}</span></p>
          <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; margin: 1mm 0;">
            <p style="margin: 0 !important;"><span>ID:</span> <span>${employee?.empNo || 'N/A'}</span></p>
            <p style="margin: 0 !important;"><span>Dept:</span> <span>${employee?.department || 'N/A'}</span></p>
          </div>
        </div>
        <div class="thermal-items">
          <table>
            <thead>
              <tr>
                <th style="width: 50%">Item</th>
                <th style="width: 15%; text-align: center">Qty</th>
                <th style="width: 17%; text-align: right">Rate</th>
                <th style="width: 18%; text-align: right">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList.map((item) => `
                <tr>
                  <td>${item.name}</td>
                  <td style="text-align: center">${item.quantity}</td>
                  <td style="text-align: right">₹${item.price.toFixed(0)}</td>
                  <td style="text-align: right">₹${item.total.toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="thermal-total">
          <div class="thermal-total-row" style="border-bottom: 1px dashed #000; padding-bottom: 1mm; margin-bottom: 1mm; font-size: 8px;">
            <div style="flex: 1; display: flex; justify-content: space-between; padding-right: 2mm; border-right: 1px solid #000;">
              <span>METHOD:</span>
              <span style="font-weight: 700;">${method.toUpperCase()}</span>
            </div>
            <div style="flex: 1; display: flex; justify-content: space-between; padding-left: 2mm;">
              <span>STATUS:</span>
              <span style="font-weight: 700;">${paid ? 'PAID' : 'UNPAID'}</span>
            </div>
          </div>
          <div class="thermal-total-row" style="font-size: 13px; font-weight: 900; padding-top: 1mm;">
            <span>TOTAL:</span>
            <span>₹${total.toFixed(2)}</span>
          </div>
        </div>
        ${note ? `<div class="thermal-payment" style="border-top: 1px dashed #000; margin-top: 2mm; padding-top: 1mm;"><p style="display: block"><span>Note: ${note}</span></p></div>` : ''}
        <div class="thermal-footer">
          <p>--------------------------------</p>
          <p>Thank you PydahSoft ❤️</p>
          <p>--------------------------------</p>
        </div>
      </div>
    `;

        printWindow.document.write(`<!doctype html><html><head><title>Receipt-${employee?.empNo || 'employee'}</title>${styles}</head><body>${thermalReceiptContent}</body></html>`);
        printWindow.document.close();

        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        };
    };

    const handleDownload = () => {
        const receiptElement = pdfRef.current;
        if (!receiptElement) return;

        // Temporarily show PDF-only elements
        const pdfOnlyElements = receiptElement.querySelectorAll('.show-in-pdf');
        pdfOnlyElements.forEach(el => {
            el.classList.remove('hidden');
            el.style.display = 'block';
        });

        html2canvas(receiptElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: 800 // Ensure consistent layout during capture
        }).then((canvas) => {
            // Re-hide PDF-only elements
            pdfOnlyElements.forEach(el => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4'
            });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgHeight = (canvas.height * (pdfWidth - 80)) / canvas.width;

            // Center vertically if it fits, else start from top margin
            const yOffset = imgHeight < (pdfHeight - 80) ? (pdfHeight - imgHeight) / 2 : 40;

            pdf.addImage(imgData, 'PNG', 40, yOffset, pdfWidth - 80, imgHeight);
            pdf.save(`receipt-employee-${employee?.empNo || 'record'}.pdf`);
        });
    };

    const filteredItems = useMemo(() => {
        const term = itemSearch.trim().toLowerCase();
        const allProducts = products || [];
        if (!term) return allProducts;
        return allProducts.filter((item) => {
            const nameMatch = item.name?.toLowerCase().includes(term);
            const descriptionMatch = item.description?.toLowerCase().includes(term);
            return Boolean(nameMatch || descriptionMatch);
        });
    }, [itemSearch, products]);

    const displayItems = useMemo(() => {
        // In "addon" style, we only show first 3 by default if no search and no selection
        if (itemSearch.trim()) return filteredItems;
        const selectedOnly = filteredItems.filter(item => selectedItems[item._id] > 0);
        if (selectedOnly.length > 0) return selectedOnly;
        return filteredItems.slice(0, 3);
    }, [filteredItems, itemSearch, selectedItems]);

    const hasHiddenItems = useMemo(() => {
        if (itemSearch.trim()) return false;
        const selectedOnly = filteredItems.filter(item => selectedItems[item._id] > 0);
        if (selectedOnly.length > 0) return false;
        return filteredItems.length > 3;
    }, [filteredItems, itemSearch, selectedItems]);

    const transactionItems = useMemo(() => {
        return Object.entries(selectedItems)
            .filter(([_, quantity]) => quantity > 0)
            .map(([productId, quantity]) => {
                const product = products.find(p => p._id === productId);
                if (!product) return null;
                const components = product.isSet
                    ? (product.setItems || []).map(setItem => ({
                        name: setItem?.product?.name || setItem?.productNameSnapshot || 'Unknown item',
                        quantity: Number(setItem?.quantity) || 1,
                    }))
                    : [];
                return {
                    productId: product._id,
                    name: product.name,
                    quantity: Number(quantity),
                    price: Number(product.price),
                    total: Number(quantity) * Number(product.price),
                    isSet: Boolean(product.isSet),
                    setComponents: components,
                };
            })
            .filter(Boolean);
    }, [selectedItems, products]);

    const totalAmount = useMemo(() => {
        return transactionItems.reduce((sum, item) => sum + item.total, 0);
    }, [transactionItems]);

    const handleQuantityChange = (productId, delta) => {
        setSelectedItems(prev => {
            const current = prev[productId] || 0;
            const product = products.find(p => p._id === productId);
            if (product?.isSet) return prev;
            let newQuantity = Math.max(0, current + delta);
            if (newQuantity === 0) {
                const { [productId]: r, ...rest } = prev;
                return rest;
            }
            return { ...prev, [productId]: newQuantity };
        });
    };

    const handleSaveTransaction = async () => {
        if (transactionItems.length === 0) {
            alert('Please select at least one item');
            return;
        }

        try {
            setSaving(true);
            const employeeId = employee.id || employee._id;

            const response = await fetch(apiUrl('/api/transactions'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId,
                    items: transactionItems,
                    paymentMethod,
                    isPaid,
                    remarks,
                    createdBy: currentUser?.id,
                    collegeId: (typeof currentUser?.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser?.assignedCollege) ||
                        (typeof currentUser?.assignedBranch === 'object' ? currentUser.assignedBranch._id : currentUser?.assignedBranch) ||
                        undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to save transaction' }));
                throw new Error(errorData.message || 'Failed to save transaction');
            }

            const savedTx = await response.json();

            // Capture for preview before resetting
            setSavedTransactionItems(transactionItems);
            setSavedPaymentInfo({
                paymentMethod,
                isPaid,
                remarks,
                totalAmount
            });

            if (onTransactionSaved) {
                onTransactionSaved(savedTx);
            }
            if (onProductsUpdated) {
                await onProductsUpdated();
            }

            setStatusMsg({ type: 'success', message: 'Transaction saved successfully!' });

            // Clear form but keep modal open for printing if they want
            setSelectedItems({});
            setRemarks('');

        } catch (error) {
            console.error('Error saving transaction:', error);
            setStatusMsg({ type: 'error', message: error.message || 'Failed to save transaction' });
            setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
        } finally {
            setSaving(false);
        }
    };

    if (!employee) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.35)' }}
            onClick={onClose}
        >
            <style type="text/css" media="print">
                {`@page { size: auto; margin: 0; }
                  .no-print { display: none !important; }
                  .thermal-receipt { display: block !important; padding: 20px; font-family: 'Arial Black', 'Helvetica Bold', sans-serif !important; }
                `}
            </style>

            <div
                className={`bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col relative max-h-[90vh] ${saving ? 'pointer-events-none' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-10 h-10 bg-white hover:bg-gray-100 rounded-full flex items-center justify-center cursor-pointer transition-colors no-print shadow-lg border border-gray-200"
                >
                    <X size={20} className="text-gray-600" />
                </button>

                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 rounded-t-2xl border-b border-blue-600/40">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-white uppercase">{receiptConfig.receiptHeader}</h2>
                        <p className="text-xs text-blue-100 mt-0.5">{receiptConfig.receiptSubheader}</p>
                    </div>
                </div>

                {/* Status Message */}
                {statusMsg.message && (
                    <div className={`mx-5 mt-3 p-3 rounded-xl text-xs font-bold text-center animate-pulse ${statusMsg.type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {statusMsg.message}
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4" ref={receiptRef}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column - Selection & Payment */}
                        <div className="space-y-4">
                            <div className="no-print">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                            <Package size={14} className="text-white" />
                                        </div>
                                        Select Items
                                    </h3>
                                    <div className="relative w-full sm:max-w-xs">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            value={itemSearch}
                                            onChange={(e) => setItemSearch(e.target.value)}
                                            type="text"
                                            placeholder="Search items..."
                                            className="w-full pl-9 pr-3 py-2 text-xs border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                    {displayItems.map(item => {
                                        const qty = selectedItems[item._id] || 0;
                                        const isSelected = qty > 0;
                                        return (
                                            <div
                                                key={item._id}
                                                className={`flex items-center justify-between gap-2 p-3 rounded-xl border-2 transition-all shadow-sm ${isSelected
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-blue-50 bg-white hover:border-blue-200'
                                                    }`}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <span className={`font-bold text-xs ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                                                            {item.name}
                                                        </span>
                                                        <span className="font-black text-xs text-blue-700 ml-2">
                                                            ₹{item.price.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Stock: {item.stock || 0}</span>
                                                        {isSelected && (
                                                            <span className="font-bold text-[10px] text-blue-600">Subtotal: ₹{(qty * item.price).toFixed(2)}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {item.isSet ? (
                                                        <button
                                                            onClick={() => {
                                                                if (qty > 0) {
                                                                    const { [item._id]: r, ...rest } = selectedItems;
                                                                    setSelectedItems(rest);
                                                                } else {
                                                                    setSelectedItems(p => ({ ...p, [item._id]: 1 }));
                                                                }
                                                            }}
                                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow ${qty > 0
                                                                ? 'bg-red-500 text-white hover:bg-red-600'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                                }`}
                                                        >
                                                            {qty > 0 ? 'Remove' : 'Add Set'}
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center border border-blue-100 rounded-lg bg-white overflow-hidden shadow-sm">
                                                            <button
                                                                onClick={() => handleQuantityChange(item._id, -1)}
                                                                className="w-7 h-7 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                                            >
                                                                <Minus size={12} />
                                                            </button>
                                                            <span className="w-8 text-center text-xs font-black text-gray-900 leading-none">{qty}</span>
                                                            <button
                                                                onClick={() => handleQuantityChange(item._id, 1)}
                                                                className="w-7 h-7 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {hasHiddenItems && (
                                    <p className="mt-2 text-[10px] text-gray-400 font-bold italic px-1">
                                        Showing top results. Use search to find more items.
                                    </p>
                                )}
                            </div>

                            {/* Payment Tools (Only if items selected) */}
                            {transactionItems.length > 0 && (
                                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 shadow-sm no-print space-y-4">
                                    <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                                            <CreditCard size={14} className="text-white" />
                                        </div>
                                        Payment Details
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1.5 ml-1">Method</label>
                                            <div className="flex bg-white border border-blue-100 rounded-xl p-1 gap-1">
                                                <button
                                                    onClick={() => setPaymentMethod('cash')}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${paymentMethod === 'cash' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-700 hover:bg-blue-50'}`}
                                                >CASH</button>
                                                <button
                                                    onClick={() => setPaymentMethod('online')}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${paymentMethod === 'online' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-700 hover:bg-blue-50'}`}
                                                >ONLINE</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1.5 ml-1">Status</label>
                                            <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-blue-100 h-[38px] cursor-pointer" onClick={() => setIsPaid(!isPaid)}>
                                                <div className={`w-8 h-4 rounded-full transition-colors relative ${isPaid ? 'bg-green-500' : 'bg-gray-300'}`}>
                                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isPaid ? 'left-[18px]' : 'left-0.5'}`}></div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-700">{isPaid ? 'PAID' : 'UNPAID'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1 ml-1">Remarks</label>
                                        <textarea
                                            value={remarks}
                                            onChange={(e) => setRemarks(e.target.value)}
                                            placeholder="Notes for this issuance..."
                                            className="w-full bg-white border border-blue-100 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none h-16 resize-none"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Receipt Preview */}
                        {(transactionItems.length > 0 || savedTransactionItems.length > 0) && (
                            <div className="flex flex-col gap-4 no-print h-full">
                                <div className="bg-white border-2 border-dashed border-gray-300 p-6 flex flex-col shadow-sm sticky top-0" ref={pdfRef}>
                                    {/* Header in PDF Only */}
                                    <div className="hidden show-in-pdf mb-6 text-center border-b-2 border-black pb-4">
                                        <h2 className="text-2xl font-black text-black uppercase tracking-tight">{receiptConfig.receiptHeader}</h2>
                                        <p className="text-xs text-gray-800 font-bold mt-1 uppercase">{receiptConfig.receiptSubheader}</p>
                                    </div>

                                    {/* Employee Details - Compact */}
                                    <div className="grid grid-cols-1 gap-y-2 mb-6 text-[11px] bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                                        <div className="flex justify-between border-b border-gray-100 pb-1.5">
                                            <span className="text-gray-400 font-bold uppercase tracking-wider block leading-none">Name</span>
                                            <span className="font-black text-gray-900 uppercase block leading-none">{employee?.name || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">ID:</span>
                                                <span className="font-black text-gray-900">{employee?.empNo || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Dept:</span>
                                                <span className="font-black text-gray-800 uppercase">{employee?.department || 'N/A'}</span>
                                            </div>
                                        </div>
                                        <div className="text-right pt-1 border-t border-gray-100 mt-1">
                                            <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px] mr-2">Date:</span>
                                            <span className="font-black text-gray-800">{new Date().toLocaleDateString('en-GB')}</span>
                                        </div>
                                    </div>

                                    {/* Items Table - Compact */}
                                    <div className="flex-1">
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr className="border-b-2 border-black">
                                                    <th className="text-left py-2 text-[10px] font-black uppercase text-gray-500">Item</th>
                                                    <th className="text-center py-2 text-[10px] font-black uppercase text-gray-500">Qty</th>
                                                    <th className="text-right py-2 text-[10px] font-black uppercase text-gray-500">Rate</th>
                                                    <th className="text-right py-2 text-[10px] font-black uppercase text-gray-500">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(transactionItems.length > 0 ? transactionItems : savedTransactionItems).map((item, idx) => (
                                                    <tr key={idx} className="group">
                                                        <td className="py-2.5 text-xs font-bold text-gray-800 pr-2">
                                                            {item.name}
                                                        </td>
                                                        <td className="py-2.5 text-xs font-black text-gray-900 text-center">{item.quantity}</td>
                                                        <td className="py-2.5 text-xs font-bold text-gray-600 text-right">₹{item.price.toFixed(0)}</td>
                                                        <td className="py-2.5 text-sm font-black text-gray-900 text-right">₹{item.total.toFixed(0)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Summary Section */}
                                    <div className="mt-6 pt-4 border-t-2 border-black border-dashed">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest leading-none">Total Amount</span>
                                            <span className="text-2xl font-black text-gray-900 tracking-tighter leading-none">
                                                ₹{(transactionItems.length > 0 ? totalAmount : savedPaymentInfo.totalAmount).toFixed(2)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-md border border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Method:</span>
                                                <span className="text-gray-900 font-black uppercase text-[10px]">
                                                    {transactionItems.length > 0 ? paymentMethod : savedPaymentInfo.paymentMethod}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 font-bold text-[9px] uppercase tracking-wider">Status:</span>
                                                <span className={`font-black text-[10px] ${(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'text-green-600' : 'text-red-600'}`}>
                                                    {(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'PAID' : 'UNPAID'}
                                                </span>
                                            </div>
                                        </div>

                                        {(transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks) && (
                                            <div className="mt-4 p-3 bg-yellow-50/50 border-l-2 border-yellow-200 text-[10px] text-gray-600 italic font-bold">
                                                {transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks}
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="mt-8 text-center border-t border-gray-100 pt-4 flex flex-col gap-1 items-center">
                                        <p className="text-[10px] text-gray-900 font-black uppercase tracking-tight">Thank you PydahSoft ❤️</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Thermal Printer Optimized Receipt Section */}
                    {(transactionItems.length > 0 || savedTransactionItems.length > 0) && (
                        <div className="hidden print:block thermal-receipt" data-thermal-print="true">
                            {/* Thermal Header */}
                            <div className="thermal-header">
                                <h2>{receiptConfig.receiptHeader}</h2>
                                <p style={{ marginTop: '2mm', fontSize: '8px' }}>
                                    {new Date().toLocaleDateString('en-IN', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </p>
                            </div>

                            {/* Employee Info */}
                            <div className="thermal-info">
                                <p><span>Name:</span> <span>{employee?.name || 'N/A'}</span></p>
                                <p>
                                    <span>ID: {employee?.empNo || 'N/A'}</span>
                                    <span>Dept: {employee?.department || 'N/A'}</span>
                                </p>
                            </div>

                            {/* Items Table */}
                            <div className="thermal-items">
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '50%' }}>Item</th>
                                            <th style={{ width: '15%', textAlign: 'center' }}>Qty</th>
                                            <th style={{ width: '17%', textAlign: 'right' }}>Rate</th>
                                            <th style={{ width: '18%', textAlign: 'right' }}>Amt</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(transactionItems.length > 0 ? transactionItems : savedTransactionItems).map((item, idx, arr) => (
                                            <tr key={idx} className={arr.length === 1 ? 'single-item' : ''}>
                                                <td>{item.name}</td>
                                                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                                <td style={{ textAlign: 'right' }}>₹{item.price.toFixed(0)}</td>
                                                <td style={{ textAlign: 'right' }}>₹{item.total.toFixed(0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Total */}
                            <div className="thermal-total">
                                <div style={{ display: 'flex', borderBottom: '1px dashed #000', paddingBottom: '1mm', marginBottom: '1mm', fontSize: '8px' }}>
                                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', paddingRight: '2mm', borderRight: '1px solid #000' }}>
                                        <span>METHOD:</span>
                                        <span style={{ fontWeight: 700 }}>{(transactionItems.length > 0 ? paymentMethod : savedPaymentInfo.paymentMethod)?.toUpperCase()}</span>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', paddingLeft: '2mm' }}>
                                        <span>STATUS:</span>
                                        <span style={{ fontWeight: 700 }}>{(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'PAID' : 'UNPAID'}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 900, paddingTop: '1mm' }}>
                                    <span>TOTAL:</span>
                                    <span>₹{(transactionItems.length > 0 ? totalAmount : savedPaymentInfo.totalAmount).toFixed(2)}</span>
                                </div>
                            </div>
                            {(transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks) && (
                                <div className="thermal-payment" style={{ borderTop: '1px dashed #000', marginTop: '2mm', paddingTop: '1mm' }}>
                                    <p style={{ display: 'block' }}>
                                        <span>Note: {transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks}</span>
                                    </p>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="thermal-footer">
                                <p>--------------------------------</p>
                                <p>Thank you PydahSoft ❤️</p>
                                <p>--------------------------------</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50 to-blue-100 px-5 py-3 flex justify-between rounded-b-2xl no-print">
                    {/* Left side - Print/Download buttons (show after transaction saved) */}
                    <div className="flex gap-2">
                        {savedTransactionItems.length > 0 && (
                            <>
                                <button
                                    onClick={handlePrint}
                                    className="px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
                                    title="Print Receipt (Thermal Printer)"
                                >
                                    <Printer size={16} />
                                    Print Receipt
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="px-4 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
                                    title="Download as PDF"
                                >
                                    <Download size={16} />
                                    Download PDF
                                </button>
                            </>
                        )}
                    </div>

                    {/* Right side - Save button */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleSaveTransaction}
                            disabled={transactionItems.length === 0 || saving}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Save Transaction
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeeReceiptModal;
