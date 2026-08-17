import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { IconCircleCheck, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';

const ToastContext = createContext(null);
const ICONS = { success: IconCircleCheck, error: IconAlertCircle, info: IconInfoCircle };
const DURATION = 3500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const prefersReducedMotion = useReducedMotion();

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DURATION);
  }, []);

  const toastVariants = {
    hidden: { opacity: 0, x: 40, scale: 0.9 },
    visible: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 40, scale: 0.9 }
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-stack">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || IconInfoCircle;
            return (
              <motion.div
                key={t.id}
                className={`toast toast-${t.type}`}
                variants={prefersReducedMotion ? {} : toastVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 28 }}
              >
                <Icon size={18} stroke={2} />
                <span>{t.message}</span>
                {!prefersReducedMotion && (
                  <motion.div
                    className="toast-progress"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: DURATION / 1000, ease: 'linear' }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}