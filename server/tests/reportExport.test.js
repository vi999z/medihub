const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildReportExport,
  getSupportedExportTypes,
  buildPdfBuffer,
  buildWordDocument,
} = require('../controllers/exportController');

const SAMPLE_REPORT = {
  title: 'Inventory Report',
  summary: { total_items: 2 },
  rows: [{ medicine_name: 'Amoxicillin', quantity: 120 }],
  recommendations: ['Review stock levels'],
};

const SMART_REPORT = {
  title: 'Smart Pharmacy Health Report',
  executive_summary: 'Two medicines require immediate action. Cardiovascular demand is rising compared with the previous period.',
  summary: { total_medicines: 4, out_of_stock: 1, low_stock: 2 },
  comparisons: { recent_days: 30, previous_days: 30, demand_direction: 'increasing' },
  charts: {
    category_stock: [{ label: 'Cardiovascular', value: 120 }, { label: 'Antihistamine', value: 40 }],
    category_demand: [{ label: 'Cardiovascular', value: 80 }, { label: 'Antihistamine', value: 20 }],
  },
  sections: {
    critical: [{ name: 'Amlodipine', current_stock: 0, priority: 'critical', days_to_stockout: { value: 0 } }],
    expiring_soon: [],
    low_stock_monitor: [{ name: 'Cetirizine', current_stock: 4, priority: 'low', days_to_stockout: { value: 12 } }],
    healthy_stock: [{ name: 'Vitamin C', current_stock: 50 }],
  },
  priority_actions: [{ priority: 'critical', action: 'Urgently replenish Amlodipine.' }],
  recommendations: ['Urgently replenish Amlodipine.'],
};

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

test('buildPdfBuffer returns a complete PDF document', async () => {
  const buffer = await buildPdfBuffer(SAMPLE_REPORT);

  assert.ok(Buffer.isBuffer(buffer));
  assert.match(buffer.subarray(0, 5).toString('ascii'), /^%PDF-/);
  assert.equal(buffer.subarray(-6).toString('ascii'), '%%EOF\n');
});

test('buildWordDocument returns a readable DOCX package', async () => {
  const buffer = await buildWordDocument(SAMPLE_REPORT);
  const contents = buffer.toString('binary');

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');
  assert.match(contents, /\[Content_Types\]\.xml/);
  assert.match(contents, /word\/document\.xml/);
});

test('smart report renders summary, charts, and grouped sections in PDF and Word', async () => {
  const pdf = await buildPdfBuffer(SMART_REPORT);
  const docx = await buildWordDocument(SMART_REPORT);

  assert.match(pdf.subarray(0, 5).toString('ascii'), /^%PDF-/);
  assert.ok(pdf.length > 1500);
  assert.equal(docx.subarray(0, 2).toString('ascii'), 'PK');
  assert.match(docx.toString('binary'), /word\/document\.xml/);
});
