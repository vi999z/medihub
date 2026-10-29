const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun } = require('docx');
const ExcelJS = require('exceljs');

const SUPPORTED_EXPORT_TYPES = ['csv', 'excel', 'xlsx', 'pdf', 'docx', 'word', 'txt', 'json', 'chart'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupportedExportTypes() {
  return [...SUPPORTED_EXPORT_TYPES];
}

// Readable column header from a field name: "quantity_remaining" -> "Quantity Remaining".
function humanizeHeader(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// One table cell as text: dates as YYYY-MM-DD, 0 kept (not blanked), objects summarised.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  // Full ISO timestamps read better as date + time.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ? text.slice(0, 16).replace('T', ' ') : text;
}

// PDFKit's built-in fonts have no peso sign (it prints as "±").
function pdfText(value) {
  return cellText(value).replace(/₱/g, 'PHP ');
}

function toRowsArray(reportData) {
  if (Array.isArray(reportData?.rows)) return reportData.rows;
  if (Array.isArray(reportData?.items)) return reportData.items;
  if (Array.isArray(reportData?.data)) return reportData.data;
  return [];
}

function normalizeReportData(reportData) {
  if (reportData && typeof reportData === 'object' && !Buffer.isBuffer(reportData)) {
    const nestedData = reportData.data && typeof reportData.data === 'object' && !Array.isArray(reportData.data)
      ? reportData.data
      : {};
    const analysis = reportData.analysis && typeof reportData.analysis === 'object'
      ? reportData.analysis
      : {};

    return {
      ...reportData,
      summary: reportData.summary || reportData.current_state || {},
      rows: toRowsArray(reportData).length > 0
        ? toRowsArray(reportData)
        : Object.entries(nestedData).flatMap(([section, value]) =>
          Array.isArray(value) ? value.map((item) => ({ section, ...item })) : []
        ),
      recommendations: reportData.recommendations || analysis.recommendations || [],
      executive_summary: reportData.executive_summary || '',
      comparisons: reportData.comparisons || {},
      category_analysis: Array.isArray(reportData.category_analysis) ? reportData.category_analysis : [],
      sections: reportData.sections || {},
      charts: reportData.charts || {},
      data_quality: Array.isArray(reportData.data_quality) ? reportData.data_quality : [],
      key_insights: reportData.key_insights || analysis.key_insights || [],
      prioritized_actions: reportData.prioritized_actions || analysis.prioritized_actions || [],
      opportunities: reportData.opportunities || analysis.opportunities || [],
    };
  }

  if (typeof reportData === 'string') {
    try {
      return normalizeReportData(JSON.parse(reportData));
    } catch {
      return { title: 'MediHub Report', summary: {}, notes: reportData };
    }
  }

  return { title: 'MediHub Report', summary: {} };
}

function chartSvg(title, points = [], valueKey = 'value') {
  const width = 720;
  const height = 240;
  const chartHeight = 150;
  const max = Math.max(1, ...points.map(point => Number(point[valueKey]) || 0));
  const barWidth = points.length ? Math.max(18, Math.floor(660 / points.length) - 8) : 24;
  const bars = points.slice(0, 12).map((point, index) => {
    const value = Number(point[valueKey]) || 0;
    const barHeight = Math.max(2, (value / max) * chartHeight);
    const x = 40 + index * (barWidth + 8);
    const y = 180 - barHeight;
    const label = String(point.label || '').slice(0, 12);
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#0f766e"/><text x="${x + barWidth / 2}" y="198" text-anchor="middle" font-size="10" fill="#334155">${label}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="20" y="24" font-family="Arial" font-size="16" font-weight="700" fill="#172033">${title}</text><line x1="40" y1="180" x2="700" y2="180" stroke="#94a3b8"/>${bars}</svg>`;
}

function addPdfBarChart(doc, title, points = [], valueKey = 'value') {
  if (!points.length) return;
  const left = 50;
  const top = doc.y + 8;
  const width = doc.page.width - 100;
  const height = 150;
  const max = Math.max(1, ...points.map(point => Number(point[valueKey]) || 0));
  const barWidth = Math.max(12, Math.min(42, (width - 20) / Math.min(points.length, 12) - 8));
  doc.fontSize(13).fillColor('#1e40af').text(title, left, top);
  points.slice(0, 12).forEach((point, index) => {
    const value = Number(point[valueKey]) || 0;
    const barHeight = Math.max(2, (value / max) * height);
    const x = left + 10 + index * (barWidth + 8);
    const y = top + 25 + height - barHeight;
    doc.rect(x, y, barWidth, barHeight).fill('#0f766e');
    doc.fontSize(7).fillColor('#334155').text(String(point.label || '').slice(0, 10), x - 4, top + height + 32, { width: barWidth + 8, align: 'center' });
  });
  doc.moveDown(9);
}

function sectionRows(reportData) {
  const sections = reportData.sections || {};
  return [
    ['Critical - needs immediate action', sections.critical || []],
    ['Expiring soon', sections.expiring_soon || []],
    ['Low stock - monitor', sections.low_stock_monitor || []],
    ['Healthy stock', sections.healthy_stock || []],
  ].filter(([, rows]) => rows.length > 0);
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ─── CSV Generation ─────────────────────────────────────────────────────────

function toCsvBody(reportData) {
  const rows = toRowsArray(reportData);
  if (!rows.length) return `${reportData?.title || 'Report'}\nNo data available`;

  const headers = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsvValue(row?.[h])).join(','));
  }
  return lines.join('\n');
}

// ─── Text Report Generation ─────────────────────────────────────────────────

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

// ─── JSON Report Generation ────────────────────────────────────────────────

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

// ─── Chart Data Generation ─────────────────────────────────────────────────

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

// ─── PDF Generation (Enhanced with Professional Formatting) ────────────────

function buildPdfBuffer(reportData) {
  reportData = normalizeReportData(reportData);
  const tableRows = toRowsArray(reportData);
  const tableHeaders = [...new Set(tableRows.flatMap((row) => Object.keys(row || {})))];
  // Wide tables get a landscape page so columns stay readable.
  const doc = new PDFDocument({ margin: 50, size: 'A4', layout: tableHeaders.length > 6 ? 'landscape' : 'portrait' });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error) => reject(error));

    // Enhanced Header with branding
    doc.fontSize(20).fillColor('#2563eb').text(pdfText(reportData?.title || 'Pharmacy Health Report'), { align: 'center' });
    doc.fontSize(10).fillColor('gray').text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown();
    doc.moveDown();

    if (reportData.executive_summary) {
      doc.fontSize(16).fillColor('#1e40af').text('Executive Summary', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#172033').text(pdfText(reportData.executive_summary), { lineGap: 3 });
      doc.moveDown();
    }

    // Executive Summary section with better formatting
    const summary = reportData?.summary || {};
    const entries = Object.entries(summary);
    if (entries.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Current Snapshot', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      entries.forEach(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ').toUpperCase();
        doc.fillColor('#4b5563').text(`${formattedKey}:`, { continued: true });
        doc.fillColor('#1e293b').text(` ${pdfText(value)}`);
      });
      doc.moveDown();
    }

    if (reportData.comparisons && Object.keys(reportData.comparisons).length > 0) {
      doc.fontSize(14).fillColor('#1e40af').text('Trend and Comparison Context', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#172033');
      Object.entries(reportData.comparisons).forEach(([key, value]) => doc.text(`${key.replace(/_/g, ' ')}: ${value}`));
      doc.moveDown();
    }

    addPdfBarChart(doc, 'Stock by Category', reportData.charts?.category_stock);
    addPdfBarChart(doc, 'Recent Demand by Category', reportData.charts?.category_demand);

    // Key Insights section
    if (reportData?.key_insights && reportData.key_insights.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Key Insights', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      reportData.key_insights.forEach((insight, index) => {
        doc.text(`${index + 1}. ${insight}`, { indent: 10 });
      });
      doc.moveDown();
    }

    const groupedSections = sectionRows(reportData);
    if (groupedSections.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Inventory Sections', { underline: true });
      doc.moveDown(0.3);
      groupedSections.forEach(([sectionTitle, rows]) => {
        doc.fontSize(13).fillColor('#172033').text(sectionTitle);
        doc.fontSize(10).fillColor('#334155');
        rows.slice(0, 12).forEach(row => {
          const urgency = row.priority ? `[${String(row.priority).toUpperCase()}] ` : '';
          const stockout = row.days_to_stockout?.value === null ? 'no recent demand' : `${row.days_to_stockout?.value ?? 'n/a'} days to stockout`;
          doc.text(`${urgency}${row.name || row.medicine_name || 'Item'} - ${row.current_stock ?? row.quantity_remaining ?? 0} units, ${stockout}`);
        });
        doc.moveDown(0.5);
      });
    }

    // Detailed data table: wraps long values, grows rows to fit, and starts a
    // new page (repeating the header row) when it runs out of room.
    const rows = tableRows;
    if (rows.length > 0) {
      const MAX_ROWS = 500;
      const left = doc.page.margins.left;
      const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const headers = tableHeaders;
      const colWidth = tableWidth / headers.length;
      const fontSize = headers.length > 10 ? 7 : headers.length > 6 ? 8 : 9;
      const pad = 4;
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const rowHeightFor = (texts, font) => {
        doc.font(font).fontSize(fontSize);
        return Math.max(...texts.map((t) => doc.heightOfString(t, { width: colWidth - pad * 2 }))) + pad * 2;
      };

      const drawHeader = (y) => {
        const labels = headers.map(humanizeHeader);
        const h = rowHeightFor(labels, 'Helvetica-Bold');
        labels.forEach((label, i) => {
          doc.rect(left + i * colWidth, y, colWidth, h).fillAndStroke('#3b82f6', '#1e40af');
          doc.fillColor('white').font('Helvetica-Bold').fontSize(fontSize)
            .text(label, left + i * colWidth + pad, y + pad, { width: colWidth - pad * 2 });
        });
        return y + h;
      };

      doc.x = left;
      doc.fontSize(16).fillColor('#1e40af').text('Detailed Data', { underline: true });
      doc.moveDown(0.5);
      let y = drawHeader(doc.y);

      rows.slice(0, MAX_ROWS).forEach((row, rowIndex) => {
        const texts = headers.map((header) => pdfText(row?.[header]));
        const h = rowHeightFor(texts, 'Helvetica');
        if (y + h > bottom()) {
          doc.addPage();
          y = drawHeader(doc.page.margins.top);
        }
        if (rowIndex % 2 === 0) doc.rect(left, y, tableWidth, h).fill('#f1f5f9');
        texts.forEach((text, colIndex) => {
          doc.lineWidth(0.5).strokeColor('#cbd5e1').rect(left + colIndex * colWidth, y, colWidth, h).stroke();
          // Set the text colour after the stripe fill, or the text inherits it.
          doc.fillColor('#0f172a').font('Helvetica').fontSize(fontSize)
            .text(text, left + colIndex * colWidth + pad, y + pad, { width: colWidth - pad * 2 });
        });
        y += h;
      });

      doc.x = left;
      doc.y = y + 8;
      if (rows.length > MAX_ROWS) {
        doc.fontSize(9).fillColor('#475569').text(`... and ${rows.length - MAX_ROWS} more rows (export to Excel for the full list)`);
      }
      doc.moveDown();
    }

    // Prioritized Actions section
    if (reportData?.prioritized_actions && reportData.prioritized_actions.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Prioritized Actions', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      reportData.prioritized_actions.forEach((action, index) => {
        const priorityColor = action.priority === 'CRITICAL' ? '#dc2626' : action.priority === 'HIGH' ? '#ea580c' : '#059669';
        doc.fillColor(priorityColor).text(`[${action.priority}]`, { continued: true });
        doc.fillColor('#1e293b').text(` ${action.action}`);
        doc.moveDown(2);
      });
      doc.moveDown();
    }

    // Recommendations section
    const recommendations = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];
    if (recommendations.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Recommendations', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      recommendations.forEach((item, index) => {
        doc.text(`${index + 1}. ${item}`, { indent: 10 });
      });
      doc.moveDown();
    }

    if (reportData?.notes) {
      doc.fontSize(16).fillColor('#1e40af').text('Report Notes', { underline: true });
      doc.moveDown();
      doc.fontSize(11).fillColor('#1e293b').text(String(reportData.notes));
      doc.moveDown();
    }

    // Opportunities section
    if (reportData?.opportunities && reportData.opportunities.length > 0) {
      doc.fontSize(16).fillColor('#1e40af').text('Opportunities', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      reportData.opportunities.forEach((opportunity, index) => {
        doc.text(`${index + 1}. ${opportunity}`, { indent: 10 });
      });
      doc.moveDown();
    }

    // Footer — full width, from the left margin (the table leaves the cursor in its last column).
    const footerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.x = doc.page.margins.left;
    doc.fontSize(8).fillColor('gray').text('MediHub Pharmacy Management System - Confidential Report', doc.page.margins.left, doc.y, { width: footerWidth, align: 'center' });
    // Only reports with an AI-written summary carry the AI disclaimer.
    if (reportData.executive_summary || reportData.ai_generated) {
      doc.text('Includes AI-generated content - review before distribution', { width: footerWidth, align: 'center' });
    }

    doc.end();
  });
}

