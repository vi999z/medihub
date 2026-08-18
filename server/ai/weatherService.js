/**
 * Weather Service
 * Fetches real-time weather and builds seasonal/weather context
 * for the Philippines. Used to inform weather-aware inventory recommendations.
 *
 * Uses Open-Meteo (https://open-meteo.com) — completely free, no API key required.
 * Falls back to pure Philippine seasonal heuristics if the network call fails.
 */

// ─── Philippine Seasonal Calendar ───────────────────────────────────────────
// Based on PAGASA climate zones: wet season Jun–Nov, dry season Dec–May
// Demand spikes for specific medicine categories per season/month.

const PH_SEASONAL_DEMAND = {
  // Month (1-12) → demand multipliers by category
  1:  { cold_flu: 1.4, cough_cold: 1.4, antihistamine: 1.1, analgesic: 1.2, antidiarrheal: 1.0, vitamins: 1.3, electrolytes: 1.0 },
  2:  { cold_flu: 1.3, cough_cold: 1.3, antihistamine: 1.1, analgesic: 1.1, antidiarrheal: 1.0, vitamins: 1.2, electrolytes: 1.0 },
  3:  { cold_flu: 1.0, cough_cold: 1.0, antihistamine: 1.2, analgesic: 1.0, antidiarrheal: 1.1, vitamins: 1.0, electrolytes: 1.1 },
  4:  { cold_flu: 0.9, cough_cold: 0.9, antihistamine: 1.3, analgesic: 1.0, antidiarrheal: 1.2, vitamins: 1.0, electrolytes: 1.3 },
  5:  { cold_flu: 0.9, cough_cold: 0.9, antihistamine: 1.2, analgesic: 1.0, antidiarrheal: 1.3, vitamins: 1.0, electrolytes: 1.4 },
  6:  { cold_flu: 1.3, cough_cold: 1.3, antihistamine: 1.0, analgesic: 1.1, antidiarrheal: 1.3, vitamins: 1.1, electrolytes: 1.3 },
  7:  { cold_flu: 1.5, cough_cold: 1.5, antihistamine: 1.0, analgesic: 1.2, antidiarrheal: 1.4, vitamins: 1.2, electrolytes: 1.2 },
  8:  { cold_flu: 1.6, cough_cold: 1.6, antihistamine: 1.0, analgesic: 1.2, antidiarrheal: 1.4, vitamins: 1.2, electrolytes: 1.2 },
  9:  { cold_flu: 1.5, cough_cold: 1.5, antihistamine: 1.0, analgesic: 1.2, antidiarrheal: 1.3, vitamins: 1.2, electrolytes: 1.2 },
  10: { cold_flu: 1.4, cough_cold: 1.4, antihistamine: 1.0, analgesic: 1.2, antidiarrheal: 1.2, vitamins: 1.2, electrolytes: 1.1 },
  11: { cold_flu: 1.3, cough_cold: 1.3, antihistamine: 1.1, analgesic: 1.2, antidiarrheal: 1.1, vitamins: 1.2, electrolytes: 1.0 },
  12: { cold_flu: 1.4, cough_cold: 1.4, antihistamine: 1.1, analgesic: 1.3, antidiarrheal: 1.0, vitamins: 1.4, electrolytes: 1.0 },
};

// Medicine → demand category mapping (keywords in medicine name/category)
const MEDICINE_CATEGORY_MAP = [
  { category: 'cold_flu',      keywords: ['biogesic', 'neozep', 'bioflu', 'decolgen', 'tuseran', 'flu', 'cold', 'paracetamol', 'acetaminophen', 'ibuprofen', 'mefenamic', 'aspirin', 'fever'] },
  { category: 'cough_cold',    keywords: ['robitussin', 'solmux', 'ambroxol', 'guaifenesin', 'dextromethorphan', 'cough', 'mucosolvan', 'lagundi', 'ascof'] },
  { category: 'antihistamine', keywords: ['cetirizine', 'loratadine', 'fexofenadine', 'diphenhydramine', 'chlorphenamine', 'allergy', 'antihistamine', 'benadryl', 'claritin', 'zyrtec'] },
  { category: 'analgesic',     keywords: ['tramadol', 'celecoxib', 'analgesic', 'pain', 'ache', 'advil', 'alaxan', 'midol'] },
  { category: 'antidiarrheal', keywords: ['loperamide', 'diatabs', 'oresol', 'diarrhea', 'antidiarrheal', 'bismuth', 'imodium'] },
  { category: 'vitamins',      keywords: ['vitamin', 'ascorbic', 'zinc', 'multivitamin', 'berocca', 'stresstabs', 'enervon', 'myra', 'supplement', 'b-complex', 'folic'] },
  { category: 'electrolytes',  keywords: ['oresol', 'electrolit', 'gatorade', 'pocari', 'electrolyte', 'rehydration', 'pedialyte', 'dioralyte'] },
];

