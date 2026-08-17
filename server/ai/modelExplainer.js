/**
 * ML Model Explainer
 * Uses LLM to provide human-readable explanations for AI model predictions
 * Implements XAI (Explainable AI) principles
 */

const { pool } = require('../config/db');
const { selectAvailableModel } = require('./medicalLLM');

/**
 * Generate a detailed explanation for an anomaly detection result
 * Makes it understandable for pharmacy staff without technical background
 */
async function explainAnomaly(anomaly, apiKey) {
  try {
    const prompt = `You are a pharmacy AI analyst. Explain this inventory anomaly in simple terms for pharmacy staff:

Transaction: ${anomaly.transaction_type} of ${anomaly.quantity} units of ${anomaly.medicine_name}
Batch: ${anomaly.batch_number}
Normal quantity for this medicine: ${anomaly.typical_magnitude} units
Statistical deviation (Z-score): ${anomaly.z_score}
Severity: ${anomaly.severity}
Performed by: ${anomaly.user_name}
Reason given: ${anomaly.reason || 'None'}

Explain BRIEFLY (2-3 sentences):
1. What the numbers mean in plain language
2. Why this might have happened
3. What action to take

Be specific, factual, and non-accusatory.`;

    // Select best available model from fallback chain
    const selectedModel = await selectAvailableModel(apiKey);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.5
          }
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch (err) {
    console.error('Error explaining anomaly:', err.message);
    return null;
  }
}

/**
 * Generate explanation for expiry risk predictions
 */
async function explainExpiryRisk(batch, riskScore, apiKey) {
  try {
    const prompt = `You are a pharmacy AI assistant. Explain this expiry risk assessment:

Medicine: ${batch.medicine_name}
Batch: ${batch.batch_number}
Quantity: ${batch.quantity} units
Days until expiry: ${batch.days_until_expiry}
Risk score: ${riskScore} (0-100, higher = more risky)
Average daily sales: ${batch.avg_daily_sales?.toFixed(1) || 0} units/day

Provide a 1-2 sentence assessment in plain language:
- Is this batch at risk? Why or why not?
- What should the pharmacy team do?`;

    // Select best available model from fallback chain
    const selectedModel = await selectAvailableModel(apiKey);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.5
          }
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch (err) {
    console.error('Error explaining expiry risk:', err.message);
    return null;
  }
}

/**
 * Generate rationale for reorder recommendations
 */
async function explainReorderRecommendation(medicine, recommendation, apiKey) {
  try {
    const prompt = `You are a pharmacy inventory analyst. Explain this reorder recommendation:

Medicine: ${medicine.name}
Current stock: ${medicine.current_quantity} units
Reorder level: ${medicine.reorder_level} units
Recommended order quantity: ${recommendation.suggested_quantity} units
Average daily sales: ${recommendation.daily_velocity?.toFixed(1) || 0} units/day
Days of stock if ordered: ${Math.ceil((recommendation.suggested_quantity || 0) / (recommendation.daily_velocity || 1))} days

Explain in 1-2 sentences:
1. Why this quantity makes sense
2. When to expect stock-out if not ordered

Be clear and actionable.`;

    // Select best available model from fallback chain
    const selectedModel = await selectAvailableModel(apiKey);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.5
          }
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch (err) {
    console.error('Error explaining reorder:', err.message);
    return null;
  }
}

/**
 * Generate executive summary of pharmacy status
 * Like a "health report" for the inventory system
 */
async function generatePharmacyHealthReport(summaryData, apiKey) {
  try {
    const prompt = `You are a pharmacy operations expert. Generate a brief executive summary based on this data:

Total inventory value: $${summaryData.total_value || 0}
Total items: ${summaryData.total_items || 0}
Items expiring in 30 days: ${summaryData.expiring_count || 0}
Low stock items: ${summaryData.low_stock_count || 0}
Critical anomalies detected: ${summaryData.critical_anomalies || 0}
Top selling category: ${summaryData.top_category || 'Unknown'}

Generate a 3-4 sentence health summary that:
1. Highlights what's working well
2. Points out immediate concerns
3. Suggests 1-2 priority actions

Be concise and actionable.`;

    // Select best available model from fallback chain
    const selectedModel = await selectAvailableModel(apiKey);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.6
          }
        })
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;

  } catch (err) {
    console.error('Error generating health report:', err.message);
    return null;
  }
}

module.exports = {
  explainAnomaly,
  explainExpiryRisk,
  explainReorderRecommendation,
  generatePharmacyHealthReport
};
