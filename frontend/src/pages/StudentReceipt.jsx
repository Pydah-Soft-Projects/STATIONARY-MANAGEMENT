import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Printer, X, Download, Save, Plus, Minus, Package, CreditCard, Receipt, Loader2, Search } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import { apiUrl } from '../utils/api';
import useOnlineStatus from '../hooks/useOnlineStatus';

const normalizeValue = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const StudentReceiptModal = ({
  student,
  products,
  prefilledItems = [],
  onClose,
  onTransactionSaved,
  onProductsUpdated,
  onTransactionQueued,
  isOnline: isOnlineProp,
  mode = 'mapped',
  currentUser,
}) => {
  const receiptRef = useRef(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [savedTransactionItems, setSavedTransactionItems] = useState([]);
  const [savedPaymentInfo, setSavedPaymentInfo] = useState({ paymentMethod: 'cash', isPaid: false, remarks: '', totalAmount: 0 });
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });
  const [receiptConfig, setReceiptConfig] = useState({
    receiptHeader: 'PYDAH GROUP OF INSTITUTIONS',
    receiptSubheader: 'Stationery Management System',
  });
  const [itemSearch, setItemSearch] = useState('');
  const resolvedOnlineStatus = useOnlineStatus();
  const isOnline = typeof isOnlineProp === 'boolean' ? isOnlineProp : resolvedOnlineStatus;

  // Prefill items when prefilledItems prop is provided
  useEffect(() => {
    setItemSearch('');
    if (mode === 'addon') {
      setSelectedItems({});
      return;
    }

    if (prefilledItems && prefilledItems.length > 0) {
      const initialItems = {};
      prefilledItems.forEach(product => {
        if (product && product._id) {
          if (product.isSet) {
            initialItems[product._id] = 1;
          } else if (product.stock > 0) {
            initialItems[product._id] = 1;
          }
        }
      });
      setSelectedItems(initialItems);
    } else {
      setSelectedItems({});
    }
  }, [prefilledItems, mode]);

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      try {
        // Get course-specific receipt headers if student has a course
        const course = student?.course;
        const url = course
          ? apiUrl(`/api/settings?course=${encodeURIComponent(course)}`)
          : apiUrl('/api/settings');

        const response = await fetch(url);
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
        // Fallback to defaults
        if (isMounted) {
          setReceiptConfig({
            receiptHeader: 'PYDAH COLLEGE OF ENGINEERING',
            receiptSubheader: 'Stationery Management System',
          });
        }
      }
    };

    if (student) {
      fetchSettings();
    }
    return () => {
      isMounted = false;
    };
  }, [student?.course]); // Re-fetch when student course changes

  const triggerPrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt-${student?.studentId || 'student'}`,
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
      // fall through to manual
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
        /* Thermal printer optimized styles */
        @page { 
          size: 80mm auto; 
          margin: 2mm 3mm; 
        }
        *, *::before, *::after {
          box-shadow: none !important;
          text-shadow: none !important;
        }
        html, body { 
          width: 80mm !important;
          max-width: 80mm !important;
          margin: 0 !important; 
          padding: 0 !important;
          /* Use bold-friendly fonts for thermal printing */
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
          letter-spacing: 0.5px !important;
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
        /* Remove border for single item */
        .thermal-items tbody tr.single-item,
        .thermal-items tbody tr:only-child {
          border-bottom: none !important;
        }
        .thermal-total {
          border-top: 2px solid #000 !important;
          padding-top: 2mm !important;
          margin-top: 2mm !important;
          display: flex !important;
          justify-content: space-between !important;
          font-weight: 900 !important;
          font-size: 12px !important;
        }
        .thermal-payment {
          margin-top: 2mm !important;
          padding-top: 2mm !important;
          border-top: 2px solid #000 !important;
          font-size: 10px !important;
          font-weight: 700 !important;
        }
        .thermal-payment p {
          margin: 1mm 0 !important;
          display: flex !important;
          justify-content: space-between !important;
          font-weight: 700 !important;
        }
        .thermal-footer {
          text-align: center !important;
          margin-top: 3mm !important;
          padding-top: 2mm !important;
          border-top: 2px solid #000 !important;
          font-size: 9px !important;
          font-weight: 700 !important;
        }
        .set-items {
          margin-left: 2mm !important;
          font-size: 9px !important;
          font-weight: 600 !important;
          color: #000 !important;
        }
        .set-items li {
          margin: 0.5mm 0 !important;
        }
      </style>
    `;

    // Generate thermal-optimized receipt content
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
          <p><span>Name:</span> <span>${student?.name || 'N/A'}</span></p>
          <p><span>ID:</span> <span>${student?.studentId || 'N/A'}</span></p>
          <p><span>Course:</span> <span>${student?.course?.toUpperCase() || 'N/A'}</span></p>
          <p><span>Year:</span> <span>${student?.year || 'N/A'}</span></p>
          ${student?.branch ? `<p><span>Branch:</span> <span>${student.branch}</span></p>` : ''}
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
              ${itemsList.map((item, idx, arr) => `
                <tr class="${arr.length === 1 ? 'single-item' : ''}">
                  <td>
                    ${item.name}
                    ${item.isSet && item.setComponents?.length > 0 ? `
                      <ul class="set-items" style="list-style: none; padding: 0; margin: 1mm 0 0 2mm;">
                        ${item.setComponents.map(c => `<li>- ${c.name} ×${c.quantity}</li>`).join('')}
                      </ul>
                    ` : ''}
                  </td>
                  <td style="text-align: center">${item.quantity}</td>
                  <td style="text-align: right">₹${item.price.toFixed(0)}</td>
                  <td style="text-align: right">₹${item.total.toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="thermal-total">
          <span>TOTAL:</span>
          <span>₹${total.toFixed(2)}</span>
        </div>
        <div class="thermal-payment">
          <p><span>Payment:</span> <span>${method === 'cash' ? 'CASH' : 'ONLINE'}</span></p>
          <p><span>Status:</span> <span>${paid ? 'PAID' : 'UNPAID'}</span></p>
          ${note ? `<p style="display: block"><span>Note: ${note}</span></p>` : ''}
        </div>
        <div class="thermal-footer">
          <p>--------------------------------</p>
          <p>Thank you for your purchase!</p>
          <p>Keep this receipt for records</p>
          <p>--------------------------------</p>
        </div>
      </div>
    `;

    printWindow.document.write(`<!doctype html><html><head><title>Receipt-${student?.studentId || 'student'}</title>${styles}</head><body>${thermalReceiptContent}</body></html>`);
    printWindow.document.close();

    // Wait for content to load before printing
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        // Don't close immediately, let user cancel if needed
      }, 500);
    };
  };

  const handleDownload = () => {
    const receiptElement = receiptRef.current;
    if (!receiptElement) return;

    html2canvas(receiptElement, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff'
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`receipt-${student?.studentId || 'student'}.pdf`);
    });
  };

  if (!student) return null;

  const visibleItems = useMemo(() => {
    if (prefilledItems && prefilledItems.length > 0) {
      return (products || []).filter(p => prefilledItems.some(pref => pref._id === p._id));
    }

    return (products || []).filter(p => {
      if (p.forCourse) {
        const normalizedCourse = normalizeValue(p.forCourse);
        if (normalizedCourse && normalizedCourse !== normalizeValue(student.course)) {
          return false;
        }
      }
      const productYears = p.years || (p.year ? [p.year] : []);
      if (productYears.length > 0 && !productYears.includes(Number(student.year))) {
        return false;
      }
      return true;
    });
  }, [products, student.course, student.year, prefilledItems]);

  const filteredItems = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return visibleItems;

    return visibleItems.filter((item) => {
      const nameMatch = item.name?.toLowerCase().includes(term);
      const descriptionMatch = item.description?.toLowerCase().includes(term);
      const courseMatch = item.forCourse?.toLowerCase().includes(term);
      return Boolean(nameMatch || descriptionMatch || courseMatch);
    });
  }, [itemSearch, visibleItems]);

  const displayItems = useMemo(() => {
    if (mode !== 'addon' || itemSearch.trim()) {
      return filteredItems;
    }

    const selectedOnly = filteredItems.filter((item) => selectedItems[item._id]);
    if (selectedOnly.length > 0) {
      return selectedOnly;
    }

    return filteredItems.slice(0, 3);
  }, [filteredItems, itemSearch, mode, selectedItems]);

  const hasHiddenItems = useMemo(() => {
    if (mode !== 'addon' || itemSearch.trim()) return false;
    const selectedOnly = filteredItems.filter((item) => selectedItems[item._id]);
    if (selectedOnly.length > 0) return false;
    return filteredItems.length > displayItems.length;
  }, [filteredItems, displayItems, itemSearch, mode, selectedItems]);

  const transactionItems = useMemo(() => {
    return Object.entries(selectedItems)
      .filter(([_, quantity]) => quantity > 0)
      .map(([productId, quantity]) => {
        const product = visibleItems.find(p => p._id === productId);
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
  }, [selectedItems, visibleItems]);

  const totalAmount = useMemo(() => {
    return transactionItems.reduce((sum, item) => sum + item.total, 0);
  }, [transactionItems]);

  const handleQuantityChange = (productId, delta) => {
    setSelectedItems(prev => {
      const current = prev[productId] || 0;
      const product = visibleItems.find(p => p._id === productId);

      // For sets, quantity is always 1 (can't change)
      if (product?.isSet) {
        return prev;
      }

      const maxStock = product?.stock || 0;
      let newQuantity = Math.max(0, current + delta);

      if (newQuantity === 0) {
        const { [productId]: removed, ...rest } = prev;
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
      const studentId = student.id || student._id;

      const updatedStudentItems = { ...(student.items || {}) };
      transactionItems.forEach(item => {
        const product = visibleItems.find(p => p._id === item.productId);
        if (!product) return;
        const isMapped = product.forCourse && normalizeValue(product.forCourse) === normalizeValue(student.course);
        if (!isMapped) return;
        const key = product.name?.toLowerCase().replace(/\s+/g, '_');
        if (key) {
          updatedStudentItems[key] = true;
        }
      });

      const locallyUpdatedStudent = {
        ...student,
        items: updatedStudentItems,
      };

      if (!isOnline) {
        const queuedTransaction = {
          id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          payload: {
            studentId,
            items: transactionItems,
            paymentMethod,
            isPaid,
            remarks,
          },
        };

        if (onTransactionQueued) {
          onTransactionQueued(queuedTransaction, { ...locallyUpdatedStudent, id: studentId });
        }

        setSavedTransactionItems(transactionItems);
        setSavedPaymentInfo({
          paymentMethod,
          isPaid,
          remarks,
          totalAmount,
        });

        setSelectedItems({});
        setPaymentMethod('cash');
        setIsPaid(true);
        setRemarks('');

        setStatusMsg({ type: 'success', message: 'Offline transaction queued. It will sync when you reconnect.' });
        setStatusMsg({ type: 'success', message: 'Offline transaction queued. It will sync when you reconnect.' });
        onClose();
        return;
      }

      const response = await fetch(apiUrl('/api/transactions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          items: transactionItems,
          paymentMethod,
          isPaid,
          remarks,
          createdBy: currentUser?.id,
          collegeId: (typeof currentUser?.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser?.assignedCollege) ||
            (typeof currentUser?.assignedBranch === 'object' ? currentUser.assignedBranch._id : currentUser?.assignedBranch) ||
            undefined,
          // Support for legacy assignment
          branchId: (typeof currentUser?.assignedCollege === 'object' ? currentUser.assignedCollege._id : currentUser?.assignedCollege) ||
            (typeof currentUser?.assignedBranch === 'object' ? currentUser.assignedBranch._id : currentUser?.assignedBranch) ||
            undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to save transaction' }));
        throw new Error(errorData.message || 'Failed to save transaction');
      }

      await response.json();

      // Save transaction data for printing before resetting form
      setSavedTransactionItems(transactionItems);
      setSavedPaymentInfo({
        paymentMethod,
        isPaid,
        remarks,
        totalAmount,
      });

      // Fetch updated student data
      const studentRes = await fetch(apiUrl(`/api/users/${student.course}/${studentId}`));
      if (studentRes.ok) {
        const updatedStudent = await studentRes.json();
        if (onTransactionSaved) {
          onTransactionSaved({ ...updatedStudent, id: updatedStudent._id });
        }
      } else {
        if (onTransactionSaved) {
          onTransactionSaved({ ...locallyUpdatedStudent, id: studentId });
        }
      }

      if (onProductsUpdated) {
        try {
          await onProductsUpdated();
        } catch (err) {
          console.warn('Failed to refresh products after transaction:', err);
        }
      }

      // Reset form for next transaction (but keep modal open)
      setSelectedItems({});
      setPaymentMethod('cash');
      setIsPaid(true);
      setRemarks('');

      // Show success message and close modal after 1.5 seconds
      setStatusMsg({ type: 'success', message: 'Transaction saved successfully!' });
      setStatusMsg({ type: 'success', message: 'Transaction saved successfully!' });
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Failed to save transaction' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.35)' }}
      onClick={onClose}
    >
      <style type="text/css" media="print">
        {`@page { size: auto; margin: 0; }
          .no-print { display: none !important; }
        `}
      </style>

      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col relative ${saving ? 'pointer-events-none' : ''}`}
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
            <h2 className="text-xl font-bold text-white">{receiptConfig.receiptHeader}</h2>
            <p className="text-xs text-blue-100 mt-0.5">{receiptConfig.receiptSubheader}</p>
          </div>
        </div>

        {/* Status Message */}
        {statusMsg.message && (
          <div className={`mx-5 mt-3 p-3 rounded-lg text-xs font-medium ${statusMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
            {statusMsg.message}
          </div>
        )}

        {/* Content - Split into two columns */}
        <div className="flex-1  " ref={receiptRef}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
            {/* Left Column - Items Selection & Payment */}
            <div className="space-y-4">
              {/* Items Selection Section */}
              <div className="no-print">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
                  <h3 className="text-sm font-semibold text-black flex items-center gap-4">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Package size={14} className="text-white" />
                    </div>
                    Select Items
                  </h3>
                  <div className="relative w-full sm:max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 " />
                    <input
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      type="text"
                      placeholder={mode === 'addon' ? 'Search add-on items...' : 'Search items...'}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white "
                    />
                  </div>
                </div>
                {visibleItems.length === 0 ? (
                  <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-500">
                      {mode === 'addon' ? 'No add-on items configured yet.' : 'No items available for this course/year.'}
                    </p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                    <p className="text-xs text-gray-500">No items match your search.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {displayItems.map(item => {
                      const quantity = selectedItems[item._id] || 0;
                      const isSelected = quantity > 0;
                      const isSet = item.isSet || false;
                      return (
                        <div
                          key={item._id}
                          className={`flex items-center justify-between gap-2 p-3 rounded-xl border-2 transition-all shadow-sm ${isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-blue-100 bg-white hover:border-blue-300'
                            } ${isSet ? 'border-indigo-300 bg-indigo-50/60' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium text-xs ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                                  {item.name}
                                </span>
                                {isSet && (
                                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold">
                                    Set
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold  text-xs whitespace-nowrap ml-2">
                                ₹{item.price?.toFixed(2) || '0.00'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isSet && (
                                <span className="text-xs text-blue-600 font-medium">
                                  Stock:{' '}
                                  <span className={item.stock <= 0 ? 'text-red-600 font-bold' : item.stock <= 5 ? 'text-red-600 font-semibold' : item.stock <= 10 ? 'text-amber-600 font-semibold' : 'text-blue-800'}>
                                    {item.stock || 0}
                                  </span>
                                  {quantity > item.stock && (
                                    <span className="ml-2 text-[10px] text-amber-600 font-bold animate-pulse">
                                      (EXCEEDS STOCK)
                                    </span>
                                  )}
                                </span>
                              )}
                              {isSet && (
                                <span className="text-xs text-indigo-600 font-medium">
                                  Contains {item.setItems?.length || 0} item{item.setItems?.length !== 1 ? 's' : ''}
                                </span>
                              )}
                              {isSelected && (
                                <span className="font-semibold  text-xs">
                                  Total: ₹{(quantity * item.price).toFixed(2)}
                                </span>
                              )}
                            </div>
                            {isSet && item.setItems?.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {item.setItems.map(setItem => (
                                  <li
                                    key={`${item._id}-${setItem.product?._id || setItem.product || setItem.productNameSnapshot}`}
                                    className="text-[11px] text-indigo-700 flex justify-between"
                                  >
                                    <span className="truncate max-w-[160px]">
                                      {setItem?.product?.name || setItem?.productNameSnapshot || 'Unknown item'}
                                    </span>
                                    <span className="font-semibold">× {Number(setItem?.quantity) || 1}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isSet ? (
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (quantity > 0) {
                                      const { [item._id]: removed, ...rest } = selectedItems;
                                      setSelectedItems(rest);
                                    } else {
                                      setSelectedItems(prev => ({ ...prev, [item._id]: 1 }));
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shadow ${quantity > 0
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    }`}
                                >
                                  {quantity > 0 ? 'Remove' : 'Add'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center border border-blue-200 rounded-md bg-white">
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-l-md"
                                  onClick={() => handleQuantityChange(item._id, -1)}
                                  disabled={quantity === 0}
                                >
                                  <Minus size={10} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.stock || 0}
                                  value={quantity}
                                  onChange={(e) => {
                                    const inputVal = parseInt(e.target.value, 10) || 0;
                                    const val = Math.max(0, inputVal);
                                    if (val === 0) {
                                      const { [item._id]: removed, ...rest } = selectedItems;
                                      setSelectedItems(rest);
                                    } else {
                                      setSelectedItems(prev => ({ ...prev, [item._id]: val }));
                                    }
                                  }}
                                  className="w-10 text-center border-0 font-semibold text-xs focus:outline-none focus:ring-0"
                                />
                                <button
                                  type="button"
                                  className="w-6 h-6 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleQuantityChange(item._id, 1)}
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {hasHiddenItems && (
                  <p className="mt-2 text-[11px] ">
                    Showing the first {displayItems.length} add-on items. Use the search to find others.
                  </p>
                )}
              </div>

              {/* Payment Section */}
              {transactionItems.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 shadow-sm no-print">
                  <h3 className="text-sm font-semibold  mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                      <CreditCard size={14} className="text-white" />
                    </div>
                    Payment Details
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Payment Method Toggle */}
                    <div>
                      <label className="block text-xs font-medium mb-2">Payment Method</label>
                      <div className="relative inline-flex items-center bg-white border border-blue-200 rounded-lg p-1 w-full">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cash')}
                          className={`relative flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${paymentMethod === 'cash'
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-blue-700 hover:bg-blue-50'
                            }`}
                        >
                          Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('online')}
                          className={`relative flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${paymentMethod === 'online'
                            ? 'bg-blue-600 text-white shadow'
                            : 'text-blue-700 hover:bg-blue-50'
                            }`}
                        >
                          Online
                        </button>
                      </div>
                    </div>

                    {/* Payment Status */}
                    <div>
                      <label className="block text-xs font-medium  mb-2">Payment Status</label>
                      <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-blue-200 h-[42px]">
                        <input
                          type="checkbox"
                          id="paid-checkbox"
                          checked={isPaid}
                          onChange={(e) => setIsPaid(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="paid-checkbox" className="font-medium  cursor-pointer text-xs">
                          Mark as Paid
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="mt-3 col-span-2">
                    <label className="block text-xs font-medium mb-1.5">
                      Remarks (Optional)
                    </label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Add any remarks..."
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Receipt Preview */}
            {(transactionItems.length > 0 || savedTransactionItems.length > 0) && (
              <div>
                <div className="bg-white rounded-xl border border-blue-100 p-4 shadow sticky top-4">
                  <h3 className="text-sm font-semibold  mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Receipt size={14} className="text-white" />
                    </div>
                    Receipt Preview
                  </h3>

                  {/* Receipt Items Section - For printing */}
                  <div className="space-y-3">
                    <div className="border-b border-gray-200 pb-2">
                      <h4 className="text-xs font-semibold  mb-2">Items Issued</h4>
                      <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                        {(transactionItems.length > 0 ? transactionItems : savedTransactionItems).map((item, idx) => (
                          <div key={idx} className="flex flex-col py-1.5 px-2 bg-gray-50 rounded-lg text-xs">
                            <div className="flex justify-between items-center">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-gray-900 text-xs truncate block">{item.name}</span>
                                <span className="text-gray-500 text-xs">× {item.quantity}</span>
                              </div>
                              <span className="font-semibold text-gray-900 text-xs ml-2 whitespace-nowrap">₹{item.total.toFixed(2)}</span>
                            </div>
                            {item.isSet && item.setComponents?.length > 0 && (
                              <div className="mt-1 bg-white rounded-lg border border-gray-200 p-2">
                                <p className="text-[10px] font-semibold text-gray-600 mb-1">Includes:</p>
                                <ul className="space-y-1">
                                  {item.setComponents.map((component, componentIdx) => (
                                    <li
                                      key={`${item.name}-component-list-${componentIdx}`}
                                      className="flex items-center justify-between text-[10px] text-gray-600 gap-2"
                                    >
                                      <span className="truncate max-w-[140px]">{component.name}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">× {component.quantity}</span>
                                        {component.taken === false && (
                                          <span className="uppercase font-semibold text-red-600">Not Taken</span>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-center pt-2 border-t-2 border-blue-700">
                      <span className="text-xs font-bold text-blue-900">Total:</span>
                      <span className="text-base font-bold text-blue-900">
                        ₹{(transactionItems.length > 0 ? totalAmount : savedPaymentInfo.totalAmount).toFixed(2)}
                      </span>
                    </div>

                    {/* Payment Info */}
                    <div className="pt-2 border-t border-gray-200 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-blue-700 font-medium text-xs">Method:</span>
                        <span className="text-blue-900 font-semibold capitalize text-xs">
                          {transactionItems.length > 0 ? paymentMethod : savedPaymentInfo.paymentMethod}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-700 font-medium text-xs">Status:</span>
                        <span className={`font-semibold text-xs ${(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'text-green-600' : 'text-red-600'}`}>
                          {(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                      {(transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks) && (
                        <div className="pt-1.5 border-t border-blue-100">
                          <span className="text-blue-700 font-medium text-xs">Remarks:</span>
                          <p className="text-blue-900 mt-0.5 text-xs line-clamp-2">{transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks}</p>
                        </div>
                      )}
                    </div>

                    {/* Date */}
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-blue-600 text-right">
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
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
                <p>{receiptConfig.receiptSubheader}</p>
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

              {/* Student Info */}
              <div className="thermal-info">
                <p><span>Name:</span> <span>{student?.name || 'N/A'}</span></p>
                <p><span>ID:</span> <span>{student?.studentId || 'N/A'}</span></p>
                <p><span>Course:</span> <span>{student?.course?.toUpperCase() || 'N/A'}</span></p>
                <p><span>Year:</span> <span>{student?.year || 'N/A'}</span></p>
                {student?.branch && <p><span>Branch:</span> <span>{student.branch}</span></p>}
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
                        <td>
                          {item.name}
                          {item.isSet && item.setComponents?.length > 0 && (
                            <ul className="set-items" style={{ listStyle: 'none', padding: 0, margin: '1mm 0 0 2mm' }}>
                              {item.setComponents.map((component, componentIdx) => (
                                <li key={`thermal-${item.name}-${componentIdx}`}>
                                  - {component.name} ×{component.quantity}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
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
                <span>TOTAL:</span>
                <span>₹{(transactionItems.length > 0 ? totalAmount : savedPaymentInfo.totalAmount).toFixed(2)}</span>
              </div>

              {/* Payment Info */}
              <div className="thermal-payment">
                <p>
                  <span>Payment:</span>
                  <span>{(transactionItems.length > 0 ? paymentMethod : savedPaymentInfo.paymentMethod) === 'cash' ? 'CASH' : 'ONLINE'}</span>
                </p>
                <p>
                  <span>Status:</span>
                  <span>{(transactionItems.length > 0 ? isPaid : savedPaymentInfo.isPaid) ? 'PAID' : 'UNPAID'}</span>
                </p>
                {(transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks) && (
                  <p style={{ display: 'block' }}>
                    <span>Note: {transactionItems.length > 0 ? remarks : savedPaymentInfo.remarks}</span>
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="thermal-footer">
                <p>--------------------------------</p>
                <p>Thank you for your purchase!</p>
                <p>Keep this receipt for records</p>
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

export default StudentReceiptModal;
