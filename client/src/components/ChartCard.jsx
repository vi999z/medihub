import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

export default function ChartCard({ title, children, className = '', actions }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={`card ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: 'easeOut', delay: 0.1 }}
      style={{ padding: '24px' }}
    >
      <div className="section-title" style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{title}</h3>
        {actions && <div>{actions}</div>}
      </div>
      {children}
    </motion.div>
  );
}
