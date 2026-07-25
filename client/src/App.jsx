import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Medicines from './pages/Medicines';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/medicines" element={
            <ProtectedRoute><Layout><Medicines /></Layout></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/medicines" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}