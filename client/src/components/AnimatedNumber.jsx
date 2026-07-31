import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';

export default function AnimatedNumber({ value, prefix = '', decimals = 0 }) {
  const motionValue = useMotionValue(0);
  const prefersReducedMotion = useReducedMotion();
  const display = useTransform(motionValue, (v) =>
    `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`
  );
  const isFirst = useRef(true);

  useEffect(() => {
    if (value === undefined || value === null) return;
    if (prefersReducedMotion) { motionValue.set(value); return; }
    const controls = animate(motionValue, value, { duration: isFirst.current ? 0.9 : 0.5, ease: 'easeOut' });
    isFirst.current = false;
    return controls.stop;
  }, [value]);

  return <motion.span>{display}</motion.span>;
}