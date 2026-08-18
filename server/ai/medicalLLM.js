/**
 * Modern Medical LLM System
 * Implements advanced prompting, function calling, and medical reasoning
 * Designed to act like modern LLMs (Gemini, GPT-4) with pharmacy expertise
 */

const { pool } = require('../config/db');
const { scoreActiveBatches } = require('./expiryRiskModel');
const { getReorderSuggestions } = require('./demandForecastModel');
const { detectAnomalies } = require('./anomalyDetection');

// ─── Model Configuration with Fallback Chain ───
const MODEL_FALLBACK_CHAIN = [
  'gemini-3.1-flash-lite',  // Lighter, fast model with less congestion
  'gemini-2.5-flash',       // Previous generation, stable and widely supported
  'gemini-2.0-flash',       // Another stable option
  'gemini-1.5-flash',       // Original fallback
  'gemini-1.5-pro',         // More capable option
  'gemini-pro'              // Final fallback
];

// ─── Medical Domain Expertise System (Optimized for Speed) ───
const MEDICAL_INSTRUCTIONS = `You are MediHub AI, a fast pharmacy inventory assistant.

ANSWER CONCISELY (1-2 sentences max unless details are requested):
- Give direct answer first
- Include key data point
- One actionable suggestion if needed

FORMAT: Use PLAIN TEXT ONLY. NO MARKDOWN. No asterisks, no bold, no special formatting.
NO ** symbols. NO # headers. Just plain clean text.

KEEP IT SHORT. NO LENGTHY EXPLANATIONS.

IMPORTANT: Always provide helpful, data-driven answers. Never give generic responses like "I can help with inventory" - instead provide actual data from the context. If data is unavailable, suggest what data would be needed to answer the question properly.`;

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

// ─── Conversation History & Context Management (Enhanced) ───
class ConversationContext {
  constructor(userId, maxTurns = 5) {
    this.userId = userId;
    this.maxTurns = maxTurns;
    this.history = [];
    this.metadata = {
      topics: [],
      preferredStyle: 'concise',
      lastQueryType: null,
      interactionCount: 0
    };
  }

  addMessage(role, content) {
    this.history.push({ role, content, timestamp: new Date() });
    this.metadata.interactionCount++;

    // Track topics from user messages
    if (role === 'user') {
      const topics = this.extractTopics(content);
      topics.forEach(topic => {
        if (!this.metadata.topics.includes(topic)) {
          this.metadata.topics.push(topic);
        }
      });
    }

    // Maintain conversation limit
    if (this.history.length > this.maxTurns * 2) {
      this.history.shift();
    }
  }

