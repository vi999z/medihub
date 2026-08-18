import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Medicines = lazy(() => import('./pages/Medicines'));
const Batches = lazy(() => import('./pages/Batches'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AiInsights = lazy(() => import('./pages/AiInsights'));
const AiChat = lazy(() => import('./pages/AiChat'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Users = lazy(() => import('./pages/Users'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Scanner = lazy(() => import('./pages/Scanner'));

function AuthRedirect() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div className="page-loader">Loading your session…</div>;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <ScrollToTop />
            <Suspense fallback={<div className="page-loader">Loading your workspace…</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
                <Route path="/medicines" element={<ProtectedRoute><Layout><Medicines /></Layout></ProtectedRoute>} />
                <Route path="/batches" element={<ProtectedRoute><Layout><Batches /></Layout></ProtectedRoute>} />
                <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
                <Route path="/scanner" element={<ProtectedRoute><Layout><Scanner /></Layout></ProtectedRoute>} />
                <Route path="/ai-chat" element={<ProtectedRoute><Layout><AiChat /></Layout></ProtectedRoute>} />
                <Route path="/ai-insights" element={<ProtectedRoute><Layout><AiInsights /></Layout></ProtectedRoute>} />
                <Route path="/suppliers" element={<ProtectedRoute><Layout><Suppliers /></Layout></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Users /></Layout></ProtectedRoute>} />
                <Route path="/audit-log" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AuditLog /></Layout></ProtectedRoute>} />
                <Route path="/maintenance" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Maintenance /></Layout></ProtectedRoute>} />
                <Route path="*" element={<AuthRedirect />} />
              </Routes>
            </Suspense>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}