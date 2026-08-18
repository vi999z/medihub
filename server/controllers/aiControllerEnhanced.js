/**
 * Enhanced AI Controller
 * Implements modern LLM capabilities for pharmaceutical inventory management
 * Replaces the basic Google AI calls with sophisticated reasoning and context awareness
 */

const { modernChat, ConversationContext, detectIntention, buildSystemPrompt } = require('../ai/medicalLLM');
const { explainAnomaly, explainExpiryRisk, explainReorderRecommendation, generatePharmacyHealthReport } = require('../ai/modelExplainer');
const { streamGeminiResponse } = require('../ai/streamingHandler');
const { trainAndPersist, scoreActiveBatches } = require('../ai/expiryRiskModel');
const { pool } = require('../config/db');
const { getReorderSuggestions } = require('../ai/demandForecastModel');
const { detectAnomalies } = require('../ai/anomalyDetection');
const { logAudit } = require('../utils/auditLogger');

// Store conversation contexts per user (in production, use Redis or database)
const conversationContexts = new Map();

function getUserContext(userId) {
  if (!conversationContexts.has(userId)) {
    conversationContexts.set(userId, new ConversationContext(userId));
  }
  return conversationContexts.get(userId);
}

// ─── Enhanced Expiry Risk with Explanations ───
async function getExpiryRiskEnhanced(req, res) {
  try {
    const results = await scoreActiveBatches();
    
    // Add LLM-generated explanations if enabled
    if (req.query.explain === 'true' && process.env.GOOGLE_AI_API_KEY) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      
      // Enhance top risk items with explanations
      if (Array.isArray(results) && results.length > 0) {
        const topRisks = results.slice(0, 5);
        const enhanced = await Promise.all(
          topRisks.map(async (risk) => {
            const explanation = await explainExpiryRisk(risk, risk.risk_score, apiKey);
            return { ...risk, ai_explanation: explanation };
          })
        );
        
        return res.json({
          results,
          top_risks_explained: enhanced,
          explanation_source: 'gemini-2.0-flash'
        });
      }
    }
    
    res.json(results);
  } catch (err) {
    console.error('Enhanced expiry risk failed:', err);
    res.status(500).json({
      error: 'Failed to compute expiry risk',
      detail: err.message,
    });
  }
}

// ─── Enhanced Anomaly Detection with Context ───
async function getAnomaliesEnhanced(req, res) {
  try {
    const result = await detectAnomalies(req.query.days || 30);
    
    // Add explanations if requested
    if (req.query.explain === 'true' && process.env.GOOGLE_AI_API_KEY) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      
      if (result.anomalies && result.anomalies.length > 0) {
        // Explain top 3 anomalies
        const topAnomalies = result.anomalies.slice(0, 3);
        const explained = await Promise.all(
          topAnomalies.map(async (anomaly) => {
            const explanation = await explainAnomaly(anomaly, apiKey);
            return { ...anomaly, ai_explanation: explanation };
          })
        );
        
        return res.json({
          ...result,
          top_anomalies_explained: explained,
          explanation_source: 'gemini-2.0-flash'
        });
      }
    }
    
    res.json(result);
  } catch (err) {
    console.error('Enhanced anomaly detection failed:', err);
    res.status(500).json({
      error: 'Failed to detect anomalies',
      detail: err.message,
    });
  }
}

// ─── Pharmacy Health Report ───
async function getPharmacyHealthReport(req, res) {
  try {
    // Gather all analytics
    const [summary] = await pool.query('SELECT * FROM summary_view').then(r => [r[0] || {}]).catch(() => [{}]);
    const expiringResult = await detectAnomalies(30).catch(() => ({ anomalies: [] }));
    const lowStockResult = await getReorderSuggestions().catch(() => []);
    const expiryRisk = await scoreActiveBatches().catch(() => []);

    // Build summary for LLM
    const summaryData = {
      total_value: summary.total_value || 0,
      total_items: summary.total_items || 0,
      expiring_count: Array.isArray(expiryRisk) ? expiryRisk.filter(r => r.risk_score > 70).length : 0,
      low_stock_count: Array.isArray(lowStockResult) ? lowStockResult.length : 0,
      critical_anomalies: expiringResult.anomalies ? expiringResult.anomalies.filter(a => a.severity === 'critical').length : 0,
      top_category: 'Various' // Could enhance this
    };

    // Generate health report with LLM
    let healthReport = 'Pharmacy status report generated.';
    if (process.env.GOOGLE_AI_API_KEY) {
      healthReport = await generatePharmacyHealthReport(summaryData, process.env.GOOGLE_AI_API_KEY) || healthReport;
    }

    res.json({
      summary_data: summaryData,
      health_report: healthReport,
      timestamp: new Date().toISOString(),
      ai_generated: true
    });
  } catch (err) {
    console.error('Health report generation failed:', err);
    res.status(500).json({
      error: 'Failed to generate health report',
      detail: err.message,
    });
  }
}

