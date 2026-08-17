const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReportExport, getSupportedExportTypes } = require('../controllers/exportController');

test('buildReportExport generates CSV inventory exports', () => {
  const exportPayload = {
    title: 'Inventory Report',
    rows: [
      { medicine_name: 'Amoxicillin', quantity_remaining: 120, category: 'Antibiotic' },
      { medicine_name: 'Paracetamol', quantity_remaining: 45, category: 'Pain Relief' }
    ]
  };

  const result = buildReportExport(exportPayload, 'csv');

  assert.equal(result.contentType, 'text/csv; charset=utf-8');
  assert.match(result.body, /medicine_name/i);
  assert.match(result.body, /Amoxicillin/);
  assert.match(result.body, /Paracetamol/);
});

test('buildReportExport creates JSON chart data for analytics exports', () => {
  const exportPayload = {
    title: 'Pharmacy Health',
    summary: { total_value: 125000, expiring_count: 3 },
    trend: [{ label: 'Jan', value: 10 }, { label: 'Feb', value: 18 }, { label: 'Mar', value: 14 }]
  };

  const result = buildReportExport(exportPayload, 'chart');

  assert.equal(result.contentType, 'application/json; charset=utf-8');
  assert.equal(result.body.type, 'bar');
  assert.deepEqual(result.body.labels, ['Jan', 'Feb', 'Mar']);
  assert.deepEqual(result.body.datasets[0].data, [10, 18, 14]);
});

test('buildReportExport includes text and JSON formats for summaries', () => {
  const exportPayload = {
    title: 'Stock Summary',
    summary: { total_items: 180, low_stock_count: 12 },
    recommendations: ['Review reorder levels', 'Prioritize expiry checks']
  };

  const textResult = buildReportExport(exportPayload, 'txt');
  const jsonResult = buildReportExport(exportPayload, 'json');

  assert.equal(textResult.contentType, 'text/plain; charset=utf-8');
  assert.match(textResult.body, /Stock Summary/i);
  assert.equal(jsonResult.contentType, 'application/json; charset=utf-8');
  assert.equal(jsonResult.body.summary.total_items, 180);
});

test('getSupportedExportTypes exposes the implemented formats', () => {
  const supported = getSupportedExportTypes();

  assert.ok(supported.includes('csv'));
  assert.ok(supported.includes('excel'));
  assert.ok(supported.includes('pdf'));
  assert.ok(supported.includes('txt'));
  assert.ok(supported.includes('json'));
  assert.ok(supported.includes('chart'));
});
