import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import AnimatedNumber from './AnimatedNumber';
import Skeleton from './Skeleton';

const KPI_COLORS = {
  green: 'green',
  mint: 'mint', 
  pink: 'pink',
  lavender: 'lavender',
  blue: 'blue',
  yellow: 'yellow'
};

export default function KPICard({ 
  icon: Icon, 
  label, 
  value, 
  prefix = '', 
  color = 'blue',
  trend,
  loading = false,
  sparklineData = []
}) {
  const prefersReducedMotion = useReducedMotion();
  const colorClass = KPI_COLORS[color] || 'blue';

  return (
    <motion.div 
      className={`card kpi-card ${colorClass}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: 'easeOut' }}
      whileHover={{ y: -4, transition: { duration: prefersReducedMotion ? 0 : 0.2 } }}
    >
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <div className="icon-badge">
          <Icon size={18} stroke={1.8} />
        </div>
      </div>
      
      <div className="kpi-value">
        {loading ? (
          <Skeleton width={80} height={32} />
        ) : (
          <AnimatedNumber value={value} prefix={prefix} />
        )}
      </div>
      
      {!loading && trend !== undefined && (
        <div className="kpi-trend">
          {trend > 0 ? (
            <span className="up">↑ {trend.toFixed(0)}%</span>
          ) : trend < 0 ? (
            <span className="down">↓ {Math.abs(trend).toFixed(0)}%</span>
          ) : (
            <span className="flat">→ 0%</span>
          )}
          <span style={{ marginLeft: 4, fontWeight: 500, opacity: 0.7 }}>vs last week</span>
        </div>
      )}

      {sparklineData.length > 0 && !loading && !prefersReducedMotion && (
        <div className="kpi-sparkline">
          <svg width="60" height="30" viewBox="0 0 60 30">
            <path
              d={`M0,${30 - (sparklineData[0] / Math.max(...sparklineData)) * 30} ${sparklineData.map((v, i) => 
                `L${(i / (sparklineData.length - 1)) * 60},${30 - (v / Math.max(...sparklineData)) * 30}`
              ).join(' ')}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </motion.div>
  );
}
