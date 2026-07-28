import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Medicines from './pages/Medicines';
import Batches from './pages/Batches';
import Transactions from './pages/Transactions';
import Notifications from './pages/Notifications';
import AiInsights from './pages/AiInsights';
import Suppliers from './pages/Suppliers';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/medicines" element={<ProtectedRoute><Layout><Medicines /></Layout></ProtectedRoute>} />
            <Route path="/batches" element={<ProtectedRoute><Layout><Batches /></Layout></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
            <Route path="/ai-insights" element={<ProtectedRoute><Layout><AiInsights /></Layout></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><Layout><Suppliers /></Layout></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={['admin']}><Layout><Users /></Layout></ProtectedRoute>} />
            <Route path="/audit-log" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AuditLog /></Layout></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}