// ─── Word Document Generation (DOCX) ─────────────────────────────────────────

async function buildWordDocument(reportData) {
  reportData = normalizeReportData(reportData);
  const chartFallback = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const chartImage = (title, points, valueKey = 'value') => points?.length
    ? new Paragraph({ children: [new ImageRun({ type: 'svg', data: `data:image/svg+xml;base64,${Buffer.from(chartSvg(title, points, valueKey)).toString('base64')}`, transformation: { width: 620, height: 207 }, fallback: { type: 'png', data: chartFallback } })], spacing: { before: 100, after: 200 } })
    : null;
  const groupedSections = sectionRows(reportData);
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: reportData?.title || 'Pharmacy Report',
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        }),
        new Paragraph({
          text: `Generated: ${new Date().toLocaleDateString()}`,
          spacing: { after: 400 }
        }),

        ...(reportData.executive_summary ? [
          new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
          new Paragraph({ text: reportData.executive_summary, spacing: { after: 250 } })
        ] : []),

        // Current snapshot
        new Paragraph({
          text: 'Current Snapshot',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        }),

        ...Object.entries(reportData?.summary || {}).map(([key, value]) =>
          new Paragraph({
            children: [
              new TextRun({
                text: `${key.replace(/_/g, ' ').toUpperCase()}: `,
                bold: true
              }),
              new TextRun(String(value))
            ],
            spacing: { after: 100 }
          })
        ),

        ...(reportData.comparisons && Object.keys(reportData.comparisons).length > 0 ? [
          new Paragraph({ text: 'Trend and Comparison Context', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
          ...Object.entries(reportData.comparisons).map(([key, value]) => new Paragraph({ text: `${key.replace(/_/g, ' ')}: ${value}`, spacing: { after: 80 } }))
        ] : []),

        ...(chartImage('Stock by Category', reportData.charts?.category_stock) ? [chartImage('Stock by Category', reportData.charts?.category_stock)] : []),
        ...(chartImage('Recent Demand by Category', reportData.charts?.category_demand) ? [chartImage('Recent Demand by Category', reportData.charts?.category_demand)] : []),

        ...(groupedSections.length > 0 ? [
          new Paragraph({ text: 'Inventory Sections', heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
          ...groupedSections.flatMap(([sectionTitle, rows]) => [
            new Paragraph({ text: sectionTitle, heading: HeadingLevel.HEADING_3, spacing: { before: 150, after: 80 } }),
            ...rows.slice(0, 12).map(row => new Paragraph({ text: `${row.priority ? `[${String(row.priority).toUpperCase()}] ` : ''}${row.name || row.medicine_name || 'Item'} - ${row.current_stock ?? row.quantity_remaining ?? 0} units`, bullet: { level: 0 }, spacing: { after: 70 } }))
          ])
        ] : []),

        // Detailed Data Table
        ...(toRowsArray(reportData).length > 0 ? [
          new Paragraph({
            text: 'Detailed Data',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),

          new Table({
            rows: [
              new TableRow({
                children: [...new Set(toRowsArray(reportData).flatMap(row => Object.keys(row || {})))].map(header =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: humanizeHeader(header), bold: true })] })],
                    width: { size: 25, type: WidthType.PERCENTAGE },
                    shading: { fill: 'f0f0f0' }
                  })
                )
              }),
              ...toRowsArray(reportData).slice(0, 200).map(row =>
                new TableRow({
                  children: [...new Set(toRowsArray(reportData).flatMap(item => Object.keys(item || {})))].map(key =>
                    new TableCell({
                      children: [new Paragraph(cellText(row?.[key]))],
                      width: { size: 25, type: WidthType.PERCENTAGE }
                    })
                  )
                })
              )
            ],
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          ...(toRowsArray(reportData).length > 200 ? [
            new Paragraph({ text: `... and ${toRowsArray(reportData).length - 200} more rows (export to Excel for the full list)`, spacing: { before: 100 } }),
          ] : []),
        ] : []),

        // Recommendations
        ...(Array.isArray(reportData?.recommendations) && reportData.recommendations.length > 0 ? [
          new Paragraph({
            text: 'Recommendations',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),

          ...reportData.recommendations.map((item, index) =>
            new Paragraph({
              text: `${index + 1}. ${item}`,
              bullet: { level: 0 },
              spacing: { after: 100 }
            })
          )
        ] : []),

        // Footer
        new Paragraph({
          text: 'MediHub Pharmacy Management System',
          spacing: { before: 800, after: 100 },
          alignment: 'center',
          size: 18
        }),

        ...(reportData?.notes ? [
          new Paragraph({
            text: String(reportData.notes),
            spacing: { before: 400 }
          })
        ] : [])
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// ─── Enhanced Excel Generation (XLSX) ───────────────────────────────────────

async function buildExcelWorkbook(reportData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  // Add title and metadata
  worksheet.mergeCells('A1:D1');
  worksheet.getCell('A1').value = reportData?.title || 'Pharmacy Report';
  worksheet.getCell('A1').font = { bold: true, size: 16 };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  worksheet.mergeCells('A2:D2');
  worksheet.getCell('A2').value = `Generated: ${new Date().toLocaleDateString()}`;
  worksheet.getCell('A2').alignment = { horizontal: 'center' };

  // Add Executive Summary
  let row = 4;
  worksheet.getCell(`A${row}`).value = 'Executive Summary';
  worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
  row++;

  Object.entries(reportData?.summary || {}).forEach(([key, value]) => {
    worksheet.getCell(`A${row}`).value = key.replace(/_/g, ' ').toUpperCase();
    worksheet.getCell(`B${row}`).value = value;
    worksheet.getCell(`A${row}`).font = { bold: true };
    row++;
  });

  row++;

  // Add detailed data table
  const rows = toRowsArray(reportData);
  if (rows.length > 0) {
    worksheet.getCell(`A${row}`).value = 'Detailed Data';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row++;

    const headers = [...new Set(rows.flatMap(row => Object.keys(row || {})))];
    headers.forEach((header, colIndex) => {
      const cell = worksheet.getRow(row).getCell(colIndex + 1);
      cell.value = humanizeHeader(header);
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' }
      };
    });
    row++;

    // Excel is the full-detail export, so every row is included. Numbers stay
    // numeric (and 0 stays 0) so they can be summed in the spreadsheet.
    rows.forEach((dataRow) => {
      headers.forEach((header, colIndex) => {
        const value = dataRow?.[header];
        worksheet.getRow(row).getCell(colIndex + 1).value = typeof value === 'number' ? value : cellText(value);
      });
      row++;
    });
    headers.forEach((header, colIndex) => {
      const column = worksheet.getColumn(colIndex + 1);
      column.width = Math.max(column.width || 0, Math.min(40, humanizeHeader(header).length + 4));
    });
  }

  // Add Recommendations
  if (Array.isArray(reportData?.recommendations) && reportData.recommendations.length > 0) {
    row++;
    worksheet.getCell(`A${row}`).value = 'Recommendations';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row++;

    reportData.recommendations.forEach((item, index) => {
      worksheet.getCell(`A${row}`).value = `${index + 1}. ${item}`;
      row++;
    });
  }

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

// ─── Main Export Function ─────────────────────────────────────────────────

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
    case 'xlsx':
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.xlsx`,
        requiresAsync: true
      };
    case 'pdf':
      return {
        contentType: 'application/pdf',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.pdf`,
        requiresAsync: true
      };
    case 'docx':
    case 'word':
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.docx`,
        requiresAsync: true
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

// ─── API Handler ─────────────────────────────────────────────────────────

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

    // Handle async file generation (PDF, Excel, Word)
    if (requestedType === 'pdf') {
      const pdfBuffer = await buildPdfBuffer(reportData);
      return res
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.pdf"`)
        .send(pdfBuffer);
    }

    if (requestedType === 'xlsx' || requestedType === 'excel') {
      const excelBuffer = await buildExcelWorkbook(reportData);
      return res
        .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .setHeader('Content-Disposition', `attachment; filename="${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.xlsx"`)
        .send(excelBuffer);
    }

    if (requestedType === 'docx' || requestedType === 'word') {
      const wordBuffer = await buildWordDocument(reportData);
      return res
        .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .setHeader('Content-Disposition', `attachment; filename="${(reportData?.title || 'report').replace(/\s+/g, '_').toLowerCase()}.docx"`)
        .send(wordBuffer);
    }

    // Handle synchronous file generation (CSV, TXT, JSON, Chart)
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
  buildWordDocument,
  buildExcelWorkbook,
  normalizeReportData,
};