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
    const prompt = `You are a pharmacy AI analyst. Explain this inventory anomaly in simple plain text.

Transaction: ${anomaly.transaction_type} of ${anomaly.quantity} units of ${anomaly.medicine_name}
Batch: ${anomaly.batch_number}
Normal quantity for this medicine: ${anomaly.typical_magnitude} units
Statistical deviation (Z-score): ${anomaly.z_score}
Severity: ${anomaly.severity}
Performed by: ${anomaly.user_name}
Reason given: ${anomaly.reason || 'None'}

RESPONSE RULES:
- Plain text only, NO markdown
- NO ** symbols, NO bold formatting
- 2-3 sentences max
- Explain: what this means, why it happened, what to do
- Be factual and non-accusatory`;

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
            maxOutputTokens: 200,  // Reduced from 300 for faster explanations
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
    const prompt = `You are a pharmacy AI assistant. Explain this expiry risk assessment using plain text only.

Medicine: ${batch.medicine_name}
Batch: ${batch.batch_number}
Quantity: ${batch.quantity} units
Days until expiry: ${batch.days_until_expiry}
Risk score: ${riskScore} (0-100, higher = more risky)
Average daily sales: ${batch.avg_daily_sales?.toFixed(1) || 0} units/day

RESPONSE RULES:
- Plain text only, NO markdown, NO ** symbols
- 1-2 sentences max
- Answer: Is this batch at risk? Why or why not? What should the team do?`;

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
    const prompt = `You are a pharmacy inventory analyst. Explain this reorder recommendation using plain text only.

Medicine: ${medicine.name}
Current stock: ${medicine.current_quantity} units
Reorder level: ${medicine.reorder_level} units
Recommended order quantity: ${recommendation.suggested_quantity} units
Average daily sales: ${recommendation.daily_velocity?.toFixed(1) || 0} units/day
Days of stock if ordered: ${Math.ceil((recommendation.suggested_quantity || 0) / (recommendation.daily_velocity || 1))} days

RESPONSE RULES:
- Plain text only, NO markdown, NO ** symbols
- 1-2 sentences max
- Explain: Why this quantity makes sense and when stock will run out if not ordered`;

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
    const prompt = `You are a pharmacy operations expert. Generate a brief executive summary using plain text only, NO markdown.

Total inventory value: $${summaryData.total_value || 0}
Total items: ${summaryData.total_items || 0}
Items expiring in 30 days: ${summaryData.expiring_count || 0}
Low stock items: ${summaryData.low_stock_count || 0}
Critical anomalies detected: ${summaryData.critical_anomalies || 0}
Top selling category: ${summaryData.top_category || 'Unknown'}

RESPONSE RULES:
- Plain text only, NO markdown, NO ** symbols
- 3-4 sentences max
- Cover: What's working well, immediate concerns, 1-2 priority actions
- Be concise and actionable`;

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
            maxOutputTokens: 200,  // Reduced from 300 for speed
            temperature: 0.5       // Reduced from 0.6 for faster generation
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

async function generateSmartExecutiveSummary(report, apiKey) {
  if (!apiKey || !report) return null;
  try {
    const selectedModel = await selectAvailableModel(apiKey);
    const prompt = `You are a pharmacy operations analyst. Rewrite the verified inventory facts below as a plain-language executive summary in 2-4 sentences. Do not add numbers or claims that are not present. Mention the most urgent issue, an important trend or comparison, and the next action when available. Plain text only, no markdown.

Verified report facts:
${JSON.stringify({ summary: report.summary, comparisons: report.comparisons, categories: report.category_analysis?.slice(0, 3), priority_actions: report.priority_actions?.slice(0, 5) })}`;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 220, temperature: 0.2 } })
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text || text.length > 900) return null;
    return text.replace(/[*#`]/g, '').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn('Smart executive summary unavailable:', err.message);
    return null;
  }
}

module.exports = {
  explainAnomaly,
  explainExpiryRisk,
  explainReorderRecommendation,
  generatePharmacyHealthReport,
  generateSmartExecutiveSummary
};
