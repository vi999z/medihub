import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DialogProvider } from './context/DialogContext';
import { BranchProvider } from './context/BranchContext';
import { ThemeProvider } from './context/ThemeContext';
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
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Users = lazy(() => import('./pages/Users'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Branches = lazy(() => import('./pages/Branches'));
const Reports = lazy(() => import('./pages/Reports'));

// A page inside the app shell. Each page has its own error boundary (reset when
// you navigate), so one page crashing leaves the menu and every other page working.
function Page({ children, roles }) {
  const location = useLocation();
  return (
    <ProtectedRoute allowedRoles={roles}>
      <Layout>
        <ErrorBoundary compact key={location.pathname}>{children}</ErrorBoundary>
      </Layout>
    </ProtectedRoute>
  );
}

function AuthRedirect() {
  const { user, authReady } = useAuth();
  if (!authReady) return <div className="page-loader">Loading your session…</div>;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <DialogProvider>
          <BranchProvider>
          <Router>
            <ScrollToTop />
            <Suspense fallback={<div className="page-loader">Loading your workspace…</div>}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
                <Route path="/medicines" element={<Page><Medicines /></Page>} />
                <Route path="/batches" element={<Page><Batches /></Page>} />
                <Route path="/transactions" element={<Page><Transactions /></Page>} />
                <Route path="/notifications" element={<Page><Notifications /></Page>} />
                <Route path="/scanner" element={<Page><Scanner /></Page>} />
                <Route path="/ai-assistant" element={<Page><AiAssistant /></Page>} />
                <Route path="/suppliers" element={<Page><Suppliers /></Page>} />
                <Route path="/users" element={<Page roles={['admin']}><Users /></Page>} />
                <Route path="/audit-log" element={<Page roles={['admin']}><AuditLog /></Page>} />
                <Route path="/reports" element={<Page><Reports /></Page>} />
                <Route path="/branches" element={<Page roles={['admin']}><Branches /></Page>} />
                <Route path="/maintenance" element={<Page roles={['admin']}><Maintenance /></Page>} />
                <Route path="*" element={<AuthRedirect />} />
              </Routes>
            </Suspense>
          </Router>
          </BranchProvider>
        </DialogProvider>
        </ToastProvider>
      </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}