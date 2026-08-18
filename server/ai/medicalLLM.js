/**
 * Modern Medical LLM System
 * Implements advanced prompting, function calling, and medical reasoning
 * Designed to act like modern LLMs (Gemini, GPT-4) with pharmacy expertise
 */

const { pool } = require('../config/db');
const { scoreActiveBatches } = require('./expiryRiskModel');
const { getReorderSuggestions } = require('./demandForecastModel');
const { detectAnomalies } = require('./anomalyDetection');

// ─── Model Configuration with Fallback Chain (Generative AI Optimized) ───
const MODEL_FALLBACK_CHAIN = [
  'gemini-3.1-flash-lite',  // Fast, capable for most generative tasks
  'gemini-2.5-flash',       // Good balance of speed and capability
  'gemini-2.0-flash',       // Stable for complex reasoning
  'gemini-1.5-pro',         // More capable for creative tasks
  'gemini-pro'              // Fallback with broad capabilities
];

// ─── Medical Domain Expertise System (Generative AI) ───
const MEDICAL_INSTRUCTIONS = `You are MediHub AI, an advanced generative AI assistant specialized in pharmacy management and healthcare operations.

ANSWER CONCISELY (1-2 sentences max unless details are requested):
- Give direct answer first
- Include key data point
- One actionable suggestion if needed

FORMAT: Use PLAIN TEXT ONLY. NO MARKDOWN. No asterisks, no bold, no special formatting.
NO ** symbols. NO # headers. Just plain clean text.

KEEP IT SHORT. NO LENGTHY EXPLANATIONS.

IMPORTANT: Always provide helpful, data-driven answers. Never give generic responses like "I can help with inventory" - instead provide actual data from the context. If data is unavailable, suggest what data would be needed to answer the question properly.`;

// ─── Function Calling System (Enhanced for Generative AI) ───
// These are the "tools" the AI can invoke to query data and perform actions
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
      case 'generate_report':
        return await generateReport(params.report_type || 'comprehensive');
      case 'create_strategy':
        return await createStrategy(params.strategy_type || 'cost_optimization');
      case 'forecast_demand':
        return await forecastDemand(params.forecast_period || 90);
      case 'analyze_efficiency':
        return await analyzeEfficiency(params.focus_area || 'overall');
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

// ─── Generative AI Functions ───

async function generateReport(reportType) {
  try {
    const [summary, expiry, lowStock, sales, anomalies] = await Promise.all([
      getInventorySummary(),
      getExpiryAnalysis(30),
      getLowStockItems(10),
      getSalesTrends(30),
      getAnomalyAnalysis()
    ]);

    let report = {
      type: reportType,
      generated_at: new Date().toISOString(),
      summary: summary.summary || {},
      data: {
        expiry: expiry,
        lowStock: lowStock,
        sales: sales,
        anomalies: anomalies
      }
    };

    // Generate analysis based on report type
    switch (reportType) {
      case 'inventory':
        report.analysis = generateInventoryAnalysis(summary, lowStock);
        break;
      case 'expiry':
        report.analysis = generateExpiryAnalysis(expiry, summary);
        break;
      case 'sales':
        report.analysis = generateSalesAnalysis(sales, summary);
        break;
      case 'comprehensive':
        report.analysis = generateComprehensiveAnalysis(summary, expiry, lowStock, sales, anomalies);
        break;
      default:
        report.analysis = generateComprehensiveAnalysis(summary, expiry, lowStock, sales, anomalies);
    }

    return report;
  } catch (err) {
    console.error('Report generation error:', err);
    return { error: err.message };
  }
}

function generateInventoryAnalysis(summary, lowStock) {
  const totalMedicines = summary.summary?.total_medicines || 0;
  const totalStock = summary.summary?.total_stock || 0;
  const lowStockCount = lowStock?.count || 0;

  return {
    total_items: totalMedicines,
    total_units: totalStock,
    health_score: calculateInventoryHealth(totalMedicines, totalStock, lowStockCount),
    recommendations: generateInventoryRecommendations(lowStock),
    risk_level: lowStockCount > 5 ? 'HIGH' : lowStockCount > 2 ? 'MEDIUM' : 'LOW'
  };
}

function generateExpiryAnalysis(expiry, summary) {
  const atRisk = expiry?.total_at_risk || 0;
  const totalMedicines = summary.summary?.total_medicines || 0;

  return {
    items_at_risk: atRisk,
    risk_percentage: totalMedicines > 0 ? (atRisk / totalMedicines * 100).toFixed(1) : 0,
    urgency_level: atRisk > 10 ? 'CRITICAL' : atRisk > 5 ? 'HIGH' : atRisk > 2 ? 'MEDIUM' : 'LOW',
    recommendations: generateExpiryRecommendations(atRisk),
    potential_loss: estimatePotentialLoss(expiry)
  };
}

