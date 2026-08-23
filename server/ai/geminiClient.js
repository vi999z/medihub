/**
 * Gemini Client
 * Function calling definitions, tool schema builder, system prompt builder,
 * intention detection, and model selection.
 */

const { MEDICAL_INSTRUCTIONS } = require('./llmConfig');
const { GoogleGenAI } = require('@google/genai');
const {
  getInventorySummary,
  getExpiryAnalysis,
  getLowStockItems,
  getSalesTrends,
  getAnomalyAnalysis,
  getReorderRecommendations,
  getSupplierPerformance,
  getBatchDetails,
  getWeatherInventoryRecommendations,
} = require('./inventoryQueries');
const { generateReport, createStrategy, forecastDemand, analyzeEfficiency } = require('./analysisHelpers');

// ─── Available Function Definitions (tools the AI can invoke) ───
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
  },
  generate_report: {
    description: 'Generate comprehensive reports with analysis and recommendations',
    params: [{ name: 'report_type', type: 'string', description: 'Type of report: inventory, expiry, sales, performance, comprehensive' }]
  },
  create_strategy: {
    description: 'Create strategic plans for inventory optimization, cost reduction, or operational improvement',
    params: [{ name: 'strategy_type', type: 'string', description: 'Type of strategy: cost_optimization, waste_reduction, stock_efficiency, supplier_diversification' }]
  },
  forecast_demand: {
    description: 'Generate demand forecasts and predict future stock needs',
    params: [{ name: 'forecast_period', type: 'number', description: 'Days to forecast (default: 90)' }]
  },
  analyze_efficiency: {
    description: 'Analyze operational efficiency and identify improvement opportunities',
    params: [{ name: 'focus_area', type: 'string', description: 'Area to analyze: overall, purchasing, storage, dispensing' }]
  },
  get_weather_inventory_recommendations: {
    description: 'Get weather-aware inventory restocking recommendations based on real-time weather, forecasts, and Philippine seasonal demand patterns. Uses Open-Meteo (free, no API key). Identifies medicines likely to spike in demand (e.g. Biogesic, Neozep during rainy season) and flags potential shortages before they occur.',
    params: [{ name: 'city', type: 'string', description: 'City to get weather for (default: Lucena City,PH). Examples: Cebu,PH  Davao,PH  Quezon City,PH  Baguio,PH' }]
  }
};

// ─── Function Call Dispatcher ───
async function callFunction(name, params = {}) {
  try {
    switch (name) {
      case 'get_inventory_summary':      return await getInventorySummary();
      case 'get_expiry_analysis':        return await getExpiryAnalysis(params.days_window || 30);
      case 'get_low_stock_items':        return await getLowStockItems(params.limit || 10);
      case 'get_sales_trends':           return await getSalesTrends(params.days || 30);
      case 'get_anomaly_analysis':       return await getAnomalyAnalysis(params.severity);
      case 'get_reorder_recommendations':return await getReorderRecommendations(params.include_rationale !== false);
      case 'get_supplier_performance':   return await getSupplierPerformance(params.supplier_id);
      case 'get_batch_details':          return await getBatchDetails(params.medicine_id);
      case 'generate_report':            return await generateReport(params.report_type || 'comprehensive');
      case 'create_strategy':            return await createStrategy(params.strategy_type || 'cost_optimization');
      case 'forecast_demand':            return await forecastDemand(params.forecast_period || 90);
      case 'analyze_efficiency':               return await analyzeEfficiency(params.focus_area || 'overall');
      case 'get_weather_inventory_recommendations': return await getWeatherInventoryRecommendations(params.city || 'Lucena City,PH');
      default:                                 return { error: `Function ${name} not found` };
    }
  } catch (err) {
    console.error(`Function call error (${name}):`, err.message);
    return { error: err.message, function: name };
  }
}

