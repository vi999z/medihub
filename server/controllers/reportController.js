const reportModel = require('../models/reportModel');
const { buildPdfBuffer, buildWordDocument, buildExcelWorkbook, buildReportExport } = require('./exportController');
const { logAudit } = require('../utils/auditLogger');
const branchModel = require('../models/branchModel');
const { localDateKey, addDays } = require('../utils/dates');

async function summary(req, res) {
  try {
    const data = await reportModel.getSummary();
    res.json(data);
  } catch (err) {
    console.error('Error fetching summary report:', err);
    res.status(500).json({ error: 'Failed to fetch summary report' });
  }
}

async function expiringSoon(req, res) {
  try {
    const data = await reportModel.getExpiringSoon(req.query.days || 14);
    res.json(data);
  } catch (err) {
    console.error('Error fetching expiring soon report:', err);
    res.status(500).json({ error: 'Failed to fetch expiring soon report' });
  }
}

async function lowStock(req, res) {
  try {
    const data = await reportModel.getLowStock();
    res.json(data);
  } catch (err) {
    console.error('Error fetching low stock report:', err);
    res.status(500).json({ error: 'Failed to fetch low stock report' });
  }
}

async function salesTrend(req, res) {
  try {
    const data = await reportModel.getSalesTrend(req.query.days || 30);
    res.json(data);
  } catch (err) {
    console.error('Error fetching sales trend report:', err);
    res.status(500).json({ error: 'Failed to fetch sales trend report' });
  }
}

async function todaySales(req, res) {
  try {
    const data = await reportModel.getTodaySales();
    res.json(data);
  } catch (err) {
    console.error('Error fetching today sales report:', err);
    res.status(500).json({ error: 'Failed to fetch today sales report' });
  }
}

async function needsAttention(req, res) {
  try {
    const days = parseInt(req.query.days, 10) || 14;
    const data = await reportModel.getNeedsAttention(days);
    res.json(data);
  } catch (err) {
    console.error('Error fetching needs-attention report:', err);
    res.status(500).json({ error: 'Failed to fetch needs-attention report' });
  }
}

async function topSellers(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const days = parseInt(req.query.days, 10) || 30;
    const data = await reportModel.getTopSellers(limit, days);
    res.json(data);
  } catch (err) {
    console.error('Error fetching top sellers report:', err);
    res.status(500).json({ error: 'Failed to fetch top sellers report' });
  }
}

async function byCategory(req, res) {
  try {
    const data = await reportModel.getByCategory();
    res.json(data);
  } catch (err) {
    console.error('Error fetching category report:', err);
    res.status(500).json({ error: 'Failed to fetch category report' });
  }
}

// ── Report exports ───────────────────────────────────────────────────────────
// Every report accepts ?branch=<name|all>&format=excel|pdf|docx|csv. Reports about
// activity (sales, movements) also take ?from=YYYY-MM-DD&to=YYYY-MM-DD.
const MAX_PERIOD_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function isRealDate(value) {
  const d = new Date(`${value}T00:00:00Z`);
  return DATE_RE.test(value) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Reads and checks the branch and period filters from the query string.
async function parseFilters(req) {
  const requested = String(req.query.branch || '').trim();
  let branch = null;
  if (requested && requested.toLowerCase() !== 'all') {
    const found = await branchModel.getByName(requested);
    if (!found) throw httpError(400, `Unknown branch: ${requested}`);
    branch = found.name;
  }

  const today = localDateKey();
  let { from, to } = req.query;
  if (!from && !to) {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), MAX_PERIOD_DAYS);
    to = today;
    from = addDays(today, -(days - 1));
  } else {
    from = from || to;
    to = to || from;
    if (!isRealDate(from) || !isRealDate(to)) throw httpError(400, 'Dates must be real dates in YYYY-MM-DD form');
    if (from > to) throw httpError(400, 'The start date must not be after the end date');
    if ((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 >= MAX_PERIOD_DAYS) {
      throw httpError(400, `Choose a period of ${MAX_PERIOD_DAYS} days or less`);
    }
  }
  return { branch, from, to };
}

const branchLabel = (branch) => branch || 'All branches';
const periodLabel = (from, to) => (from === to ? from : `${from} to ${to}`);
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;
const fileBase = (name, branch) => `${name}_${branch ? slug(branch) : 'all_branches'}`;