// Weather condition → additional demand boost
const WEATHER_DEMAND_BOOST = {
  Rain:         { cold_flu: 0.3, cough_cold: 0.3, antidiarrheal: 0.1, electrolytes: 0.1 },
  Drizzle:      { cold_flu: 0.2, cough_cold: 0.2 },
  Thunderstorm: { cold_flu: 0.4, cough_cold: 0.4, analgesic: 0.1 },
  Clear:        { antihistamine: 0.2, electrolytes: 0.2, vitamins: 0.1 },
  Clouds:       {},
  Snow:         { cold_flu: 0.5, analgesic: 0.2 },  // unlikely in PH but safe to include
  Mist:         { cold_flu: 0.1, cough_cold: 0.1 },
  Fog:          { cold_flu: 0.1 },
  Haze:         { antihistamine: 0.2 },
  Dust:         { antihistamine: 0.3 },
};

// ─── Open-Meteo API Client (no key required) ─────────────────────────────────

// Philippine city coordinates for Open-Meteo (lat/lon based)
const PH_CITY_COORDS = {
  'manila':         { lat: 14.5995, lon: 120.9842, label: 'Manila' },
  'quezon city':    { lat: 14.6760, lon: 121.0437, label: 'Quezon City' },
  'cebu city':      { lat: 10.3157, lon: 123.8854, label: 'Cebu City' },
  'cebu':           { lat: 10.3157, lon: 123.8854, label: 'Cebu City' },
  'davao city':     { lat:  7.1907, lon: 125.4553, label: 'Davao City' },
  'davao':          { lat:  7.1907, lon: 125.4553, label: 'Davao City' },
  'iloilo city':    { lat: 10.7202, lon: 122.5621, label: 'Iloilo City' },
  'iloilo':         { lat: 10.7202, lon: 122.5621, label: 'Iloilo City' },
  'zamboanga':      { lat:  6.9214, lon: 122.0790, label: 'Zamboanga' },
  'cagayan de oro': { lat:  8.4542, lon: 124.6319, label: 'Cagayan de Oro' },
  'bacolod':        { lat: 10.6713, lon: 122.9511, label: 'Bacolod' },
  'general santos': { lat:  6.1164, lon: 125.1716, label: 'General Santos' },
  'baguio':         { lat: 16.4023, lon: 120.5960, label: 'Baguio' },
};

// WMO weather code → internal condition label
// Full code table: https://open-meteo.com/en/docs#weathervariables
function wmoToCondition(code) {
  if (code === 0)               return 'Clear';
  if (code <= 2)                return 'Clouds';
  if (code === 3)               return 'Clouds';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain';
  if (code >= 85 && code <= 86) return 'Snow';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Clouds';
}

function wmoToDescription(code) {
  const desc = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'foggy', 48: 'depositing rime fog',
    51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
    61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain',
    71: 'slight snow', 73: 'moderate snow', 75: 'heavy snow',
    80: 'slight showers', 81: 'moderate showers', 82: 'violent showers',
    95: 'thunderstorm', 96: 'thunderstorm with slight hail', 99: 'thunderstorm with heavy hail',
  };
  return desc[code] || 'variable conditions';
}

/** Strip country suffix and resolve city name to lat/lon. Falls back to Manila. */
function resolveCoords(city = 'Manila,PH') {
  const key = city.replace(/,.*$/, '').trim().toLowerCase();
  return PH_CITY_COORDS[key] || PH_CITY_COORDS['manila'];
}

function mode(arr) {
  const freq = {};
  arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || arr[0];
}

/**
 * Single Open-Meteo request that returns both current conditions and the
 * 5-day daily forecast. No API key. Returns { current, forecast } or null.
 */
