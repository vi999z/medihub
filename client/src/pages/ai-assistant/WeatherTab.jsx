import { useEffect, useState, useCallback } from 'react';
import {
  Cloud, CloudRain, Sun, RefreshCw, AlertTriangle, CheckCircle2, Package,
  MapPin, ArrowUp, Info
} from 'lucide-react';
import api from '../../api/axios';
import Skeleton from '../../components/Skeleton';
import TableSkeleton from '../../components/TableSkeleton';

// ─── Utility helpers ──────────────────────────────────────────────────────────

const PH_CITIES = [
  'Lucena City,PH', 'Manila,PH', 'Quezon City,PH', 'Cebu City,PH', 'Davao City,PH',
  'Iloilo City,PH', 'Zamboanga,PH', 'Cagayan de Oro,PH', 'Bacolod,PH',
  'General Santos,PH', 'Baguio,PH',
];

// Same red → amber → orange → green severity ladder as the Batches page.
const URGENCY_CONFIG = {
  critical: { label: 'Critical', cls: 'red' },
  high:     { label: 'High',     cls: 'amber' },
  medium:   { label: 'Medium',   cls: 'orange' },
  low:      { label: 'Low',      cls: 'green' },
};

const CATEGORY_LABEL = {
  cold_flu:      'Cold & Flu',
  cough_cold:    'Cough & Cold',
  antihistamine: 'Antihistamine',
  analgesic:     'Pain Relief',
  antidiarrheal: 'Antidiarrheal',
  vitamins:      'Vitamins',
  electrolytes:  'Electrolytes',
};

function WeatherIcon({ condition, size = 32, style = {} }) {
  const icons = {
    Rain: <CloudRain size={size} style={{ color: '#5a8aaa', ...style }} />,
    Drizzle: <CloudRain size={size} style={{ color: '#7aaecc', ...style }} />,
    Thunderstorm: <CloudRain size={size} style={{ color: '#4a5a8a', ...style }} />,
    Clear: <Sun size={size} style={{ color: '#c8a050', ...style }} />,
    Clouds: <Cloud size={size} style={{ color: '#8a9aaa', ...style }} />,
    Mist: <Cloud size={size} style={{ color: '#aab0b8', ...style }} />,
    Haze: <Cloud size={size} style={{ color: '#b0a890', ...style }} />,
  };
  return icons[condition] || <Cloud size={size} style={{ color: '#8a9aaa', ...style }} />;
}

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.low;
  return (
    <span className={`flat-status-label ${cfg.cls}`}>{cfg.label}</span>
  );
}

