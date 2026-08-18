/**
 * Response Builder
 * Markdown validation, Gemini text extraction, fallback response building,
 * contextual response building, and file request detection.
 *
 * Bug fix: extractGeneratedText returns null (not a hardcoded string) when
 * Gemini returns no usable text, so callers can cleanly fall through to
 * buildFallbackInventoryResponse without triggering the same loop again.
 */

const { RESPONSE_TEMPLATES } = require('./llmConfig');
const {
  getInventorySummary,
  getExpiryAnalysis,
  getLowStockItems,
  getSalesTrends,
  getAnomalyAnalysis,
  getReorderRecommendations
} = require('./inventoryQueries');

// ─── Markdown Safety Validation ───
function validateAndCleanMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  // Ensure backticks are balanced
  const backtickCount = (text.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    text = text.replace(/`/g, '');
  }

  // Strip potential HTML/script injection
  text = text.replace(/<script[^>]*>.*?<\/script>/gi, '');
  text = text.replace(/javascript:/gi, '');
  text = text.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');

  return text.trim();
}

// ─── Gemini Text Extractor ───
// Returns the text string from a Gemini response, or null if none is present.
// Returning null (not a hardcoded string) lets callers decide what to do.
function extractGeneratedText(responseData) {
  const candidate = responseData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .map((part) => part?.text)
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
    .trim();

  if (text) return text;

  // No usable text — return null so the caller falls back gracefully
  return null;
}

// ─── Fallback Inventory Response ───
// Used when Gemini produces no usable text. Queries live DB data and builds
// a markdown response. Never calls the Gemini API.
async function buildFallbackInventoryResponse(question) {
  try {
    const data = await getInventorySummary();
    const summary = data?.summary || {};
    const totalMedicines = summary.total_medicines ?? summary.total_items ?? 0;
    const totalStock = summary.total_stock ?? 0;
    const totalValue = summary.total_value ?? 0;
    const expiringSoon = summary.expiring_soon ?? 0;
    const lowStock = summary.low_stock_count ?? summary.low_stock ?? 0;

    let response = '';
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('expir') || lowerQuestion.includes('shelf')) {
      const expiryData = await getExpiryAnalysis(30);
      const count = expiryData.total_at_risk || 0;
      response = `You have **${count} items** at risk of expiring within 30 days.

## Quick Status
- **Total medicines**: ${totalMedicines}
- **At risk of expiry**: **${count}** items
- **Action needed**: Review these items for promotions or disposal

> I can show you which specific items are expiring and help you create a strategy to minimize waste.`;

    } else if (lowerQuestion.includes('stock') || lowerQuestion.includes('inventory')) {
      const lowStockData = await getLowStockItems(5);
      const count = lowStockData.count || 0;
      response = `You have **${count} items** below reorder level.

## Inventory Status
- **Total medicines**: ${totalMedicines}
- **Total units in stock**: ${totalStock}
- **Below reorder level**: **${count}** items

> I can help you prioritize which items to order first and generate an order list for your supplier.`;

    } else if (lowerQuestion.includes('sales') || lowerQuestion.includes('trend')) {
      const salesData = await getSalesTrends(30);
      const avgTrans = salesData.avg_daily_transactions || 0;
      response = `Over the last 30 days, you've averaged **${avgTrans} transactions per day**.

## Sales Insight
- **Analysis period**: Last 30 days
- **Average daily transactions**: ${avgTrans}
- **Total medicines in catalog**: ${totalMedicines}

> I can break this down by medicine category or generate a detailed sales trend report.`;

    } else if (lowerQuestion.includes('total') || lowerQuestion.includes('overview') || lowerQuestion.includes('summary')) {
      response = `Here's your current **inventory snapshot**:

## Overview
- **Total medicines**: **${totalMedicines}**
- **Total units**: **${totalStock}** units
- **Inventory value**: **$${totalValue?.toFixed(2) || '0.00'}**
- **Items expiring soon**: ${expiringSoon} items
- **Low stock items**: ${lowStock} items

> What would you like to dive deeper into? I can analyze expiry risks, stock levels, sales patterns, or help with ordering.`;

    } else {
      response = `I'm ready to help! Here's what I see:

## Your Pharmacy Dashboard
- **Total medicines**: **${totalMedicines}**
- **Total units**: **${totalStock}** units
- **Inventory value**: **$${totalValue?.toFixed(2) || '0.00'}**
- **Items expiring soon**: ${expiringSoon}
- **Low stock alerts**: ${lowStock}

## What I Can Do
- 📊 **Analyze expiry risks** — See what's about to expire
- 📦 **Reorder intelligence** — Smart recommendations
- 📈 **Sales trends** — Understand demand patterns
- 🚨 **Detect anomalies** — Spot unusual activity
- 📄 **Generate reports** — Export in CSV, PDF, Excel, JSON

> What would you like to focus on?`;
    }

    return validateAndCleanMarkdown(response);
  } catch (err) {
    console.error('Fallback inventory response error:', err);
    return validateAndCleanMarkdown(
      `I'm having trouble accessing your inventory data right now. Please try again in a moment.`
    );
  }
}