function generateSalesAnalysis(sales, summary) {
  const avgTransactions = sales?.avg_daily_transactions || 0;
  const totalStock = summary.summary?.total_stock || 0;

  return {
    daily_avg: avgTransactions,
    velocity_score: calculateVelocityScore(avgTransactions, totalStock),
    trend_analysis: analyzeSalesTrend(sales?.daily_trends || []),
    recommendations: generateSalesRecommendations(avgTransactions)
  };
}

function generateComprehensiveAnalysis(summary, expiry, lowStock, sales, anomalies) {
  return {
    overall_health: calculateOverallHealth(summary, expiry, lowStock, sales, anomalies),
    key_insights: generateKeyInsights(summary, expiry, lowStock, sales, anomalies),
    prioritized_actions: generatePrioritizedActions(summary, expiry, lowStock, sales, anomalies),
    opportunities: identifyOpportunities(summary, expiry, lowStock, sales, anomalies)
  };
}

async function createStrategy(strategyType) {
  const [summary, sales, expiry] = await Promise.all([
    getInventorySummary(),
    getSalesTrends(90),
    getExpiryAnalysis(60)
  ]);

  let strategy = {
    type: strategyType,
    created_at: new Date().toISOString(),
    current_state: summary.summary || {},
    plan: []
  };

  switch (strategyType) {
    case 'cost_optimization':
      strategy.plan = generateCostOptimizationStrategy(summary, sales);
      break;
    case 'waste_reduction':
      strategy.plan = generateWasteReductionStrategy(expiry, summary);
      break;
    case 'stock_efficiency':
      strategy.plan = generateStockEfficiencyStrategy(summary, sales);
      break;
    default:
      strategy.plan = generateCostOptimizationStrategy(summary, sales);
  }

  return strategy;
}

async function forecastDemand(forecastPeriod) {
  const [sales, lowStock] = await Promise.all([
    getSalesTrends(30),
    getLowStockItems(20)
  ]);

  const avgDailySales = sales?.avg_daily_transactions || 0;
  const trends = sales?.daily_trends || [];

  return {
    forecast_period: forecastPeriod,
    current_baseline: avgDailySales,
    predicted_growth: calculatePredictedGrowth(trends),
    stock_recommendations: generateStockRecommendations(lowStock, avgDailySales, forecastPeriod),
    confidence_level: calculateConfidenceLevel(trends.length)
  };
}

async function analyzeEfficiency(focusArea) {
  const [summary, anomalies, sales] = await Promise.all([
    getInventorySummary(),
    getAnomalyAnalysis(),
    getSalesTrends(30)
  ]);

  return {
    focus_area: focusArea,
    overall_score: calculateEfficiencyScore(summary, anomalies, sales),
    bottlenecks: identifyBottlenecks(summary, anomalies, sales),
    improvement_opportunities: generateImprovementOpportunities(summary, anomalies, sales),
    quick_wins: identifyQuickWins(summary, anomalies, sales)
  };
}

// ─── Helper Functions for Generative AI ───

function calculateInventoryHealth(totalMedicines, totalStock, lowStockCount) {
  if (totalMedicines === 0) return 0;
  const healthScore = ((totalMedicines - lowStockCount) / totalMedicines) * 100;
  return Math.round(healthScore);
}

function generateInventoryRecommendations(lowStock) {
  const recommendations = [];
  const count = lowStock?.count || 0;

  if (count > 5) {
    recommendations.push('Immediate action required: Review and expedite reorders for critical items');
    recommendations.push('Consider implementing automated reorder triggers');
  } else if (count > 2) {
    recommendations.push('Schedule review of low-stock items within 48 hours');
    recommendations.push('Prioritize high-demand items for immediate replenishment');
  } else {
    recommendations.push('Continue monitoring stock levels');
    recommendations.push('Review reorder point settings for optimal efficiency');
  }

  return recommendations;
}

