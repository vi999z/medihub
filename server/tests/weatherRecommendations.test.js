/**
 * Quick smoke test for weatherService recommendations engine.
 * Run: node server/tests/weatherRecommendations.test.js
 */

const { buildWeatherRecommendations, classifyMedicine, PH_SEASONAL_DEMAND } = require('../ai/weatherService.js');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('  PASS:', label);
    passed++;
  } else {
    console.error('  FAIL:', label);
    failed++;
  }
}

// ─── Classification tests ─────────────────────────────────────────────────────
console.log('\n[Classification]');
assert(classifyMedicine('Biogesic', '') === 'cold_flu', 'Biogesic → cold_flu');
assert(classifyMedicine('Neozep', '') === 'cold_flu', 'Neozep → cold_flu');
assert(classifyMedicine('Bioflu', '') === 'cold_flu', 'Bioflu → cold_flu');
assert(classifyMedicine('Solmux', '') === 'cough_cold', 'Solmux → cough_cold');
assert(classifyMedicine('Robitussin', '') === 'cough_cold', 'Robitussin → cough_cold');
assert(classifyMedicine('Cetirizine', '') === 'antihistamine', 'Cetirizine → antihistamine');
assert(classifyMedicine('Loratadine', '') === 'antihistamine', 'Loratadine → antihistamine');
assert(classifyMedicine('Vitamin C 500mg', '') === 'vitamins', 'Vitamin C → vitamins');
assert(classifyMedicine('Oresol', '') === 'antidiarrheal', 'Oresol → antidiarrheal');
assert(classifyMedicine('Loperamide', '') === 'antidiarrheal', 'Loperamide → antidiarrheal');
assert(classifyMedicine('Amoxicillin', '') === null, 'Amoxicillin → null (excluded)');
assert(classifyMedicine('Metformin', '') === null, 'Metformin → null (excluded)');

// ─── Seasonal multipliers ─────────────────────────────────────────────────────
console.log('\n[Seasonal Multipliers]');
const aug = PH_SEASONAL_DEMAND[8];
assert(aug.cold_flu >= 1.5, 'August cold_flu multiplier ≥ 1.5 (peak wet season)');
assert(aug.cough_cold >= 1.5, 'August cough_cold multiplier ≥ 1.5');
const apr = PH_SEASONAL_DEMAND[4];
assert(apr.cold_flu < 1.0, 'April cold_flu multiplier < 1.0 (dry season)');
assert(apr.electrolytes >= 1.3, 'April electrolytes multiplier ≥ 1.3 (hot summer)');

// ─── Recommendations engine ───────────────────────────────────────────────────
console.log('\n[Recommendations Engine]');
const mockContext = {
  location: 'Manila', country: 'PH', condition: 'Rain', season: 'wet', month: 8,
  season_description: 'Mid wet season',
  rainy_days_in_forecast: 4,
  demand_multipliers: { cold_flu: 1.9, cough_cold: 1.9, antihistamine: 1.0, analgesic: 1.3, antidiarrheal: 1.5, vitamins: 1.2, electrolytes: 1.2 },
  high_demand_categories: [{ category: 'cold_flu', multiplier: 1.9 }],
};

const medicines = [
  { id: 1, name: 'Biogesic', category: 'analgesic', reorder_level: 100, current_stock: 30, daily_velocity: 8 },
  { id: 2, name: 'Neozep', category: 'cold', reorder_level: 80, current_stock: 200, daily_velocity: 5 },
  { id: 3, name: 'Solmux', category: 'cough', reorder_level: 60, current_stock: 20, daily_velocity: 3 },
  { id: 4, name: 'Amoxicillin', category: 'antibiotic', reorder_level: 50, current_stock: 300, daily_velocity: 2 },
];

const recs = buildWeatherRecommendations(mockContext, medicines);

// Amoxicillin should not appear
const amoxRec = recs.find(r => r.medicine_name === 'Amoxicillin');
assert(!amoxRec, 'Amoxicillin excluded (no weather category)');

// Biogesic has 30 units, 8/day × 1.9 = 15.2/day adjusted → ~2 days — should be critical
const biogesicRec = recs.find(r => r.medicine_name === 'Biogesic');
assert(biogesicRec !== undefined, 'Biogesic appears in recommendations');
if (biogesicRec) {
  assert(biogesicRec.urgency === 'critical', 'Biogesic urgency = critical (< 7 days adjusted)');
  assert(biogesicRec.recommended_restock_qty > 0, 'Biogesic has positive restock qty');
  assert(biogesicRec.weather_demand_multiplier >= 1.5, 'Biogesic multiplier >= 1.5');
  console.log('    Biogesic days of stock:', biogesicRec.days_of_stock_at_adjusted_demand);
  console.log('    Biogesic reason:', biogesicRec.weather_reason.slice(0, 90) + '...');
}

// Sort: critical first
if (recs.length >= 2) {
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  let sorted = true;
  for (let i = 1; i < recs.length; i++) {
    if (urgencyOrder[recs[i].urgency] < urgencyOrder[recs[i - 1].urgency]) {
      sorted = false; break;
    }
  }
  assert(sorted, 'Recommendations sorted by urgency (critical first)');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('Results:', passed + failed, 'tests,', passed, 'passed,', failed, 'failed');
if (failed > 0) process.exit(1);
