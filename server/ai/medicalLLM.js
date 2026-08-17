/**
 * Modern Medical LLM System
 * Implements advanced prompting, function calling, and medical reasoning
 * Designed to act like modern LLMs (Gemini, GPT-4) with pharmacy expertise
 */

const { pool } = require('../config/db');
const { scoreActiveBatches } = require('./expiryRiskModel');
const { getReorderSuggestions } = require('./demandForecastModel');
const { detectAnomalies } = require('./anomalyDetection');

// ─── Medical Domain Expertise System ───
const MEDICAL_INSTRUCTIONS = `You are MediHub, an advanced medical inventory AI assistant.
You combine database analytics with pharmaceutical knowledge to provide evidence-based insights.

CORE PRINCIPLES:
1. **Medical Accuracy**: Prioritize patient safety and regulatory compliance
2. **Data-Driven**: Back every claim with actual data from the pharmacy system
3. **Clear Communication**: Explain complex pharmacy concepts simply
4. **Actionable**: Provide specific, implementable recommendations
5. **Transparency**: Acknowledge data limitations and assumptions

PHARMACEUTICAL EXPERTISE AREAS:
- Inventory optimization for patient access and cost efficiency
- Expiry management and waste reduction
- Demand forecasting and seasonal patterns
- Anomaly detection (potential theft, usage patterns, documentation errors)
- Supplier performance and reorder strategies
- Batch tracking and quality assurance
- Regulatory compliance documentation

RESPONSE FRAMEWORK:
When answering questions, use this structure:
1. **Direct Answer**: Address the question concisely
2. **Data Evidence**: Show relevant data from the system
3. **Pharmaceutical Context**: Explain why this matters for patient care or operations
4. **Actionable Recommendation**: What to do about it
5. **Caveats**: Acknowledge data limitations or edge cases

TONE: Professional but conversational. Avoid jargon when possible, explain when necessary.`;

// ─── Function Calling System ───
// These are the "tools" the AI can invoke to query data
const AVAILABLE_FUNCTIONS = {
  get_inventory_summary: {
    description: 'Get overall inventory metrics (total value, item count, categories)',
    params: []
  },
  get_expiry_analysis: {
    description: 'Get detailed expiry risk analysis and items expiring soon',
    params: [{ name: 'days_window', type: 'number', description: 'Days until expiry to check (default: 30)' }]
  },
  get_low_stock_items: {
    description: 'Get items below reorder level with reorder recommendations',
    params: [{ name: 'limit', type: 'number', description: 'Max items to return (default: 10)' }]
  },
  get_sales_trends: {
    description: 'Get sales data and trends for last 30-90 days',
    params: [{ name: 'days', type: 'number', description: 'Historical days to analyze (default: 30)' }]
  },
  get_anomaly_analysis: {
    description: 'Detect unusual transactions that may indicate issues',
    params: [{ name: 'severity', type: 'string', description: 'Filter by severity: critical, warning, info' }]
  },
  get_reorder_recommendations: {
    description: 'Get AI-recommended orders based on demand forecasting',
    params: [{ name: 'include_rationale', type: 'boolean', description: 'Include explanation for each recommendation' }]
  },
  get_supplier_performance: {
    description: 'Analyze supplier reliability and quality metrics',
    params: [{ name: 'supplier_id', type: 'number', description: 'Optional: analyze specific supplier' }]
  },
  get_batch_details: {
    description: 'Get detailed information about specific batches',
    params: [{ name: 'medicine_id', type: 'number', description: 'Medicine to analyze' }]
  }
};

// ─── Function Implementations ───
async function callFunction(name, params = {}) {
  try {
    switch (name) {
      case 'get_inventory_summary':
        return await getInventorySummary();
      case 'get_expiry_analysis':
        return await getExpiryAnalysis(params.days_window || 30);
      case 'get_low_stock_items':
        return await getLowStockItems(params.limit || 10);
      case 'get_sales_trends':
        return await getSalesTrends(params.days || 30);
      case 'get_anomaly_analysis':
        return await getAnomalyAnalysis(params.severity);
      case 'get_reorder_recommendations':
        return await getReorderRecommendations(params.include_rationale !== false);
      case 'get_supplier_performance':
        return await getSupplierPerformance(params.supplier_id);
      case 'get_batch_details':
        return await getBatchDetails(params.medicine_id);
      default:
        return { error: `Function ${name} not found` };
    }
  } catch (err) {
    console.error(`Function call error (${name}):`, err.message);
    return { error: err.message, function: name };
  }
}

async function getInventorySummary() {
  const [summary] = await pool.query('SELECT * FROM summary_view');
  const [categoryData] = await pool.query(
    'SELECT category, COUNT(*) as count, SUM(quantity) as total_quantity FROM medicines JOIN batches ON medicines.id = batches.medicine_id WHERE batches.status = "active" GROUP BY category'
  );
  return {
    summary: summary[0] || {},
    by_category: categoryData || [],
    timestamp: new Date().toISOString()
  };
}