// ─── System Prompt Builder ───
function buildSystemPrompt(context = null, detectedIntention = null) {
  let prompt = MEDICAL_INSTRUCTIONS;

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
      weather: 'Focus on weather-driven demand patterns. Use get_weather_inventory_recommendations to pull real-time weather data and seasonal analysis. Highlight medicines likely to see demand spikes (cold/flu, cough remedies, antihistamines, vitamins) and recommend proactive restocking before shortages occur.',
      general: 'Be conversational and helpful while being prepared to access pharmacy data if needed.'
    };

    prompt += `\n\nQUESTION TYPE: ${detectedIntention.toUpperCase()}
${intentionHints[detectedIntention] || intentionHints.general}`;
  }

  if (context) {
    prompt += `\n\nPREVIOUS CONVERSATION:\n${context}`;
  }

  return prompt;
}

// ─── Gemini Tools Schema Builder ───
function buildGeminiTools() {
  const functionDeclarations = Object.entries(AVAILABLE_FUNCTIONS).map(([name, info]) => {
    const declaration = {
      name,
      description: info.description,
    };

    if (info.params && info.params.length > 0) {
      const properties = {};
      info.params.forEach(p => {
        properties[p.name] = {
          type: p.type === 'number' ? 'NUMBER' : p.type === 'boolean' ? 'BOOLEAN' : 'STRING',
          description: p.description
        };
      });
      declaration.parameters = { type: 'OBJECT', properties, required: [] };
    } else {
      declaration.parameters = { type: 'OBJECT', properties: {} };
    }

    return declaration;
  });

  return [{ functionDeclarations }];
}

async function explainTensorFlowRisk(results, apiKey) {
  if (!apiKey || !Array.isArray(results) || results.length === 0) return null;

  const ai = new GoogleGenAI({ apiKey });
  const evidence = results.slice(0, 5).map((item) => ({
    medicine: item.medicine_name,
    batch: item.batch_number,
    risk_score: item.risk_score,
    method: item.method,
    days_left: item.days_left,
    quantity_remaining: item.quantity_remaining,
    daily_velocity: item.daily_velocity,
    severity: item.insight_severity,
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [{
        role: 'user',
        parts: [{ text: `Explain these TensorFlow expiry-risk results for pharmacy staff. Use only the supplied values. Give 3 concise actions, no markdown, and mention that the risk score is a prioritization signal, not a diagnosis.\n\n${JSON.stringify(evidence)}` }]
      }],
      config: {
        systemInstruction: MEDICAL_INSTRUCTIONS,
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    return response.text || null;
  } catch (err) {
    console.warn('Gemini risk explanation unavailable:', err.message);
    return null;
  }
}

// ─── Intention Detection ───
function detectIntention(question) {
  const keywords = {
    expiry: ['expir', 'shelf life', 'waste', 'discard', 'spoil', 'expired', 'expiry date'],
    reorder: ['order', 'reorder', 'stock', 'low', 'out of stock', 'purchase', 'restock'],
    anomaly: ['unusual', 'anomal', 'strange', 'discrepanc', 'missin', 'theft', 'suspicious', 'unexpected'],
    trend: ['trend', 'pattern', 'sales', 'consumption', 'velocity', 'demand', 'history', 'over time'],
    performance: ['supplier', 'delivery', 'quality', 'performan', 'reliability'],
    analysis: ['analyze', 'analyse', 'insight', 'recommend', 'advice', 'suggest', 'report', 'summary'],
    pricing: ['price', 'cost', 'profit', 'margin', 'revenue', 'pricing'],
    forecasting: ['forecast', 'predict', 'future', 'project', 'estimate', 'need'],
    weather: ['weather', 'rain', 'rainy', 'season', 'seasonal', 'typhoon', 'monsoon', 'forecast', 'climate', 'flu season', 'cold season', 'demand spike', 'biogesic', 'neozep', 'bioflu'],
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

// ─── Model Selection ───
async function selectAvailableModel(apiKey) {
  return 'gemini-3.7-flash'; // primary; modernChat.js falls back through chain on failure
}

module.exports = {
  AVAILABLE_FUNCTIONS,
  callFunction,
  buildSystemPrompt,
  buildGeminiTools,
  explainTensorFlowRisk,
  detectIntention,
  selectAvailableModel
};
