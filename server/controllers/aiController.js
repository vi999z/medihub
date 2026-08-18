const { trainAndPersist, scoreActiveBatches } = require('../ai/expiryRiskModel');
const { pool } = require('../config/db');
const { getReorderSuggestions } = require('../ai/demandForecastModel');
const { detectAnomalies } = require('../ai/anomalyDetection');
const { logAudit } = require('../utils/auditLogger');
const { buildReportExport, buildPdfBuffer, getSupportedExportTypes } = require('./exportController');

// Helper function to convert data to rows array for exports
function toRowsArray(data) {
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

// Generate comprehensive pharmacy health report
function generatePharmacyHealthReport(data) {
  const report = {
    title: 'Pharmacy Health Report',
    generated_at: new Date().toISOString(),
    summary: {},
    rows: [],
    recommendations: [],
    trend: []
  };

  // Add summary statistics
  if (data.summary) {
    report.summary = {
      total_medicines: data.summary.total_medicines || 0,
      total_batches: data.summary.total_batches || 0,
      total_value: data.summary.total_value || 0,
      expiring_soon: data.summary.expiring_soon || 0,
      low_stock: data.summary.low_stock || 0
    };
  }

  // Add expiring items as rows
  if (Array.isArray(data.expiring) && data.expiring.length > 0) {
    data.expiring.forEach(item => {
      report.rows.push({
        type: 'expiring',
        medicine_name: item.medicine_name || item.name,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        quantity: item.quantity,
        days_until_expiry: item.days_until_expiry
      });
    });
    report.recommendations.push(`Review ${data.expiring.length} items expiring within 30 days`);
  }

  // Add low stock items as rows
  if (Array.isArray(data.lowStock) && data.lowStock.length > 0) {
    data.lowStock.forEach(item => {
      report.rows.push({
        type: 'low_stock',
        medicine_name: item.medicine_name || item.name,
        current_stock: item.current_stock || item.quantity,
        minimum_stock: item.minimum_stock || item.min_stock,
        reorder_level: item.reorder_level
      });
    });
    report.recommendations.push(`Consider reordering ${data.lowStock.length} low stock items`);
  }

  // Add sales trend data
  if (Array.isArray(data.trend) && data.trend.length > 0) {
    report.trend = data.trend.map(item => ({
      date: item.date,
      total_sales: item.total_sales || item.units_sold || 0,
      transaction_count: item.transaction_count || 0
    }));
  }

  // Add expiry risk data
  if (Array.isArray(data.expiryRisk) && data.expiryRisk.length > 0) {
    data.expiryRisk.forEach(item => {
      report.rows.push({
        type: 'expiry_risk',
        medicine_name: item.medicine_name,
        risk_score: item.risk_score,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date
      });
    });
  }

  // Add reorder suggestions
  if (Array.isArray(data.reorderSuggestions) && data.reorderSuggestions.length > 0) {
    data.reorderSuggestions.forEach(item => {
      report.recommendations.push(`Reorder ${item.medicine_name}: suggested quantity ${item.suggested_quantity}`);
    });
  }

  // Add anomaly data
  if (Array.isArray(data.anomalies) && data.anomalies.length > 0) {
    data.anomalies.forEach(item => {
      report.rows.push({
        type: 'anomaly',
        description: item.description,
        severity: item.severity,
        detected_at: item.detected_at
      });
    });
    report.recommendations.push(`Investigate ${data.anomalies.length} detected anomalies`);
  }

  return report;
}

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
      pool.query('SELECT * FROM summary_view').then(r => r[0]?.[0] || {}).catch(e => { console.error('Summary view error:', e); return {}; }),
      pool.query('SELECT * FROM batches WHERE status = \'active\' AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY expiry_date ASC LIMIT 10').then(r => r[0] || []).catch(e => { console.error('Expiring batches error:', e); return []; }),
      pool.query('SELECT * FROM low_stock_view LIMIT 10').then(r => r[0] || []).catch(e => { console.error('Low stock view error:', e); return []; }),
      pool.query('SELECT * FROM sales_trend_view ORDER BY date DESC LIMIT 30').then(r => r[0] || []).catch(e => { console.error('Sales trend view error:', e); return []; }),
      pool.query('SELECT category, COUNT(*) as count FROM medicines GROUP BY category').then(r => r[0] || []).catch(e => { console.error('Category query error:', e); return []; }),
      scoreActiveBatches().catch(e => { console.error('Expiry risk error:', e); return []; }),
      getReorderSuggestions().catch(e => { console.error('Reorder suggestions error:', e); return []; }),
      detectAnomalies(30).catch(e => { console.error('Anomalies error:', e); return []; }),
    ]);
    console.log('Database data fetched successfully');

    // Filter out empty datasets to prevent AI from creating empty tables
    const hasData = (data) => data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0);

    const filteredData = {
      summary: hasData(summary) ? summary : null,
      expiring: hasData(expiring) ? expiring : null,
      lowStock: hasData(lowStock) ? lowStock : null,
      trend: hasData(trend) ? trend : null,
      categoryData: hasData(categoryData) ? categoryData : null,
      expiryRisk: hasData(expiryRisk) ? expiryRisk : null,
      reorderSuggestions: hasData(reorderSuggestions) ? reorderSuggestions : null,
      anomalies: hasData(anomalies) ? anomalies : null,
    };

    // Detect if question is pharmacy-related
    const pharmacyKeywords = ['inventory', 'medicine', 'stock', 'expiry', 'sales', 'pharmacy', 'drug', 'medication', 'batch', 'transaction', 'supplier', 'order'];

    // Detect export requests
    const exportKeywords = {
      csv: ['csv', 'excel', 'spreadsheet', 'xls', 'export'],
      pdf: ['pdf', 'report', 'document'],
      txt: ['text', 'txt', 'summary', 'plain text'],
      json: ['json', 'api', 'structured data', 'data export'],
      chart: ['chart', 'graph', 'visual', 'analytics', 'dashboard']
    };

    const detectExportType = (text) => {
      const lowerText = text.toLowerCase();
      for (const [type, keywords] of Object.entries(exportKeywords)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
          return type;
        }
      }
      return null;
    };

    const isPharmacyRelated = pharmacyKeywords.some(keyword => question.toLowerCase().includes(keyword));
    const requestedExportType = detectExportType(question);

    // Construct the system prompt with real data
    const systemPrompt = `You are a helpful AI assistant for a pharmacy inventory management system called MediHub.
You answer questions about inventory, expiry, stock levels, and sales using ONLY the data provided below.
For pharmacy-related questions, be precise and data-driven. For general questions, be conversational and helpful.

GENERAL RESPONSE GUIDELINES:
- Be conversational and natural - write like a helpful human assistant
- Keep responses concise but complete - avoid unnecessary fluff
- Use clear structure with paragraphs or bullet points when appropriate
- Be specific and actionable when possible
- If you don't know something, admit it honestly
- Adapt your tone to the question - professional for data, friendly for general chat
- Avoid robotic or overly formal language unless the topic requires it
- Use formatting (bold, lists) sparingly and only when it adds clarity

PHARMACY DATA RULES:
- Do not invent or hallucinate numbers. If the answer cannot be found in the data, say so clearly.
- Format numbers with appropriate units (currency, quantities, percentages)
- For empty/missing data, give natural responses like "I don't have sales data recorded yet" instead of empty tables
- ONLY create tables/charts when there is actual meaningful data to display
- Never create empty tables with "No data available" placeholders

EXPORT CAPABILITIES:
- When users request exports (CSV, Excel, PDF, TXT, JSON, Charts), prepare structured data for export
- For CSV/Excel: Create row-based data with clear headers
- For PDF: Structure with title, summary, and recommendations
- For TXT: Plain text summaries with bullet points
- For JSON: Structured data with metadata
- For Charts: Provide labels and datasets for visualization
- Automatically detect export keywords: csv, excel, spreadsheet, pdf, report, text, json, chart, graph, visual
- Generate comprehensive pharmacy health reports with all relevant data

CONTEXT: ${isPharmacyRelated ? 'This is a pharmacy-related question. Use the inventory data below.' : 'This is a general conversation question. Be helpful and conversational without forcing pharmacy data into your response.'}

${filteredData.summary || filteredData.expiring || filteredData.lowStock || filteredData.trend || filteredData.categoryData || filteredData.expiryRisk || filteredData.reorderSuggestions || filteredData.anomalies ? `AVAILABLE PHARMACY DATA (use only if relevant to the question):` : ''}
${filteredData.summary ? `|- Summary: ${JSON.stringify(filteredData.summary)}` : ''}
${filteredData.expiring ? `|- Expiring soon (next 30 days): ${JSON.stringify(filteredData.expiring)}` : ''}
${filteredData.lowStock ? `|- Low stock items: ${JSON.stringify(filteredData.lowStock)}` : ''}
${filteredData.trend ? `|- Sales trend (last 30 days): ${JSON.stringify(filteredData.trend)}` : ''}
${filteredData.categoryData ? `|- Stock by category: ${JSON.stringify(filteredData.categoryData)}` : ''}
${filteredData.expiryRisk ? `|- Expiry risk scores: ${JSON.stringify(filteredData.expiryRisk)}` : ''}
${filteredData.reorderSuggestions ? `|- Reorder suggestions: ${JSON.stringify(filteredData.reorderSuggestions)}` : ''}
${filteredData.anomalies ? `|- Anomalies detected: ${JSON.stringify(filteredData.anomalies)}` : ''}`;

    console.log('Calling Google AI API with fallback system...');
    // Define fallback models in order of preference (more reliable models first)
    const models = [
      'gemini-3.1-flash-lite',  // Lighter, fast model with less congestion
      'gemini-2.5-flash',       // Previous generation, stable and widely supported
      'gemini-2.0-flash',       // Another stable option
      'gemini-1.5-flash',       // Original fallback
      'gemini-1.5-pro',         // More capable option
      'gemini-pro'              // Final fallback
    ];
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
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
            maxOutputTokens: 800,
            temperature: 0.7,
          }
        }),
      });

      console.log(`Google AI API response status for ${model}:`, response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Google AI API error for ${model}:`, response.status, errorText);

        // If it's a 503 (high demand), retry with exponential backoff
        if (response.status === 503) {
          console.log(`Model ${model} experiencing high demand, retrying...`);
          for (let retry = 1; retry <= 3; retry++) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000)); // 2s, 4s, 8s
            console.log(`Retry attempt ${retry} for ${model}...`);
            const retryResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt + "\n\nUser: " + question }] }],
                generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
              }),
            });
            if (retryResponse.ok) {
              const retryText = await retryResponse.text();
              let retryData;
              try { retryData = JSON.parse(retryText); } catch { continue; }
              const aiResponse = retryData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
              console.log(`Retry successful for ${model}`);

              await logAudit(req.user.id, 'ai_chat', `Question: ${question.substring(0, 100)}...`, req);
              return res.json({ response: aiResponse });
            }
          }
          console.log(`All retries failed for ${model}, trying next model...`);
          lastError = new Error(`Model ${model} failed after retries: 503`);
          continue;
        }

        // If it's a 404 (model not found), try next model
        if (response.status === 404) {
          console.log(`Model ${model} not found, trying next model...`);
          lastError = new Error(`Model ${model} not found: 404`);
          continue;
        }

        // For other errors, throw immediately
        throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error(`Invalid JSON from model ${model}:`, responseText.substring(0, 200));
        lastError = new Error(`Model ${model} returned invalid JSON`);
        continue;
      }
      console.log(`Google AI API response received from ${model}`);
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

      // If user requested an export, process it
      if (requestedExportType) {
        console.log(`Export request detected: ${requestedExportType}`);

        // Generate comprehensive pharmacy health report
        const exportData = generatePharmacyHealthReport(filteredData);

        try {
          const exportResult = buildReportExport(exportData, requestedExportType);

          // Log the export generation
          await logAudit(
            req.user.id,
            'ai_export',
            `Generated ${requestedExportType} export: ${exportResult.filename}`,
            req
          );

          return res.json({
            response: aiResponse,
            export: {
              type: requestedExportType,
              filename: exportResult.filename,
              contentType: exportResult.contentType,
              data: exportResult.body,
              downloadUrl: `/api/ai/report/export?type=${requestedExportType}`
            }
          });
        } catch (exportError) {
          console.error('Export generation failed:', exportError);
          // Still return the AI response even if export fails
          return res.json({
            response: aiResponse,
            exportError: 'Failed to generate export file'
          });
        }
      }

      // If we got here, the model worked
      console.log(`Successfully used model: ${model}`);

      // Log the chat interaction
      await logAudit(
        req.user.id,
        'ai_chat',
        `Question: ${question.substring(0, 100)}...`,
        req
      );

      return res.json({ response: aiResponse });

    } catch (err) {
      console.error(`Error with model ${model}:`, err.message);
      lastError = err;
      continue; // Try next model
    }
  }

    // If we get here, all models failed
    console.error('All AI models failed, last error:', lastError);
    throw lastError || new Error('All AI models failed');
  } catch (err) {
    console.error('AI chat failed:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      hasApiKey: !!process.env.GOOGLE_AI_API_KEY,
      apiKeyPrefix: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 8) + '...' : 'none'
    });

    if (err.message?.includes('API key') || err.message?.includes('401')) {
      return res.status(500).json({ error: 'AI service authentication failed. Please contact administrator.' });
    }
    if (err.message?.includes('quota') || err.message?.includes('rate limit') || err.message?.includes('429')) {
      return res.status(429).json({ error: 'AI service rate limit exceeded. Please try again later.' });
    }
    if (err.message?.includes('503') || err.message?.includes('high demand') || err.message?.includes('UNAVAILABLE')) {
      return res.status(503).json({ error: 'AI service is currently experiencing high demand. Please try again in a few moments.' });
    }
    if (err.message?.includes('Google AI') || err.message?.includes('AI service')) {
      return res.status(500).json({ error: `AI service error: ${err.message}` });
    }
    res.status(500).json({ error: 'Failed to process question. Please try again.' });
  }
}

module.exports = { getExpiryRisk, train, getReorderSuggestionsHandler, getAnomalies, chat };
