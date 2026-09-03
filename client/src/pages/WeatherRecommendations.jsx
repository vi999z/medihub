import { useEffect, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconCloud, IconCloudRain, IconSun, IconWind, IconDroplet,
  IconThermometer, IconRefresh, IconAlertTriangle, IconPackage,
  IconMapPin, IconCalendar, IconArrowUp, IconInfoCircle
} from '@tabler/icons-react';
import api from '../api/axios';
import Skeleton from '../components/Skeleton';

// ─── Utility helpers ──────────────────────────────────────────────────────────

const PH_CITIES = [
  'Lucena City,PH', 'Manila,PH', 'Quezon City,PH', 'Cebu City,PH', 'Davao City,PH',
  'Iloilo City,PH', 'Zamboanga,PH', 'Cagayan de Oro,PH', 'Bacolod,PH',
  'General Santos,PH', 'Baguio,PH',
];

const URGENCY_CONFIG = {
  critical: { label: 'Critical',  className: 'critical', color: 'var(--red)',    bg: 'var(--red-tint)' },
  high:     { label: 'High',      className: 'warning',  color: 'var(--amber)',  bg: 'var(--amber-tint)' },
  medium:   { label: 'Medium',    className: 'warning',  color: 'var(--amber)',  bg: '#f5f0e0' },
  low:      { label: 'Low',       className: 'safe',     color: 'var(--green)',  bg: 'var(--green-tint)' },
};

const CATEGORY_LABEL = {
  cold_flu:      '🤧 Cold & Flu',
  cough_cold:    '😷 Cough & Cold',
  antihistamine: '🌿 Antihistamine',
  analgesic:     '💊 Pain Relief',
  antidiarrheal: '🏥 Antidiarrheal',
  vitamins:      '🌿 Vitamins',
  electrolytes:  '💧 Electrolytes',
};

function WeatherIcon({ condition, size = 32, style = {} }) {
  const icons = {
    Rain: <IconCloudRain size={size} style={{ color: '#5a8aaa', ...style }} />,
    Drizzle: <IconCloudRain size={size} style={{ color: '#7aaecc', ...style }} />,
    Thunderstorm: <IconCloudRain size={size} style={{ color: '#4a5a8a', ...style }} />,
    Clear: <IconSun size={size} style={{ color: '#c8a050', ...style }} />,
    Clouds: <IconCloud size={size} style={{ color: '#8a9aaa', ...style }} />,
    Mist: <IconCloud size={size} style={{ color: '#aab0b8', ...style }} />,
    Haze: <IconCloud size={size} style={{ color: '#b0a890', ...style }} />,
  };
  return icons[condition] || <IconCloud size={size} style={{ color: '#8a9aaa', ...style }} />;
}

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.low;
  return (
    <span className={`status-pill ${cfg.className}`} style={{ fontSize: 11, fontWeight: 700 }}>
      {cfg.label}
    </span>
  );
}

