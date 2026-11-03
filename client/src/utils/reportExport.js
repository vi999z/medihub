import api from '../api/axios';
import { downloadBlob } from './downloadFile';
import { localDateKey, addDays } from './date';

// Every report the server can produce. `branch` / `period` say which of the
// panel's filters apply to it, so a filter that does nothing is never shown.
export const REPORT_GROUPS = [
  { label: 'Sales', reports: [
    { key: 'sales', label: 'Sales by medicine', hint: 'Units sold and returned, net sales and estimated profit for each medicine.', endpoint: '/reports/export/sales', branch: true, period: true },
  ] },
  { label: 'Stock', reports: [
    { key: 'batches', label: 'Batches by status', hint: 'Every batch with its quantity, price and expiry date.', endpoint: '/reports/export/batches', branch: true, status: true },
    { key: 'inventory-value', label: 'Inventory value', hint: 'What the stock on hand is worth, at cost and at retail price.', endpoint: '/reports/export/inventory-value', branch: true },
    { key: 'low-stock', label: 'Low stock', hint: 'Medicines at or below their reorder level, including those out of stock.', endpoint: '/reports/export/low-stock', branch: true },
  ] },
  { label: 'Expiry and waste', reports: [
    { key: 'expiring', label: 'Expiring soon (14 days)', hint: 'Batches that expire within the next two weeks.', endpoint: '/reports/export/expiring?days=14', branch: true },
    { key: 'wasted', label: 'Wasted medicines', hint: 'Stock that was disposed of or expired on the shelf, with its cost.', endpoint: '/reports/export/wasted', branch: true },
  ] },
  { label: 'Activity', reports: [
    { key: 'transactions', label: 'Stock movements', hint: 'Stock in, sales, adjustments, disposals and returns.', endpoint: '/reports/export/transactions', branch: true, period: true },
    { key: 'notifications', label: 'Alerts', hint: 'Low-stock, near-expiry and expired alerts.', endpoint: '/reports/export/notifications' },
  ] },
];

export const REPORTS = REPORT_GROUPS.flatMap((g) => g.reports);

export const FORMATS = [
  { value: 'excel', label: 'Excel', ext: 'xlsx' },
  { value: 'pdf', label: 'PDF', ext: 'pdf' },
  { value: 'docx', label: 'Word', ext: 'docx' },
  { value: 'csv', label: 'CSV', ext: 'csv' },
];

export const BATCH_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'recalled', label: 'Recalled' },
];

export const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Choose dates…' },
];

// The first and last day (YYYY-MM-DD) of a period choice.
export function periodRange(period, customFrom, customTo) {
  const today = localDateKey();
  switch (period) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom': return { from: customFrom, to: customTo };
    default: return { from: addDays(today, -29), to: today };
  }
}

// Checks the choices and returns a message for the first problem, or ''.
export function checkReportChoices(report, { period, from, to }) {
  if (!report.period || period !== 'custom') return '';
  if (!from || !to) return 'Choose both a start and an end date.';
  if (from > to) return 'The start date must not be after the end date.';
  if ((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000 >= 366) return 'Choose a period of one year or less.';
  return '';
}

// Downloads one report. Throws (with a readable server message) if it fails.
export async function downloadReport({ report, format, branch, period, from, to, status }) {
  const meta = REPORTS.find((r) => r.key === report);
  const fmt = FORMATS.find((f) => f.value === format);
  if (!meta || !fmt) throw new Error('Unknown report or format');

  const params = new URLSearchParams({ format });
  if (meta.branch && branch && branch !== 'all') params.set('branch', branch);
  if (meta.period) {
    const range = periodRange(period, from, to);
    params.set('from', range.from);
    params.set('to', range.to);
  }
  if (meta.status && status) params.set('status', status);

  const joiner = meta.endpoint.includes('?') ? '&' : '?';
  const res = await api.get(`${meta.endpoint}${joiner}${params}`, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
  const branchPart = meta.branch ? `_${branch && branch !== 'all' ? branch.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all-branches'}` : '';
  downloadBlob(blob, `${meta.key}${meta.status && status ? `-${status}` : ''}${branchPart}_${localDateKey()}.${fmt.ext}`);
}