// ─── Smart Data Fetcher ───
async function fetchRelevantData(question) {
  const lowerQuestion = question.toLowerCase();
  const dataPromises = [getInventorySummary()]; // always fetch summary

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

// ─── Contextual Response Builder ───
function buildContextualResponse(question, data, intention) {
  const summary = data.summary?.summary || {};
  const totalMedicines = summary.total_medicines || summary.total_items || 0;
  const totalStock = summary.total_stock || 0;
  const topCategory = summary.top_category || 'general';

  let response = '';

  switch (intention) {
    case 'expiry': {
      const expiryCount = data.expiry?.total_at_risk || 0;
      response = RESPONSE_TEMPLATES.expiry(expiryCount, totalMedicines, expiryCount > 0 ? topCategory : null);
      if (expiryCount === 0) {
        response = `Great news! Your expiry management is looking solid — **no items** are at risk of expiring in the next 30 days. Your inventory is in great shape!`;
      }
      break;
    }
    case 'reorder': {
      const lowStockCount = data.lowStock?.count || 0;
      response = RESPONSE_TEMPLATES.reorder(lowStockCount, totalMedicines, totalStock);
      if (lowStockCount === 0) {
        response = `Excellent! All your stock levels are **healthy** — no items are below reorder level right now. Your inventory is well-balanced!`;
      }
      break;
    }
    case 'trend': {
      const avgTransactions = data.sales?.avg_daily_transactions || 0;
      response = RESPONSE_TEMPLATES.trend(avgTransactions, 30);
      break;
    }
    case 'anomaly': {
      const anomalyCount = data.anomalies?.total_anomalies || 0;
      response = RESPONSE_TEMPLATES.anomaly(anomalyCount);
      if (anomalyCount === 0) {
        response = `Perfect! I've scanned your inventory data from the past 30 days and everything looks **normal**. No suspicious patterns or anomalies detected. Your data integrity looks great!`;
      }
      break;
    }
    default:
      response = RESPONSE_TEMPLATES.general(totalMedicines, totalStock);
  }

  return validateAndCleanMarkdown(response);
}

// ─── File Request Detector ───
// Returns the requested file type, or null if no file intent detected.
function detectFileRequest(question) {
  const q = question.toLowerCase();

  // Explicit format keywords — highest priority
  if (/\b(csv|comma.?separated)\b/.test(q)) return 'csv';
  if (/\b(excel|xlsx|spreadsheet|xls)\b/.test(q)) return 'excel';
  if (/\b(word|docx|microsoft word|doc)\b/.test(q)) return 'word';
  if (/\b(pdf|pdf report)\b/.test(q)) return 'pdf';
  if (/\b(json|structured data|api data)\b/.test(q)) return 'json';
  if (/\b(txt|plain.?text|text file|text document)\b/.test(q)) return 'txt';

  // Natural generation phrases — verb + file-like noun
  const genVerbs  = ['generate', 'create', 'make', 'produce', 'give me', 'provide', 'export', 'download', 'output', 'write', 'build', 'prepare', 'show me'];
  const fileNouns = ['file', 'report', 'list', 'table', 'dataset', 'inventory', 'summary', 'log', 'sheet', 'sample'];
  if (genVerbs.some(v => q.includes(v)) && fileNouns.some(n => q.includes(n))) return 'csv';

  return null;
}

// ─── Derive a clean filename from the user's question ───
// e.g. "give me a sample inventory file" → "sample_inventory"
function deriveFilename(question, fileType) {
  const stopWords = new Set([
    'a','an','the','me','my','us','our','for','of','in','on','to','at','with',
    'give','make','create','generate','produce','provide','export','download',
    'output','write','build','prepare','show','get','can','you','please','i',
    'want','need','file','data','report','sample','fully','made','as','is','it',
    'csv','json','txt','excel','xlsx','pdf','xls',
  ]);
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  const slug = words.slice(0, 5).join('_') || 'medihub_export';
  return `${slug}.${fileType}`;
}

// ─── Auto-detect ALL generated file blocks in an AI response ───
// Returns an array of { file_type, content, filename } objects — one per fenced block.
// Returns [] if the response has no downloadable content.
function detectGeneratedContent(responseText, question = '') {
  if (!responseText) return [];

  const results = [];
  // Match every fenced block: ```<lang>\n<content>```
  const re = /```([\w]*)\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = re.exec(responseText)) !== null) {
    const tag   = match[1].toLowerCase();
    const block = match[2].trim();
    if (!block) continue;

    // Determine file type from tag or content heuristic
    let fileType = null;
    if (['csv', 'json', 'txt', 'excel'].includes(tag)) {
      fileType = tag;
    } else {
      // Untagged or unknown tag — sniff content
      try { JSON.parse(block); fileType = 'json'; } catch {}
      if (!fileType) {
        const lines = block.split('\n').filter(Boolean);
        if (lines.length >= 2 && lines[0].includes(',')) fileType = 'csv';
      }
      if (!fileType) fileType = 'txt';
    }

    results.push({
      file_type: fileType,
      content:   block,
      filename:  deriveFilename(question, fileType),
    });
  }

  return results;
}

module.exports = {
  validateAndCleanMarkdown,
  extractGeneratedText,
  buildFallbackInventoryResponse,
  fetchRelevantData,
  buildContextualResponse,
  detectFileRequest,
  detectGeneratedContent,
  deriveFilename,
};
