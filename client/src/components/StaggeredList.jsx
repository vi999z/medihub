import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { Children, cloneElement, isValidElement } from 'react';

export default function StaggeredList({ children, staggerDelay = 0.05, className = '' }) {
  const prefersReducedMotion = useReducedMotion();
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : staggerDelay,
        delayChildren: prefersReducedMotion ? 0 : 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : 0.4,
        ease: [0.25, 0.1, 0.25, 1]
      }
    }
  };

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        return (
          <motion.div
            key={child.key || index}
            variants={itemVariants}
            style={{ display: 'contents' }}
          >
            {cloneElement(child, { index })}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