function MultiplierBadge({ multiplier }) {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct <= 0) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, alignSelf: 'flex-start',
      fontSize: 11, fontWeight: 700, color: 'var(--flat-amber)',
      background: 'color-mix(in srgb, var(--flat-amber) 14%, white)', borderRadius: 6, padding: '2px 7px'
    }}>
      <ArrowUp size={10} /> +{pct}% demand
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, unit, sub }) {
  const displayValue = value !== null && value !== undefined ? value : '—';
  return (
    <div className="flat-card weather-tile">
      <div className="weather-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{displayValue}</span>
        {unit && <span className="flat-med-meta" style={{ marginTop: 0 }}>{unit}</span>}
      </div>
      {sub && <div className="flat-med-meta" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ForecastStrip({ forecast }) {
  if (!forecast?.length) return null;
  return (
    <div className="flat-card" style={{ padding: '16px 20px' }}>
      <div className="weather-label" style={{ marginBottom: 14 }}>5-Day Forecast</div>
      <div style={{ display: 'flex' }}>
        {forecast.slice(0, 5).map((day, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '0 6px',
            borderRight: i < 4 ? '1px solid var(--flat-border)' : 'none',
          }}>
            <div className="weather-label" style={{ marginBottom: 8 }}>
              {new Date(day.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short' }).toUpperCase()}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <WeatherIcon condition={day.dominant_condition} size={22} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{day.max_temp_c}°</div>
            {day.min_temp_c != null && (
              <div className="flat-med-meta" style={{ marginTop: 0, fontSize: 12 }}>{day.min_temp_c}°</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentWeatherCard({ weather, loading }) {
  if (loading) return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Skeleton height={180} radius={8} style={{ flex: '0 0 220px' }} />
      <div style={{ flex: 1, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[1,2,3,4].map(i => <Skeleton key={i} height={100} radius={8} style={{ flex: '1 1 120px' }} />)}
      </div>
    </div>
  );
  if (!weather) return null;

  const { condition, current, season, season_description, rainy_days_in_forecast, live_data } = weather;

  return (
    <>
      {/* Top row: hero card + stat tiles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

        {/* Hero — big temp + condition */}
        <div className="flat-card" style={{
          padding: '24px 28px',
          flex: '0 0 220px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 160,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <WeatherIcon condition={condition} size={44} />
            {!live_data && <span className="flat-tag" style={{ margin: 0 }}>Seasonal est.</span>}
          </div>
          <div>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
              {current?.temp_c != null ? `${current.temp_c}°` : '—'}
            </div>
            <div className="flat-med-meta" style={{ textTransform: 'capitalize', marginBottom: 6 }}>
              {current?.description || condition || 'Unknown'}
            </div>
            <div className="flat-med-meta" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} />
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
      <ForecastStrip forecast={weather.forecast_5day} />
    </>
  );
}

function DemandCategoryBadges({ categories, loading }) {
  if (loading) return <Skeleton height={32} radius={8} />;
  if (!categories?.length) return null;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="weather-label" style={{ marginBottom: 0 }}>High demand:</span>
      {categories.map(({ category, multiplier }) => (
        <span key={category} className="flat-status-label amber">
          {CATEGORY_LABEL[category] || category} +{Math.round((multiplier - 1) * 100)}%
        </span>
      ))}
    </div>
  );
}

function RecommendationRow({ rec }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr key={rec.medicine_id}>
      <td>
        <div className="flat-med-name">{rec.medicine_name}</div>
        <div className="flat-med-meta">
          {CATEGORY_LABEL[rec.demand_category] || rec.demand_category}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 700 }}>{rec.current_stock}</div>
        <div className="flat-med-meta">
          reorder @ {rec.reorder_level}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="flat-med-meta" style={{ marginTop: 0 }}>
            Normal: {rec.daily_velocity_normal}/day
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--flat-amber)' }}>
            Adjusted: {rec.daily_velocity_weather_adjusted}/day
          </span>
          <MultiplierBadge multiplier={rec.weather_demand_multiplier} />
        </div>
      </td>
      <td>
        <span className={`flat-status-label ${rec.days_of_stock_at_adjusted_demand <= 7 ? 'red' : rec.days_of_stock_at_adjusted_demand <= 14 ? 'amber' : 'green'}`}>
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
            fontSize: 12, color: 'var(--flat-accent)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, marginTop: 4,
          }}
        >
          <Info size={11} />
          {expanded ? 'Less' : 'Why?'}
        </button>
        {expanded && (
          <div style={{
            fontSize: 12, color: 'var(--flat-text-muted)', marginTop: 4,
            background: 'var(--flat-bg)', borderRadius: 6, padding: '6px 8px',
            maxWidth: 240, lineHeight: 1.4,
          }}>
            {rec.weather_reason}
          </div>
        )}
      </td>
    </tr>
  );
}

function SummaryBanner({ data, loading }) {
  if (loading) return <Skeleton height={72} radius={8} />;
  if (!data) return null;

  const { critical_count, high_count, total_items_flagged } = data;

  if (total_items_flagged === 0) {
    return (
      <div className="flat-card flat-banner flat-banner--green">
        <div className="flat-banner__title">
          <CheckCircle2 size={16} /> Stock levels look good for current weather conditions
        </div>
        <p>No medicines are flagged for weather-driven restocking at this time. Check back during season transitions or after severe weather events.</p>
      </div>
    );
  }

  const tone = critical_count > 0 ? 'red' : 'amber';
  return (
    <div className={`flat-card flat-banner flat-banner--${tone}`}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="flat-banner__title">
            <AlertTriangle size={16} />
            {total_items_flagged} medicine{total_items_flagged > 1 ? 's' : ''} need weather-driven restocking
          </div>
          <p>Based on current weather conditions and Philippine seasonal demand patterns</p>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'Critical', value: critical_count, color: 'var(--flat-red)' },
            { label: 'High', value: high_count, color: 'var(--flat-amber)' },
            { label: 'Medium/Low', value: total_items_flagged - critical_count - high_count, color: 'var(--flat-text)' },
          ].filter((stat) => stat.value > 0 || stat.label === 'Medium/Low').map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: stat.color }}>{stat.value}</div>
              <div className="flat-med-meta" style={{ marginTop: 0, fontSize: 12 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function WeatherTab({ onBadgeChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [city, setCity] = useState('Lucena City,PH');
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

  // Surface a "needs attention" count on the shared tab widget.
  useEffect(() => {
    onBadgeChange?.(data?.total_items_flagged ?? 0);
  }, [data, onBadgeChange]);

  const recommendations = data?.recommendations || [];
  const filtered = recommendations.filter(r => {
    if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false;
    if (categoryFilter !== 'all' && r.demand_category !== categoryFilter) return false;
    return true;
  });

  const allCategories = [...new Set(recommendations.map(r => r.demand_category))];

  return (
    <div className="flat-stack">
      {/* Local action row: city picker + refresh */}
      <div className="page-actions-only">
        <div className="page-header-actions">
          <div className="field filter-select" style={{ minWidth: 200 }}>
            <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
              {PH_CITIES.map(c => (
                <option key={c} value={c}>{c.replace(',PH', '').replace(',', ', ')}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="flat-action-btn"
            onClick={() => fetchData(city)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
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
      <div className="flat-card flat-info-card">
        <div className="flat-info-card__title">How weather recommendations work</div>
        <p>
          Demand multipliers are calculated by combining <strong>current weather conditions</strong> (live via OpenWeatherMap)
          with <strong>Philippine seasonal baselines</strong> (PAGASA climate data). Your actual stock velocity is adjusted
          by these multipliers to compute weather-adjusted days of supply, triggering restocking alerts before seasonal
          demand peaks. Common examples: <em>Biogesic, Neozep, Bioflu</em> spike during rainy months (June–November);{' '}
          <em>Cetirizine, Loratadine</em> spike during dry/hazy season (March–May).
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flat-card flat-empty">
          Unable to load recommendations — {error}
          <div style={{ marginTop: 10 }}>
            <button type="button" className="flat-action-btn" onClick={() => fetchData(city)}>Retry</button>
          </div>
        </div>
      )}

      {/* Recommendations table */}
      {!error && (
        <div className="flat-card flat-attention-card">
          {/* Title + filters */}
          <div className="flat-table-header" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            <span className="flat-table-title" style={{ marginRight: 8 }}>Weather restock</span>
            {/* Urgency filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['all', 'critical', 'high', 'medium', 'low'].map(u => (
                <button
                  key={u}
                  type="button"
                  className={`chip${urgencyFilter === u ? ' active' : ''}`}
                  onClick={() => setUrgencyFilter(u)}
                >
                  {u === 'all' ? 'All urgencies' : URGENCY_CONFIG[u].label}
                </button>
              ))}
            </div>
            {/* Category filter */}
            {allCategories.length > 0 && (
              <div className="field filter-select">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Filter by category">
                  <option value="all">All categories</option>
                  {allCategories.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="flat-med-meta" style={{ marginLeft: 'auto', marginTop: 0 }}>
              {loading ? '…' : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}
              {data?.generated_at && !loading && (
                <span style={{ marginLeft: 8 }}>
                  · Updated {new Date(data.generated_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </span>
          </div>

          <div className="flat-attention-scroll">
            <table className="flat-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th><Package size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />Current Stock</th>
                  <th>Demand Velocity</th>
                  <th>Days Left *</th>
                  <th>Priority</th>
                  <th>Recommended Restock</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton cols={6} rows={5} />
              ) : (
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="flat-empty">
                        {recommendations.length === 0
                          ? 'No medicines flagged for weather-driven restocking under current conditions.'
                          : 'No matches for the current filter.'}
                      </td>
                    </tr>
                  )}
                  {filtered.map((rec) => (
                    <RecommendationRow
                      key={rec.medicine_id}
                      rec={rec}
                    />
                  ))}
                </tbody>
              )}
            </table>
          </div>

          <div className="flat-med-meta" style={{ margin: 0, padding: '10px 20px 14px', fontSize: 12, borderTop: '2px solid #F2C94C' }}>
            * Days of stock calculated using <em>weather-adjusted</em> daily demand velocity.
            {!data?.weather?.live_data && ' Live weather unavailable — using Philippine seasonal estimates.'}
          </div>
        </div>
      )}
    </div>
  );
}
