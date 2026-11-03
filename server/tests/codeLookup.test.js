const test = require('node:test');
const assert = require('node:assert/strict');

// Replace the database with a small fake so the lookup order can be tested
// without a real connection.
const dbPath = require.resolve('../config/db');
let tables;
function fakeQuery(sql, params = []) {
  const [value] = params;
  const rows = (name, pred) => [tables[name].filter(pred)];
  if (/FROM medicines WHERE barcode/.test(sql)) return rows('medicines', (m) => m.barcode === value);
  if (/FROM medicines WHERE id/.test(sql)) return rows('medicines', (m) => m.id === value);
  if (/FROM batches WHERE batch_number/.test(sql)) return rows('batches', (b) => b.batch_number === value);
  if (/FROM batches WHERE id/.test(sql)) return rows('batches', (b) => b.id === value);
  throw new Error(`Unexpected query: ${sql}`);
}
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async (sql, params) => fakeQuery(sql, params) } } };
const { findByCode } = require('../models/medicineModel');

test.beforeEach(() => {
  tables = {
    medicines: [{ id: 1, barcode: '4800010000011' }, { id: 2, barcode: null }],
    batches: [{ id: 7, medicine_id: 2, batch_number: 'LOT-77' }, { id: 12, medicine_id: 1, batch_number: 'LOT-12' }],
  };
});

test('a product barcode finds its medicine', async () => {
  assert.deepEqual(await findByCode('4800010000011'), { kind: 'medicine', medicine_id: 1 });
});

test('a medicine QR (MEDIHUB:M:id) finds the medicine; an unknown one finds nothing', async () => {
  assert.deepEqual(await findByCode('MEDIHUB:M:2'), { kind: 'medicine', medicine_id: 2 });
  assert.equal(await findByCode('MEDIHUB:M:99'), null);
});

test('a batch QR (MEDIHUB:B:id) finds the batch and its medicine', async () => {
  assert.deepEqual(await findByCode('MEDIHUB:B:7'), { kind: 'batch', medicine_id: 2, batch_id: 7 });
  assert.equal(await findByCode('MEDIHUB:B:99'), null);
});

test('a batch number typed on a label finds the batch', async () => {
  assert.deepEqual(await findByCode('LOT-12'), { kind: 'batch', medicine_id: 1, batch_id: 12 });
});

test('a plain number still works as a batch id (QR codes made before medicine QR codes)', async () => {
  assert.deepEqual(await findByCode('7'), { kind: 'batch', medicine_id: 2, batch_id: 7 });
});

test('a barcode wins over a batch with the same number, and unknown or blank codes find nothing', async () => {
  tables.batches.push({ id: 5, medicine_id: 2, batch_number: '4800010000011' });
  assert.equal((await findByCode('4800010000011')).kind, 'medicine');
  assert.equal(await findByCode('NOPE-123'), null);
  assert.equal(await findByCode('   '), null);
  assert.equal(await findByCode(undefined), null);
});
