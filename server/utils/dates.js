// Calendar-day helpers in the pharmacy's own timezone. Using toISOString()
// for day keys gives UTC dates, which in the Philippines (UTC+8) puts
// anything between midnight and 8 AM on the previous day.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

// YYYY-MM-DD of an instant, as a calendar day in APP_TIMEZONE.
function localDateKey(date = new Date()) {
  return dayFormatter.format(date);
}

// Shift a YYYY-MM-DD key by whole days (pure calendar arithmetic).
function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The instant a calendar day starts in APP_TIMEZONE.
function startOfLocalDay(key) {
  const guess = new Date(`${key}T00:00:00Z`);
  // Offset between UTC and APP_TIMEZONE at that moment, in ms.
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: APP_TIMEZONE }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (asLocal - asUtc));
}

module.exports = { APP_TIMEZONE, localDateKey, addDays, startOfLocalDay };
