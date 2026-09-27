// Shared client-side field validation. Server-side checks remain the source
// of truth (these are UX only — catch bad input before a round trip, not a
// security boundary), so keep the allow-lists generous rather than fighting
// legitimate data (accented names, ampersands in supplier names, etc.).

// Letters (incl. accented), digits, spaces and common punctuation used in
// medicine/supplier/person names. Blocks angle brackets, braces and other
// characters that have no business in a name field.
const NAME_PATTERN = /^[\p{L}\p{N} .,'&/()-]+$/u;

// Batch numbers / SKUs: alphanumeric plus - _ (no spaces or punctuation).
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone: digits plus common separators (+, -, spaces, parens).
const PHONE_PATTERN = /^[0-9+\-() ]+$/;

export function isValidName(value) {
  return NAME_PATTERN.test(String(value || '').trim());
}

export function isValidCode(value) {
  return CODE_PATTERN.test(String(value || '').trim());
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

export function isValidPhone(value) {
  return PHONE_PATTERN.test(String(value || '').trim());
}

export function isPositiveNumber(value) {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n > 0;
}

export function isNonNegativeNumber(value) {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= 0;
}

export function isPositiveInteger(value) {
  const n = Number(value);
  return isPositiveNumber(value) && Number.isInteger(n);
}
