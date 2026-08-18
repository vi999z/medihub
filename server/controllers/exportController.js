const PDFDocument = require('pdfkit');
const ExcelJS    = require('exceljs');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, BorderStyle, WidthType, AlignmentType,
} = require('docx');

const SUPPORTED_EXPORT_TYPES = ['csv', 'excel', 'xlsx', 'pdf', 'txt', 'json', 'word', 'docx', 'chart'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupportedExportTypes() {
  return [...SUPPORTED_EXPORT_TYPES];
}

function toRowsArray(reportData) {
  if (Array.isArray(reportData?.rows))  return reportData.rows;
  if (Array.isArray(reportData?.items)) return reportData.items;
  if (Array.isArray(reportData?.data))  return reportData.data;
  return [];
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function safeSlug(title) {
  return (title || 'report').replace(/\s+/g, '_').toLowerCase();
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function toCsvBody(reportData) {
  const rows = toRowsArray(reportData);
  if (!rows.length) return `${reportData?.title || 'Report'}\nNo data available`;

  const headers = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
  const lines   = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsvValue(row?.[h])).join(','));
  }
  return lines.join('\n');
}

// Parse CSV text → array of row objects (used when AI generated raw CSV)
function parseCsvText(text) {
  const lines   = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim().replace(/^"|"$/g, '')]));
  });
}

// ─── Real Excel (.xlsx) via ExcelJS ──────────────────────────────────────────

async function buildExcelBuffer(reportData) {
  const wb   = new ExcelJS.Workbook();
  wb.creator  = 'MediHub AI';
  wb.created  = new Date();

  const title = reportData?.title || 'Report';
  const ws    = wb.addWorksheet(title.slice(0, 31)); // sheet name max 31 chars

  const rows    = toRowsArray(reportData);
  const summary = reportData?.summary || {};

  // ── Title row ──
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = title;
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FF1D6F42' } };
  titleCell.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 28;

  // ── Generated date ──
  ws.getCell('A2').value = `Generated: ${new Date().toLocaleString()}`;
  ws.getCell('A2').font  = { italic: true, size: 9, color: { argb: 'FF888888' } };
  ws.addRow([]);

  let currentRow = 4;

  // ── Summary section ──
  const summaryEntries = Object.entries(summary);
  if (summaryEntries.length) {
    const hdr = ws.getRow(currentRow);
    hdr.getCell(1).value = 'Summary';
    hdr.getCell(1).font  = { bold: true, size: 11 };
    currentRow++;
    for (const [k, v] of summaryEntries) {
      ws.getRow(currentRow).getCell(1).value = k.replace(/_/g, ' ');
      ws.getRow(currentRow).getCell(2).value = v;
      currentRow++;
    }
    currentRow++;
  }

  // ── Data table ──
  if (rows.length) {
    const headers = [...new Set(rows.flatMap(r => Object.keys(r || {})))];

    // Header row
    const hdrRow = ws.getRow(currentRow);
    headers.forEach((h, i) => {
      const cell = hdrRow.getCell(i + 1);
      cell.value = h;
      cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D6F42' } };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    hdrRow.height = 18;
    currentRow++;

    // Data rows
    rows.forEach((row, ri) => {
      const dataRow = ws.getRow(currentRow);
      headers.forEach((h, i) => {
        const cell = dataRow.getCell(i + 1);
        cell.value = row[h] ?? '';
        if (ri % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7F0' } };
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
          right: { style: 'thin', color: { argb: 'FFDDDDDD' } },
        };
      });
      currentRow++;
    });

    // Auto-width columns
    headers.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(h.length + 2, 12);
    });
  }

  // ── Recommendations ──
  const recs = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];
  if (recs.length) {
    currentRow++;
    ws.getRow(currentRow).getCell(1).value = 'Recommendations';
    ws.getRow(currentRow).getCell(1).font  = { bold: true, size: 11 };
    currentRow++;
    recs.forEach((r, i) => {
      ws.getRow(currentRow).getCell(1).value = `${i + 1}. ${r}`;
      currentRow++;
    });
  }

  return wb.xlsx.writeBuffer();
}

// ─── Real Word (.docx) via docx ───────────────────────────────────────────────