async function getExpiryAnalysis(daysWindow) {
  const [expiringBatches] = await pool.query(
    `SELECT m.name, m.id, b.batch_number, b.quantity, b.expiry_date, 
            DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
            COALESCE(SUM(st.quantity * CASE WHEN st.transaction_type = 'sale' THEN -1 ELSE 1 END), 0) as consumption_rate
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN stock_transactions st ON st.batch_id = b.id AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     WHERE b.status = 'active' AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     GROUP BY b.id
     ORDER BY b.expiry_date ASC`,
    [daysWindow]
  );
  
  const expiryRisk = await scoreActiveBatches();
  
  return {
    expiring_soon: expiringBatches || [],
    risk_analysis: expiryRisk,
    window_days: daysWindow,
    total_at_risk: expiringBatches?.length || 0
  };
}

async function getLowStockItems(limit) {
  const [lowStock] = await pool.query(
    `SELECT m.id, m.name, m.category, b.quantity, m.reorder_level, m.min_stock,
            (m.reorder_level - b.quantity) as quantity_needed,
            COALESCE(AVG(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE 0 END), 0) as daily_avg_sales
     FROM medicines m
     LEFT JOIN batches b ON m.id = b.medicine_id AND b.status = 'active'
     LEFT JOIN stock_transactions st ON b.id = st.batch_id AND st.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY m.id
     HAVING b.quantity < m.reorder_level OR b.quantity IS NULL
     ORDER BY (m.reorder_level - COALESCE(b.quantity, 0)) DESC
     LIMIT ?`,
    [limit]
  );
  
  return {
    low_stock_items: lowStock || [],
    count: lowStock?.length || 0
  };
}

async function getSalesTrends(days) {
  const [trends] = await pool.query(
    `SELECT DATE(st.created_at) as date, 
            COUNT(DISTINCT st.id) as transaction_count,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE st.quantity END) as net_movement,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE 0 END) as total_sold,
            COUNT(DISTINCT st.medicine_id) as unique_medicines
     FROM stock_transactions st
     WHERE st.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(st.created_at)
     ORDER BY date DESC`,
    [days]
  );
  
  return {
    daily_trends: trends || [],
    days_analyzed: days,
    avg_daily_transactions: trends ? Math.round(trends.reduce((a, t) => a + t.transaction_count, 0) / days) : 0
  };
}

async function getAnomalyAnalysis(severity = null) {
  const result = await detectAnomalies(30);
  let anomalies = result.anomalies || [];
  
  if (severity) {
    anomalies = anomalies.filter(a => a.severity === severity);
  }
  
  return {
    total_anomalies: anomalies.length,
    by_severity: {
      critical: anomalies.filter(a => a.severity === 'critical').length,
      warning: anomalies.filter(a => a.severity === 'warning').length,
      info: anomalies.filter(a => a.severity === 'info').length
    },
    anomalies: anomalies.slice(0, 20),
    analysis_window_days: 30
  };
}

async function getReorderRecommendations(includeRationale) {
  const suggestions = await getReorderSuggestions();
  
  if (includeRationale && Array.isArray(suggestions)) {
    return {
      recommendations: suggestions.map(s => ({
        ...s,
        rationale: `Based on ${s.daily_velocity?.toFixed(1) || 0} units/day consumption, recommend ordering ${s.suggested_quantity || 0} units to maintain ${Math.ceil((s.suggested_quantity || 0) / (s.daily_velocity || 1)) || 0} days of stock.`
      })),
      count: suggestions.length
    };
  }
  
  return { recommendations: suggestions || [], count: Array.isArray(suggestions) ? suggestions.length : 0 };
}

async function getSupplierPerformance(supplierId = null) {
  let query = `
    SELECT s.id, s.name,
           COUNT(DISTINCT po.id) as total_orders,
           AVG(DATEDIFF(po.delivery_date, po.order_date)) as avg_delivery_days,
           SUM(po.total_amount) as total_spent,
           COUNT(DISTINCT CASE WHEN po.status = 'delivered' THEN po.id END) as completed_orders
    FROM suppliers s
    LEFT JOIN purchase_orders po ON s.id = po.supplier_id
  `;
  
  if (supplierId) {
    query += ` WHERE s.id = ${supplierId}`;
  }
  
  query += ` GROUP BY s.id`;
  
  const [suppliers] = await pool.query(query);
  return { suppliers: suppliers || [] };
}