  extractTopics(text) {
    const keywords = {
      'inventory': ['inventory', 'stock', 'quantity', 'count'],
      'expiry': ['expir', 'shelf life', 'waste', 'expire'],
      'sales': ['sales', 'sold', 'revenue', 'transaction'],
      'orders': ['order', 'purchase', 'supplier', 'delivery'],
      'pricing': ['price', 'cost', 'profit', 'margin'],
      'analytics': ['trend', 'analytics', 'report', 'statistics'],
      'alerts': ['alert', 'warning', 'low stock', 'critical']
    };

    const topics = [];
    const lowerText = text.toLowerCase();

    for (const [topic, words] of Object.entries(keywords)) {
      if (words.some(word => lowerText.includes(word))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  getHistory() {
    return this.history.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  getContext() {
    if (this.history.length === 0) return '';

    const recent = this.history.slice(-4);
    const context = recent.map(m => `${m.role}: ${m.content}`).join('\n');

    if (this.metadata.topics.length > 0) {
      return `${context}\n\nTopics discussed: ${this.metadata.topics.join(', ')}`;
    }

    return context;
  }

  summarize() {
    if (this.history.length < 2) return '';

    const topicSummary = this.metadata.topics.length > 0
      ? `User has been asking about ${this.metadata.topics.join(', ')}`
      : 'User has been asking about pharmacy inventory';

    return `Previous conversation context: ${topicSummary}. This is conversation turn ${this.metadata.interactionCount}.`;
  }

  setPreferredStyle(style) {
    this.metadata.preferredStyle = style;
  }

  getPreferredStyle() {
    return this.metadata.preferredStyle;
  }

  clear() {
    this.history = [];
    this.metadata.topics = [];
    this.metadata.interactionCount = 0;
  }
}

// ─── Enhanced System Prompt Builder ───
function buildSystemPrompt(context = null, detectedIntention = null) {
  let prompt = MEDICAL_INSTRUCTIONS;
  
  prompt += `\n\nAVAILABLE FUNCTIONS:
${Object.entries(AVAILABLE_FUNCTIONS).map(([name, info]) => 
  `- ${name}: ${info.description}`
).join('\n')}`;

  if (detectedIntention) {
    const intentionHints = {
      expiry: 'Focus on expiry dates, shelf life, and waste prevention.',
      reorder: 'Focus on stock levels, reorder points, and ordering strategies.',
      anomaly: 'Focus on unusual patterns, discrepancies, and potential issues.',
      trend: 'Focus on patterns over time, consumption rates, and demand forecasting.',
      performance: 'Focus on supplier reliability, delivery times, and quality metrics.',
      analysis: 'Provide comprehensive analysis with insights and recommendations.',
      pricing: 'Focus on costs, margins, and profitability.',
      forecasting: 'Focus on predictions, future needs, and capacity planning.',
      general: 'Be conversational and helpful while being prepared to access pharmacy data if needed.'
    };

    prompt += `\n\nQUESTION TYPE: ${detectedIntention.toUpperCase()}
${intentionHints[detectedIntention] || intentionHints.general}`;
  }

  if (context) {
    prompt += `\n\nPREVIOUS CONVERSATION:
${context}`;
  }

  prompt += `\n\nRESPONSE FORMAT:
- Plain text only, NO markdown
- NO asterisks, NO bold, NO special formatting
- Be concise (1-2 sentences max)
- Include key data points
- One actionable suggestion if needed`;

  return prompt;
}

// ─── Intention Detection (enhanced with more patterns) ───
function detectIntention(question) {
  const keywords = {
    expiry: ['expir', 'shelf life', 'waste', 'discard', 'spoil', 'expired', 'expiry date'],
    reorder: ['order', 'reorder', 'stock', 'low', 'out of stock', 'purchase', 'restock'],
    anomaly: ['unusual', 'anomal', 'strange', 'discrepanc', 'missin', 'theft', 'suspicious', 'unexpected'],
    trend: ['trend', 'pattern', 'sales', 'consumption', 'velocity', 'demand', 'history', 'over time'],
    performance: ['supplier', 'delivery', 'quality', 'performan', 'reliability'],
    analysis: ['analyze', 'analyze', 'insight', 'recommend', 'advice', 'suggest', 'report', 'summary'],
    pricing: ['price', 'cost', 'profit', 'margin', 'revenue', 'pricing'],
    forecasting: ['forecast', 'predict', 'future', 'project', 'estimate', 'need'],
    general: ['hello', 'hi', 'help', 'what', 'how', 'who', 'can you']
  };

  const lowerQuestion = question.toLowerCase();

  for (const [intention, kws] of Object.entries(keywords)) {
    if (kws.some(kw => lowerQuestion.includes(kw))) {
      return intention;
    }
  }

  return 'general_inquiry';
}

// ─── Model Selection with Fallback (Optimized for Speed) ───
async function selectAvailableModel(apiKey) {
  // Use the working models we identified earlier
  return 'gemini-3.1-flash-lite';
}

// ─── Main Chat Function with Modern LLM Capabilities ───
function extractGeneratedText(responseData) {
  const candidate = responseData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .map((part) => part?.text)
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .trim();

  if (text) {
    return text;
  }

  if (responseData?.promptFeedback?.blockReason) {
    return 'The request was blocked by the safety filter, so I’m switching to a quick inventory summary instead.';
  }

  if (responseData?.candidates?.length) {
    return 'I can give you a quick inventory summary instead. Ask about stock levels, expiring items, or low-stock alerts.';
  }

  return 'I’m having trouble generating a full answer right now, so I’m giving you a quick inventory summary instead.';
}

async function buildFallbackInventoryResponse(question) {
  try {
    const data = await getInventorySummary();
    const summary = data?.summary || {};
    const totalMedicines = summary.total_medicines ?? summary.total_items ?? 0;
    const totalStock = summary.total_stock ?? 0;
    const totalValue = summary.total_value ?? 0;
    const expiringSoon = summary.expiring_soon ?? 0;
    const lowStock = summary.low_stock_count ?? summary.low_stock ?? 0;

    // Get more specific data based on question
    let specificData = '';
    let followUp = '';
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('expir') || lowerQuestion.includes('shelf')) {
      const expiryData = await getExpiryAnalysis(30);
      specificData = ` ${expiryData.total_at_risk} items are at risk of expiring within 30 days.`;
      followUp = ' Would you like me to show you which specific items are expiring?';
    } else if (lowerQuestion.includes('stock') || lowerQuestion.includes('inventory')) {
      const lowStockData = await getLowStockItems(5);
      specificData = ` ${lowStockData.count} items are below reorder level.`;
      followUp = ' I can help you identify which items need reordering.';
    } else if (lowerQuestion.includes('sales') || lowerQuestion.includes('trend')) {
      const salesData = await getSalesTrends(30);
      specificData = ` Average of ${salesData.avg_daily_transactions} transactions per day over the last 30 days.`;
      followUp = ' I can break this down by specific medicines or time periods.';
    } else if (lowerQuestion.includes('total') || lowerQuestion.includes('overview') || lowerQuestion.includes('summary')) {
      specificData = ` Total inventory value: $${totalValue?.toFixed(2) || '0.00'}.`;
      followUp = ' Would you like me to provide more details about any specific aspect?';
    }

    const response = `Current inventory: ${totalMedicines} medicines, ${totalStock} units in stock.${specificData} ${expiringSoon > 0 ? `${expiringSoon} items expiring soon. ` : ''}${lowStock > 0 ? `${lowStock} low-stock items. ` : ''}${followUp}`;

    return response;
  } catch (err) {
    console.error('Fallback inventory response error:', err);
    return 'I can help you with your pharmacy inventory management. I have access to your stock levels, expiry dates, sales trends, reorder suggestions, and can generate reports. You can ask me about inventory status, expiring items, low stock alerts, sales patterns, or I can help you analyze specific data. What would you like to know?';
  }
}

// ─── Smart Data Fetching Based on Question Context ───
async function fetchRelevantData(question) {
  const lowerQuestion = question.toLowerCase();
  const dataPromises = [];

  // Always fetch basic summary
  dataPromises.push(getInventorySummary());

  // Context-aware data fetching
  if (lowerQuestion.includes('expir') || lowerQuestion.includes('shelf')) {
    dataPromises.push(getExpiryAnalysis(30));
  }
  if (lowerQuestion.includes('stock') || lowerQuestion.includes('low') || lowerQuestion.includes('reorder')) {
    dataPromises.push(getLowStockItems(10));
  }
  if (lowerQuestion.includes('sales') || lowerQuestion.includes('trend') || lowerQuestion.includes('revenue')) {
    dataPromises.push(getSalesTrends(30));
  }
  if (lowerQuestion.includes('anomal') || lowerQuestion.includes('unusual') || lowerQuestion.includes('strange')) {
    dataPromises.push(getAnomalyAnalysis());
  }
  if (lowerQuestion.includes('order') || lowerQuestion.includes('suggest') || lowerQuestion.includes('forecast')) {
    dataPromises.push(getReorderRecommendations(true));
  }

  const results = await Promise.all(dataPromises);
  return {
    summary: results[0],
    expiry: results[1],
    lowStock: results[2],
    sales: results[3],
    anomalies: results[4],
    recommendations: results[5]
  };
}

// ─── Enhanced Response Builder with Context ───
function buildContextualResponse(question, data, intention) {
  const summary = data.summary?.summary || {};
  const totalMedicines = summary.total_medicines || summary.total_items || 0;
  const totalStock = summary.total_stock || 0;

  let response = '';

  switch (intention) {
    case 'expiry':
      const expiryCount = data.expiry?.total_at_risk || 0;
      response = `You have ${expiryCount} items at risk of expiring within 30 days out of ${totalMedicines} total medicines. `;
      if (expiryCount > 0) {
        response += `I recommend reviewing these items for potential discounts or expedited sales to minimize waste. Would you like me to show you the specific items?`;
      } else {
        response += `Your expiry management looks good - no immediate risks detected.`;
      }
      break;

    case 'reorder':
      const lowStockCount = data.lowStock?.count || 0;
      response = `${lowStockCount} items are currently below reorder level out of ${totalMedicines} medicines with ${totalStock} total units. `;
      if (lowStockCount > 0) {
        response += `I can help you prioritize which items to order first based on sales velocity. Would you like to see the reorder recommendations?`;
      } else {
        response += `Your stock levels are healthy across all items.`;
      }
      break;

    case 'trend':
      const avgTransactions = data.sales?.avg_daily_transactions || 0;
      response = `Over the past 30 days, you've averaged ${avgTransactions} transactions per day. `;
      response += `This gives us a good baseline for demand forecasting. Would you like me to break this down by specific medicine categories or time periods?`;
      break;

    case 'anomaly':
      const anomalyCount = data.anomalies?.total_anomalies || 0;
      response = `I've detected ${anomalyCount} unusual patterns in your inventory data over the past 30 days. `;
      if (anomalyCount > 0) {
        response += `These might indicate data entry issues, theft, or other operational concerns. Would you like me to review the specific anomalies?`;
      } else {
        response += `Your inventory data appears consistent with no significant anomalies detected.`;
      }
      break;

    default:
      response = `Based on your current inventory, you have ${totalMedicines} medicines with ${totalStock} total units in stock. `;
      response += `I can help you analyze expiry risks, stock levels, sales trends, or provide reorder recommendations. What would you like to focus on?`;
  }

  return response;
}

async function modernChat(question, userId, context = null) {
  try {
    const intention = detectIntention(question);

    let contextStr = '';
    if (context && context.getHistory().length > 0) {
      contextStr = context.getContext();
    }

    // Add user message to context before building prompt
    if (context) {
      context.addMessage('user', question);
    }

    const baseSystemPrompt = buildSystemPrompt(contextStr, intention);
    const messages = [];

    if (context && context.getHistory().length > 0) {
      const history = context.getHistory();
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // If it's the first message or no history, add the question
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: question });
    }

    console.log(`[AI] Processing question with intention: ${intention}`);
    console.log(`[AI] Conversation history length: ${messages.length}`);

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('AI service not configured');
    }

    const selectedModels = [
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    let lastError = null;

    for (const modelName of [...new Set(selectedModels)]) {
      try {
        const recoveryPrompt = `${baseSystemPrompt}\n\nIMPORTANT: If the request is ambiguous or the model output would be empty, answer using the pharmacy inventory snapshot instead of refusing. Focus on concise data-driven help.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: recoveryPrompt }],
                role: 'system'
              },
              contents: messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
              })),
              generationConfig: {
                maxOutputTokens: 400,
                temperature: 0.5,
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
          lastError = new Error(`API error (${response.status}): ${errorText}`);
          continue;
        }

        const data = await response.json();
        const aiResponse = extractGeneratedText(data);
        const isRecoveryText = /quick inventory summary|switching to a quick inventory summary|safer alternative|having trouble generating a full answer|blocked by the safety filter/i.test(aiResponse);
        const finalResponse = isRecoveryText ? await buildFallbackInventoryResponse(question) : aiResponse;

        if (context) {
          context.addMessage('assistant', finalResponse);
        }

        return {
          response: finalResponse,
          intention,
          model: modelName,
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        console.warn(`[AI] Model ${modelName} failed:`, err.message);
        lastError = err;
      }
    }

    const recoveryResponse = await buildFallbackInventoryResponse(question);

    if (context) {
      context.addMessage('assistant', recoveryResponse);
    }

    return {
      response: recoveryResponse,
      intention,
      model: selectedModels[0],
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
  buildSystemPrompt,
  selectAvailableModel,
  MODEL_FALLBACK_CHAIN,
  extractGeneratedText,
  buildFallbackInventoryResponse
};
