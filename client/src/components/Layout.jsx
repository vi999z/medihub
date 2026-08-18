import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import {
  IconLayoutDashboard, IconPill, IconPackage, IconReceipt, IconBellRinging,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout, IconSearch, IconChevronDown,
  IconTools, IconQrcode, IconMessage, IconCloudRain
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard, section: 'MAIN MENU' },
  { to: '/medicines', label: 'Medicines', icon: IconPill, section: 'MAIN MENU' },
  { to: '/batches', label: 'Batches', icon: IconPackage, section: 'MAIN MENU' },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt, section: 'MAIN MENU' },
  { to: '/notifications', label: 'Alerts', icon: IconBellRinging, section: 'MAIN MENU' },
  { to: '/scanner', label: 'Scanner', icon: IconQrcode, section: 'MAIN MENU' },
  { to: '/ai-chat', label: 'AI Chat', icon: IconMessage, section: 'MAIN MENU' },
  { to: '/ai-insights', label: 'AI Insights', icon: IconBrain, section: 'OPERATIONS' },
  { to: '/weather-recommendations', label: 'Weather Stock', icon: IconCloudRain, section: 'OPERATIONS' },
  { to: '/suppliers', label: 'Suppliers', icon: IconTruck, section: 'OPERATIONS' },
];
const ADMIN_ITEMS = [
  { to: '/users', label: 'Users', icon: IconUsers, section: 'ADMIN' },
  { to: '/audit-log', label: 'Audit Log', icon: IconFileText, section: 'ADMIN' },
  { to: '/maintenance', label: 'Maintenance', icon: IconTools, section: 'ADMIN' },
];
const ALL_ITEMS = [...NAV_ITEMS, ...ADMIN_ITEMS];

function NavItem({ to, label, icon: Icon, isActive, showLabel }) {
  return (
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`}>
      {isActive && <motion.div layoutId="nav-pill" className="nav-pill-bg" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
      <span className="nav-link-content">
        <span className="nav-icon-pill"><Icon size={14} stroke={1.8} /></span>
        {showLabel && label}
      </span>
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
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.cachedGet('/medicines').catch(() => ({ data: [] })),
      api.cachedGet('/notifications?unread=true').catch(() => ({ data: [] }))
    ]).then(([medicinesRes, notificationsRes]) => {
      if (!mounted) return;
      setMedicines(medicinesRes.data || []);
      setUnread(notificationsRes.data?.length || 0);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    function handleKey(e) {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const term = query.trim().toLowerCase();
  const results = term
    ? medicines
        .filter((m) => [m.name, m.generic_name, m.category, m.dosage_form, m.strength]
          .some((value) => String(value || '').toLowerCase().includes(term)))
        .slice(0, 6)
    : [];

  function goToMedicine(medicine) {
    setQuery('');
    setSearchOpen(false);
    navigate(`/medicines?q=${encodeURIComponent(medicine.name)}`);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!term) return;
    setSearchOpen(false);
    navigate(`/medicines?q=${encodeURIComponent(query.trim())}`);
  }

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <header className="topbar">
      {/* Animated breadcrumb — slides in when page title changes */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pageTitle}
          className="breadcrumb"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {pageTitle}
        </motion.div>
      </AnimatePresence>

      <div className="topbar-actions" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <form className="search-bar" ref={searchRef} onSubmit={handleSearchSubmit} role="search">
          <IconSearch size={15} className="search-icon" stroke={1.8} />
          <input
            placeholder="Search medicines…"
            aria-label="Search medicines"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && term && (
            <div className="search-results">
              {results.length === 0
                ? <div className="search-result-item" style={{ color: 'var(--steel)', cursor: 'default' }}>No medicines match "{query.trim()}"</div>
                : results.map((m) => (
                  <button key={m.id} type="button" className="search-result-item" onClick={() => goToMedicine(m)}>
                    {m.name} <span>{[m.strength, m.dosage_form].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
            </div>
          )}
        </form>

        <button className="icon-btn" onClick={() => navigate('/notifications')} aria-label="Notifications">
          <IconBellRinging size={18} stroke={1.8} />
          {unread > 0 && <span className="dot-badge" />}
        </button>

        <div className="avatar-wrapper" ref={menuRef}>
          <button className="avatar-trigger" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            <span className="avatar-circle">{initials(user?.full_name)}</span>
            <div className="avatar-info">
              <span className="avatar-name">{user?.full_name?.split(' ')[0]}</span>
              <span className="avatar-email">{user?.email}</span>
            </div>
            {/* Chevron rotates smoothly when menu opens */}
            <IconChevronDown
              size={14}
              stroke={1.8}
              className={`avatar-chevron${menuOpen ? ' open' : ''}`}
            />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="avatar-menu"
                initial={{ opacity: 0, scale: 0.94, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -6 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformOrigin: 'top right' }}
              >
                <div className="avatar-menu-header">
                  <strong>{user?.full_name}</strong>
                  <span>{user?.role}</span>
                </div>
                <button className="avatar-menu-item danger" onClick={handleLogout}>
                  <IconLogout size={15} stroke={1.8} /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const pageTitle = useMemo(() => ALL_ITEMS.find((i) => i.to === location.pathname)?.label || 'MediHub', [location.pathname]);
  const visibleItems = user?.role === 'admin' ? ALL_ITEMS : NAV_ITEMS;

  useEffect(() => {
    const title = pageTitle === 'MediHub' ? 'MediHub' : `${pageTitle} · MediHub`;
    document.title = title;
  }, [pageTitle]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><span className="dot" />MEDI<span>HUB</span></div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {Object.entries(
            visibleItems.reduce((acc, item) => {
              if (!acc[item.section]) acc[item.section] = [];
              acc[item.section].push(item);
              return acc;
            }, {})
          ).map(([section, items]) => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
              {items.map((item) => (
                <NavItem 
                  key={item.to} 
                  {...item} 
                  isActive={location.pathname === item.to}
                  showLabel={true}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="shell-main">
        <TopBar pageTitle={pageTitle} />
        <main className="main-content" style={{ position: 'relative' }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ height: '100%' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}