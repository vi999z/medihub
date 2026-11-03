import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useBranchFilter } from '../context/BranchContext';
import useBranches from '../hooks/useBranches';
import { useMemo } from 'react';
import {
  IconLayoutDashboard, IconPill, IconReceipt, IconBellRinging, IconBox,
  IconBrain, IconTruck, IconUsers, IconFileText, IconLogout, IconSearch, IconChevronDown,
  IconTools, IconQrcode, IconSun, IconMoon, IconHelpCircle, IconMenu2, IconMapPin, IconTextSize, IconReportAnalytics
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/axios';
import AnimatedModal from './AnimatedModal';
import { NOTIFICATIONS_CHANGED_EVENT } from '../utils/events';

const NAV_GROUP_PRIMARY = [
  { to: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/medicines', label: 'Medicines', icon: IconPill },
  { to: '/batches', label: 'Batches', icon: IconBox },
  { to: '/suppliers', label: 'Suppliers', icon: IconTruck },
  { to: '/transactions', label: 'Transactions', icon: IconReceipt },
  { to: '/reports', label: 'Reports', icon: IconReportAnalytics },
  { to: '/scanner', label: 'Scanner', icon: IconQrcode },
];
const NAV_GROUP_SECONDARY = [
  { to: '/ai-assistant', label: 'AI Assistant', icon: IconBrain },
  { to: '/notifications', label: 'Alerts', icon: IconBellRinging },
  { to: '/audit-log', label: 'Audit Log', icon: IconFileText, adminOnly: true },
  { to: '/branches', label: 'Branches', icon: IconMapPin, adminOnly: true },
  { to: '/users', label: 'Users', icon: IconUsers, adminOnly: true },
  { to: '/maintenance', label: 'Maintenance', icon: IconTools, adminOnly: true },
];
const ALL_ITEMS = [...NAV_GROUP_PRIMARY, ...NAV_GROUP_SECONDARY];

const HELP_BY_PAGE = {
  '/dashboard': ['See sales today, stock levels and what needs attention at a glance.', 'Use the branch, category and date filters at the top.', 'Click a stock box (out of stock, low, expiring, healthy) to filter the list below.'],
  '/medicines': ['Search by name, or use the filters and category chips.', 'Click a medicine to see its batches and expiry dates.', 'Use "Receive stock" when a delivery arrives, and "QR" to print a code for a medicine.'],
  '/batches': ['Each batch is one delivery with its own expiry date.', 'Filter by branch or status; use "Receive stock" to add a delivery.', 'Colours show how soon a batch expires.'],
  '/suppliers': ['Add the companies you buy from.', 'Choose a supplier when you receive stock to link them to a batch.'],
  '/transactions': ['Every stock movement is listed here: stock in, sale, adjustment, disposal and return.', 'Use "New transaction" to record one; adjustments need a reason.', 'Filter by type or pick a date.'],
  '/reports': ['Pick a report, a branch and a format, then press Download.', 'Sales and stock movement reports also let you choose the dates.'],
  '/scanner': ['Scan a barcode or QR code with the camera, or upload a photo of one.', 'A known code opens its medicine. An unknown code lets you add a new medicine or receive stock.'],
  '/notifications': ['Alerts warn about low stock, medicines close to expiry and expired batches.', 'Red is critical and needs action first. Click "Mark as read" once handled.'],
  '/ai-assistant': ['Chat: ask about stock and expiring medicines in plain language.', 'Insights: expiry risk, demand forecast, reorder suggestions and unusual movements.', 'Weather Restock: what to stock for the current weather and season.'],
  '/audit-log': ['A permanent record of who did what, and when. It cannot be deleted.'],
  '/users': ['Add accounts, change roles and deactivate people who should no longer have access.'],
  '/branches': ['Add a branch or change its name and address. Every medicine belongs to one branch.'],
  '/maintenance': ['Download a backup regularly. Restoring replaces all current data, so be careful.', 'Demo data is for testing only and can be removed.'],
};

function NavItem({ to, label, icon: Icon, isActive, showLabel }) {
  return (
    <NavLink to={to} className={`nav-link-wrapper${isActive ? ' active' : ''}`}>
      <span className="nav-link-content">
        <span className="nav-icon-pill"><Icon size={14} stroke={1.8} /></span>
        {showLabel && <span className="nav-label">{label}</span>}
      </span>
    </NavLink>
  );
}

function initials(name = '') {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function TopBar({ pageTitle, onOpenNav }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { branch, setBranch } = useBranchFilter();
  const { names: branchNames } = useBranches();
  const [textSize, setTextSize] = useState(() => {
    try { return localStorage.getItem('medihub_text_size') || 'normal'; } catch { return 'normal'; }
  });
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
    function loadUnread() {
      api.cachedGet('/notifications?unread=true')
        .catch(() => ({ data: [] }))
        .then((res) => { if (mounted) setUnread(res.data?.length || 0); });
    }
    api.cachedGet('/medicines')
      .catch(() => ({ data: [] }))
      .then((res) => { if (mounted) setMedicines(res.data || []); });
    loadUnread();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadUnread);
    return () => {
      mounted = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadUnread);
    };
  }, []);

  // Text size (normal / large / extra large) scales the page content for readability.
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    try { localStorage.setItem('medihub_text_size', textSize); } catch { /* storage unavailable */ }
  }, [textSize]);

  function cycleTextSize() {
    setTextSize((current) => (current === 'normal' ? 'large' : current === 'large' ? 'xlarge' : 'normal'));
  }

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
    // pointerdown (not mousedown) so taps on non-interactive areas close the
    // menus on iOS Safari, which doesn't emit mousedown for those.
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
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
      {/* Only visible on narrow screens, where the sidebar becomes a drawer */}
      <button className="icon-btn nav-toggle" onClick={onOpenNav} aria-label="Open navigation">
        <IconMenu2 size={20} stroke={1.8} />
      </button>
      <div className={`breadcrumb-group${pageTitle ? '' : ' breadcrumb-group--date-only'}`}>
        {pageTitle && <div className="breadcrumb">{pageTitle}</div>}
        <div className="topbar-date">{today}</div>
      </div>

      <div className="topbar-actions" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <label className="branch-picker" title="Show data for one branch or all branches">
          <IconMapPin size={15} stroke={1.8} aria-hidden="true" />
          <select
            value={branchNames.includes(branch) ? branch : 'all'}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Branch"
          >
            <option value="all">All branches</option>
            {branchNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>

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

        {/* The search bar is hidden on narrow screens; jump to the Medicines search instead */}
        <button className="icon-btn mobile-only" onClick={() => navigate('/medicines')} aria-label="Search medicines">
          <IconSearch size={18} stroke={1.8} />
        </button>

        <button className="icon-btn" onClick={() => navigate('/notifications')} aria-label="Notifications">
          <IconBellRinging size={18} stroke={1.8} />
          {unread > 0 && <span className="dot-badge" />}
        </button>

        <button className="icon-btn desktop-only" onClick={() => setHelpOpen(true)} aria-label="Help">
          <IconHelpCircle size={18} stroke={1.8} />
        </button>

        <button
          className="icon-btn"
          onClick={cycleTextSize}
          aria-label={`Text size: ${textSize === 'normal' ? 'normal' : textSize === 'large' ? 'large' : 'extra large'}. Click to change`}
          title={`Text size: ${textSize === 'normal' ? 'normal' : textSize === 'large' ? 'large' : 'extra large'}`}
        >
          <IconTextSize size={18} stroke={1.8} />
        </button>

        <button className="icon-btn desktop-only" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
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
              {/* Phones drop these from the topbar to save room, so offer them here */}
              <button className="avatar-menu-item mobile-only" onClick={() => { setMenuOpen(false); setHelpOpen(true); }}>
                <IconHelpCircle size={15} stroke={1.8} /> Help &amp; support
              </button>
              <button className="avatar-menu-item mobile-only" onClick={() => { setMenuOpen(false); toggle(); }}>
                {dark ? <IconSun size={15} stroke={1.8} /> : <IconMoon size={15} stroke={1.8} />} {dark ? 'Light mode' : 'Dark mode'}
              </button>
              <button className="avatar-menu-item danger" onClick={handleLogout}>
                <IconLogout size={15} stroke={1.8} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatedModal isOpen={helpOpen} onClose={() => setHelpOpen(false)}>
        <h3 style={{ margin: '0 0 12px' }}>Help &amp; support</h3>
        <p style={{ color: 'var(--steel)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 12px' }}>
          MediHub helps you track medicine inventory, batches, suppliers, and expiry risk.
          Use the menu on the left to move between pages, or the search bar above to find a medicine.
        </p>
        {(HELP_BY_PAGE[location.pathname] || []).length > 0 && (
          <>
            <h4 style={{ margin: '0 0 6px', fontSize: 13.5 }}>On this page</h4>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: 'var(--steel)' }}>
              {HELP_BY_PAGE[location.pathname].map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          </>
        )}
        <p style={{ color: 'var(--steel)', fontSize: 13, margin: '0 0 16px' }}>For anything else, reach out to your system administrator.</p>
        <button className="flat-btn-primary" onClick={() => setHelpOpen(false)}>Got it</button>
      </AnimatedModal>
    </header>
  );
}