function generateExpiryRecommendations(atRisk) {
  const recommendations = [];

  if (atRisk > 10) {
    recommendations.push('URGENT: Implement discount strategy for items expiring within 30 days');
    recommendations.push('Consider expediting sales through promotional campaigns');
    recommendations.push('Review ordering patterns to prevent future overstocking');
  } else if (atRisk > 5) {
    recommendations.push('Review expiring items for potential returns or transfers');
    recommendations.push('Implement first-expiry-first-out dispensing protocol');
  } else {
    recommendations.push('Continue monitoring expiry dates');
    recommendations.push('Review procurement quantities to match demand');
  }

  return recommendations;
}

function estimatePotentialLoss(expiry) {
  const expiringBatches = expiry?.expiring_soon || [];
  let estimatedLoss = 0;

  expiringBatches.forEach(batch => {
    const daysToExpiry = batch.days_until_expiry || 0;
    const quantity = batch.quantity || 0;
    if (daysToExpiry <= 30) {
      estimatedLoss += quantity * 0.8; // 80% potential loss
    } else if (daysToExpiry <= 60) {
      estimatedLoss += quantity * 0.5; // 50% potential loss
    }
  });

  return Math.round(estimatedLoss);
}

function calculateVelocityScore(avgTransactions, totalStock) {
  if (totalStock === 0) return 0;
  const velocity = (avgTransactions / totalStock) * 100;
  return Math.min(Math.round(velocity), 100);
}

function analyzeSalesTrend(trends) {
  if (trends.length < 7) return 'insufficient_data';

  const recentWeek = trends.slice(0, 7).reduce((sum, t) => sum + (t.transaction_count || 0), 0);
  const previousWeek = trends.slice(7, 14).reduce((sum, t) => sum + (t.transaction_count || 0), 0);

  if (recentWeek > previousWeek * 1.1) return 'increasing';
  if (recentWeek < previousWeek * 0.9) return 'decreasing';
  return 'stable';
}

function generateSalesRecommendations(avgTransactions) {
  const recommendations = [];

  if (avgTransactions > 50) {
    recommendations.push('High transaction volume: Consider expanding inventory capacity');
    recommendations.push('Review staffing levels to handle current demand');
  } else if (avgTransactions < 10) {
    recommendations.push('Low transaction volume: Review marketing and customer engagement');
    recommendations.push('Consider stock optimization to reduce carrying costs');
  } else {
    recommendations.push('Maintain current operational levels');
    recommendations.push('Continue monitoring trends for optimization opportunities');
  }

  return recommendations;
}

function calculateOverallHealth(summary, expiry, lowStock, sales, anomalies) {
  const inventoryHealth = calculateInventoryHealth(
    summary.summary?.total_medicines || 0,
    summary.summary?.total_stock || 0,
    lowStock?.count || 0
  );

  const expiryHealth = 100 - ((expiry?.total_at_risk || 0) / (summary.summary?.total_medicines || 1) * 100);
  const anomalyScore = 100 - ((anomalies?.total_anomalies || 0) * 5);

  return Math.round((inventoryHealth + expiryHealth + anomalyScore) / 3);
}

function generateKeyInsights(summary, expiry, lowStock, sales, anomalies) {
  const insights = [];

  if (lowStock?.count > 5) {
    insights.push('Multiple items require immediate reordering to prevent stockouts');
  }

  if (expiry?.total_at_risk > 10) {
    insights.push('Significant expiry risk requires immediate attention to minimize waste');
  }

  if (sales?.avg_daily_transactions > 30) {
    insights.push('High sales velocity indicates strong demand and opportunity for growth');
  }

  if (anomalies?.total_anomalies > 5) {
    insights.push('Multiple anomalies detected that may require operational review');
  }

  return insights;
}

function generatePrioritizedActions(summary, expiry, lowStock, sales, anomalies) {
  const actions = [];

  if (expiry?.total_at_risk > 5) {
    actions.push({ priority: 'CRITICAL', action: 'Address expiring items through discount sales or returns' });
  }

  if (lowStock?.count > 3) {
    actions.push({ priority: 'HIGH', action: 'Expedite reorders for critical low-stock items' });
  }

  if (anomalies?.total_anomalies > 3) {
    actions.push({ priority: 'MEDIUM', action: 'Investigate and resolve operational anomalies' });
  }

  if (sales?.avg_daily_transactions < 15) {
    actions.push({ priority: 'LOW', action: 'Review and enhance customer engagement strategies' });
  }

  return actions;
}

function identifyOpportunities(summary, expiry, lowStock, sales, anomalies) {
  const opportunities = [];

  if (sales?.avg_daily_transactions > 20) {
    opportunities.push('Expand inventory for high-demand items to capture more sales');
  }

  if (expiry?.total_at_risk < 3) {
    opportunities.push('Current expiry management is excellent - consider maintaining current practices');
  }

  if (lowStock?.count < 2) {
    opportunities.push('Optimize reorder points to reduce carrying costs while maintaining service levels');
  }

  return opportunities;
}

