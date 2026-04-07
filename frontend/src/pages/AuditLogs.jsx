import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardList, RefreshCcw, CheckCircle2, XCircle, Info, History, Clock, Lock } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasViewAccess } from '../utils/permissions';

const getCurrentUserName = () => {
  try {
    const saved = localStorage.getItem('currentUser');
    if (!saved) return 'System';
    const parsed = JSON.parse(saved);
    return parsed?.name || 'System';
  } catch (error) {
    return 'System';
  }
};

const getCurrentUserInfo = () => {
  try {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
};

const AuditLogs = ({ currentUser }) => {
  // Use currentUser prop if provided, otherwise fallback to localStorage
  const currentUserInfo = useMemo(() => {
    return currentUser || getCurrentUserInfo();
  }, [currentUser]);

  const currentUserPermissions = Array.isArray(currentUserInfo?.permissions) ? currentUserInfo.permissions : [];
  const isSuperAdmin = currentUserInfo?.role === 'Administrator';

  // Check for legacy audit-logs permission (without access level)
  const hasLegacyAuditPermission = currentUserPermissions.some(p => {
    if (typeof p !== 'string') return false;
    // Check for 'audit-logs' or 'audit-logs:view' or 'audit-logs:full'
    return p === 'audit-logs' || p.startsWith('audit-logs:');
  });

  // Use hasViewAccess to properly check permissions with access levels
  const canAccessEntry =
    isSuperAdmin ||
    hasLegacyAuditPermission ||
    hasViewAccess(currentUserPermissions, 'audit-log-entry');
  const canAccessApproval =
    isSuperAdmin ||
    hasLegacyAuditPermission ||
    hasViewAccess(currentUserPermissions, 'audit-log-approval');

  const [activeTab, setActiveTab] = useState(() => {
    if (canAccessEntry) return 'entry';
    if (canAccessApproval) return 'approval';
    return 'none';
  });
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [entryValues, setEntryValues] = useState({});
  const [beforeTouched, setBeforeTouched] = useState({});
  const [entryStatus, setEntryStatus] = useState({});
  const [isSubmittingAll, setIsSubmittingAll] = useState(false);
  const [pendingLogs, setPendingLogs] = useState([]);
  const groupLogsByBatch = (logs = []) => {
    const groups = new Map();
    logs.forEach((log) => {
      const key = log.batchId || log._id;
      if (!groups.has(key)) {
        groups.set(key, {
          batchId: key,
          status: log.status,
          createdBy: log.createdBy || 'System',
          createdAt: log.createdAt,
          approvedBy: log.approvedBy,
          approvedAt: log.approvedAt,
          items: [],
        });
      }
      const group = groups.get(key);
      group.items.push(log);
      if (log.status && group.status !== log.status) {
        group.status = log.status;
      }
      if (log.approvedBy) {
        group.approvedBy = log.approvedBy;
      }
      if (log.approvedAt) {
        group.approvedAt = log.approvedAt;
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  };
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [approvingId, setApprovingId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const currentUserName = useMemo(
    () => currentUserInfo?.name || getCurrentUserName(),
    [currentUserInfo]
  );

  useEffect(() => {
    if (canAccessEntry && activeTab === 'none') {
      setActiveTab('entry');
    } else if (!canAccessEntry && activeTab === 'entry') {
      setActiveTab(canAccessApproval ? 'approval' : 'none');
    } else if (!canAccessApproval && activeTab === 'approval') {
      setActiveTab(canAccessEntry ? 'entry' : 'none');
    }
  }, [canAccessEntry, canAccessApproval, activeTab]);

  const fetchProducts = async () => {
    try {
      setProductsLoading(true);
      setProductsError('');
      const response = await fetch(apiUrl('/api/products'));
      if (!response.ok) {
        throw new Error(`Failed to load products (${response.status})`);
      }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data.filter(p => !p.isSet) : []);
    } catch (error) {
      console.error('Error fetching products for audit logs:', error);
      setProductsError(error.message || 'Unable to load products');
    } finally {
      setProductsLoading(false);
    }
  };

  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState(null); // For SuperAdmin selection

  // Fetch current user's college info (SubAdmin constraint)
  const userCollegeId =
    currentUserInfo?.assignedCollege?._id ||
    (typeof currentUserInfo?.assignedCollege === 'string' ? currentUserInfo?.assignedCollege : null);
  const targetCollegeId = userCollegeId && !isSuperAdmin ? userCollegeId : selectedCollege;

  useEffect(() => {
    // Initialize selectedCollege: if SubAdmin, force to their college. If SA, kept null (Central)
    if (userCollegeId && !isSuperAdmin) {
      setSelectedCollege(userCollegeId);
    }
  }, [userCollegeId, isSuperAdmin]);

  useEffect(() => {
    // Reset manual "Before Audit" edits when switching stock context.
    setBeforeTouched({});
  }, [targetCollegeId]);

  const fetchColleges = async () => {
    try {
      const response = await fetch(apiUrl('/api/stock-transfers/colleges'));
      if (response.ok) {
        const data = await response.json();
        setColleges(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching colleges:', error);
    }
  };

  const fetchPendingLogs = async () => {
    try {
      setLogsLoading(true);
      setLogsError('');
      // If Sub-Admin, filter by their college. SuperAdmin sees all or filtered by selectedCollege
      let query = '?status=pending';
      const targetCollege = targetCollegeId;

      if (targetCollege) {
        query += `&collegeId=${targetCollege}`;
      } else if (isSuperAdmin && selectedCollege === null) {
        // If SA and selected Central (null), maybe show only Central audits? 
        // Or show ALL if "All" selected? Let's assume null means Central for Entry, but for List maybe we need distinct 'all' logic.
        // For Filter in Approval: Let's assume we want to filter by the selected options.
        // Current logic: `selectedCollege` acts as filter.
        // However, for Approval, SA might want to see EVERYTHING.
        // Let's keep `selectedCollege` primarily for ENTRY context, and use a separate filter for APPROVAL?
        // Actually, user said "raise from particular college".
        // Let's add a robust filter state for Lists.
      }

      // REVISED LIST LOGIC in render, or here?
      // Let's stick to standard fetch. For SA, if they picked a college in filter, use it.
      // If we use selectedCollege for both Entry and View, it's consistent.

      if (targetCollege) query = `?status=pending&collegeId=${targetCollege}`;

      const response = await fetch(apiUrl(`/api/audit-logs${query}`));
      if (!response.ok) {
        throw new Error(`Failed to load audit logs (${response.status})`);
      }
      const data = await response.json();
      setPendingLogs(Array.isArray(data) ? data.filter(log => !log.product?.isSet) : []);
    } catch (error) {
      console.error('Error fetching pending audit logs:', error);
      setLogsError(error.message || 'Unable to load audit logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchHistoryLogs = async () => {
    try {
      setHistoryLoading(true);
      setHistoryError('');
      let query = '?status=all';
      const targetCollege = targetCollegeId;
      if (targetCollege) query += `&collegeId=${targetCollege}`;

      const response = await fetch(apiUrl(`/api/audit-logs${query}`));
      if (!response.ok) {
        throw new Error(`Failed to load audit history (${response.status})`);
      }
      const data = await response.json();
      const nonPending = Array.isArray(data) ? data.filter(entry => entry.status !== 'pending' && !entry.product?.isSet) : [];
      setHistoryLogs(nonPending);
    } catch (error) {
      console.error('Error fetching audit history:', error);
      setHistoryError(error.message || 'Unable to load audit history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Helper to get stock for product based on context (Central vs College)
  const getContextStock = (product) => {
    return product.stock ?? 0;
  };

  // Need to fetch College Stock if user is SubAdmin to show correct "Current Stock"
  const [collegeStockMap, setCollegeStockMap] = useState({});

  useEffect(() => {
    const targetCollege = targetCollegeId;

    if (targetCollege) {
      // Fetch college stock to override central stock display
      const fetchCollegeStock = async () => {
        try {
          const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${targetCollege}/stock`));
          if (res.ok) {
            const data = await res.json();
            const map = {};
            (data.stock || []).forEach(item => {
              const rawProductId =
                typeof item.product === 'object'
                  ? (item.product?._id ?? item.product?.id)
                  : item.product;
              if (rawProductId !== undefined && rawProductId !== null) {
                map[String(rawProductId)] = Number(item.quantity) || 0;
              }
            });
            setCollegeStockMap(map);
          }
        } catch (e) { console.error('Error fetching college stock', e); }
      };
      fetchCollegeStock();
    } else {
      // Reset if central (mostly for SA switching back to Central)
      setCollegeStockMap({});
    }
  }, [targetCollegeId, refreshKey]);

  useEffect(() => {
    fetchProducts();
    if (isSuperAdmin) fetchColleges(); // Fetch colleges for SA
    fetchPendingLogs();
    fetchHistoryLogs();
  }, [refreshKey, selectedCollege, targetCollegeId]); // Re-fetch logs when college selection changes

  useEffect(() => {
    if (!products?.length) return;
    setEntryValues(prev => {
      const next = { ...prev };
      products.forEach(product => {
        const existing = next[product._id] || {};
        // Determine correct stock to show based on context
        const contextStock = targetCollegeId
          ? (collegeStockMap[String(product._id)] ?? 0)
          : (product.stock ?? 0);
        const shouldUseContextBefore = !beforeTouched[product._id];

        next[product._id] = {
          beforeQuantity: shouldUseContextBefore
            ? Number(contextStock)
            : (existing.beforeQuantity ?? Number(contextStock)),
          afterQuantity: existing.afterQuantity ?? '',
          notes: existing.notes ?? '',
        };
      });
      return next;
    });
  }, [products, collegeStockMap, targetCollegeId, beforeTouched]); // Dependency on collegeStockMap

  const handleEntryChange = (productId, field, value) => {
    if (field === 'beforeQuantity') {
      setBeforeTouched(prev => ({ ...prev, [productId]: true }));
    }
    setEntryValues(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const submitAuditForProduct = async (product) => {
    const values = entryValues[product._id] || {};

    // Fallback logic for initial beforeQuantity
    const contextStock = targetCollegeId
      ? (collegeStockMap[String(product._id)] ?? 0)
      : (product.stock ?? 0);

    const beforeQuantity = values.beforeQuantity !== undefined && values.beforeQuantity !== ''
      ? Number(values.beforeQuantity)
      : Number(contextStock);

    const afterQuantity = values.afterQuantity !== undefined && values.afterQuantity !== ''
      ? Number(values.afterQuantity)
      : null;

    if (!Number.isFinite(beforeQuantity) || beforeQuantity < 0) {
      setEntryStatus(prev => ({ ...prev, [product._id]: 'error' }));
      return { success: false, message: 'Invalid before quantity' };
    }

    if (!Number.isFinite(afterQuantity) || afterQuantity < 0) {
      setEntryStatus(prev => ({ ...prev, [product._id]: 'error' }));
      return { success: false, message: 'Invalid after quantity' };
    }

    try {
      setEntryStatus(prev => ({ ...prev, [product._id]: 'submitting' }));
      const response = await fetch(apiUrl('/api/audit-logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product._id,
          collegeId: targetCollegeId || null, // Send selected college (or null for central)
          beforeQuantity,
          afterQuantity,
          notes: values.notes || '',
          createdBy: currentUserName,
          batchId: values.batchId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to submit audit entry');
      }

      const created = await response.json();

      setEntryValues(prev => ({
        ...prev,
        [product._id]: {
          // Actually, 'before' should likely become the 'after' value if approved? 
          // No, approval is async. Reset to blank is fine.
          beforeQuantity: Number(afterQuantity), // Optimistic update?
          afterQuantity: '',
          notes: '',
        },
      }));
      setBeforeTouched(prev => ({ ...prev, [product._id]: false }));

      setPendingLogs(prev => [created, ...prev]);
      setEntryStatus(prev => ({ ...prev, [product._id]: 'success' }));
      return { success: true };
    } catch (error) {
      console.error('Error submitting audit log:', error);
      setEntryStatus(prev => ({ ...prev, [product._id]: 'error' }));
      return { success: false, message: error.message || 'Submission failed' };
    }
  };

  const handleSubmitAll = async () => {
    if (!canAccessEntry) {
      return;
    }
    if (isSubmittingAll) return;
    const productsToSubmit = products.filter(product => {
      const values = entryValues[product._id];
      return values && values.afterQuantity !== undefined && values.afterQuantity !== '';
    });

    if (productsToSubmit.length === 0) {
      alert('Enter an "After Audit" quantity for at least one product before submitting.');
      return;
    }

    setIsSubmittingAll(true);
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let successCount = 0;
    let failureCount = 0;

    for (const product of productsToSubmit) {
      handleEntryChange(product._id, 'batchId', batchId);
      const result = await submitAuditForProduct(product);
      if (result?.success) {
        successCount += 1;
      } else {
        failureCount += 1;
      }
    }

    if (successCount > 0) {
      await fetchPendingLogs();
      await fetchHistoryLogs();
      alert(`${successCount} audit entr${successCount === 1 ? 'y' : 'ies'} submitted for approval.`);
    }
    if (failureCount > 0) {
      alert(`${failureCount} audit entr${failureCount === 1 ? 'y' : 'ies'} failed to submit. Check highlighted rows and retry.`);
    }

    setIsSubmittingAll(false);
  };

  // ... (Approval logic remains mostly same, backend handles actual stock update)
  const processGroupedLogs = async (group, action) => {
    if (!canAccessApproval) {
      return;
    }
    if (!group?.items?.length) return;
    const endpoint = action === 'approve' ? 'approve' : 'reject';
    const reason =
      action === 'reject'
        ? window.prompt('Enter a reason for rejection (optional):', '') || ''
        : '';

    setApprovingId(group.batchId);
    try {
      for (const log of group.items) {
        const response = await fetch(apiUrl(`/api/audit-logs/${log._id}/${endpoint}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvedBy: currentUserName,
            notes: reason,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Failed to ${action} audit log`);
        }
      }

      await fetchPendingLogs();
      await fetchProducts();
      // Refresh college stock if relevant
      if (userCollegeId && !isSuperAdmin) {
        setRefreshKey(prev => prev + 1); // Trigger re-fetch
      }
      await fetchHistoryLogs();

      alert(
        action === 'approve'
          ? 'Audit request approved. Stock quantities have been updated.'
          : 'Audit request rejected.'
      );
    } catch (error) {
      console.error(`Error trying to ${action} audit logs:`, error);
      alert(error.message || `Unable to ${action} audit logs.`);
    } finally {
      setApprovingId('');
    }
  };

  const handleApproveGroup = (group) => processGroupedLogs(group, 'approve');
  const handleRejectGroup = (group) => processGroupedLogs(group, 'reject');

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const pendingGroups = useMemo(() => groupLogsByBatch(pendingLogs), [pendingLogs]);
  const historyGroups = useMemo(() => groupLogsByBatch(historyLogs), [historyLogs]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center shadow-lg">
              <ClipboardCheck className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
              <p className="text-gray-600 mt-1">
                Record {userCollegeId && !isSuperAdmin ? 'College' : 'Stock'} audit entries and approve adjustments.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start lg:self-auto">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors shadow-sm"
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
          {/* Same Tabs */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => canAccessEntry && setActiveTab('entry')}
              disabled={!canAccessEntry}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'entry'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
                } ${!canAccessEntry ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              {canAccessEntry ? <ClipboardList size={18} /> : <Lock size={18} />}
              Audit Log Entry
            </button>
            <button
              onClick={() => canAccessApproval && setActiveTab('approval')}
              disabled={!canAccessApproval}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'approval'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
                } ${!canAccessApproval ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
            >
              {canAccessApproval ? <ClipboardCheck size={18} /> : <Lock size={18} />}
              Audit Approval
            </button>
          </div>
        </div>

        {activeTab === 'none' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-600">
            <Lock className="mx-auto mb-3 text-gray-400" size={32} />
            <p className="text-sm font-medium">You do not have permission to access audit logs.</p>
          </div>
        )}

        {activeTab === 'entry' && canAccessEntry && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Audit Log Entry</h3>
                  <p className="text-sm text-gray-500">
                    Provide the before and after quantities for {selectedCollege ? (colleges.find(c => c._id === selectedCollege)?.name || 'Selected College') : 'Central Warehouse'}.
                  </p>

                  {isSuperAdmin && (
                    <div className="mt-2">
                      <select
                        value={selectedCollege || ''}
                        onChange={(e) => setSelectedCollege(e.target.value || null)} // Empty string becomes null (Central)
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      >
                        <option value="">Central Warehouse</option>
                        {colleges.map(c => (
                          <option key={c._id} value={c._id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {/* ... same headers ... */}
                <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  {products.length} product{products.length === 1 ? '' : 's'}
                </span>
                <button
                  onClick={handleSubmitAll}
                  disabled={isSubmittingAll}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmittingAll ? (
                    <>
                      <RefreshCcw size={16} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck size={16} />
                      Submit Audit Entries
                    </>
                  )}
                </button>
              </div>

              {/* ... same loading states ... */}
              {productsLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600">Loading products...</p>
                </div>
              ) : productsError ? (
                <div className="p-12 text-center space-y-4">
                  <Info className="mx-auto text-red-500" size={48} />
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">Unable to load products</h4>
                    <p className="text-gray-600">{productsError}</p>
                  </div>
                  <button
                    onClick={fetchProducts}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCcw size={16} />
                    Retry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Current Stock ({selectedCollege ? (colleges.find(c => c._id === selectedCollege)?.name || 'College') : 'Central'})
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Before Audit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">After Audit</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {products.map(product => {
                        const values = entryValues[product._id] || {};
                        const status = entryStatus[product._id];
                        const currentStock = targetCollegeId
                          ? (collegeStockMap[String(product._id)] ?? 0)
                          : (product.stock ?? 0);

                        return (
                          <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900">{product.name}</span>
                                <span className="text-xs text-gray-500">{product.forCourse ? product.forCourse.toUpperCase() : 'All Courses'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-semibold text-gray-900">{currentStock}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                placeholder={String(currentStock)}
                                value={values.beforeQuantity ?? ''}
                                onChange={(e) => handleEntryChange(product._id, 'beforeQuantity', e.target.value)}
                                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                min="0"
                                value={values.afterQuantity ?? ''}
                                onChange={(e) => handleEntryChange(product._id, 'afterQuantity', e.target.value)}
                                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Qty"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <textarea
                                value={values.notes ?? ''}
                                onChange={(e) => handleEntryChange(product._id, 'notes', e.target.value)}
                                placeholder="Notes (optional)"
                                className="w-full min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                rows={2}
                              />
                            </td>
                            <td className="px-6 py-4">
                              {/* ... same status ... */}
                              {status === 'submitting' && (
                                <div className="flex items-center gap-2 text-sm text-blue-600">
                                  <RefreshCcw size={14} className="animate-spin" />
                                  Submitting...
                                </div>
                              )}
                              {status === 'success' && (
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                  <CheckCircle2 size={14} />
                                  Submitted
                                </div>
                              )}
                              {status === 'error' && (
                                <div className="flex items-center gap-2 text-sm text-red-600">
                                  <XCircle size={14} />
                                  Needs attention
                                </div>
                              )}
                              {!status && (
                                <div className="text-sm text-gray-400">
                                  Pending entry
                                </div>
                              )}
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
        )}

        {activeTab === 'approval' && canAccessApproval && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Audit Approval</h3>
                  <p className="text-sm text-gray-500">
                    Review submitted audit entries, and approve or reject them to update stock levels.
                  </p>
                </div>
                <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  {pendingLogs.length} pending entr{pendingLogs.length === 1 ? 'y' : 'ies'}
                </span>
              </div>

              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600">Loading audit logs...</p>
                </div>
              ) : logsError ? (
                <div className="p-12 text-center space-y-4">
                  <Info className="mx-auto text-red-500" size={48} />
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">Unable to load audit logs</h4>
                    <p className="text-gray-600">{logsError}</p>
                  </div>
                  <button
                    onClick={fetchPendingLogs}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCcw size={16} />
                    Retry
                  </button>
                </div>
              ) : pendingGroups.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-6xl mb-4">✅</div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">No pending audits!</h4>
                  <p className="text-gray-600">All submitted audit entries have been reviewed.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {pendingGroups.map(group => {
                    const totalDifference = group.items.reduce(
                      (sum, log) => sum + (Number(log.afterQuantity || 0) - Number(log.beforeQuantity || 0)),
                      0
                    );
                    const totalProducts = group.items.length;
                    // Check if group belongs to a college (take from first item)
                    const collegeName = group.items[0]?.college?.name;

                    return (
                      <div key={group.batchId} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Submitted by {group.createdBy} on {new Date(group.createdAt).toLocaleString()}
                            </p>
                            {collegeName && (
                              <p className="text-xs font-semibold text-blue-600 mt-0.5">
                                For College: {collegeName}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {totalProducts} item{totalProducts === 1 ? '' : 's'} • Total difference: {totalDifference > 0 ? '+' : ''}
                              {totalDifference}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApproveGroup(group)}
                              disabled={approvingId === group.batchId}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {approvingId === group.batchId ? (
                                <>
                                  <RefreshCcw size={16} className="animate-spin" />
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={16} />
                                  Approve Request
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectGroup(group)}
                              disabled={approvingId === group.batchId}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <XCircle size={16} />
                              Reject Request
                            </button>
                          </div>
                        </div>
                        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Before</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">After</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.items.map(log => {
                                const difference = Number(log.afterQuantity || 0) - Number(log.beforeQuantity || 0);
                                return (
                                  <tr key={log._id}>
                                    <td className="px-4 py-2">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-gray-900">{log.product?.name || 'N/A'}</span>
                                        <span className="text-xs text-gray-500">
                                          {log.college
                                            ? `College Stock`
                                            : `Central Stock: ${log.product?.stock ?? 'N/A'}`}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">{log.beforeQuantity}</td>
                                    <td className="px-4 py-2 font-semibold text-gray-900">{log.afterQuantity}</td>
                                    <td className="px-4 py-2">
                                      <span className={`font-medium ${difference === 0 ? 'text-gray-500' : difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {difference > 0 ? '+' : ''}
                                        {difference}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-700 whitespace-pre-line">{log.notes || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <History size={18} />
                    Audit History
                  </h3>
                  <p className="text-sm text-gray-500">
                    View previously approved or rejected audit adjustments.
                  </p>
                </div>
                <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  {historyGroups.length} request{historyGroups.length === 1 ? '' : 's'}
                </span>
              </div>

              {historyLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600">Loading audit history...</p>
                </div>
              ) : historyError ? (
                <div className="p-12 text-center space-y-4">
                  <Info className="mx-auto text-red-500" size={48} />
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-1">Unable to load audit history</h4>
                    <p className="text-gray-600">{historyError}</p>
                  </div>
                  <button
                    onClick={fetchHistoryLogs}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCcw size={16} />
                    Retry
                  </button>
                </div>
              ) : historyGroups.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-6xl mb-4">🗂️</div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">No audit history yet</h4>
                  <p className="text-gray-600">Approved and rejected audit entries will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {historyGroups.map(group => {
                    const totalDifference = group.items.reduce(
                      (sum, log) => sum + (Number(log.afterQuantity || 0) - Number(log.beforeQuantity || 0)),
                      0
                    );
                    const statusBadge =
                      group.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700';
                    return (
                      <div key={group.batchId} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge}`}>
                                {group.status.charAt(0).toUpperCase() + group.status.slice(1)}
                              </span>
                              Reviewed {group.status === 'approved' ? 'by' : 'by'} {group.approvedBy || 'System'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Submitted by {group.createdBy} on {new Date(group.createdAt).toLocaleString()}
                            </p>
                            {group.items[0]?.college?.name && (
                              <p className="text-xs font-semibold text-blue-600 mt-0.5">
                                For College: {group.items[0].college.name}
                              </p>
                            )}
                            <p className="text-xs text-gray-500">
                              Reviewed on {group.approvedAt ? new Date(group.approvedAt).toLocaleString() : '—'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {group.items.length} item{group.items.length === 1 ? '' : 's'} • Total difference:{' '}
                              {totalDifference > 0 ? '+' : ''}
                              {totalDifference}
                            </p>
                          </div>
                        </div>
                        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Before</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">After</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {group.items.map(log => {
                                const difference = Number(log.afterQuantity || 0) - Number(log.beforeQuantity || 0);
                                return (
                                  <tr key={log._id}>
                                    <td className="px-4 py-2">
                                      <div className="flex flex-col">
                                        <span className="font-medium text-gray-900">{log.product?.name || 'N/A'}</span>
                                        <span className="text-xs text-gray-500">
                                          Stock after review: {log.product?.stock ?? 'N/A'}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">{log.beforeQuantity}</td>
                                    <td className="px-4 py-2 font-semibold text-gray-900">{log.afterQuantity}</td>
                                    <td className="px-4 py-2">
                                      <span className={`font-medium ${difference === 0 ? 'text-gray-500' : difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {difference > 0 ? '+' : ''}
                                        {difference}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-700 whitespace-pre-line">{log.notes || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;

