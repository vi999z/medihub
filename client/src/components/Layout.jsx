import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Pill, Package, Receipt, Bell, Brain, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/medicines', label: 'Medicines', icon: Pill },
  { to: '/batches', label: 'Batches', icon: Package },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/ai-insights', label: 'AI Insights', icon: Brain },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">MEDI<span>HUB</span></div>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 8px' }} />
              {ADMIN_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  <Icon size={16} /> {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><strong>{user?.full_name}</strong>{user?.role}</div>
          <button className="logout-btn" onClick={handleLogout}><LogOut size={15} /> Log out</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}