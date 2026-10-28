// Server-side input validation for every create/update endpoint — the source
// of truth (client/src/utils/validation.js mirrors these rules, with the same
// messages, for instant feedback). Each validate* function returns
// { error } on the first problem, or { value } with trimmed, typed,
// normalised fields ready for the model layer.
const { localDateKey } = require('./dates');

const NAME_PATTERN = /^[\p{L}\p{N} .,'&/()-]+$/u;
// Strengths like "500mg", "5mg/5mL", "0.5%", "1,000 IU", "250+125mg"
const STRENGTH_PATTERN = /^[\p{L}\p{N} .,%/+-]+$/u;
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-() ]+$/;
// Free text (addresses, reasons): anything printable except markup characters.
// eslint-disable-next-line no-control-regex
const TEXT_PATTERN = /^[^<>{}\u0000-\u001f]+$/u;
const INTEGER_PATTERN = /^\d+$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MAX_QUANTITY = 1000000;
const MAX_REORDER_LEVEL = 100000;
const MAX_PRICE = 9999999.99;

const BATCH_STATUSES = ['active', 'expired', 'depleted', 'recalled'];
const ROLES = ['admin', 'pharmacist'];
const TRANSACTION_TYPES = ['sale', 'adjustment', 'disposal', 'return'];

const NAME_HINT = "can only contain letters, numbers, spaces and . , ' & / ( ) -";
const TEXT_HINT = 'cannot contain < > { } characters';

