export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}

// Calendar day (YYYY-MM-DD) of an instant in the pharmacy's timezone — the
// same day boundaries the server uses for the sales chart
// (server/utils/dates.js). toISOString() would give the UTC day instead.
const APP_TIMEZONE = 'Asia/Manila';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function localDateKey(date = new Date()) {
  return dayFormatter.format(new Date(date));
}

// Shift a YYYY-MM-DD day key by whole days (calendar arithmetic, no timezone surprises).
export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