// ─── Modern Chat with Conversation History & Function Calling ───
async function chatModern(req, res) {
  try {
    const { question, stream = false } = req.body;
    const userId = req.user.id;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    console.log(`[AI] User ${userId} asked: "${question.substring(0, 50)}..."`);

    // Get conversation context for this user
    const context = getUserContext(userId);

    // Try modern approach first
    try {
      if (stream) {
        // Stream response mode (like ChatGPT)
        const systemPrompt = buildSystemPrompt(
          context.getContext(),
          detectIntention(question)
        );
        
        return streamGeminiResponse(question, systemPrompt, res);
      } else {
        // Regular response mode (faster)
        const result = await modernChat(question, userId, context);

        // Log interaction
        await logAudit(
          userId,
          'ai_chat_modern',
          `Question: ${question.substring(0, 100)}...`,
          req
        );

        return res.json({
          response: result.response,
          intention: result.intention,
          model: result.model,
          timestamp: result.timestamp,
          conversation_turn: context.getHistory().length / 2
        });
      }
    } catch (modernErr) {
      console.warn('[AI] Modern approach failed, falling back to basic mode:', modernErr.message);
      
      // Fallback to simpler approach
      return fallbackChat(question, userId, apiKey, req, res, context);
    }

  } catch (err) {
    console.error('[AI Chat] Error:', err);
    res.status(500).json({
      error: 'Chat processing failed',
      detail: err.message
    });
  }
}

// ─── Fallback Chat (basic mode if modern fails) ───
async function fallbackChat(question, userId, apiKey, req, res, context) {
  try {
    const [summary, expiring] = await Promise.all([
      pool.query('SELECT * FROM summary_view').then(r => r[0] || {}).catch(() => ({})),
      pool.query('SELECT * FROM batches WHERE status = "active" AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY expiry_date ASC LIMIT 10').catch(() => []),
    ]);

    const systemPrompt = `You are a helpful pharmacy AI assistant for MediHub. 
Answer questions about inventory based on this data: ${JSON.stringify({ summary, expiring })}
Keep responses concise and data-driven.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: question }]
          }],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = require('../ai/medicalLLM').extractGeneratedText(data);

    if (context) {
      context.addMessage('user', question);
      context.addMessage('assistant', aiResponse);
    }

    await logAudit(userId, 'ai_chat_fallback', `Question: ${question.substring(0, 100)}...`, req);

    return res.json({
      response: aiResponse,
      model: 'gemini-2.0-flash',
      mode: 'fallback',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[Fallback Chat] Error:', err);
    throw err;
  }
}

// ─── Clear conversation history ───
async function clearConversation(req, res) {
  try {
    const userId = req.user.id;
    conversationContexts.delete(userId);
    res.json({ message: 'Conversation history cleared', userId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
}

// ─── Get conversation metadata ───
async function getConversationInfo(req, res) {
  try {
    const userId = req.user.id;
    const context = getUserContext(userId);
    
    res.json({
      user_id: userId,
      turn_count: Math.floor(context.getHistory().length / 2),
      last_updated: context.getHistory().length > 0 
        ? context.getHistory()[context.getHistory().length - 1].timestamp 
        : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get conversation info' });
  }
}

// ─── Keep existing functions for backward compatibility ───
async function getExpiryRisk(req, res) {
  const enhancedMode = req.query.enhanced !== 'false';
  return enhancedMode ? getExpiryRiskEnhanced(req, res) : getExpiryRisk(req, res);
}

async function getAnomalies(req, res) {
  const enhancedMode = req.query.enhanced !== 'false';
  return enhancedMode ? getAnomaliesEnhanced(req, res) : detectAnomalies(req.query.days || 30).then(r => res.json(r)).catch(err => res.status(500).json({ error: err.message }));
}

async function train(req, res) {
  try {
    const result = await trainAndPersist();
    await logAudit(req.user.id, 'trained_ai_model', `Training: ${JSON.stringify(result)}`, req);
    res.json(result);
  } catch (err) {
    console.error('Training failed:', err);
    res.status(500).json({ error: 'Training failed', detail: err.message });
  }
}

async function getReorderSuggestionsHandler(req, res) {
  try {
    const suggestions = await getReorderSuggestions();
    
    if (req.query.explain === 'true' && process.env.GOOGLE_AI_API_KEY) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      const explained = await Promise.all(
        (Array.isArray(suggestions) ? suggestions : []).slice(0, 3).map(async (suggestion) => {
          const explanation = await explainReorderRecommendation(
            { name: suggestion.medicine_name, current_quantity: suggestion.current_quantity, reorder_level: suggestion.reorder_level },
            suggestion,
            apiKey
          );
          return { ...suggestion, ai_explanation: explanation };
        })
      );
      return res.json({ suggestions, top_recommendations_explained: explained });
    }
    
    res.json(suggestions);
  } catch (err) {
    console.error('Reorder suggestions failed:', err);
    res.status(500).json({ error: 'Failed to get suggestions', detail: err.message });
  }
}

module.exports = {
  // Modern endpoints
  chatModern,
  getPharmacyHealthReport,
  clearConversation,
  getConversationInfo,
  getExpiryRiskEnhanced,
  getAnomaliesEnhanced,
  
  // Backward compatible endpoints
  getExpiryRisk,
  train,
  getReorderSuggestionsHandler,
  getAnomalies,
  
  // Legacy name for compatibility
  chat: chatModern
};
