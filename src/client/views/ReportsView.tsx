import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, Printer } from 'lucide-react';
import { api } from '../api';
import { formatLKR } from '../../shared/decimal';
import type { Category } from '../../shared/types';

interface ReportsViewProps {
  categories: Category[];
  refreshTrigger: number;
  startDate?: string;
  endDate?: string;
  onDateChange?: (start: string, end: string) => void;
}

const REPORT_TYPES = [
  { id: 'MONTHLY_FINANCIAL', label: '1. Monthly Financial Report' },
  { id: 'YEARLY_FINANCIAL', label: '2. Yearly Financial Report' },
  { id: 'CATEGORY_EXPENSE', label: '3. Category-wise Expense Report' },
  { id: 'INDIVIDUAL_SPENDING', label: '4. Individual Spending Report (Husband vs Wife)' },
  { id: 'LOAN_REPAYMENT', label: '5. Loan Repayment Report' },
  { id: 'SUBSCRIPTION', label: '6. Subscription Report' },
  { id: 'BUDGET_PERFORMANCE', label: '7. Budget Performance Report' },
  { id: 'SAVINGS', label: '8. Savings & Financial Goals Report' },
];

export const ReportsView: React.FC<ReportsViewProps> = ({
  categories,
  refreshTrigger,
  startDate: propStartDate,
  endDate: propEndDate,
  onDateChange,
}) => {
  const [reportType, setReportType] = useState<string>('MONTHLY_FINANCIAL');
  const [internalStartDate, setInternalStartDate] = useState<string>('2026-11-01');
  const [internalEndDate, setInternalEndDate] = useState<string>('2026-11-30');

  const startDate = propStartDate || internalStartDate;
  const endDate = propEndDate || internalEndDate;
  const [categoryId, setCategoryId] = useState<string>('');
  const [memberRole, setMemberRole] = useState<string>('');
  const [transactionType, setTransactionType] = useState<string>('');
  const [reportData, setReportData] = useState<{
    title: string;
    period: { startDate: string; endDate: string; formatted: string };
    summary: any;
    rows: Array<Record<string, string | number>>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getReport({
        reportType,
        startDate,
        endDate,
        categoryId: categoryId || undefined,
        memberRole: memberRole || undefined,
        transactionType: transactionType || undefined,
      })
      .then((res) => setReportData(res))
      .finally(() => setLoading(false));
  }, [reportType, startDate, endDate, categoryId, memberRole, transactionType, refreshTrigger]);

  const handleDownloadCsv = () => {
    if (!reportData || reportData.rows.length === 0) return;
    const cols = Object.keys(reportData.rows[0]);
    const escapeCell = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvLines = [
      cols.map(escapeCell).join(','),
      ...reportData.rows.map((r) => cols.map((c) => escapeCell(r[c])).join(',')),
    ];
    const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType.toLowerCase()}_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (!reportData || reportData.rows.length === 0) return;
    const cols = Object.keys(reportData.rows[0]);
    const escapeHtml = (val: unknown) =>
      String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const htmlTable = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><h3>${escapeHtml(
      reportData.title
    )} (${escapeHtml(reportData.period.formatted)})</h3><table border="1"><thead><tr>${cols
      .map((c) => `<th style="background:#059669;color:#fff;padding:6px;">${escapeHtml(c)}</th>`)
      .join('')}</tr></thead><tbody>${reportData.rows
      .map(
        (r) =>
          `<tr>${cols.map((c) => `<td style="padding:4px;">${escapeHtml(r[c])}</td>`).join('')}</tr>`
      )
      .join('')}</tbody></table></body></html>`;
    const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType.toLowerCase()}_${startDate}_to_${endDate}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const headers = reportData?.rows?.[0] ? Object.keys(reportData.rows[0]) : [];

  return (
    <div className="space-y-6">
      {/* Controls & Export Bar */}
      <div className="no-print bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Financial Reports & Export Center
            </h2>
            <p className="text-xs text-slate-500">
              Generate monthly, yearly, category, member, loan, subscription, budget, and savings statements
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Excel (.xls)
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <Download className="w-4 h-4" /> Export CSV (.csv)
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shadow-sm"
            >
              <Printer className="w-4 h-4" /> Print Report
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-500 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => {
                const rt = e.target.value;
                setReportType(rt);
                if (rt === 'YEARLY_FINANCIAL') {
                  if (onDateChange) {
                    onDateChange('2026-01-01', '2026-12-31');
                  } else {
                    setInternalStartDate('2026-01-01');
                    setInternalEndDate('2026-12-31');
                  }
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
            >
              {REPORT_TYPES.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                onDateChange ? onDateChange(e.target.value, endDate) : setInternalStartDate(e.target.value)
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                onDateChange ? onDateChange(startDate, e.target.value) : setInternalEndDate(e.target.value)
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Household Member</label>
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="">Both (Husband & Wife)</option>
              <option value="HUSBAND">Husband Only</option>
              <option value="WIFE">Wife Only</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Category Filter</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Printable Report Sheet */}
      {reportData && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {reportData.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Reporting Period: {reportData.period.formatted} • Currency: Sri Lankan Rupees (LKR)
              </p>
            </div>

            {reportData.summary && (
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Income: </span>
                  <span className="font-mono font-bold text-emerald-600">
                    {formatLKR(reportData.summary.combinedIncomeLkr)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Expenses: </span>
                  <span className="font-mono font-bold text-rose-600">
                    {formatLKR(reportData.summary.totalExpensesLkr)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Net Cash Flow: </span>
                  <span className="font-mono font-bold text-blue-600">
                    {formatLKR(reportData.summary.cashFlowSurplusLkr)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Generating report...</div>
          ) : reportData.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No records found for the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[11px] font-semibold uppercase text-slate-500">
                    {headers.map((h) => (
                      <th key={h} className="py-3 px-4 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportData.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      {headers.map((h) => {
                        const val = row[h];
                        const isMonetaryCol = h.includes('(LKR)') || h.includes('LKR Amount');
                        return (
                          <td
                            key={h}
                            className={`py-2.5 px-4 whitespace-nowrap ${
                              isMonetaryCol ? 'font-mono font-semibold text-right' : ''
                            }`}
                          >
                            {isMonetaryCol && typeof val === 'number' ? formatLKR(val) : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

