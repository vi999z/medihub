import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import {
  IconLayoutDashboard, IconPill, IconReceipt, IconBellRinging, IconBox,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout, IconSearch, IconChevronDown,
  IconTools, IconQrcode, IconMessage, IconCloudRain, IconSun, IconMoon, IconHelpCircle
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/axios';
import AnimatedModal from './AnimatedModal';

const NAV_GROUP_PRIMARY = [
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/medicines', label: 'Medicines', icon: IconPill },
  { to: '/batches', label: 'Batches', icon: IconBox },
  { to: '/suppliers', label: 'Suppliers', icon: IconTruck },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt },
  { to: '/scanner', label: 'Scanner', icon: IconQrcode },
];
const NAV_GROUP_SECONDARY = [
  { to: '/ai-chat', label: 'AI Chat', icon: IconMessage },
  { to: '/ai-insights', label: 'AI Insights', icon: IconBrain },
  { to: '/weather-recommendations', label: 'Weather', icon: IconCloudRain },
  { to: '/notifications', label: 'Alerts', icon: IconBellRinging },
  { to: '/audit-log', label: 'Audit Log', icon: IconFileText, adminOnly: true },
  { to: '/users', label: 'Users', icon: IconUsers, adminOnly: true },
  { to: '/maintenance', label: 'Maintenance', icon: IconTools, adminOnly: true },
];
const ALL_ITEMS = [...NAV_GROUP_PRIMARY, ...NAV_GROUP_SECONDARY];

function NavItem({ to, label, icon: Icon, isActive, showLabel }) {
  return (
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`}>
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
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [medicines, setMedicines] = useState([]);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const today = useMemo(() => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), []);

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

  // Pass `navigate` so AuthContext uses React Router instead of a hard reload.
  function handleLogout() { logout(navigate); }

  return (
    <header className="topbar">
      <div className={`breadcrumb-group${pageTitle ? '' : ' breadcrumb-group--date-only'}`}>
        {pageTitle && <div className="breadcrumb">{pageTitle}</div>}
        <div className="topbar-date">{today}</div>
      </div>

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

        <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help">
          <IconHelpCircle size={18} stroke={1.8} />
        </button>

        <button className="icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? <IconSun size={18} stroke={1.8} /> : <IconMoon size={18} stroke={1.8} />}
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

          {menuOpen && (
            <div className="avatar-menu">
              <div className="avatar-menu-header">
                <strong>{user?.full_name}</strong>
                <span>{user?.role}</span>
              </div>
              <button className="avatar-menu-item danger" onClick={handleLogout}>
                <IconLogout size={15} stroke={1.8} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatedModal isOpen={helpOpen} onClose={() => setHelpOpen(false)}>
        <h3 style={{ margin: '0 0 12px' }}>Help &amp; support</h3>
        <p style={{ color: 'var(--steel)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
          MediHub helps you track medicine inventory, batches, suppliers, and expiry risk.
          Use the sidebar to jump between sections, or the search bar above to find a
          specific medicine. For anything else, reach out to your system administrator.
        </p>
        <button className="btn btn-primary" onClick={() => setHelpOpen(false)}>Got it</button>
      </AnimatedModal>
    </header>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const pageTitle = useMemo(() => {
    const keepTitle = ['/dashboard', '/ai-chat', '/weather-recommendations'].includes(location.pathname);
    if (!keepTitle) return '';
    return ALL_ITEMS.find((i) => i.to === location.pathname)?.label || 'MediHub';
  }, [location.pathname]);
  const secondaryItems = NAV_GROUP_SECONDARY.filter((item) => !item.adminOnly || user?.role === 'admin');

  useEffect(() => {
    const title = pageTitle === 'MediHub' ? 'MediHub' : `${pageTitle} · MediHub`;
    document.title = title;
  }, [pageTitle]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo"><span className="dot" />MEDI<span>HUB</span></div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {NAV_GROUP_PRIMARY.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              isActive={location.pathname === item.to}
              showLabel={true}
            />
          ))}
          <div className="nav-divider" />
          {secondaryItems.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              isActive={location.pathname === item.to}
              showLabel={true}
            />
          ))}
        </nav>
      </aside>
      <div className="shell-main">
        <TopBar pageTitle={pageTitle} />
        <main className="main-content" style={{ position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
}