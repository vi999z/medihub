/**
 * Analysis Helpers
 * Report generation, strategy creation, demand forecasting,
 * efficiency analysis, and all supporting computation functions.
 */

const {
  getInventorySummary,
  getExpiryAnalysis,
  getLowStockItems,
  getSalesTrends,
  getAnomalyAnalysis,
} = require('./inventoryQueries');

// ─── Report Generation ───

async function generateReport(reportType) {
  try {
    const [summary, expiry, lowStock, sales, anomalies] = await Promise.all([
      getInventorySummary(),
      getExpiryAnalysis(30),
      getLowStockItems(10),
      getSalesTrends(30),
      getAnomalyAnalysis()
    ]);

    const report = {
      type: reportType,
      generated_at: new Date().toISOString(),
      summary: summary.summary || {},
      data: { expiry, lowStock, sales, anomalies }
    };

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

// ─── Strategy Creation ───

async function createStrategy(strategyType) {
  const [summary, sales, expiry] = await Promise.all([
    getInventorySummary(),
    getSalesTrends(90),
    getExpiryAnalysis(60)
  ]);

  const strategy = {
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

// ─── Demand Forecasting ───

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

// ─── Efficiency Analysis ───

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

// ─── Private Computation Helpers ───

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
      estimatedLoss += quantity * 0.8;
    } else if (daysToExpiry <= 60) {
      estimatedLoss += quantity * 0.5;
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

module.exports = {
  generateReport,
  createStrategy,
  forecastDemand,
  analyzeEfficiency
};