function generateCostOptimizationStrategy(summary, sales) {
  return [
    { step: 1, action: 'Analyze current procurement costs and identify high-cost items', timeline: 'Week 1' },
    { step: 2, action: 'Review supplier contracts for negotiation opportunities', timeline: 'Week 2' },
    { step: 3, action: 'Implement bulk ordering for frequently used items', timeline: 'Week 3' },
    { step: 4, action: 'Establish cost monitoring and reporting system', timeline: 'Week 4' }
  ];
}

function generateWasteReductionStrategy(expiry, summary) {
  return [
    { step: 1, action: 'Implement first-expiry-first-out dispensing protocol', timeline: 'Immediate' },
    { step: 2, action: 'Review and adjust ordering quantities based on actual demand', timeline: 'Week 1' },
    { step: 3, action: 'Establish early warning system for items approaching expiry', timeline: 'Week 2' },
    { step: 4, action: 'Create partnerships for returns or transfers of excess stock', timeline: 'Week 3' }
  ];
}

function generateStockEfficiencyStrategy(summary, sales) {
  return [
    { step: 1, action: 'Analyze current stock levels against sales velocity', timeline: 'Week 1' },
    { step: 2, action: 'Implement dynamic reorder points based on demand patterns', timeline: 'Week 2' },
    { step: 3, action: 'Establish safety stock levels for critical items', timeline: 'Week 3' },
    { step: 4, action: 'Implement regular stock optimization reviews', timeline: 'Week 4' }
  ];
}

function calculatePredictedGrowth(trends) {
  if (trends.length < 4) return 'insufficient_data';

  const recent = trends.slice(0, 7).reduce((sum, t) => sum + (t.transaction_count || 0), 0);
  const older = trends.slice(7, 14).reduce((sum, t) => sum + (t.transaction_count || 0), 0);

  const growthRate = ((recent - older) / older) * 100;
  return growthRate.toFixed(1) + '%';
}

function generateStockRecommendations(lowStock, avgDailySales, forecastPeriod) {
  const recommendations = [];

  if (lowStock?.count > 0) {
    lowStock.low_stock_items?.slice(0, 5).forEach(item => {
      const currentStock = item.current_stock || 0;
      const reorderLevel = item.reorder_level || 10;
      const dailyAvg = item.daily_avg_sales || 1;

      const projectedNeed = Math.ceil((dailyAvg * forecastPeriod) - currentStock);
      if (projectedNeed > 0) {
        recommendations.push({
          item: item.medicine_name,
          current_stock: currentStock,
          recommended_order: Math.max(projectedNeed, reorderLevel * 2),
          urgency: currentStock < reorderLevel ? 'HIGH' : 'MEDIUM'
        });
      }
    });
  }

  return recommendations;
}

function calculateConfidenceLevel(dataPoints) {
  if (dataPoints < 7) return 'LOW';
  if (dataPoints < 14) return 'MEDIUM';
  return 'HIGH';
}

function calculateEfficiencyScore(summary, anomalies, sales) {
  const anomalyDeduction = (anomalies?.total_anomalies || 0) * 5;
  const salesBonus = Math.min((sales?.avg_daily_transactions || 0) * 0.5, 20);
  const baseScore = 80;

  return Math.max(0, Math.min(100, Math.round(baseScore + salesBonus - anomalyDeduction)));
}

function identifyBottlenecks(summary, anomalies, sales) {
  const bottlenecks = [];

  if (anomalies?.total_anomalies > 3) {
    bottlenecks.push('Data entry inconsistencies affecting inventory accuracy');
  }

  if (sales?.avg_daily_transactions < 10) {
    bottlenecks.push('Low sales velocity may indicate service or stock availability issues');
  }

  if (summary.summary?.low_stock_count > 5) {
    bottlenecks.push('Frequent stockouts disrupting operations');
  }

  return bottlenecks;
}

function generateImprovementOpportunities(summary, anomalies, sales) {
  const opportunities = [];

  if (anomalies?.total_anomalies > 0) {
    opportunities.push('Implement data validation and quality control processes');
  }

  if (sales?.avg_daily_transactions > 20) {
    opportunities.push('Expand inventory capacity to meet growing demand');
  }

  opportunities.push('Implement automated reorder triggers based on demand patterns');
  opportunities.push('Establish regular efficiency review and optimization cycles');

  return opportunities;
}