// Expected problems (bad filter) answer 400 with their message; anything else is a 500.
function failExport(res, err, what) {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(`Error exporting ${what}:`, err);
  return res.status(500).json({ error: `Failed to export ${what}` });
}

async function batchesByStatus(req, res) {
  try {
    const { status = 'active', format = 'excel' } = req.query;
    const { branch } = await parseFilters(req);
    const rows = await reportModel.getBatchesByStatus(status, { branch });
    const safeStatus = ['active', 'expired', 'depleted', 'recalled'].includes(status) ? status : 'active';
    const totalValue = rows.reduce((sum, r) => sum + Number(r.quantity_remaining) * Number(r.cost_price || 0), 0);
    await sendFormattedReport(res, {
      title: `${safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1)} Batches — ${branchLabel(branch)}`,
      summary: {
        branch: branchLabel(branch),
        total_batches: rows.length,
        total_remaining_quantity: rows.reduce((sum, r) => sum + Number(r.quantity_remaining), 0),
        estimated_value: peso(totalValue),
      },
      rows,
    }, format, fileBase(`${safeStatus}_batches`, branch));
  } catch (err) { failExport(res, err, 'the batches report'); }
}

async function wastedMedicines(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const { branch } = await parseFilters(req);
    const rows = await reportModel.getWastedMedicines({ branch });
    const totalWaste = rows.reduce((sum, r) => sum + Number(r.estimated_waste_value || 0), 0);
    await sendFormattedReport(res, {
      title: `Wasted / Disposed Medicines — ${branchLabel(branch)}`,
      summary: { branch: branchLabel(branch), wasted_batches: rows.length, estimated_total_waste_value: peso(totalWaste) },
      rows,
    }, format, fileBase('wasted_medicines', branch));
  } catch (err) { failExport(res, err, 'the wasted medicines report'); }
}

async function transactionsReport(req, res) {
  try {
    const { format = 'excel', type } = req.query;
    if (type && !['stock_in', 'sale', 'adjustment', 'disposal', 'return'].includes(type)) throw httpError(400, 'Unknown movement type');
    const { branch, from, to } = await parseFilters(req);
    const rows = await reportModel.getTransactionsReport({ from, to, type: type || null, branch });
    await sendFormattedReport(res, {
      title: `Stock Movements — ${branchLabel(branch)}${type ? ` — ${type.replace('_', ' ')}` : ''}`,
      summary: { branch: branchLabel(branch), period: periodLabel(from, to), total_movements: rows.length },
      rows: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ') })),
    }, format, fileBase('stock_movements', branch));
  } catch (err) { failExport(res, err, 'the stock movements report'); }
}

async function salesReport(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const { branch, from, to } = await parseFilters(req);
    const rows = await reportModel.getSalesReport({ from, to, branch });
    const sum = (key) => rows.reduce((total, r) => total + Number(r[key] || 0), 0);
    const summary = {
      branch: branchLabel(branch),
      period: periodLabel(from, to),
      medicines_sold: rows.length,
      units_sold: sum('units_sold'),
      units_returned: sum('units_returned'),
      net_sales: peso(sum('net_sales')),
      estimated_cost: peso(sum('estimated_cost')),
      estimated_profit: peso(sum('estimated_profit')),
    };
    // With every branch selected, also show each branch's share.
    if (!branch) {
      for (const name of [...new Set(rows.map((r) => r.branch))].sort()) {
        summary[`net_sales_${slug(name)}`] = peso(rows.filter((r) => r.branch === name).reduce((t, r) => t + r.net_sales, 0));
      }
    }
    await sendFormattedReport(res, { title: `Sales — ${branchLabel(branch)}`, summary, rows }, format, fileBase('sales', branch));
  } catch (err) { failExport(res, err, 'the sales report'); }
}

