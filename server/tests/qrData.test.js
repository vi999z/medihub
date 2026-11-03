const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The scanner's parser lives in the client (ES module); load it from here so
// it is tested with the rest of the suite.
const load = () => import(pathToFileURL(path.join(__dirname, '../../client/src/utils/qrData.js')).href);

test('a MEDIHUB detail code is read into medicine and batch details', async () => {
  const { parseScan } = await load();
  const info = parseScan(JSON.stringify({
    app: 'MEDIHUB', medicine: 'Biogesic', strength: '500mg', form: 'Tablet', barcode: 'DEMO480100001', branch: 'QMC',
    batch: 'lot-9001', qty: 120, mfg: '2026-08-01', exp: '2028-02-28', cost: 38.5, price: 52, supplier: 'Supplier A (Demo)',
  }));
  assert.equal(info.kind, 'info');
  assert.equal(info.medicine.name, 'Biogesic');
  assert.equal(info.batch.batch_number, 'LOT-9001');
  assert.equal(info.batch.quantity_received, 120);
  assert.equal(info.batch.expiry_date, '2028-02-28');
  assert.equal(info.batch.selling_price, 52);
  assert.deepEqual(info.barcodeCandidates, ['DEMO480100001']);
});

test('bad values in a code are dropped with a warning, never accepted', async () => {
  const { parseScan } = await load();
  const info = parseScan(JSON.stringify({ app: 'MEDIHUB', medicine: 'X', batch: 'B1', qty: -5, exp: '2028-02-30', price: 'abc' }));
  assert.equal(info.batch.quantity_received, null);
  assert.equal(info.batch.expiry_date, '');
  assert.equal(info.batch.selling_price, null);
  assert.ok(info.warnings.some((w) => /Expiry date/.test(w)));
});

test('plain barcodes, MEDIHUB references, other apps and junk stay plain codes', async () => {
  const { parseScan } = await load();
  assert.deepEqual(parseScan('4800010000011'), { kind: 'code', code: '4800010000011' });
  assert.deepEqual(parseScan('MEDIHUB:M:12'), { kind: 'code', code: 'MEDIHUB:M:12' });
  assert.equal(parseScan('012345678905').kind, 'code');
  assert.equal(parseScan('{"app":"OTHER","name":"x"}').kind, 'code');
  assert.equal(parseScan('{not json').kind, 'code');
  assert.equal(parseScan('{}').kind, 'code');
  assert.equal(parseScan('').kind, 'code');
});

test('a GS1 pack code gives barcode, lot, expiry and count', async () => {
  const { parseScan } = await load();
  const info = parseScan('(01)04800100000011(17)281231(10)lot123(30)48');
  assert.equal(info.source, 'gs1');
  assert.equal(info.batch.batch_number, 'LOT123');
  assert.equal(info.batch.expiry_date, '2028-12-31');
  assert.equal(info.batch.quantity_received, 48);
  assert.deepEqual(info.barcodeCandidates, ['04800100000011', '4800100000011']);
});

test('a raw GS1 reading works; day 00 means the last day of the month; bad dates warn', async () => {
  const { parseScan } = await load();
  const raw = parseScan('010480010000001117280200' + '10ABC-1\u001d' + '21SER9');
  assert.equal(raw.batch.expiry_date, '2028-02-29');
  assert.equal(raw.batch.batch_number, 'ABC-1');
  const bad = parseScan('(01)04800100000011(17)281399(10)L1');
  assert.equal(bad.batch.expiry_date, '');
  assert.ok(bad.warnings.length > 0);
});