function str(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

// Returns an error message, or null. `optional` fields may be blank.
function checkText(value, label, { max, pattern = NAME_PATTERN, optional = false, hint = NAME_HINT } = {}) {
  if (!value) return optional ? null : `${label} is required`;
  if (value.length > max) return `${label} must be ${max} characters or fewer`;
  if (!pattern.test(value)) return `${label} ${hint}`;
  return null;
}

function parseInteger(value, label, { min = 0, max = MAX_QUANTITY } = {}) {
  const raw = str(value);
  if (!raw) return { error: `${label} is required` };
  if (!INTEGER_PATTERN.test(raw)) return { error: `${label} must be a whole number` };
  const n = Number(raw);
  if (n < min) return { error: `${label} must be at least ${min}` };
  if (n > max) return { error: `${label} must be ${max.toLocaleString('en-US')} or less` };
  return { value: n };
}

function parseId(value) {
  const raw = str(value);
  return INTEGER_PATTERN.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

function parseMoney(value, label) {
  const raw = str(value);
  if (!raw) return { value: null };
  if (!MONEY_PATTERN.test(raw)) return { error: `${label} must be a number of 0 or more, with at most 2 decimal places` };
  const n = Number(raw);
  if (n > MAX_PRICE) return { error: `${label} is too large` };
  return { value: n };
}

// Accepts YYYY-MM-DD only, and rejects impossible dates like 2026-02-30.
function parseDate(value, label, { optional = false } = {}) {
  const raw = str(value).slice(0, 10);
  if (!raw) return optional ? { value: null } : { error: `${label} is required` };
  if (!DATE_PATTERN.test(raw)) return { error: `${label} must be a valid date` };
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return { error: `${label} must be a valid date` };
  return { value: raw };
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(str(value).toLowerCase());
}

function validateMedicine(body, { categoryOptions, branchOptions }) {
  const v = {
    name: str(body.name),
    generic_name: str(body.generic_name),
    category: str(body.category) || 'Other',
    dosage_form: str(body.dosage_form),
    strength: str(body.strength),
    unit: str(body.unit),
    requires_prescription: parseBoolean(body.requires_prescription),
    branch: str(body.branch) || branchOptions[0],
  };
  const error =
    checkText(v.name, 'Medicine name', { max: 150 }) ||
    checkText(v.generic_name, 'Generic name', { max: 150, optional: true }) ||
    checkText(v.category, 'Category', { max: 80 }) ||
    checkText(v.dosage_form, 'Dosage form', { max: 50, optional: true }) ||
    checkText(v.strength, 'Strength', { max: 50, optional: true, pattern: STRENGTH_PATTERN, hint: 'can only contain letters, numbers, spaces and . , % / + -' }) ||
    checkText(v.unit, 'Unit', { max: 30 });
  if (error) return { error };

  // Known categories are case-normalised; custom ones (e.g. from a CSV
  // import) are allowed so those medicines stay editable.
  v.category = categoryOptions.find((c) => c.toLowerCase() === v.category.toLowerCase()) || v.category;

  const branch = branchOptions.find((b) => b.toLowerCase() === v.branch.toLowerCase());
  if (!branch) return { error: `Branch must be one of: ${branchOptions.join(', ')}` };
  v.branch = branch;

  const reorderRaw = str(body.reorder_level);
  const reorder = parseInteger(reorderRaw === '' ? '10' : reorderRaw, 'Reorder level', { min: 0, max: MAX_REORDER_LEVEL });
  if (reorder.error) return reorder;
  v.reorder_level = reorder.value;

  // Blank optional text is stored as NULL, not ''.
  for (const key of ['generic_name', 'dosage_form', 'strength']) if (!v[key]) v[key] = null;
  return { value: v };
}

// `existing` is the current batch row when editing, undefined when creating.
// Options for CSV imports: `withoutMedicine` (the medicine is created in the
// same step) and `allowPastExpiry` (expired stock is imported as 'expired').
function validateBatch(body, existing, { withoutMedicine = false, allowPastExpiry = false } = {}) {
  const today = localDateKey();
  const v = {};

  if (!withoutMedicine) {
    v.medicine_id = existing && body.medicine_id === undefined ? existing.medicine_id : parseId(body.medicine_id);
    if (!v.medicine_id) return { error: 'Select a medicine' };
  }

  v.batch_number = str(body.batch_number);
  const codeError = checkText(v.batch_number, 'Batch number', { max: 80, pattern: CODE_PATTERN, hint: 'can only contain letters, numbers, - and _' });
  if (codeError) return { error: codeError };

  const received = parseInteger(body.quantity_received, 'Quantity received', { min: 1 });
  if (received.error) return received;
  v.quantity_received = received.value;

  if (existing) {
    const remaining = parseInteger(body.quantity_remaining, 'Quantity remaining', { min: 0 });
    if (remaining.error) return remaining;
    if (remaining.value > v.quantity_received) return { error: 'Quantity remaining cannot exceed quantity received' };
    v.quantity_remaining = remaining.value;
  } else {
    v.quantity_remaining = v.quantity_received;
  }

  const expiry = parseDate(body.expiry_date, 'Expiry date');
  if (expiry.error) return expiry;
  v.expiry_date = expiry.value;
  if (!existing && !allowPastExpiry && v.expiry_date <= today) return { error: 'Expiry date must be after today' };

  const made = parseDate(body.manufacture_date, 'Manufacture date', { optional: true });
  if (made.error) return made;
  v.manufacture_date = made.value;
  if (v.manufacture_date && v.manufacture_date > today) return { error: 'Manufacture date cannot be in the future' };
  if (v.manufacture_date && v.manufacture_date >= v.expiry_date) return { error: 'Manufacture date must be before the expiry date' };

  for (const [key, label] of [['cost_price', 'Cost price'], ['selling_price', 'Selling price']]) {
    const price = parseMoney(body[key], label);
    if (price.error) return price;
    v[key] = price.value;
  }

  const supplierRaw = str(body.supplier_id);
  v.supplier_id = supplierRaw ? parseId(supplierRaw) : null;
  if (supplierRaw && !v.supplier_id) return { error: 'Choose a valid supplier' };

  if (existing) {
    v.status = str(body.status) || existing.status;
    if (!BATCH_STATUSES.includes(v.status)) return { error: `Status must be one of: ${BATCH_STATUSES.join(', ')}` };
    // Keep status consistent with the numbers: an "active" batch with
    // nothing left is depleted, and one past its expiry date is expired.
    if (v.status === 'active' && v.quantity_remaining === 0) v.status = 'depleted';
    if (v.status === 'active' && v.expiry_date < today) v.status = 'expired';
  } else {
    v.status = v.expiry_date < today ? 'expired' : 'active';
  }
  return { value: v };
}

function validateSupplier(body) {
  const v = {
    name: str(body.name),
    contact_person: str(body.contact_person),
    phone: str(body.phone),
    email: str(body.email).toLowerCase(),
    address: str(body.address),
  };
  const error =
    checkText(v.name, 'Supplier name', { max: 150 }) ||
    checkText(v.contact_person, 'Contact person', { max: 100, optional: true }) ||
    checkText(v.phone, 'Phone', { max: 30, optional: true, pattern: PHONE_PATTERN, hint: 'can only contain digits, spaces, + - ( )' }) ||
    (v.phone && v.phone.replace(/\D/g, '').length < 7 ? 'Phone must have at least 7 digits' : null) ||
    checkText(v.email, 'Email', { max: 100, optional: true, pattern: EMAIL_PATTERN, hint: 'must be a valid email address' }) ||
    checkText(v.address, 'Address', { max: 255, optional: true, pattern: TEXT_PATTERN, hint: TEXT_HINT });
  if (error) return { error };
  for (const key of ['contact_person', 'phone', 'email', 'address']) if (!v[key]) v[key] = null;
  return { value: v };
}

// `isCreate` also requires and checks the temporary password.
function validateUser(body, { isCreate }) {
  const v = {
    full_name: str(body.full_name),
    email: str(body.email).toLowerCase(),
    role: str(body.role),
  };
  const error =
    checkText(v.full_name, 'Full name', { max: 100 }) ||
    checkText(v.email, 'Email', { max: 100, pattern: EMAIL_PATTERN, hint: 'must be a valid email address' }) ||
    (ROLES.includes(v.role) ? null : 'Role must be admin or pharmacist');
  if (error) return { error };
  if (isCreate) {
    const password = body.password === undefined || body.password === null ? '' : String(body.password);
    if (password.length < 8) return { error: 'Temporary password must be at least 8 characters' };
    // bcrypt silently ignores everything after 72 bytes.
    if (Buffer.byteLength(password, 'utf8') > 72) return { error: 'Temporary password must be 72 characters or fewer' };
    v.password = password;
  }
  if (body.is_active !== undefined) v.is_active = parseBoolean(body.is_active);
  return { value: v };
}

function validateTransaction(body) {
  const batch_id = parseId(body.batch_id);
  if (!batch_id) return { error: 'Select a batch' };
  const type = str(body.transaction_type);
  if (!TRANSACTION_TYPES.includes(type)) return { error: `Movement type must be one of: ${TRANSACTION_TYPES.join(', ')}` };
  const quantity = parseInteger(body.quantity, 'Quantity', { min: 1 });
  if (quantity.error) return quantity;
  let direction = null;
  if (type === 'adjustment') {
    direction = str(body.direction) || 'increase';
    if (!['increase', 'decrease'].includes(direction)) return { error: 'Adjustment direction must be increase or decrease' };
  }
  const reason = str(body.reason);
  const reasonError = checkText(reason, 'Reason', { max: 255, optional: true, pattern: TEXT_PATTERN, hint: TEXT_HINT });
  if (reasonError) return { error: reasonError };
  return { value: { batch_id, transaction_type: type, quantity: quantity.value, direction, reason: reason || null } };
}

module.exports = {
  validateMedicine,
  validateBatch,
  validateSupplier,
  validateUser,
  validateTransaction,
};