async function buildWordBuffer(reportData) {
  const title   = reportData?.title || 'Report';
  const rows    = toRowsArray(reportData);
  const summary = reportData?.summary || {};
  const recs    = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];

  const children = [];

  // Title
  children.push(new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, italics: true, size: 18, color: '888888' })],
    alignment: AlignmentType.CENTER,
  }));
  children.push(new Paragraph(''));

  // Summary
  const summaryEntries = Object.entries(summary);
  if (summaryEntries.length) {
    children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }));
    summaryEntries.forEach(([k, v]) => {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${k.replace(/_/g, ' ')}: `, bold: true }),
          new TextRun(String(v)),
        ],
      }));
    });
    children.push(new Paragraph(''));
  }

  // Data table
  if (rows.length) {
    const headers = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
    children.push(new Paragraph({ text: 'Data', heading: HeadingLevel.HEADING_2 }));

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    const cellBorders = { top: border, bottom: border, left: border, right: border };

    const tableRows = [
      // Header row
      new TableRow({
        children: headers.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF' })] })],
          shading: { fill: '1D6F42' },
          borders: cellBorders,
        })),
        tableHeader: true,
      }),
      // Data rows
      ...rows.map(row => new TableRow({
        children: headers.map(h => new TableCell({
          children: [new Paragraph(String(row[h] ?? ''))],
          borders: cellBorders,
        })),
      })),
    ];

    children.push(new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
    children.push(new Paragraph(''));
  }

  // Recommendations
  if (recs.length) {
    children.push(new Paragraph({ text: 'Recommendations', heading: HeadingLevel.HEADING_2 }));
    recs.forEach((r, i) => {
      children.push(new Paragraph({ children: [new TextRun(`${i + 1}. ${r}`)] }));
    });
  }

  // Footer
  children.push(new Paragraph(''));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'MediHub Pharmacy Management System', italics: true, size: 16, color: 'AAAAAA' })],
    alignment: AlignmentType.CENTER,
  }));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ─── PDF (pdfkit) ─────────────────────────────────────────────────────────────

function buildPdfBuffer(reportData) {
  const doc    = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title = reportData?.title || 'Pharmacy Health Report';
    const GREEN = '#1D6F42';

    // Header band
    doc.rect(0, 0, doc.page.width, 60).fill(GREEN);
    doc.fillColor('#FFFFFF').fontSize(18).text(title, 50, 18, { align: 'center' });
    doc.fillColor('#DDFFDD').fontSize(9).text(`Generated: ${new Date().toLocaleString()}`, 50, 40, { align: 'center' });
    doc.moveDown(2);

    // Summary
    const summary = reportData?.summary || {};
    const entries = Object.entries(summary);
    if (entries.length) {
      doc.fillColor(GREEN).fontSize(13).text('Summary', { underline: true });
      doc.fillColor('#333333').fontSize(10);
      entries.forEach(([k, v]) => doc.text(`  ${k.replace(/_/g, ' ')}: ${v}`));
      doc.moveDown();
    }

    // Data table
    const rows = toRowsArray(reportData);
    if (rows.length) {
      doc.fillColor(GREEN).fontSize(13).text('Data', { underline: true });
      doc.moveDown(0.3);

      const headers  = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
      const colW     = Math.min(120, (doc.page.width - 100) / headers.length);
      const rowH     = 18;
      let   y        = doc.y;

      // Header row
      headers.forEach((h, i) => {
        doc.rect(50 + i * colW, y, colW, rowH).fill(GREEN);
        doc.fillColor('#FFFFFF').fontSize(8).text(
          h, 53 + i * colW, y + 5, { width: colW - 6, ellipsis: true }
        );
      });
      y += rowH;

      // Data rows (max 40 to avoid page overflow)
      rows.slice(0, 40).forEach((row, ri) => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
        headers.forEach((h, i) => {
          if (ri % 2 === 0) doc.rect(50 + i * colW, y, colW, rowH).fill('#F0F7F0');
          doc.rect(50 + i * colW, y, colW, rowH).stroke('#CCCCCC');
          doc.fillColor('#333333').fontSize(8).text(
            String(row[h] ?? ''), 53 + i * colW, y + 5, { width: colW - 6, ellipsis: true }
          );
        });
        y += rowH;
      });
      if (rows.length > 40) {
        doc.fillColor('#888888').fontSize(8).text(`… and ${rows.length - 40} more rows`, 50, y + 4);
      }
      doc.moveDown(2);
    }

    // Recommendations
    const recs = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];
    if (recs.length) {
      doc.fillColor(GREEN).fontSize(13).text('Recommendations', { underline: true });
      doc.fillColor('#333333').fontSize(10);
      recs.forEach((r, i) => doc.text(`${i + 1}. ${r}`, { indent: 10 }));
    }

    // Footer
    doc.fillColor('#AAAAAA').fontSize(8).text('MediHub Pharmacy Management System', 50, doc.page.height - 40, { align: 'center' });
    doc.end();
  });
}

// ─── TXT ─────────────────────────────────────────────────────────────────────

function buildTextReport(reportData) {
  const title   = reportData?.title || 'Pharmacy report';
  const summary = reportData?.summary || {};
  const recs    = Array.isArray(reportData?.recommendations) ? reportData.recommendations : [];
  const lines   = [title, '='.repeat(title.length), ''];

  if (Object.keys(summary).length) {
    lines.push('Summary', '-'.repeat(7));
    for (const [k, v] of Object.entries(summary))
      lines.push(`  ${k.replace(/_/g, ' ')}: ${v}`);
    lines.push('');
  }

  const rows = toRowsArray(reportData);
  if (rows.length) {
    const headers = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
    lines.push('Data', '-'.repeat(4));
    lines.push(headers.join('\t'));
    rows.forEach(row => lines.push(headers.map(h => row[h] ?? '').join('\t')));
    lines.push('');
  }

  if (recs.length) {
    lines.push('Recommendations', '-'.repeat(15));
    recs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  return lines.join('\n');
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

function buildJsonReport(reportData) {
  return {
    title:           reportData?.title || 'Pharmacy Report',
    generated_at:    new Date().toISOString(),
    summary:         reportData?.summary || {},
    rows:            toRowsArray(reportData),
    recommendations: Array.isArray(reportData?.recommendations) ? reportData.recommendations : [],
    trend:           Array.isArray(reportData?.trend) ? reportData.trend : [],
  };
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function buildChartPayload(reportData) {
  const title  = reportData?.title || 'Analytics';
  const trend  = Array.isArray(reportData?.trend) ? reportData.trend : [];
  const labels = trend.map(p => p?.label ?? p?.date ?? p?.name ?? '');
  const data   = trend.map(p => Number(p?.value ?? p?.total ?? p?.units_sold ?? p?.count ?? 0));
  return { type: 'bar', title, labels, datasets: [{ label: title, data }] };
}

// ─── Normalise incoming content into a reportData object ─────────────────────
// When the AI generates raw CSV text, convert it to { title, rows } so the
// export builders have structured data to work with.
function normaliseContent(content) {
  if (!content) return { title: 'Report', rows: [] };
  if (typeof content === 'object' && !Array.isArray(content)) return content;
  if (typeof content === 'string') {
    // Try JSON
    try { return JSON.parse(content); } catch {}
    // Try CSV
    const rows = parseCsvText(content);
    if (rows.length) return { title: 'Report', rows };
    // Plain text → wrap as a summary
    return { title: 'Report', summary: { content } };
  }
  return { title: 'Report', rows: [] };
}

// ─── buildReportExport (sync, non-binary formats) ────────────────────────────

function buildReportExport(rawContent, type = 'csv') {
  const exportType  = (type || 'csv').toLowerCase();
  const reportData  = normaliseContent(rawContent);
  const slug        = safeSlug(reportData?.title);

  switch (exportType) {
    case 'csv':
      return { contentType: 'text/csv; charset=utf-8', filename: `${slug}.csv`, body: toCsvBody(reportData) };
    case 'txt':
      return { contentType: 'text/plain; charset=utf-8', filename: `${slug}.txt`, body: buildTextReport(reportData) };
    case 'json':
      return { contentType: 'application/json; charset=utf-8', filename: `${slug}.json`, body: buildJsonReport(reportData) };
    case 'chart':
      return { contentType: 'application/json; charset=utf-8', filename: `${slug}_chart.json`, body: buildChartPayload(reportData) };
    default:
      return { contentType: 'text/csv; charset=utf-8', filename: `${slug}.csv`, body: toCsvBody(reportData) };
  }
}

// ─── buildBinaryExport (async, binary formats) ───────────────────────────────

async function buildBinaryExport(rawContent, type, filename) {
  const exportType = (type || 'xlsx').toLowerCase();
  const reportData = normaliseContent(rawContent);
  const slug       = filename ? filename.replace(/\.[^.]+$/, '') : safeSlug(reportData?.title);

  switch (exportType) {
    case 'excel':
    case 'xlsx': {
      const buf = await buildExcelBuffer(reportData);
      return {
        buffer:      buf,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename:    `${slug}.xlsx`,
      };
    }
    case 'word':
    case 'docx': {
      const buf = await buildWordBuffer(reportData);
      return {
        buffer:      buf,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename:    `${slug}.docx`,
      };
    }
    case 'pdf': {
      const buf = await buildPdfBuffer(reportData);
      return { buffer: buf, contentType: 'application/pdf', filename: `${slug}.pdf` };
    }
    default:
      throw new Error(`Unsupported binary format: ${exportType}`);
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

async function generateReportExport(req, res) {
  try {
    const payload     = req.method === 'GET' ? (req.query || {}) : (req.body || {});
    const type        = (payload.type || req.query?.type || 'csv').toLowerCase();
    const reportData  = payload.report || payload.data || payload;

    if (!SUPPORTED_EXPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Unsupported export type', supported_types: getSupportedExportTypes() });
    }

    const BINARY = ['pdf', 'excel', 'xlsx', 'word', 'docx'];
    if (BINARY.includes(type)) {
      const { buffer, contentType, filename } = await buildBinaryExport(reportData, type, payload.filename);
      return res
        .setHeader('Content-Type', contentType)
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    }

    const result = buildReportExport(reportData, type);
    return res
      .setHeader('Content-Type', result.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2));

  } catch (err) {
    console.error('Report export generation failed:', err);
    return res.status(500).json({ error: 'Failed to generate report export', detail: err.message });
  }
}

module.exports = {
  getSupportedExportTypes,
  buildReportExport,
  buildBinaryExport,
  buildExcelBuffer,
  buildWordBuffer,
  buildPdfBuffer,
  generateReportExport,
  normaliseContent,
};