async function fetchOpenMeteo(city = 'Manila,PH') {
  const coords = resolveCoords(city);

  const params = new URLSearchParams({
    latitude:      coords.lat,
    longitude:     coords.lon,
    current:       [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'wind_speed_10m', 'weather_code', 'precipitation',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
    ].join(','),
    timezone:      'Asia/Manila',
    forecast_days: 6,   // today + 5 ahead
  });

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) {
      console.warn(`[Weather] Open-Meteo failed (${res.status})`);
      return null;
    }
    const data = await res.json();

    // ── Current conditions ──
    const cur     = data.current || {};
    const curCode = cur.weather_code ?? 0;
    const current = {
      city:         coords.label,
      country:      'PH',
      condition:    wmoToCondition(curCode),
      description:  wmoToDescription(curCode),
      temp_c:       Math.round(cur.temperature_2m ?? 0),
      feels_like_c: Math.round(cur.apparent_temperature ?? 0),
      humidity_pct: Math.round(cur.relative_humidity_2m ?? 0),
      wind_kph:     Math.round(cur.wind_speed_10m ?? 0),
      precip_mm:    cur.precipitation ?? 0,
    };

    // ── Daily forecast — skip index 0 (today) → take next 5 days ──
    const daily      = data.daily || {};
    const dates      = daily.time                || [];
    const codes      = daily.weather_code        || [];
    const maxTemps   = daily.temperature_2m_max  || [];
    const minTemps   = daily.temperature_2m_min  || [];
    const precipSums = daily.precipitation_sum   || [];

    const forecast = dates.slice(1, 6).map((date, i) => {
      const idx    = i + 1;
      const cond   = wmoToCondition(codes[idx] ?? 0);
      const precip = precipSums[idx] ?? 0;
      return {
        date,
        max_temp_c:         Math.round(maxTemps[idx] ?? 0),
        min_temp_c:         Math.round(minTemps[idx] ?? 0),
        dominant_condition: cond,
        total_precip_mm:    Math.round(precip * 10) / 10,
        is_rainy:           ['Rain', 'Drizzle', 'Thunderstorm'].includes(cond) || precip > 2,
      };
    });

    return { current, forecast };
  } catch (err) {
    console.warn('[Weather] Open-Meteo fetch error:', err.message);
    return null;
  }
}

// ─── Seasonal + Weather Context Builder ─────────────────────────────────────

/**
 * Build the full weather context object used by the AI and the recommendations engine.
 * Always succeeds — falls back gracefully to seasonal heuristics.
 */
async function getWeatherContext(city = 'Manila,PH') {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const seasonalMultipliers = PH_SEASONAL_DEMAND[month] || PH_SEASONAL_DEMAND[1];

  // Single Open-Meteo call returns both current + forecast (no API key needed)
  const omData   = await fetchOpenMeteo(city);
  const current  = omData?.current  || null;
  const forecast = omData?.forecast || [];

  // Build effective demand multipliers: seasonal base + weather boost
  const condition = current?.condition || deriveSeasonalCondition(month);
  const weatherBoost = WEATHER_DEMAND_BOOST[condition] || {};
  const demandMultipliers = {};
  Object.keys(seasonalMultipliers).forEach(cat => {
    demandMultipliers[cat] = (seasonalMultipliers[cat] || 1.0) + (weatherBoost[cat] || 0);
  });

  const season = getPhilippineSeason(month);
  const rainyDays = forecast.filter(d => d.is_rainy).length;

  return {
    location: current?.city || city,
    country: current?.country || 'PH',
    current_weather: current,
    forecast_5day: forecast,
    month,
    season,
    season_description: getSeasonDescription(month),
    condition,
    rainy_days_in_forecast: rainyDays,
    demand_multipliers: demandMultipliers,
    high_demand_categories: Object.entries(demandMultipliers)
      .filter(([, v]) => v >= 1.3)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, mult]) => ({ category: cat, multiplier: Math.round(mult * 100) / 100 })),
    live_data: current !== null,
    generated_at: now.toISOString(),
  };
}

function getPhilippineSeason(month) {
  if (month >= 6 && month <= 11) return 'wet';
  return 'dry';
}

function getSeasonDescription(month) {
  const descriptions = {
    1:  'Cool dry season — post-Christmas, cold front possible in Luzon',
    2:  'Cool dry season — lowest temperatures of the year',
    3:  'Hot dry season begins — allergies rise with dusty conditions',
    4:  'Peak hot dry season — heat-related illness risk highest',
    5:  'Pre-monsoon — occasional early rains, high humidity',
    6:  'Wet season starts — typhoon season begins, respiratory illnesses spike',
    7:  'Mid wet season — peak typhoon activity, heavy rains, cold-flu surge',
    8:  'Mid wet season — continued heavy rains and typhoon risk',
    9:  'Wet season — rains continue, high demand for cold/flu medicines',
    10: 'Wet season tapering — still rainy, respiratory issues common',
    11: 'Transition season — "ber" months, Christmas shopping, respiratory demand',
    12: 'Cold Christmas season — respiratory illnesses spike, vitamin demand high',
  };
  return descriptions[month] || '';
}