// Shown whenever the browser loses its connection, so a failed save isn't a mystery.
function ConnectionBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);
  if (online) return null;
  return <div className="offline-banner" role="alert">You are offline. MEDIHUB can't save changes until your connection is back.</div>;
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const pageTitle = useMemo(() => {
    const keepTitle = ['/dashboard', '/ai-assistant'].includes(location.pathname);
    if (!keepTitle) return '';
    return ALL_ITEMS.find((i) => i.to === location.pathname)?.label || 'MediHub';
  }, [location.pathname]);
  const secondaryItems = NAV_GROUP_SECONDARY.filter((item) => !item.adminOnly || user?.role === 'admin');
  // Off-canvas sidebar state — only has an effect on narrow screens (see theme.css).
  // Remembering the path it was opened on closes it on any route change
  // (including browser back) without a state-resetting effect.
  const [navOpenPath, setNavOpenPath] = useState(null);
  const navOpen = navOpenPath === location.pathname;
  const setNavOpen = (open) => setNavOpenPath(open ? location.pathname : null);

  useEffect(() => {
    const title = pageTitle === 'MediHub' ? 'MediHub' : `${pageTitle} · MediHub`;
    document.title = title;
  }, [pageTitle]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpenPath(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-logo">
          <span className="dot" />MEDI<span>HUB</span>
        </div>
        <nav
          style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
          onClick={(e) => { if (e.target.closest('a')) setNavOpen(false); }}
        >
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
        <TopBar pageTitle={pageTitle} onOpenNav={() => setNavOpen(true)} />
        <ConnectionBanner />
        <main className="main-content" style={{ position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
}