function MultiplierBadge({ multiplier }) {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct <= 0) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 700, color: 'var(--amber)',
      background: 'var(--amber-tint)', borderRadius: 6, padding: '2px 7px'
    }}>
      <IconArrowUp size={10} /> +{pct}% demand
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, unit, sub }) {
  const displayValue = value !== null && value !== undefined ? value : '—';
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #f0f0f0',
      borderRadius: 16,
      padding: '18px 20px',
      flex: '1 1 140px',
      minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{displayValue}</span>
        {unit && <span style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ForecastStrip({ forecast, loading }) {
  if (loading) return <Skeleton height={88} radius={16} />;
  if (!forecast?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #f0f0f0',
      borderRadius: 16,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>
        5-Day Forecast
      </div>
      <div style={{ display: 'flex', gap: 0 }}>
        {forecast.slice(0, 5).map((day, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '0 6px',
            borderRight: i < 4 ? '1px solid #f0f0f0' : 'none',
          }}>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, fontWeight: 600 }}>
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' }).toUpperCase()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <WeatherIcon condition={day.dominant_condition} size={22} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{day.max_temp_c}°</div>
            {day.min_temp_c != null && (
              <div style={{ fontSize: 11, color: '#aaa' }}>{day.min_temp_c}°</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentWeatherCard({ weather, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <Skeleton height={180} radius={16} style={{ flex: '0 0 240px' }} />
      <div style={{ flex: 1, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[1,2,3,4].map(i => <Skeleton key={i} height={100} radius={16} style={{ flex: '1 1 120px' }} />)}
      </div>
    </div>
  );
  if (!weather) return null;

  const { condition, current, season, season_description, rainy_days_in_forecast, live_data } = weather;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Top row: hero card + stat tiles */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>

        {/* Hero — big temp + condition */}
        <div style={{
          background: '#fff',
          border: '1px solid #f0f0f0',
          borderRadius: 16,
          padding: '24px 28px',
          flex: '0 0 220px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 160,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <WeatherIcon condition={condition} size={44} />
            {!live_data && (
              <span style={{ fontSize: 10, color: '#aaa', background: '#f5f5f5', borderRadius: 6, padding: '2px 7px' }}>
                Seasonal est.
              </span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 52, fontWeight: 700, color: '#1a1a1a', lineHeight: 1, marginBottom: 4 }}>
              {current?.temp_c != null ? `${current.temp_c}°` : '—'}
            </div>
            <div style={{ fontSize: 13, color: '#888', textTransform: 'capitalize', marginBottom: 6 }}>
              {current?.description || condition || 'Unknown'}
            </div>
            <div style={{ fontSize: 11, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconMapPin size={11} />
              {weather.location}{weather.country ? `, ${weather.country}` : ''}
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ flex: 1, display: 'flex', gap: 12, flexWrap: 'wrap', alignContent: 'flex-start' }}>
          <StatTile
            label="Feels Like"
            value={current?.feels_like_c}
            unit="°"
            sub="Apparent temperature"
          />
          <StatTile
            label="Humidity"
            value={current?.humidity_pct}
            unit="%"
            sub={current?.humidity_pct != null 
              ? (current?.humidity_pct >= 80 ? 'High — cold/flu risk up' : current?.humidity_pct >= 60 ? 'Moderate' : 'Low')
              : 'N/A'}
          />
          <StatTile
            label="Wind"
            value={current?.wind_kph}
            unit="km/h"
            sub={condition}
          />
          <StatTile
            label="Season"
            value={season === 'wet' ? 'Wet' : 'Dry'}
            sub={rainy_days_in_forecast > 0 ? `${rainy_days_in_forecast} rainy days ahead` : season_description?.split('.')[0]}
          />
        </div>
      </div>

      {/* 5-day forecast strip */}
      <ForecastStrip forecast={weather.forecast_5day} loading={false} />
    </div>
  );
}

function DemandCategoryBadges({ categories, loading }) {
  if (loading) return <Skeleton height={44} radius={12} style={{ marginBottom: 16 }} />;
  if (!categories?.length) return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--steel)', alignSelf: 'center' }}>
        HIGH DEMAND:
      </span>
      {categories.map(({ category, multiplier }) => (
        <span key={category} style={{
          fontSize: 12, fontWeight: 600,
          background: 'var(--amber-tint)', color: 'var(--amber)',
          borderRadius: 8, padding: '4px 10px',
          border: '1px solid rgba(160,128,80,0.25)',
        }}>
          {CATEGORY_LABEL[category] || category} <strong>+{Math.round((multiplier - 1) * 100)}%</strong>
        </span>
      ))}
    </div>
  );
}

function RecommendationRow({ rec, index, prefersReducedMotion }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.tr
      key={rec.medicine_id}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2, delay: prefersReducedMotion ? 0 : index * 0.04 }}
    >
      <td style={{ fontWeight: 600, fontSize: 13 }}>
        <div>{rec.medicine_name}</div>
        <div style={{ fontSize: 11, color: 'var(--steel)', marginTop: 2 }}>
          {CATEGORY_LABEL[rec.demand_category] || rec.demand_category}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 700 }}>{rec.current_stock}</div>
        <div style={{ fontSize: 11, color: 'var(--steel)' }}>
          reorder @ {rec.reorder_level}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 12, color: 'var(--steel)' }}>
            Normal: {rec.daily_velocity_normal}/day
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>
            Adjusted: {rec.daily_velocity_weather_adjusted}/day
          </span>
          <MultiplierBadge multiplier={rec.weather_demand_multiplier} />
        </div>
      </td>
      <td>
        <span className={`status-pill ${rec.days_of_stock_at_adjusted_demand <= 7 ? 'critical' : rec.days_of_stock_at_adjusted_demand <= 14 ? 'warning' : 'safe'}`}>
          {rec.days_of_stock_at_adjusted_demand}d
        </span>
      </td>
      <td>
        <UrgencyBadge urgency={rec.urgency} />
      </td>
      <td>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {rec.recommended_restock_qty > 0
            ? `+${rec.recommended_restock_qty} units`
            : '—'}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 11, color: 'var(--steel)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, marginTop: 4,
          }}
        >
          <IconInfoCircle size={11} />
          {expanded ? 'Less' : 'Why?'}
        </button>
        {expanded && (
          <div style={{
            fontSize: 11, color: 'var(--ink-soft)', marginTop: 4,
            background: 'var(--bg-subtle)', borderRadius: 6, padding: '6px 8px',
            maxWidth: 240, lineHeight: 1.4,
          }}>
            {rec.weather_reason}
          </div>
        )}
      </td>
    </motion.tr>
  );
}

