import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
// import { useAuth } from '../context/AuthContext'; // Make sure to import your actual useAuth hook
// import CommandPalette from './CommandPalette'; // Import your actual CommandPalette

// --- MOCK DATA & HOOKS (Replace with your actual imports/data) ---
const useAuth = () => ({ user: { name: 'John Doe', role: 'admin' } });

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'Manage Users', icon: '👥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const ALL_ITEMS = [...NAV_ITEMS, ...ADMIN_ITEMS];

// --- MISSING COMPONENTS ---
function NavItem({ to, label, icon, isActive }) {
  return (
    <Link to={to} className={`nav-item ${isActive ? 'active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </Link>
  );
}

// Dummy CommandPalette (if you don't already have the file)
function CommandPalette({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input type="text" placeholder="Search..." autoFocus />
      </div>
    </div>
  );
}

// --- RECONSTRUCTED TOPBAR ---
function TopBar({ pageTitle, onOpenPalette }) {
  const { user } = useAuth();

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <h2>{pageTitle}</h2>
      </div>
      
      <div className="top-bar-right">
        <button className="search-shortcut" onClick={onOpenPalette}>
          Search (Ctrl+K)
        </button>
        
        <div className="user-profile">
          <span className="user-name">{user?.name}</span>
          {user?.role === 'admin' && (
            <span className="role-badge">Admin</span>
          )}
        </div>
      </div>
    </header>
  );
}

// --- YOUR ORIGINAL LAYOUT COMPONENT ---
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
        <div className="sidebar-logo">
          <span className="dot" />MEDI<span>HUB</span>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div className="nav-section-label">Operations</div>
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />
          ))}
          
          {user?.role === 'admin' && (
            <>
              <div className="nav-section-label">Administration</div>
              {ADMIN_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} isActive={location.pathname === item.to} />
              ))}
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