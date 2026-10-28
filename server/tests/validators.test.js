const test = require('node:test');
const assert = require('node:assert/strict');

const { validateMedicine, validateBatch, validateSupplier, validateUser, validateTransaction } = require('../utils/validators');

const medOpts = { categoryOptions: ['Analgesic', 'Other'], branchOptions: ['QMC', 'MT Carmel'] };
const batch = (overrides = {}) => ({ medicine_id: 1, batch_number: 'B-1', quantity_received: 5, expiry_date: '2099-01-01', ...overrides });

test('medicine: rejects blank, overlong, markup and bad branch', () => {
  assert.match(validateMedicine({ name: ' ', unit: 'box' }, medOpts).error, /required/);
  assert.match(validateMedicine({ name: 'x'.repeat(151), unit: 'box' }, medOpts).error, /150 characters/);
  assert.match(validateMedicine({ name: '<script>', unit: 'box' }, medOpts).error, /can only contain/);
  assert.match(validateMedicine({ name: 'A', unit: 'box', branch: 'Mars' }, medOpts).error, /Branch/);
});

test('medicine: reorder level must be a whole number and 0 is kept', () => {
  assert.ok(validateMedicine({ name: 'A', unit: 'box', reorder_level: '-1' }, medOpts).error);
  assert.ok(validateMedicine({ name: 'A', unit: 'box', reorder_level: '1e3' }, medOpts).error);
  assert.equal(validateMedicine({ name: 'A', unit: 'box', reorder_level: 0 }, medOpts).value.reorder_level, 0);
});

test('medicine: "false" text is not a true prescription flag; categories normalise', () => {
  const { value } = validateMedicine({ name: 'A', unit: 'box', requires_prescription: 'false', category: 'analgesic' }, medOpts);
  assert.equal(value.requires_prescription, false);
  assert.equal(value.category, 'Analgesic');
});

test('batch: dates must be real, expiry in the future, manufacture before expiry', () => {
  assert.match(validateBatch(batch({ expiry_date: '2020-01-01' })).error, /after today/);
  assert.match(validateBatch(batch({ expiry_date: '2099-02-30' })).error, /valid date/);
  assert.match(validateBatch(batch({ manufacture_date: '2098-01-01' })).error, /future/);
});

test('batch: quantities and prices', () => {
  assert.match(validateBatch(batch({ quantity_received: '0' })).error, /at least 1/);
  assert.match(validateBatch(batch({ cost_price: '-3' })).error, /0 or more/);
  assert.match(validateBatch(batch({ cost_price: '1.234' })).error, /2 decimal/);
  const existing = { medicine_id: 1, status: 'active' };
  assert.match(validateBatch(batch({ quantity_remaining: 9 }), existing).error, /exceed/);
  assert.equal(validateBatch(batch({ quantity_remaining: 0 }), existing).value.status, 'depleted');
});

test('batch: CSV imports may carry already-expired stock', () => {
  const { value } = validateBatch(batch({ expiry_date: '2020-01-01' }), undefined, { withoutMedicine: true, allowPastExpiry: true });
  assert.equal(value.status, 'expired');
});

test('supplier and user formats', () => {
  assert.ok(validateSupplier({ name: 'Acme', email: 'nope' }).error);
  assert.ok(validateSupplier({ name: 'Acme', phone: '123' }).error);
  assert.ok(validateUser({ full_name: 'Ann', email: 'a@b.co', role: 'pharmacist', password: 'short' }, { isCreate: true }).error);
  assert.ok(validateUser({ full_name: 'Ann', email: 'a@b.co', role: 'owner' }, { isCreate: false }).error);
});

test('transaction: whole quantities and a valid adjustment direction', () => {
  assert.ok(validateTransaction({ batch_id: 1, transaction_type: 'sale', quantity: '1.5' }).error);
  assert.ok(validateTransaction({ batch_id: 1, transaction_type: 'adjustment', quantity: 1, direction: 'sideways' }).error);
  assert.equal(validateTransaction({ batch_id: 1, transaction_type: 'adjustment', quantity: 2, direction: 'decrease' }).value.direction, 'decrease');
});
