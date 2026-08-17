const { trainAndPersist, scoreActiveBatches } = require('../ai/expiryRiskModel');
const { pool } = require('../config/db');
const { getReorderSuggestions } = require('../ai/demandForecastModel');
const { detectAnomalies } = require('../ai/anomalyDetection');
const { logAudit } = require('../utils/auditLogger');

// GET /api/ai/expiry-risk
async function getExpiryRisk(req, res) {
  try {
    const results = await scoreActiveBatches();
    res.json(results);
  } catch (err) {
    console.error('Expiry risk scoring failed:', err);
    res.status(500).json({
      error: 'Failed to compute expiry risk',
      detail: err.message,
    });
  }
}

// POST /api/ai/train
async function train(req, res) {
  try {
    const result = await trainAndPersist();

    // Log the training attempt regardless of success/failure
    await logAudit(
      req.user.id,
      'trained_ai_model',
      `Expiry risk model training: ${JSON.stringify(result)}`,
      req
    );

    // Return 200 with full result — the frontend shows different messages for trained vs not-trained
    res.json(result);
  } catch (err) {
    console.error('AI training failed:', err);
    res.status(500).json({
      error: 'Training failed',
      detail: err.message,
      trained: false,
    });
  }
}

// GET /api/ai/reorder-suggestions
async function getReorderSuggestionsHandler(req, res) {
  try {
    res.json(await getReorderSuggestions());
  } catch (err) {
    console.error('Reorder suggestions failed:', err);
    res.status(500).json({
      error: 'Failed to compute reorder suggestions',
      detail: err.message,
    });
  }
}

// GET /api/ai/anomalies
async function getAnomalies(req, res) {
  try {
    res.json(await detectAnomalies(req.query.days || 30));
  } catch (err) {
    console.error('Anomaly detection failed:', err);
    res.status(500).json({
      error: 'Failed to detect anomalies',
      detail: err.message,
    });
  }
}

// POST /api/ai/chat
async function chat(req, res) {
  try {
    const { question } = req.body;
    console.log('AI chat request received:', { question: question?.substring(0, 50) + '...', userId: req.user?.id });

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error('GOOGLE_AI_API_KEY is not set in environment variables');
      return res.status(500).json({ error: 'AI service not configured. Please contact administrator.' });
    }
    console.log('Google AI API key present:', apiKey ? 'Yes' : 'No');

    console.log('Fetching database data...');
    // Gather relevant data from existing endpoints
    const [summary, expiring, lowStock, trend, categoryData, expiryRisk, reorderSuggestions, anomalies] = await Promise.all([
      pool.query('SELECT * FROM summary_view').then(r => r[0] || {}).catch(e => { console.error('Summary view error:', e); return {}; }),
      pool.query('SELECT * FROM batches WHERE status = \'active\' AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY expiry_date ASC LIMIT 10').then(r => r).catch(e => { console.error('Expiring batches error:', e); return []; }),
      pool.query('SELECT * FROM low_stock_view LIMIT 10').then(r => r).catch(e => { console.error('Low stock view error:', e); return []; }),
      pool.query('SELECT * FROM sales_trend_view ORDER BY date DESC LIMIT 30').then(r => r).catch(e => { console.error('Sales trend view error:', e); return []; }),
      pool.query('SELECT category, COUNT(*) as count FROM medicines GROUP BY category').then(r => r).catch(e => { console.error('Category query error:', e); return []; }),
      scoreActiveBatches().catch(e => { console.error('Expiry risk error:', e); return []; }),
      getReorderSuggestions().catch(e => { console.error('Reorder suggestions error:', e); return []; }),
      detectAnomalies(30).catch(e => { console.error('Anomalies error:', e); return []; }),
    ]);
    console.log('Database data fetched successfully');

    // Construct the system prompt with real data
    const systemPrompt = `You are a helpful AI assistant for a pharmacy inventory management system called MediHub. 
You answer questions about inventory, expiry, stock levels, and sales using ONLY the data provided below.
Do not invent or hallucinate numbers. If the answer cannot be found in the data, say so clearly.
Be concise and professional. Format numbers with appropriate units.

CURRENT INVENTORY DATA:
- Summary: ${JSON.stringify(summary)}
- Expiring soon (next 30 days): ${JSON.stringify(expiring)}
- Low stock items: ${JSON.stringify(lowStock)}
- Sales trend (last 30 days): ${JSON.stringify(trend)}
- Stock by category: ${JSON.stringify(categoryData)}
- Expiry risk scores: ${JSON.stringify(expiryRisk)}
- Reorder suggestions: ${JSON.stringify(reorderSuggestions)}
- Anomalies detected: ${JSON.stringify(anomalies)}`;

    console.log('Calling Google AI API...');
    // Call Google AI Studio API with updated model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\nUser: " + question }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        }
      }),
    });

    console.log('Google AI API response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google AI API error:', response.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        console.error('Google AI error details:', errorData);
      } catch (e) {
        console.error('Could not parse error response');
      }
      throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Google AI API response received');
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Log the chat interaction
    await logAudit(
      req.user.id,
      'ai_chat',
      `Question: ${question.substring(0, 100)}...`,
      req
    );

    res.json({ response: aiResponse });
  } catch (err) {
    console.error('AI chat failed:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      hasApiKey: !!process.env.GOOGLE_AI_API_KEY,
      apiKeyPrefix: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 8) + '...' : 'none'
    });

    if (err.message?.includes('API key') || err.message?.includes('401') || err.message?.includes('auth')) {
      return res.status(500).json({ error: 'AI service authentication failed. Please contact administrator.' });
    }
    if (err.message?.includes('quota') || err.message?.includes('rate limit') || err.message?.includes('429')) {
      return res.status(429).json({ error: 'AI service rate limit exceeded. Please try again later.' });
    }
    if (err.message?.includes('Google AI') || err.message?.includes('AI service') || err.message?.includes('genai')) {
      return res.status(500).json({ error: `AI service error: ${err.message}` });
    }
    res.status(500).json({ error: 'Failed to process question. Please try again.' });
  }
}

module.exports = { getExpiryRisk, train, getReorderSuggestionsHandler, getAnomalies, chat };