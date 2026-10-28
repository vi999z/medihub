// Client-side form validation — mirrors server/utils/validators.js (same
// rules, same messages) so mistakes show instantly instead of after a round
// trip. The server re-checks everything; these are not a security boundary.
// Each validate*Form returns the first error message, or '' when valid.
import { localDateKey } from './date';

const NAME_PATTERN = /^[\p{L}\p{N} .,'&/()-]+$/u;
const STRENGTH_PATTERN = /^[\p{L}\p{N} .,%/+-]+$/u;
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-() ]+$/;
// eslint-disable-next-line no-control-regex
const TEXT_PATTERN = /^[^<>{}\u0000-\u001f]+$/u;
const INTEGER_PATTERN = /^\d+$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

const NAME_HINT = "can only contain letters, numbers, spaces and . , ' & / ( ) -";
const TEXT_HINT = 'cannot contain < > { } characters';

// Field length limits — the database column sizes. Forms pass these to
// `maxLength` so over-long input can't even be typed.
export const MAX_LENGTH = {
  medicineName: 150, genericName: 150, category: 80, dosageForm: 50, strength: 50, unit: 30,
  batchNumber: 80, reason: 255,
  supplierName: 150, contactPerson: 100, phone: 30, email: 100, address: 255,
  fullName: 100, password: 72,
};

function str(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function checkText(value, label, { max, pattern = NAME_PATTERN, optional = false, hint = NAME_HINT }) {
  const v = str(value);
  if (!v) return optional ? '' : `${label} is required`;
  if (v.length > max) return `${label} must be ${max} characters or fewer`;
  if (!pattern.test(v)) return `${label} ${hint}`;
  return '';
}

function checkInteger(value, label, { min = 0, max = 1000000 } = {}) {
  const raw = str(value);
  if (!raw) return `${label} is required`;
  if (!INTEGER_PATTERN.test(raw)) return `${label} must be a whole number`;
  const n = Number(raw);
  if (n < min) return `${label} must be at least ${min}`;
  if (n > max) return `${label} must be ${max.toLocaleString('en-US')} or less`;
  return '';
}

function checkMoney(value, label) {
  const raw = str(value);
  if (!raw) return '';
  if (!MONEY_PATTERN.test(raw)) return `${label} must be a number of 0 or more, with at most 2 decimal places`;
  if (Number(raw) > 9999999.99) return `${label} is too large`;
  return '';
}

function checkDate(value, label, { optional = false } = {}) {
  const raw = str(value);
  if (!raw) return optional ? '' : `${label} is required`;
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    return `${label} must be a valid date`;
  }
  return '';
}

export function validateMedicineForm(form) {
  return (
    checkText(form.name, 'Medicine name', { max: MAX_LENGTH.medicineName }) ||
    checkText(form.generic_name, 'Generic name', { max: MAX_LENGTH.genericName, optional: true }) ||
    checkText(form.category, 'Category', { max: MAX_LENGTH.category }) ||
    checkText(form.dosage_form, 'Dosage form', { max: MAX_LENGTH.dosageForm, optional: true }) ||
    checkText(form.strength, 'Strength', { max: MAX_LENGTH.strength, optional: true, pattern: STRENGTH_PATTERN, hint: 'can only contain letters, numbers, spaces and . , % / + -' }) ||
    checkText(form.unit, 'Unit', { max: MAX_LENGTH.unit }) ||
    checkInteger(form.reorder_level, 'Reorder level', { min: 0, max: 100000 })
  );
}

// `isEditing` switches to the edit rules (quantity remaining, past expiry allowed).
export function validateBatchForm(form, { isEditing, needsMedicine }) {
  const today = localDateKey();
  if (needsMedicine && !str(form.medicine_id)) return 'Select a medicine';
  const error =
    checkText(form.batch_number, 'Batch number', { max: MAX_LENGTH.batchNumber, pattern: CODE_PATTERN, hint: 'can only contain letters, numbers, - and _' }) ||
    checkInteger(form.quantity_received, 'Quantity received', { min: 1 }) ||
    (isEditing ? checkInteger(form.quantity_remaining, 'Quantity remaining', { min: 0 }) : '') ||
    checkDate(form.expiry_date, 'Expiry date') ||
    checkDate(form.manufacture_date, 'Manufacture date', { optional: true }) ||
    checkMoney(form.cost_price, 'Cost price') ||
    checkMoney(form.selling_price, 'Selling price');
  if (error) return error;
  if (isEditing && Number(form.quantity_remaining) > Number(form.quantity_received)) return 'Quantity remaining cannot exceed quantity received';
  if (!isEditing && form.expiry_date <= today) return 'Expiry date must be after today';
  if (form.manufacture_date && form.manufacture_date > today) return 'Manufacture date cannot be in the future';
  if (form.manufacture_date && form.manufacture_date >= form.expiry_date) return 'Manufacture date must be before the expiry date';
  return '';
}

export function validateMovementForm(form) {
  if (!str(form.batch_id)) return 'Select a batch';
  return (
    checkInteger(form.quantity, 'Quantity', { min: 1 }) ||
    checkText(form.reason, 'Reason', { max: MAX_LENGTH.reason, optional: true, pattern: TEXT_PATTERN, hint: TEXT_HINT })
  );
}

export function validateSupplierForm(form) {
  const phone = str(form.phone);
  return (
    checkText(form.name, 'Supplier name', { max: MAX_LENGTH.supplierName }) ||
    checkText(form.contact_person, 'Contact person', { max: MAX_LENGTH.contactPerson, optional: true }) ||
    checkText(phone, 'Phone', { max: MAX_LENGTH.phone, optional: true, pattern: PHONE_PATTERN, hint: 'can only contain digits, spaces, + - ( )' }) ||
    (phone && phone.replace(/\D/g, '').length < 7 ? 'Phone must have at least 7 digits' : '') ||
    checkText(form.email, 'Email', { max: MAX_LENGTH.email, optional: true, pattern: EMAIL_PATTERN, hint: 'must be a valid email address' }) ||
    checkText(form.address, 'Address', { max: MAX_LENGTH.address, optional: true, pattern: TEXT_PATTERN, hint: TEXT_HINT })
  );
}

export function validateUserForm(form, { isCreate }) {
  const error =
    checkText(form.full_name, 'Full name', { max: MAX_LENGTH.fullName }) ||
    checkText(form.email, 'Email', { max: MAX_LENGTH.email, pattern: EMAIL_PATTERN, hint: 'must be a valid email address' }) ||
    (['admin', 'pharmacist'].includes(form.role) ? '' : 'Role must be admin or pharmacist');
  if (error || !isCreate) return error;
  const password = form.password || '';
  if (password.length < 8) return 'Temporary password must be at least 8 characters';
  if (new TextEncoder().encode(password).length > 72) return 'Temporary password must be 72 characters or fewer';
  return '';
}

// Trims every string field before it's sent to the server.
export function trimFields(form) {
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
}
