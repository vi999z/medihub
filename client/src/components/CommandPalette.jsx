import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconLayoutDashboard, IconPill, IconPackage, IconReceipt, IconBellRinging,
  IconBrain, IconTruck, IconUsers, IconFileText, IconTools, IconSearch
} from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';

const NAV_ACTIONS = [
  { to: '/dashboard', label: 'Dashboard', desc: 'Overview and KPIs', icon: IconLayoutDashboard },
  { to: '/medicines', label: 'Medicines', desc: 'Manage medicine catalog', icon: IconPill },
  { to: '/batches', label: 'Batches', desc: 'Stock batches and expiry', icon: IconPackage },
  { to: '/transactions', label: 'Transactions', desc: 'Stock movements', icon: IconReceipt },
  { to: '/notifications', label: 'Alerts', desc: 'Notifications and warnings', icon: IconBellRinging },
  { to: '/ai-insights', label: 'AI Insights', desc: 'Expiry risk and reorder suggestions', icon: IconBrain },
  { to: '/suppliers', label: 'Suppliers', desc: 'Supplier directory', icon: IconTruck },
];

const ADMIN_ACTIONS = [
  { to: '/users', label: 'Users', desc: 'Manage user accounts', icon: IconUsers },
  { to: '/audit-log', label: 'Audit Log', desc: 'System activity trail', icon: IconFileText },
  { to: '/maintenance', label: 'Maintenance', desc: 'Admin cleanup tools', icon: IconTools },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const actions = useMemo(() => {
    const items = [...NAV_ACTIONS];
    if (user?.role === 'admin') items.push(...ADMIN_ACTIONS);
    return items;
  }, [user]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((a) =>
      a.label.toLowerCase().includes(term) || a.desc.toLowerCase().includes(term)
    );
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        goTo(filtered[selectedIndex]);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, filtered, selectedIndex]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function goTo(action) {
    onClose();
    navigate(action.to);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cmd-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="cmd-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="cmd-input-wrap">
              <IconSearch size={18} stroke={1.8} color="var(--steel)" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and actions…"
                aria-label="Search pages and actions"
              />
              <span className="cmd-kbd">ESC</span>
            </div>
            <div className="cmd-results" ref={listRef}>
              {filtered.length === 0 && (
                <div className="cmd-empty">No results for “{query}”.</div>
              )}
              {filtered.length > 0 && (
                <>
                  <div className="cmd-group-label">Navigate</div>
                  {filtered.map((action, index) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.to}
                        type="button"
                        data-index={index}
                        className={`cmd-item${selectedIndex === index ? ' selected' : ''}`}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => goTo(action)}
                      >
                        <span className="cmd-icon"><Icon size={16} stroke={1.8} /></span>
                        <span className="cmd-label">{action.label}</span>
                        <span className="cmd-desc">{action.desc}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}