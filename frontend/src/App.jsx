import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
const Sidebar = lazy(() => import('./Sidebar'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const StudentDetail = lazy(() => import('./pages/StudentDetail'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
// const AddStudent = lazy(() => import('./pages/AddStudent')); // REMOVED
// const StudentManagement = lazy(() => import('./pages/StudentManagement')); // REMOVED
const Login = lazy(() => import('./pages/Login'));
const SubAdminManagement = lazy(() => import('./pages/SubAdminManagement'));
const ManageStock = lazy(() => import('./pages/ManageStock'));
const HomePage = lazy(() => import('./pages/HomePage'));
const CourseManagement = lazy(() => import('./pages/CourseManagement'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const StudentDue = lazy(() => import('./pages/StudentDue.jsx'));
const AuditLogs = lazy(() => import('./pages/AuditLogs.jsx'));
const StockTransfers = lazy(() => import('./pages/StockTransfers.jsx'));
const GeneralPurchase = lazy(() => import('./pages/GeneralPurchase.jsx'));
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard.jsx'));
const EmployeeDetail = lazy(() => import('./pages/EmployeeDetail.jsx'));
import ProtectedRoute from './components/ProtectedRoute';
import { apiUrl } from './utils/api';
import useOnlineStatus from './hooks/useOnlineStatus';
import { loadJSON, saveJSON } from './utils/storage';

import { hasViewAccess } from './utils/permissions';

const resolveDefaultPath = (user) => {
  if (!user) return '/login';
  if (user.role === 'Administrator') return '/';

  const permissions = user.permissions || [];
  const priorityPaths = [
    { key: 'dashboard', path: '/' },
    // { key: 'add-student', path: '/add-student' }, // REMOVED
    // { key: 'student-management', path: '/student-management' }, // REMOVED
    { key: 'course-dashboard', path: '/students-dashboard' },
    { key: 'employee-dashboard', path: '/employees-dashboard' },
    { key: 'courses', path: '/courses' },
    { key: 'manage-stock', path: '/manage-stock' },
    { key: 'transactions', path: '/transactions' },
    { key: 'settings', path: '/settings' },
  ];

  for (const item of priorityPaths) {
    if (hasViewAccess(permissions, item.key)) {
      return item.path;
    }
  }

  return '/';
};

const DefaultRoute = ({ currentUser }) => {
  const targetPath = resolveDefaultPath(currentUser);

  if (targetPath !== '/') {
    return <Navigate to={targetPath} replace />;
  }

  return <Dashboard />;
};

function App() {
  // const [students, setStudents] = useState(() => loadJSON('studentsCache', [])); // REMOVED legacy cache
  const [itemCategories, setItemCategories] = useState(() => loadJSON('itemCategoriesCache', []));
  const [products, setProducts] = useState(() => loadJSON('productsCache', []));
  const [currentCourse, setCurrentCourse] = useState('');
  // Initialize isAuthenticated from localStorage
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) return true;
    return !!localStorage.getItem('isAuthenticated');
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState(() => loadJSON('pendingTransactions', []));
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const processingQueueRef = useRef(false);

  // Check for mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      setSidebarOpen(window.innerWidth > 768); // Open on desktop, closed on mobile
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // REMOVED legacy fetchStudentsData
  /*
  const fetchStudentsData = useCallback(async () => {
    if (!isAuthenticated) return;
    // Persist authentication state locally for reloads
    localStorage.setItem('isAuthenticated', 'true');

    try {
      const studentsRes = await fetch(apiUrl('/api/users'));
      if (studentsRes.ok) {
        const studentsData = await studentsRes.json();
        const formattedStudents = studentsData.map(s => ({ ...s, id: s._id }));
        setStudents(formattedStudents);
        saveJSON('studentsCache', formattedStudents);
      }
    } catch (error) {
      console.warn('Could not fetch students yet:', error);
    }
  }, [isAuthenticated]);
  */

  const fetchProductsData = useCallback(async () => {
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

      const productsRes = await fetch(apiUrl('/api/products'));
      if (!productsRes.ok) throw new Error(`Server responded with ${productsRes.status}`);
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
          saveJSON('productsCache', productsWithCollegeStock);
        } else {
          setProducts(globalProducts || []);
          saveJSON('productsCache', globalProducts || []);
        }
      } else {
        setProducts(globalProducts || []);
        saveJSON('productsCache', globalProducts || []);
      }
    } catch (err) {
      console.warn('Could not fetch products on app load:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isAuthenticated && isOnline) {
      // fetchStudentsData(); // REMOVED
      localStorage.setItem('isAuthenticated', 'true'); // Keep auth persistence
    } else if (!isAuthenticated) {
      // Clear authentication state
      localStorage.removeItem('isAuthenticated');
      setCurrentUser(null);
    }
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (isOnline) {
      fetchProductsData();
    }
  }, [isOnline, fetchProductsData]);

  useEffect(() => {
    if (!Array.isArray(products)) return;
    const cats = Array.from(new Set((products || []).map(p => p.name?.toLowerCase().replace(/\s+/g, '_')).filter(Boolean)));
    setItemCategories(cats);
    saveJSON('itemCategoriesCache', cats);
  }, [products]);

  /*
  useEffect(() => {
    if (Array.isArray(students)) {
      saveJSON('studentsCache', students);
    }
  }, [students]);
  */

  useEffect(() => {
    saveJSON('productsCache', products);
  }, [products]);

  useEffect(() => {
    saveJSON('pendingTransactions', pendingTransactions);
  }, [pendingTransactions]);

  useEffect(() => {
    if (!isAuthenticated) {
      const token = localStorage.getItem('authToken');
      const savedUser = localStorage.getItem('currentUser');
      if (token && savedUser) {
        setCurrentUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      }
    } else {
      localStorage.setItem('isAuthenticated', 'true');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isOnline || pendingTransactions.length === 0 || processingQueueRef.current) {
      return;
    }

    let isCancelled = false;
    const processQueue = async () => {
      processingQueueRef.current = true;
      const remaining = [];
      let processedAny = false;

      for (const item of pendingTransactions) {
        if (isCancelled) break;
        try {
          const response = await fetch(apiUrl('/api/transactions'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });

          if (!response.ok) {
            throw new Error(`Failed to sync queued transaction (${response.status})`);
          }

          processedAny = true;
        } catch (error) {
          console.warn('Failed to process queued transaction:', error);
          remaining.push(item);
        }
      }

      if (!isCancelled) {
        setPendingTransactions(remaining);
        if (processedAny) {
          // await fetchStudentsData(); // REMOVED
          await fetchProductsData();
        }
      }
      processingQueueRef.current = false;
    };

    processQueue();

    return () => {
      isCancelled = true;
    };
  }, [isOnline, pendingTransactions, fetchProductsData]);

  const queueOfflineTransaction = useCallback((queuedTransaction, optimisticStudent) => {
    setPendingTransactions(prev => [...prev, queuedTransaction]);
    /*
    if (optimisticStudent) {
      setStudents(prev => {
        const exists = prev.some(s => String(s.id) === String(optimisticStudent.id));
        const updated = exists
          ? prev.map(s => (String(s.id) === String(optimisticStudent.id) ? optimisticStudent : s))
          : [...prev, optimisticStudent];
        saveJSON('studentsCache', updated);
        return updated;
      });
    }
    */
  }, []);

  // Listen to item category edit/delete events dispatched from ProductList
  useEffect(() => {
    const onRemove = (e) => {
      const name = e.detail;
      setItemCategories((prev) => prev.filter((i) => i !== name));
      // Removed local student item cleanup - handled by backend/dynamic calculation now
    };

    const onEdit = (e) => {
      const { oldVal, newVal } = e.detail;
      const normalizedNew = newVal.toLowerCase().replace(/\s+/g, '_');
      setItemCategories((prev) => prev.map(i => i === oldVal ? normalizedNew : i));
      // Removed local student item cleanup - handled by backend/dynamic calculation now
    };

    window.addEventListener('removeItemCategory', onRemove);
    window.addEventListener('editItemCategory', onEdit);
    return () => {
      window.removeEventListener('removeItemCategory', onRemove);
      window.removeEventListener('editItemCategory', onEdit);
    };
  }, []);

  // REMOVED addStudent function

  const addItemCategory = (newItem) => {
    // This method now only updates client-side categories; server Products are source of truth
    if (itemCategories.includes(newItem) || newItem.trim() === '') return;
    const newItemCategory = newItem.toLowerCase().replace(/\s+/g, '_');
    setItemCategories((prev) => [...prev, newItemCategory]);
  };

  const handleLogin = async (id, password) => {
    try {
      const res = await fetch(apiUrl('/api/subadmins/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: id, password }),
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      const token = data.token || `local-${data._id}`;
      const userData = {
        name: data.name,
        role: data.role || 'Editor',
        id: data._id,
        permissions: data.permissions || [],
        assignedCollege: data.assignedCollege || data.assignedBranch || null,
        assignedBranch: data.assignedCollege || data.assignedBranch || null, // Keep for backward compatibility
      };

      setCurrentUser(userData);
      localStorage.setItem('currentUser', JSON.stringify(userData));
      localStorage.setItem('authToken', token);
      setIsAuthenticated(true);
      navigate('/');
      return true;
    } catch (err) {
      console.error('Login failed:', err);
      return false;
    }
  };

  const handleLogout = () => {
    // It's good practice to also notify the backend of logout
    fetch(apiUrl('/api/auth/logout'), { method: 'POST' }).catch(err => console.warn("Logout notification failed", err));
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
    setCurrentUser(null);
    // The component will re-render to the public routes, and the Navigate path="*" will send them to "/" (HomePage)
  };

  // Loading animation component
  const LoadingScreen = () => (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="text-center">
        {/* Animated Logo/Icon */}
        <div className="relative mb-8">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-pulse">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          {/* Rotating ring */}
          <div className="absolute inset-0 w-20 h-20 mx-auto border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>

        {/* Loading text with animation */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-gray-800 animate-pulse">Loading Application</h3>
          <div className="flex items-center justify-center gap-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className={`min-h-screen bg-gray-50 ${!isOnline ? 'pt-16' : ''}`}>
        {!isOnline && (
          <div className="fixed top-2 left-0 right-0 z-[60] flex justify-center px-4 pointer-events-none">
            <div className="bg-red-500 text-white  text-sm font-medium py-2.5 px-4 rounded-full shadow-lg pointer-events-auto flex items-center gap-2 max-w-4xl w-full justify-center">
              <span className="text-base leading-none">📡</span>
              <span className="text-center">
                You’re offline. Showing cached data edits will sync as soon as you reconnect.
              </span>
            </div>
          </div>
        )}
        {isAuthenticated ? (
          <>
            <Sidebar
              onLogout={handleLogout}
              isMobile={isMobile}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              currentUser={currentUser}
            />
            <main className={`
            flex-1 min-h-screen bg-gray-50 flex justify-center items-start transition-all duration-300
            ${isMobile ? 'ml-0' : (sidebarOpen ? 'ml-52' : 'ml-20')}
            ${isMobile ? 'pt-20 px-4' : 'px-8'}
            }
          `}>
              {isMobile && (
                <button
                  className="fixed top-4 left-4 z-50 w-12 h-12 rounded-xl bg-primary-500 border-none text-white flex items-center justify-center cursor-pointer shadow-strong transition-all duration-200 hover:bg-primary-600 hover:scale-105"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu size={24} />
                </button>
              )}
              <div className="w-full  mx-auto">
                <Routes>
                  {/* Dashboard is the default route for authenticated users */}
                  <Route
                    path="/"
                    element={<DefaultRoute currentUser={currentUser} />}
                  />
                  <Route
                    path="/students-dashboard"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["student-dashboard", "course-dashboard"]}>
                        <StudentDashboard
                          // initialStudents={students} // REMOVED
                          isOnline={isOnline}
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/student/:id"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["student-management", "student-dashboard", "course-dashboard"]}>
                        <StudentDetail
                          // students={students} // REMOVED
                          // setStudents={setStudents} // REMOVED
                          products={products}
                          setProducts={setProducts}
                          onQueueTransaction={queueOfflineTransaction}
                          isOnline={isOnline}
                          pendingTransactions={pendingTransactions}
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  {/* REMOVED AddStudent Route */}
                  {/*
                  <Route
                    path="/add-student"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="add-student">
                        <AddStudent addStudent={addStudent} currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  */}
                  {/* REMOVED StudentManagement Route */}
                  {/*
                  <Route
                    path="/student-management"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="student-management">
                        <StudentManagement
                          // students={students} // REMOVED
                          // setStudents={setStudents} // REMOVED
                          // addStudent={addStudent} // REMOVED
                          // refreshStudents={fetchStudentsData} // REMOVED
                          currentUser={currentUser}
                        />
                      </ProtectedRoute>
                    }
                  />
                  */}
                  <Route
                    path="/sub-admin-management"
                    element={
                      <ProtectedRoute currentUser={currentUser} superAdminOnly={true}>
                        <SubAdminManagement currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/manage-stock"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['stock-products', 'stock-add', 'stock-entries', 'stock-vendors', 'manage-stock']}>
                        <ManageStock itemCategories={itemCategories} addItemCategory={addItemCategory} setItemCategories={setItemCategories} currentCourse={currentCourse} products={products} setProducts={setProducts} currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/courses"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="courses">
                        <CourseManagement currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/transactions"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="transactions">
                        <Reports currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/student-due"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="transactions">
                        <StudentDue currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/audit-logs"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={['audit-log-entry', 'audit-log-approval', 'audit-logs']}>
                        <AuditLogs currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="settings">
                        <Settings currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/stock-transfers"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="stock-transfers">
                        <StockTransfers currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/general-purchase"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermission="general-purchase">
                        <GeneralPurchase currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/employees-dashboard"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["employee-dashboard"]}>
                        <EmployeeDashboard currentUser={currentUser} />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/employees/:id"
                    element={
                      <ProtectedRoute currentUser={currentUser} requiredPermissions={["employee-dashboard"]}>
                        <EmployeeDetail products={products} setProducts={setProducts} currentUser={currentUser} isOnline={isOnline} />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </div>
            </main>
          </>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            {/* Unauthenticated users attempting to access any other path are redirected to HomePage ('/') */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </div>
    </Suspense>
  );
}

export default App;
