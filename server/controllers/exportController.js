const PDFDocument = require('pdfkit');

const SUPPORTED_EXPORT_TYPES = ['csv', 'excel', 'pdf', 'txt', 'json', 'chart'];

// Helper function moved to top for PDF generation
function toRowsArray(reportData) {
  if (Array.isArray(reportData?.rows)) return reportData.rows;
  if (Array.isArray(reportData?.items)) return reportData.items;
  if (Array.isArray(reportData?.data)) return reportData.data;
  return [];
}

function getSupportedExportTypes() {
  return [...SUPPORTED_EXPORT_TYPES];
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsvBody(reportData) {
  const rows = toRowsArray(reportData);

  if (!rows.length) {
    return `${reportData?.title || 'Report'}\nNo data available`;
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
  const lines = [headers.map((header) => escapeCsvValue(header)).join(',')];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row?.[header])).join(','));
  }

  return lines.join('\n');
}

function buildTextReport(reportData) {
  const title = reportData?.title || 'Pharmacy report';
  const summary = reportData?.summary || {};
  const recommendations = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];

  const lines = [title, ''];

  if (Object.keys(summary).length > 0) {
    lines.push('Summary:');
    for (const [key, value] of Object.entries(summary)) {
      lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
    }
    lines.push('');
  }

  if (recommendations.length > 0) {
    lines.push('Recommendations:');
    recommendations.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  return lines.join('\n');
}

function buildJsonReport(reportData) {
  return {
    title: reportData?.title || 'Pharmacy Report',
    generated_at: new Date().toISOString(),
    summary: reportData?.summary || {},
    rows: toRowsArray(reportData),
    recommendations: Array.isArray(reportData?.recommendations) ? reportData.recommendations : [],
    trend: Array.isArray(reportData?.trend) ? reportData.trend : [],
  };
}

function buildChartPayload(reportData) {
  const title = reportData?.title || 'Analytics';
  const trend = Array.isArray(reportData?.trend) ? reportData.trend : [];
  const labels = trend.map((point) => point?.label ?? point?.date ?? point?.name ?? '');
  const data = trend.map((point) => Number(point?.value ?? point?.total ?? point?.units_sold ?? point?.count ?? 0));

  return {
    type: 'bar',
    title,
    labels,
    datasets: [{
      label: title,
      data,
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
    }],
  };
}

function buildPdfBuffer(reportData) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    // Header
    doc.fontSize(18).text(reportData?.title || 'Pharmacy Health Report', { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Summary section
    const summary = reportData?.summary || {};
    const entries = Object.entries(summary);
    if (entries.length > 0) {
      doc.fontSize(14).fillColor('blue').text('Executive Summary', { underline: true });
      doc.fillColor('black').fontSize(11);
      entries.forEach(([key, value]) => {
        doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${value}`);
      });
      doc.moveDown();
    }

    // Data tables section
    const rows = toRowsArray(reportData);
    if (rows.length > 0) {
      doc.fontSize(14).fillColor('blue').text('Detailed Data', { underline: true });
      doc.fillColor('black').fontSize(10);

      // Create table
      const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
      const tableTop = doc.y;
      const rowHeight = 20;
      const colWidth = (doc.page.width - 100) / headers.length;

      // Draw headers
      headers.forEach((header, i) => {
        doc.rect(50 + i * colWidth, tableTop, colWidth, rowHeight).fillAndStroke('#f0f0f0', '#000');
        doc.fillColor('black').text(header, 55 + i * colWidth, tableTop + 5, { width: colWidth - 10 });
      });

      // Draw rows
      rows.slice(0, 20).forEach((row, rowIndex) => {
        const y = tableTop + rowHeight + (rowIndex + 1) * rowHeight;
        headers.forEach((header, colIndex) => {
          doc.rect(50 + colIndex * colWidth, y, colWidth, rowHeight).stroke();
          doc.text(String(row?.[header] || ''), 55 + colIndex * colWidth, y + 5, { width: colWidth - 10 });
        });
      });

      if (rows.length > 20) {
        doc.text(`... and ${rows.length - 20} more rows`, 50, doc.y + 10);
      }
      doc.moveDown();
    }

    // Recommendations section
    const recommendations = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];
    if (recommendations.length > 0) {
      doc.fontSize(14).fillColor('blue').text('Recommendations', { underline: true });
      doc.fillColor('black').fontSize(11);
      recommendations.forEach((item, index) => {
        doc.text(`${index + 1}. ${item}`, { indent: 10 });
      });
    }

    // Footer
    doc.fontSize(8).fillColor('gray').text('MediHub Pharmacy Management System', { align: 'center' });

    doc.end();
  });
}

function buildReportExport(reportData, type = 'csv') {
  const exportType = (type || 'csv').toLowerCase();

  switch (exportType) {
    case 'csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.csv`,
        body: toCsvBody(reportData),
      };
    case 'excel':
      return {
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.xls`,
        body: toCsvBody(reportData),
      };
    case 'pdf':
      // PDF is handled separately in the route handler
      return {
        contentType: 'application/pdf',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.pdf`,
        requiresAsync: true // Signal that this needs async handling
      };
    case 'txt':
      return {
        contentType: 'text/plain; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.txt`,
        body: buildTextReport(reportData),
      };
    case 'json':
      return {
        contentType: 'application/json; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.json`,
        body: buildJsonReport(reportData),
      };
    case 'chart':
      return {
        contentType: 'application/json; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.json`,
        body: buildChartPayload(reportData),
      };
    default:
      return {
        contentType: 'application/json; charset=utf-8',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.json`,
        body: buildJsonReport(reportData),
      };
  }
}

async function generateReportExport(req, res) {
  try {
    const payload = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const requestedType = (payload.type || req.query?.type || 'csv').toLowerCase();
    const reportData = payload.report || payload.data || payload;

    if (!SUPPORTED_EXPORT_TYPES.includes(requestedType)) {
      return res.status(400).json({
        error: 'Unsupported export type',
        supported_types: getSupportedExportTypes(),
      });
    }

    if (requestedType === 'pdf') {
      const pdfBuffer = await buildPdfBuffer(reportData);
      return res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.pdf"`)
        .send(pdfBuffer);
    }

    const result = buildReportExport(reportData, requestedType);

    if (typeof result.body === 'string') {
      return res
        .setHeader('Content-Type', result.contentType)
        .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.body);
    }

    return res
      .setHeader('Content-Type', result.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      .json(result.body);
  } catch (error) {
    console.error('Report export generation failed:', error);
    return res.status(500).json({
      error: 'Failed to generate report export',
      detail: error.message,
    });
  }
}

module.exports = {
  getSupportedExportTypes,
  buildReportExport,
  generateReportExport,
  buildPdfBuffer,
};