async function notificationsReport(req, res) {
  try {
    const { format = 'excel', severity, unread } = req.query;
    const rows = await reportModel.getNotificationsReport(severity || null, unread === 'true');
    const criticalCount = rows.filter(n => n.severity === 'critical').length;
    const warningCount = rows.filter(n => n.severity === 'warning').length;
    await sendFormattedReport(res, {
      title: 'Alerts & Notifications Report',
      summary: { total_alerts: rows.length, critical: criticalCount, warnings: warningCount, info: rows.length - criticalCount - warningCount },
      rows: rows.map(n => ({
        id: n.id, type: (n.type || '').replace(/_/g, ' '), severity: n.severity,
        message: n.message, status: n.is_read ? 'Read' : 'Unread',
        date: new Date(n.created_at).toLocaleDateString()
      })),
    }, format, 'alerts_notifications');
  } catch (err) { failExport(res, err, 'the alerts report'); }
}

async function expiringSoonReport(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 365);
    const { branch } = await parseFilters(req);
    const rows = await reportModel.getExpiringSoon(days, { branch });
    await sendFormattedReport(res, {
      title: `Expiring Within ${days} Days — ${branchLabel(branch)}`,
      summary: {
        branch: branchLabel(branch),
        total_batches: rows.length,
        total_quantity: rows.reduce((sum, r) => sum + Number(r.quantity_remaining), 0),
        critical_urgent: rows.filter(r => r.days_left <= 3).length,
        urgent: rows.filter(r => r.days_left > 3 && r.days_left <= 7).length,
      },
      rows,
    }, format, fileBase(`expiring_${days}_days`, branch));
  } catch (err) { failExport(res, err, 'the expiring soon report'); }
}

async function lowStockReport(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const { branch } = await parseFilters(req);
    const rows = await reportModel.getLowStock({ branch });
    await sendFormattedReport(res, {
      title: `Low Stock Medicines — ${branchLabel(branch)}`,
      summary: {
        branch: branchLabel(branch),
        total_medicines: rows.length,
        out_of_stock: rows.filter(r => Number(r.total_remaining) === 0).length,
        total_deficit: rows.reduce((sum, r) => sum + (Number(r.reorder_level) - Number(r.total_remaining)), 0),
      },
      rows,
    }, format, fileBase('low_stock', branch));
  } catch (err) { failExport(res, err, 'the low stock report'); }
}

async function inventoryValueReport(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const { branch } = await parseFilters(req);
    const rows = await reportModel.getInventoryValue({ branch });
    await sendFormattedReport(res, {
      title: `Inventory Value — ${branchLabel(branch)}`,
      summary: {
        branch: branchLabel(branch),
        medicines_in_stock: rows.length,
        total_quantity: rows.reduce((sum, r) => sum + r.total_quantity, 0),
        value_at_cost: peso(rows.reduce((sum, r) => sum + r.value_at_cost, 0)),
        value_at_retail: peso(rows.reduce((sum, r) => sum + r.value_at_retail, 0)),
      },
      rows,
    }, format, fileBase('inventory_value', branch));
  } catch (err) { failExport(res, err, 'the inventory value report'); }
}

// ── Helper: send a report in the requested format ────────────────────────────
async function sendFormattedReport(res, reportData, format, basename) {
  const fmt = (format || 'excel').toLowerCase();
  // Every export is recorded, so who downloaded which report can be traced.
  if (res.req?.user) {
    logAudit(res.req.user.id, 'export_report', `Exported ${basename} as ${fmt}`, res.req);
  }
  if (fmt === 'csv') {
    const csv = buildReportExport(reportData, 'csv');
    // BOM so Excel opens non-English characters correctly.
    return res.setHeader('Content-Type', csv.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${basename}.csv"`)
      .send(`﻿${csv.body}`);
  }
  if (fmt === 'pdf') {
    const buf = await buildPdfBuffer(reportData);
    return res.setHeader('Content-Type', 'application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${basename}.pdf"`)
      .send(buf);
  }
  if (fmt === 'docx' || fmt === 'word') {
    const buf = await buildWordDocument(reportData);
    return res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .setHeader('Content-Disposition', `attachment; filename="${basename}.docx"`)
      .send(buf);
  }
  // Default: Excel
  const buf = await buildExcelWorkbook(reportData);
  return res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setHeader('Content-Disposition', `attachment; filename="${basename}.xlsx"`)
    .send(buf);
}

module.exports = { salesReport, summary, todaySales, needsAttention, topSellers, expiringSoon, lowStock, salesTrend, byCategory, batchesByStatus, wastedMedicines, transactionsReport, notificationsReport, expiringSoonReport, lowStockReport, inventoryValueReport };
