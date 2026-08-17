import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

export default function AnimatedModal({ isOpen, onClose, children, className = '' }) {
  const prefersReducedMotion = useReducedMotion();

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const contentVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : 0.3,
        ease: [0.34, 1.56, 0.64, 1]
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: {
        duration: prefersReducedMotion ? 0 : 0.2,
        ease: 'easeIn'
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className={`modal-content ${className}`}
            variants={contentVariants}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
