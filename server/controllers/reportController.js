const reportModel = require('../models/reportModel');
const { buildPdfBuffer, buildWordDocument, buildExcelWorkbook } = require('./exportController');

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

async function byCategory(req, res) {
  try {
    const data = await reportModel.getByCategory();
    res.json(data);
  } catch (err) {
    console.error('Error fetching category report:', err);
    res.status(500).json({ error: 'Failed to fetch category report' });
  }
}

// ── Status-based batch export ────────────────────────────────────────────────
async function batchesByStatus(req, res) {
  try {
    const { status = 'expired', format = 'excel' } = req.query;
    const rows = await reportModel.getBatchesByStatus(status);
    const title = `${status.charAt(0).toUpperCase() + status.slice(1)} Batches Report`;
    await sendFormattedReport(res, { title, rows }, format, `${status}_batches`);
  } catch (err) {
    console.error('Error fetching batches by status:', err);
    res.status(500).json({ error: 'Failed to export batches report' });
  }
}

async function wastedMedicines(req, res) {
  try {
    const { format = 'excel' } = req.query;
    const rows = await reportModel.getWastedMedicines();
    const totalWaste = rows.reduce((sum, r) => sum + Number(r.estimated_waste_value || 0), 0);
    await sendFormattedReport(res, {
      title: 'Wasted / Disposed Medicines Report',
      summary: { total_wasted_batches: rows.length, estimated_total_waste_value: `₱${totalWaste.toFixed(2)}` },
      rows,
    }, format, 'wasted_medicines');
  } catch (err) {
    console.error('Error fetching wasted medicines:', err);
    res.status(500).json({ error: 'Failed to export wasted medicines report' });
  }
}

async function transactionsReport(req, res) {
  try {
    const { format = 'excel', days = 30, type } = req.query;
    const rows = await reportModel.getTransactionsReport(Number(days), type || null);
    await sendFormattedReport(res, {
      title: `Transactions Report (Last ${days} days${type ? ` — ${type}` : ''})`,
      summary: { total_transactions: rows.length, period_days: days },
      rows,
    }, format, 'transactions');
  } catch (err) {
    console.error('Error fetching transactions report:', err);
    res.status(500).json({ error: 'Failed to export transactions report' });
  }
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
  } catch (err) {
    console.error('Error fetching notifications report:', err);
    res.status(500).json({ error: 'Failed to export notifications report' });
  }
}

// ── Helper: send a report in the requested format ────────────────────────────
async function sendFormattedReport(res, reportData, format, basename) {
  const fmt = (format || 'excel').toLowerCase();
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

module.exports = { summary, expiringSoon, lowStock, salesTrend, byCategory, batchesByStatus, wastedMedicines, transactionsReport, notificationsReport };
