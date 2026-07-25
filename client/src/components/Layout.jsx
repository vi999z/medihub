import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Pill, Package, Receipt, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/medicines', label: 'Medicines', icon: Pill },
  { to: '/batches', label: 'Batches', icon: Package },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/notifications', label: 'Alerts', icon: Bell },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">MEDI<span>HUB</span></div>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user?.full_name}</strong>
            {user?.role}
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}