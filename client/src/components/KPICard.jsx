import { motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import AnimatedNumber from './AnimatedNumber';
import Skeleton from './Skeleton';

const VALID_KPI_COLORS = new Set(['green', 'mint', 'pink', 'lavender', 'blue', 'yellow', 'coral']);

export default function KPICard({
  icon: Icon,
  label,
  value,
  prefix = '',
  color = 'blue',
  trend,
  loading = false,
  sparklineData = [],
  breakdown
}) {
  const prefersReducedMotion = useReducedMotion();
  const colorClass = VALID_KPI_COLORS.has(color) ? color : 'blue';

  return (
    <motion.div
      className={`card kpi-card ${colorClass}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: 'easeOut' }}
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

      {!loading && trend !== undefined && trend !== null && (
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

      {!loading && breakdown?.length > 0 && (
        <div className="kpi-breakdown">
          {breakdown.map((row) => (
            <div key={row.label} className="kpi-breakdown-row">
              <span>{row.label}</span>
              <span className="value">{row.value}</span>
            </div>
          ))}
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
