import { useState, useCallback, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, MessageCircle, Brain, CloudRain } from 'lucide-react';

// Lazy per tab so switching between Chat/Insights/Weather only downloads
// that tab's code — this page combines what used to be three separate
// routed pages, each with its own bundle.
const ChatTab = lazy(() => import('./ai-assistant/ChatTab'));
const InsightsTab = lazy(() => import('./ai-assistant/InsightsTab'));
const WeatherTab = lazy(() => import('./ai-assistant/WeatherTab'));

const TABS = [
  { key: 'chat', label: 'Chat', icon: MessageCircle, subtitle: 'Ask about your inventory in plain language — expiry risk, low stock, sales trends, and more.' },
  { key: 'insights', label: 'Insights', icon: Brain, subtitle: 'Expiry risk, reorder suggestions, and transaction anomalies, scored from real stock movement.' },
  { key: 'weather', label: 'Weather Restock', icon: CloudRain, subtitle: 'Weather-aware restocking recommendations based on live conditions and Philippine seasonal patterns.' },
];

export default function AiAssistant() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'chat';
  const [tab, setTab] = useState(initialTab);
  const active = TABS.find((t) => t.key === tab) || TABS[0];

  // "Needs attention" counts reported up by Insights/Weather, shown as
  // badges on the tab widget so switching tabs isn't the only way to know
  // something over there wants a look.
  const [badges, setBadges] = useState({ insights: 0, weather: 0 });
  const setInsightsBadge = useCallback((n) => setBadges((b) => (b.insights === n ? b : { ...b, insights: n })), []);
  const setWeatherBadge = useCallback((n) => setBadges((b) => (b.weather === n ? b : { ...b, weather: n })), []);

  function selectTab(key) {
    setTab(key);
    setSearchParams(key === 'chat' ? {} : { tab: key }, { replace: true });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={22} /> AI Assistant
          </h1>
          <p>{active.subtitle}</p>
        </div>
      </div>

      <div className="ai-assistant-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const badge = badges[t.key];
          return (
            <button
              key={t.key}
              type="button"
              className={`ai-assistant-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => selectTab(t.key)}
            >
              <Icon size={15} /> {t.label}
              {Boolean(badge) && <span className="ai-assistant-tab-badge">{badge}</span>}
            </button>
          );
        })}
      </div>

      <Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--steel)' }}>Loading…</div>}>
        {tab === 'chat' && <ChatTab />}
        {tab === 'insights' && <InsightsTab onBadgeChange={setInsightsBadge} />}
        {tab === 'weather' && <WeatherTab onBadgeChange={setWeatherBadge} />}
      </Suspense>
    </div>
  );
}
