import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  IconLayoutDashboard, IconPill, IconPackage, IconReceipt, IconBellRinging,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/medicines', label: 'Medicines', icon: IconPill },
  { to: '/batches', label: 'Batches', icon: IconPackage },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt },
  { to: '/notifications', label: 'Alerts', icon: IconBellRinging },
  { to: '/ai-insights', label: 'AI Insights', icon: IconBrain },
  { to: '/suppliers', label: 'Suppliers', icon: IconTruck },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'Users', icon: IconUsers },
  { to: '/audit-log', label: 'Audit Log', icon: IconFileText },
];

function NavItem({ to, label, icon: Icon, isActive }) {
  return (
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`}>
      {isActive && (
        <motion.div layoutId="nav-pill" className="nav-pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
      )}
      <span className="nav-link-content"><Icon size={16} stroke={1.8} /> {label}</span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><span className="dot" />MEDI<span>HUB</span></div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />
          ))}
          {user.role === 'admin' && (
            <>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 8px' }} />
              {ADMIN_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><strong>{user?.full_name}</strong>{user?.role}</div>
          <button className="logout-btn" onClick={handleLogout}><IconLogout size={15} stroke={1.8} /> Log out</button>
        </div>
      </aside>
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}