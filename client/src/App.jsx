import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Medicines from './pages/Medicines';
import Batches from './pages/Batches';
import Transactions from './pages/Transactions';
import Notifications from './pages/Notifications';
import AiInsights from './pages/AiInsights';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/medicines" element={<ProtectedRoute><Layout><Medicines /></Layout></ProtectedRoute>} />
          <Route path="/batches" element={<ProtectedRoute><Layout><Batches /></Layout></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
          <Route path="/ai-insights" element={<ProtectedRoute><Layout><AiInsights /></Layout></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}