function deriveSeasonalCondition(month) {
  if (month >= 6 && month <= 11) return 'Rain';
  if (month >= 3 && month <= 5) return 'Clear';
  return 'Clouds';
}

// ─── Medicine → Category Classifier ─────────────────────────────────────────

function classifyMedicine(name = '', category = '') {
  const lower = `${name} ${category}`.toLowerCase();
  for (const { category: cat, keywords } of MEDICINE_CATEGORY_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

/**
 * Given the weather context and a list of medicines with stock levels,
 * return actionable restocking recommendations sorted by urgency.
 */
function buildWeatherRecommendations(weatherContext, medicines) {
  const { demand_multipliers, high_demand_categories, season, condition, month } = weatherContext;

  const recommendations = [];

  for (const med of medicines) {
    const demandCat = classifyMedicine(med.name, med.category || '');
    if (!demandCat) continue;

    const multiplier = demand_multipliers[demandCat] || 1.0;
    if (multiplier <= 1.05) continue; // no significant boost

    const currentStock = Number(med.current_stock ?? med.quantity ?? 0);
    const reorderLevel = Number(med.reorder_level ?? 10);
    const dailyVelocity = Number(med.daily_velocity ?? med.avg_daily_demand ?? 1);

    // Adjusted demand velocity factoring in weather
    const adjustedDailyDemand = Math.ceil(dailyVelocity * multiplier);
    const daysOfStock = adjustedDailyDemand > 0 ? Math.floor(currentStock / adjustedDailyDemand) : 999;

    // Recommended buffer: 30 days of weather-adjusted demand
    const recommended30dayStock = adjustedDailyDemand * 30;
    const shortfall = Math.max(0, recommended30dayStock - currentStock);

    const urgency =
      daysOfStock <= 7  ? 'critical' :
      daysOfStock <= 14 ? 'high' :
      shortfall > reorderLevel ? 'medium' :
      'low';

    if (urgency === 'low' && multiplier < 1.3) continue;

    recommendations.push({
      medicine_id: med.id,
      medicine_name: med.name,
      demand_category: demandCat,
      current_stock: currentStock,
      reorder_level: reorderLevel,
      daily_velocity_normal: Math.round(dailyVelocity * 10) / 10,
      daily_velocity_weather_adjusted: adjustedDailyDemand,
      weather_demand_multiplier: Math.round(multiplier * 100) / 100,
      days_of_stock_at_adjusted_demand: daysOfStock,
      recommended_restock_qty: shortfall,
      urgency,
      weather_reason: buildWeatherReason(demandCat, season, condition, month, multiplier),
    });
  }

  // Sort: critical → high → medium → low, then by days_of_stock ascending
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) =>
    urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
    a.days_of_stock_at_adjusted_demand - b.days_of_stock_at_adjusted_demand
  );

  return recommendations;
}

function buildWeatherReason(demandCat, season, condition, month, multiplier) {
  const conditionLabel = {
    Rain: 'rainy weather', Drizzle: 'drizzly conditions', Thunderstorm: 'thunderstorm activity',
    Clear: 'dry/sunny weather', Clouds: 'cloudy weather', Mist: 'misty conditions',
    Haze: 'hazy conditions', Dust: 'dusty conditions',
  }[condition] || 'current conditions';

  const catLabel = {
    cold_flu: 'cold & flu medicines',
    cough_cold: 'cough & cold remedies',
    antihistamine: 'antihistamines',
    analgesic: 'pain relievers',
    antidiarrheal: 'antidiarrheals',
    vitamins: 'vitamins & supplements',
    electrolytes: 'electrolyte solutions',
  }[demandCat] || demandCat;

  const seasonLabel = season === 'wet'
    ? `wet season (${getSeasonDescription(month)})`
    : `dry season (${getSeasonDescription(month)})`;

  return `Demand for ${catLabel} increases ~${Math.round((multiplier - 1) * 100)}% during ${conditionLabel} in the ${seasonLabel}`;
}

module.exports = {
  getWeatherContext,
  buildWeatherRecommendations,
  classifyMedicine,
  PH_SEASONAL_DEMAND,
  MEDICINE_CATEGORY_MAP,
};
