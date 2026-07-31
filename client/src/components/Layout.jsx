import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconLayoutDashboard, IconPill, IconPackage, IconReceipt, IconBellRinging,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout, IconSearch, IconChevronDown,
  IconTools
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

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
  { to: '/maintenance', label: 'Maintenance', icon: IconTools },
];
const ALL_ITEMS = [...NAV_ITEMS, ...ADMIN_ITEMS];

function NavItem({ to, label, icon: Icon, isActive }) {
  return (
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`}>
      {isActive && <motion.div layoutId="nav-pill" className="nav-pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span className="nav-link-content"><Icon size={16} stroke={1.8} /> {label}</span>
    </NavLink>
  );
}

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function TopBar({ pageTitle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [medicines, setMedicines] = useState([]);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    api.get('/medicines').then((r) => setMedicines(r.data)).catch(() => {});
    api.get('/notifications?unread=true').then((r) => setUnread(r.data.length)).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const results = query.length > 0
    ? medicines.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function goToMedicine() {
    setQuery('');
    navigate('/medicines');
  }

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <header className="topbar">
      <div className="breadcrumb">{pageTitle}</div>
      <div className="topbar-actions" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <div className="search-bar">
          <IconSearch size={15} className="search-icon" stroke={1.8} />
          <input placeholder="Search medicines…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((m) => (
                <button key={m.id} type="button" className="search-result-item" onClick={goToMedicine}>
                  {m.name} <span>{m.strength}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="icon-btn" onClick={() => navigate('/notifications')}>
          <IconBellRinging size={18} stroke={1.8} />
          {unread > 0 && <span className="dot-badge" />}
        </button>

        <div className="avatar-wrapper" ref={menuRef}>
          <button className="avatar-trigger" onClick={() => setMenuOpen((o) => !o)}>
            <span className="avatar-circle">{initials(user?.full_name)}</span>
            <span className="avatar-name">{user?.full_name?.split(' ')[0]}</span>
            <IconChevronDown size={14} stroke={1.8} color="var(--steel)" />
          </button>
          {menuOpen && (
            <div className="avatar-menu">
              <div className="avatar-menu-header">
                <strong>{user?.full_name}</strong>
                <span>{user?.role}</span>
              </div>
              <button className="avatar-menu-item" onClick={handleLogout}>
                <IconLogout size={15} stroke={1.8} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const pageTitle = ALL_ITEMS.find((i) => i.to === location.pathname)?.label || 'MediHub';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><span className="dot" />MEDI<span>HUB</span></div>
        <nav>
          {NAV_ITEMS.map((item) => <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />)}
          {user.role === 'admin' && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '10px 8px' }} />
              {ADMIN_ITEMS.map((item) => <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />)}
            </>
          )}
        </nav>
      </aside>
      <div className="shell-main">
        <TopBar pageTitle={pageTitle} />
        <main className="main-content" style={{ position: 'relative' }}>
          <motion.div
            key={location.pathname}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.12, ease: 'easeOut' }}
            style={{ minHeight: '100%' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}