function SummaryBanner({ data, loading }) {
  if (loading) return <Skeleton height={80} radius={14} style={{ marginBottom: 20 }} />;
  if (!data) return null;

  const { critical_count, high_count, total_items_flagged } = data;

  if (total_items_flagged === 0) {
    return (
      <div className="card" style={{
        padding: '14px 20px', marginBottom: 20,
        background: 'var(--green-tint)', borderLeft: '4px solid var(--green)'
      }}>
        <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
          ✅ Stock levels look good for current weather conditions
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
          No medicines are flagged for weather-driven restocking at this time. Check back during season transitions or after severe weather events.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{
      padding: '14px 20px', marginBottom: 20,
      background: critical_count > 0 ? 'var(--red-tint)' : 'var(--amber-tint)',
      borderLeft: `4px solid ${critical_count > 0 ? 'var(--red)' : 'var(--amber)'}`
    }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: critical_count > 0 ? 'var(--red)' : 'var(--amber)' }}>
            <IconAlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            {total_items_flagged} medicine{total_items_flagged > 1 ? 's' : ''} need weather-driven restocking
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>
            Based on current weather conditions and Philippine seasonal demand patterns
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {critical_count > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--red)' }}>{critical_count}</div>
              <div style={{ fontSize: 11, color: 'var(--steel)' }}>Critical</div>
            </div>
          )}
          {high_count > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--amber)' }}>{high_count}</div>
              <div style={{ fontSize: 11, color: 'var(--steel)' }}>High</div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--ink)' }}>
              {total_items_flagged - critical_count - high_count}
            </div>
            <div style={{ fontSize: 11, color: 'var(--steel)' }}>Medium/Low</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {[120, 70, 90, 50, 70, 80].map((w, j) => (
            <td key={j}><div className="skeleton" style={{ height: 13, width: w }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeatherRecommendations() {
  const prefersReducedMotion = useReducedMotion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [city, setCity] = useState('Lucena City,PH');
  const [cityInput, setCityInput] = useState('Lucena City,PH');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const fetchData = useCallback(async (targetCity) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/ai/weather-recommendations?city=${encodeURIComponent(targetCity)}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load weather recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(city); }, [city, fetchData]);

  function handleCityChange(e) {
    const val = e.target.value;
    setCityInput(val);
    setCity(val);
  }

  const recommendations = data?.recommendations || [];
  const filtered = recommendations.filter(r => {
    if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false;
    if (categoryFilter !== 'all' && r.demand_category !== categoryFilter) return false;
    return true;
  });

  const allCategories = [...new Set(recommendations.map(r => r.demand_category))];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Weather-Aware Restocking</h1>
          <p>Real-time weather data + Philippine seasonal patterns → proactive inventory recommendations</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="filter-search" style={{ flex: '0 0 220px' }}>
            <IconMapPin size={14} className="filter-search-icon" />
            <select
              value={cityInput}
              onChange={handleCityChange}
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontSize: 13, color: 'var(--ink)', width: '100%', cursor: 'pointer',
                paddingLeft: 22,
              }}
            >
              {PH_CITIES.map(c => (
                <option key={c} value={c}>{c.replace(',PH', '').replace(',', ', ')}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => fetchData(city)}
            disabled={loading}
          >
            <IconRefresh size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Current weather + forecast */}
      <CurrentWeatherCard weather={data?.weather} loading={loading} />

      {/* Summary banner */}
      <SummaryBanner data={data} loading={loading} />

      {/* High-demand categories */}
      <DemandCategoryBadges categories={data?.high_demand_categories} loading={loading} />

      {/* How it works info */}
      <div className="card" style={{
        padding: '12px 18px', marginBottom: 20,
        background: 'linear-gradient(135deg, #fefcf8 0%, #f8ebdc 100%)'
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          How weather recommendations work
        </div>
        <p style={{ margin: '5px 0 0', color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.6 }}>
          Demand multipliers are calculated by combining <strong>current weather conditions</strong> (live via OpenWeatherMap)
          with <strong>Philippine seasonal baselines</strong> (PAGASA climate data). Your actual stock velocity is adjusted
          by these multipliers to compute weather-adjusted days of supply, triggering restocking alerts before seasonal
          demand peaks. Common examples: <em>Biogesic, Neozep, Bioflu</em> spike during rainy months (June–November);
          <em>Cetirizine, Loratadine</em> spike during dry/hazy season (March–May).
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="empty-state">
            <strong>Unable to load recommendations</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => fetchData(city)}>Retry</button>
          </div>
        </div>
      )}

      {/* Recommendations table */}
      {!error && (
        <div className="card table-card">
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, padding: '14px 20px 0', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--steel)' }}>Filter:</span>
            {/* Urgency filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['all', 'critical', 'high', 'medium'].map(u => (
                <button
                  key={u}
                  onClick={() => setUrgencyFilter(u)}
                  style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 6, padding: '3px 10px',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    background: urgencyFilter === u ? 'var(--ink)' : 'var(--surface)',
                    color: urgencyFilter === u ? '#fff' : 'var(--ink)',
                  }}
                >
                  {u === 'all' ? 'All urgencies' : u.charAt(0).toUpperCase() + u.slice(1)}
                </button>
              ))}
            </div>
            {/* Category filter */}
            {allCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                <option value="all">All categories</option>
                {allCategories.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
                ))}
              </select>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--steel)' }}>
              {loading ? '…' : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}
              {data?.generated_at && !loading && (
                <span style={{ marginLeft: 8 }}>
                  · Updated {new Date(data.generated_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </span>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th><IconPackage size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />Current Stock</th>
                  <th>Demand Velocity</th>
                  <th>Days Left *</th>
                  <th>Priority</th>
                  <th>Recommended Restock</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton />
              ) : (
                <tbody>
                  {filtered.map((rec, i) => (
                    <RecommendationRow
                      key={rec.medicine_id}
                      rec={rec}
                      index={i}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  ))}
                </tbody>
              )}
            </table>
          </div>

          {!loading && filtered.length === 0 && !error && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--steel)', fontSize: 13 }}>
              {recommendations.length === 0
                ? 'No medicines flagged for weather-driven restocking under current conditions.'
                : 'No matches for the current filter.'}
            </div>
          )}

          <div style={{ padding: '10px 20px 14px', fontSize: 11, color: 'var(--steel)', borderTop: '1px solid var(--border)' }}>
            * Days of stock calculated using <em>weather-adjusted</em> daily demand velocity.
            {!data?.weather?.live_data && ' Live weather unavailable — using Philippine seasonal estimates.'}
          </div>
        </div>
      )}
    </motion.div>
  );
}