function identifyQuickWins(summary, anomalies, sales) {
  const quickWins = [];

  if (summary.summary?.low_stock_count > 2) {
    quickWins.push('Expedite reorders for top 3 low-stock items');
  }

  if (anomalies?.total_anomalies > 0) {
    quickWins.push('Review and resolve recent data entry anomalies');
  }

  quickWins.push('Review and optimize reorder point settings');
  quickWins.push('Implement daily stock level monitoring dashboard');

  return quickWins;
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

// ─── Model Selection with Fallback (Enhanced for Generative AI) ───
async function selectAvailableModel(apiKey) {
  // Use models that support generative capabilities
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
        response += `I recommend reviewing these items for potential discounts or expedited sales to minimize waste. Would you like me to show you the specific items or generate a detailed expiry report for download?`;
      } else {
        response += `Your expiry management looks good - no immediate risks detected.`;
      }
      break;

    case 'reorder':
      const lowStockCount = data.lowStock?.count || 0;
      response = `${lowStockCount} items are currently below reorder level out of ${totalMedicines} medicines with ${totalStock} total units. `;
      if (lowStockCount > 0) {
        response += `I can help you prioritize which items to order first based on sales velocity. Would you like me to show the reorder recommendations or generate a CSV file with ordering details?`;
      } else {
        response += `Your stock levels are healthy across all items.`;
      }
      break;

    case 'trend':
      const avgTransactions = data.sales?.avg_daily_transactions || 0;
      response = `Over the past 30 days, you've averaged ${avgTransactions} transactions per day. `;
      response += `This gives us a good baseline for demand forecasting. Would you like me to break this down by specific medicine categories, generate a sales trend report, or create a downloadable CSV with the detailed data?`;
      break;

    case 'anomaly':
      const anomalyCount = data.anomalies?.total_anomalies || 0;
      response = `I've detected ${anomalyCount} unusual patterns in your inventory data over the past 30 days. `;
      if (anomalyCount > 0) {
        response += `These might indicate data entry issues, theft, or other operational concerns. Would you like me to review the specific anomalies or generate an anomaly report for your records?`;
      } else {
        response += `Your inventory data appears consistent with no significant anomalies detected.`;
      }
      break;

    default:
      response = `Based on your current inventory, you have ${totalMedicines} medicines with ${totalStock} total units in stock. `;
      response += `I can help you analyze expiry risks, stock levels, sales trends, or provide reorder recommendations. I can also generate downloadable reports in PDF, CSV, Excel, or JSON format. What would you like to focus on?`;
  }

  return response;
}

// ─── File Request Detection ───
function detectFileRequest(question) {
  const lowerQuestion = question.toLowerCase();

  const filePatterns = {
    csv: ['csv', 'excel', 'spreadsheet', 'download file', 'export to csv'],
    pdf: ['pdf', 'report file', 'download report', 'pdf report'],
    excel: ['excel', 'xlsx', 'spreadsheet', 'microsoft excel'],
    json: ['json', 'data file', 'api data', 'structured data'],
    txt: ['text file', 'txt', 'plain text', 'text document']
  };

  for (const [fileType, patterns] of Object.entries(filePatterns)) {
    if (patterns.some(pattern => lowerQuestion.includes(pattern))) {
      return fileType;
    }
  }

  return null;
}

// ─── Enhanced Chat with File Generation ───
async function chatWithFileGeneration(question, userId, context = null) {
  const requestedFileType = detectFileRequest(question);
  const intention = detectIntention(question);

  // Get the standard AI response first
  const standardResponse = await modernChat(question, userId, context);

  // If user requested a file, enhance the response
  if (requestedFileType) {
    const fileHint = `I detected you want a ${requestedFileType.toUpperCase()} file. You can use the file generation endpoint with your current data to create a downloadable ${requestedFileType} file. Would you like me to help you generate that now?`;

    return {
      ...standardResponse,
      file_request: {
        detected: true,
        file_type: requestedFileType,
        hint: fileHint,
        endpoint: `/api/ai/generate-file`,
        available_formats: ['csv', 'excel', 'pdf', 'json', 'txt']
      }
    };
  }

  return standardResponse;
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
                maxOutputTokens: 2048,  // Increased for generative responses
                temperature: 0.7,       // Higher temperature for more creative responses
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
  buildFallbackInventoryResponse,
  generateReport,
  createStrategy,
  forecastDemand,
  analyzeEfficiency,
  detectFileRequest,
  chatWithFileGeneration
};