async function getBatchDetails(medicineId) {
  const [batches] = await pool.query(
    `SELECT b.id, b.batch_number, b.quantity, b.expiry_date, b.date_received, b.status,
            DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry,
            m.name as medicine_name,
            COUNT(st.id) as transaction_count,
            SUM(CASE WHEN st.transaction_type = 'sale' THEN -st.quantity ELSE st.quantity END) as net_movement
     FROM batches b
     JOIN medicines m ON b.medicine_id = m.id
     LEFT JOIN stock_transactions st ON b.id = st.batch_id
     WHERE m.id = ?
     GROUP BY b.id
     ORDER BY b.expiry_date ASC`,
    [medicineId]
  );
  
  return { batches: batches || [], medicine_id: medicineId };
}

// ─── Conversation History & Context Management ───
class ConversationContext {
  constructor(userId, maxTurns = 5) {
    this.userId = userId;
    this.maxTurns = maxTurns;
    this.history = [];
    this.metadata = {};
  }

  addMessage(role, content) {
    this.history.push({ role, content, timestamp: new Date() });
    if (this.history.length > this.maxTurns * 2) {
      this.history.shift();
    }
  }

  getHistory() {
    return this.history.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  getContext() {
    return this.history.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
  }

  summarize() {
    if (this.history.length < 2) return '';
    return `Previous conversation context: User has been asking about ${this.metadata.topics?.join(', ') || 'pharmacy inventory'}`;
  }
}

// ─── Enhanced System Prompt Builder ───
function buildSystemPrompt(context = null, detectedIntention = null) {
  let prompt = MEDICAL_INSTRUCTIONS;
  
  prompt += `\n\n## FUNCTION CALLING SYSTEM
You can invoke these functions to query pharmacy data:
${Object.entries(AVAILABLE_FUNCTIONS).map(([name, info]) => 
  `- ${name}: ${info.description}`
).join('\n')}

When you need data to answer a question, mention which function(s) you'd like to call.
Format: [FUNCTION_CALL: function_name(param1=value, param2=value)]`;

  if (detectedIntention) {
    prompt += `\n\n## DETECTED QUESTION TYPE
The user is asking about: ${detectedIntention}
Focus your response on this domain.`;
  }

  if (context) {
    prompt += `\n\n## CONVERSATION CONTEXT
${context}`;
  }

  prompt += `\n\n## RESPONSE EXPECTATIONS
- Be concise but thorough (2-3 paragraphs max unless asked for details)
- Use markdown for formatting when helpful
- Include data points to support claims
- Suggest follow-up actions
- If data is incomplete, explain what's missing`;

  return prompt;
}

// ─── Intention Detection (understand what user is really asking) ───
function detectIntention(question) {
  const keywords = {
    expiry: ['expir', 'shelf life', 'waste', 'discard', 'spoil'],
    reorder: ['order', 'reorder', 'stock', 'low', 'out of stock', 'purchase'],
    anomaly: ['unusual', 'anomal', 'strange', 'discrepanc', 'missin', 'theft', 'suspicious'],
    trend: ['trend', 'pattern', 'sales', 'consumption', 'velocity', 'demand'],
    performance: ['supplier', 'delivery', 'quality', 'performan'],
    analysis: ['analyze', 'analyze', 'insight', 'recommend', 'advice', 'suggest'],
  };

  for (const [intention, kws] of Object.entries(keywords)) {
    if (kws.some(kw => question.toLowerCase().includes(kw))) {
      return intention;
    }
  }

  return 'general_inquiry';
}

// ─── Main Chat Function with Modern LLM Capabilities ───
async function modernChat(question, userId, context = null) {
  try {
    // Detect user's intention
    const intention = detectIntention(question);
    
    // Build conversation context if provided
    let contextStr = '';
    if (context && context.getHistory().length > 0) {
      contextStr = context.getContext();
    }

    // Build system prompt with modern prompting techniques
    const systemPrompt = buildSystemPrompt(contextStr, intention);

    // Prepare the messages array (like modern LLMs)
    const messages = [];
    
    if (context && context.getHistory().length > 0) {
      // Add conversation history for context
      const history = context.getHistory();
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Add current user question
    messages.push({
      role: 'user',
      content: question
    });

    console.log(`[AI] Processing question with intention: ${intention}`);
    console.log(`[AI] Conversation history length: ${messages.length}`);

    // Call Google AI with modern parameters
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('AI service not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
            role: 'system'
          },
          contents: messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    // Update context if provided
    if (context) {
      context.addMessage('user', question);
      context.addMessage('assistant', aiResponse);
    }

    return {
      response: aiResponse,
      intention,
      model: 'gemini-2.0-flash',
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error('[AI] Error in modernChat:', err.message);
    throw err;
  }
}

module.exports = {
  modernChat,
  ConversationContext,
  callFunction,
  AVAILABLE_FUNCTIONS,
  detectIntention,
  buildSystemPrompt
};
