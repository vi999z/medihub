const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateExpiryRisk } = require('../ai/expiryRiskUtils');

test('flags batches that will take longer to sell than the remaining shelf life', () => {
  const risk = calculateExpiryRisk({ quantityRemaining: 40, dailyVelocity: 2, daysLeft: 10, reorderLevel: 10 });
  assert.ok(risk > 0.6, `expected high risk, received ${risk}`);
});

test('keeps well-covered stock with healthy demand at low risk', () => {
  const risk = calculateExpiryRisk({ quantityRemaining: 120, dailyVelocity: 20, daysLeft: 60, reorderLevel: 10 });
  assert.ok(risk < 0.3, `expected low risk, received ${risk}`);
});

test('raises risk when a small stock will not sell before expiry', () => {
  // 4 units at 0.1/day take 40 days to sell, but only 30 days are left.
  const risk = calculateExpiryRisk({ quantityRemaining: 4, dailyVelocity: 0.1, daysLeft: 30, reorderLevel: 10 });
  assert.ok(risk > 0.3, `expected elevated risk, received ${risk}`);
});

test('keeps risk low for a small stock that sells out well before expiry', () => {
  // 4 units at 1/day sell out in 4 days with 30 days left — an expiry
  // non-issue, even though the quantity is below the reorder buffer.
  const risk = calculateExpiryRisk({ quantityRemaining: 4, dailyVelocity: 1, daysLeft: 30, reorderLevel: 10 });
  assert.ok(risk < 0.3, `expected low risk, received ${risk}`);
});
