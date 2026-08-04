import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import {
  IconLayoutDashboard, IconPill, IconPackage, IconReceipt, IconBellRinging,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout, IconSearch, IconChevronDown,
  IconTools, IconCommand
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import CommandPalette from './CommandPalette';

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
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`} title={label}>
      {isActive && <motion.div layoutId="nav-pill" className="nav-pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span className="nav-link-content"><Icon size={17} stroke={1.8} /> <span>{label}</span></span>
    </NavLink>
  );
}

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function TopBar({ pageTitle, onOpenPalette }) {
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
      <div className="breadcrumb">{pageTitle}</div>
      <div className="topbar-actions">
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
                ? <div className="search-result-item" style={{ color: 'var(--steel)', cursor: 'default' }}>No medicines match “{query.trim()}”</div>
                : results.map((m) => (
                  <button key={m.id} type="button" className="search-result-item" onClick={() => goToMedicine(m)}>
                    {m.name} <span>{[m.strength, m.dosage_form].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
            </div>
          )}
        </form>

        <button className="icon-btn" onClick={onOpenPalette} title="Search (Ctrl+K)">
          <IconCommand size={18} stroke={1.8} />
        </button>

        <button className="icon-btn" onClick={() => navigate('/notifications')} title="Alerts">
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pageTitle = useMemo(() => ALL_ITEMS.find((i) => i.to === location.pathname)?.label || 'MediHub', [location.pathname]);

  useEffect(() => {
    const title = pageTitle === 'MediHub' ? 'MediHub' : `${pageTitle} · MediHub`;
    document.title = title;
  }, [pageTitle]);

  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="app-shell">
      <div className="aurora-bg" />
      <aside className="sidebar">
        <div className="sidebar-logo"><span className="dot" />MEDI<span>HUB</span></div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div className="nav-section-label">Operations</div>
          {NAV_ITEMS.map((item) => <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />)}
          {user.role === 'admin' && (
            <>
              <div className="nav-section-label">Administration</div>
              {ADMIN_ITEMS.map((item) => <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />)}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <strong>Megawide Drug Pharmacy</strong>
          Inventory Management System
          <br />© {year}
        </div>
      </aside>
      <div className="shell-main">
        <TopBar pageTitle={pageTitle} onOpenPalette={() => setPaletteOpen(true)} />
        <main className="main-content">
          <motion.div
            key={location.pathname}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.14, ease: 'easeOut' }}
            style={{ minHeight: '100%' }}
            className="page-enter"
          >
            {children}
          </motion.div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
