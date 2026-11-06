import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  PiggyBank,
  ShieldCheck,
  AlertTriangle,
  Info,
  Calendar,
  Plus,
  CheckCircle2,
  Clock,
  Users,
  CreditCard,
  ArrowRightLeft,
  Receipt,
  Scale,
  Edit,
} from 'lucide-react';
import { api } from '../api';
import { formatDateSL, formatLKR } from '../../shared/decimal';
import { AccountReconcileModal } from '../components/AccountReconcileModal';
import { EditAccountModal } from '../components/EditAccountModal';
import type { Account, DashboardSummary, TransactionType } from '../../shared/types';

interface DashboardViewProps {
  refreshTrigger: number;
  onQuickAdd: (type: TransactionType) => void;
  onNavigate: (tab: string) => void;
}

type FilterPreset = 'CURRENT_MONTH' | 'PREV_MONTH' | 'LAST_3M' | 'LAST_6M' | 'CURRENT_YEAR' | 'CUSTOM';

export const DashboardView: React.FC<DashboardViewProps> = ({
  refreshTrigger,
  onQuickAdd,
  onNavigate,
}) => {
  // Default to November 2026
  const [preset, setPreset] = useState<FilterPreset>('CURRENT_MONTH');
  const [startDate, setStartDate] = useState<string>('2026-11-01');
  const [endDate, setEndDate] = useState<string>('2026-11-30');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [selectedAccountIdForReconcile, setSelectedAccountIdForReconcile] = useState<string | undefined>();
  const [editAccountModalOpen, setEditAccountModalOpen] = useState(false);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<Account | null>(null);
  const [ledgerMemberFilter, setLedgerMemberFilter] = useState<'ALL' | 'HUSBAND' | 'WIFE'>('ALL');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'ALL' | 'BANK' | 'CASH'>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = () => {
    api.getAccounts().then((res) => setAccounts(res.accounts)).catch(() => {});
  };

  useEffect(() => {
    loadAccounts();
  }, [refreshTrigger]);

  const applyPreset = (p: FilterPreset) => {
    setPreset(p);
    if (p === 'CURRENT_MONTH') {
      setStartDate('2026-11-01');
      setEndDate('2026-11-30');
    } else if (p === 'PREV_MONTH') {
      setStartDate('2026-10-01');
      setEndDate('2026-10-31');
    } else if (p === 'LAST_3M') {
      setStartDate('2026-09-01');
      setEndDate('2026-11-30');
    } else if (p === 'LAST_6M') {
      setStartDate('2026-06-01');
      setEndDate('2026-11-30');
    } else if (p === 'CURRENT_YEAR') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getDashboard(startDate, endDate)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [startDate, endDate, refreshTrigger]);

  if (loading && !summary) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        Loading household financial dashboard...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
        {error || 'Unable to load dashboard summary'}
      </div>
    );
  }

  const { financialOverview: fo, individualOverview: io, financialHealth: fh, charts } = summary;

  return (
    <div className="space-y-6">
      {/* Top Filter & Quick Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'CURRENT_MONTH', label: 'Current Month (Nov)' },
              { id: 'PREV_MONTH', label: 'Oct 2026 (Full Month)' },
              { id: 'LAST_3M', label: 'Last 3 Months' },
              { id: 'LAST_6M', label: 'Last 6 Months' },
              { id: 'CURRENT_YEAR', label: 'Current Year (2026)' },
              { id: 'CUSTOM', label: 'Custom Range' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              onClick={() => applyPreset(btn.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                preset === btn.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {preset === 'CUSTOM' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <span>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          )}
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 px-2">
            <Calendar className="w-3.5 h-3.5" />
            {summary.period.label}
          </span>
          <button
            onClick={() => onQuickAdd('EXPENSE')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
          <button
            onClick={() => onQuickAdd('INCOME')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Income
          </button>
        </div>
      </div>

      {/* Primary Financial Overview Cards (Section 9) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Combined Household Income
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(fo.combinedIncomeLkr)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Husband: {formatLKR(io.husbandIncomeLkr, { showDecimals: false })}</span>
            <span>Wife: {formatLKR(io.wifeIncomeLkr, { showDecimals: false })}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Household Expenses
            </span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(fo.totalExpensesLkr)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Fixed: {formatLKR(fo.totalFixedCommitmentsLkr, { showDecimals: false })}</span>
            <span>Variable: {formatLKR(fo.totalVariableExpensesLkr, { showDecimals: false })}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Allocated Savings & Surplus
            </span>
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {formatLKR(fo.allocatedSavingsLkr)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cash Surplus: {formatLKR(fo.cashFlowSurplusLkr, { showDecimals: false })}</span>
            <span>Rate: {fh.savingsRatePct}%</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Remaining Available Balance
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(fo.remainingAvailableBalanceLkr)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Loans Paid: {formatLKR(fo.totalLoanRepaymentsLkr, { showDecimals: false })}</span>
            <span>Bank/Cash: {formatLKR(fo.totalBankAndCashAssetsLkr, { showDecimals: false })}</span>
          </div>
        </div>
      </div>

      {/* Requirement 7: Account Balance & Physical Cash Overview */}
      {summary.accountOverview && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-600" />
                <span>Account & Cash Balances Overview</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live calculated balances across Commercial Bank, BOC, NSB, and physical cash wallets
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedAccountIdForReconcile(undefined);
                  setReconcileModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold border border-blue-200 dark:border-blue-800 transition shadow-sm"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Reconcile Statement</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commercial Bank</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatLKR(summary.accountOverview.commercialBankBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Salary & Daily Banking</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">BOC Bank Account</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatLKR(summary.accountOverview.bocBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Wife Bank of Ceylon</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">NSB Bank Accounts</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatLKR(summary.accountOverview.nsbBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Tharindu & Wife Savings</span>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Total Bank Balance</span>
              <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-1">
                {formatLKR(summary.accountOverview.totalHouseholdBankBalance)}
              </div>
              <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">Across all 5 Bank Accounts</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Husband's Cash (Tharindu)</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatLKR(summary.accountOverview.husbandCashBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Physical Cash Wallet</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Wife's Cash (Sudu)</span>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                {formatLKR(summary.accountOverview.wifeCashBalance)}
              </div>
              <span className="text-[10px] text-slate-400">Physical Cash Wallet</span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 shadow-sm">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Total Household Cash</span>
              <div className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300 mt-1">
                {formatLKR(summary.accountOverview.totalHouseholdCashBalance)}
              </div>
              <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Physical Wallet Cash</span>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Total Available Funds</span>
              <div className="text-lg font-black font-mono text-blue-700 dark:text-blue-300 mt-1">
                {formatLKR(summary.accountOverview.totalHouseholdAvailableFunds)}
              </div>
              <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80">Total Bank + Physical Cash</span>
            </div>
          </div>

          {/* Detailed Account Ledger & Balance Reconciliation Table */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Detailed Account Balances & Transaction Audit Ledger
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Opening Balance + Income + In Transfers - Out Transfers - Expenses - Withdrawals - Bank Fees = Current Balance
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ledgerMemberFilter}
                  onChange={(e) => setLedgerMemberFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="ALL">All Members</option>
                  <option value="HUSBAND">Husband (Tharindu)</option>
                  <option value="WIFE">Wife (Sudu)</option>
                </select>

                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="ALL">All Accounts & Wallets</option>
                  <option value="BANK">Bank Accounts Only</option>
                  <option value="CASH">Cash Wallets Only</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">Account / Card</th>
                    <th className="p-2.5">Bank / Type</th>
                    <th className="p-2.5">Owner</th>
                    <th className="p-2.5 text-right">Opening Bal</th>
                    <th className="p-2.5 text-right text-emerald-600">Income (+)</th>
                    <th className="p-2.5 text-right text-rose-600">Expenses (-)</th>
                    <th className="p-2.5 text-right text-slate-600">Withdrawals</th>
                    <th className="p-2.5 text-right text-slate-600">Deposits</th>
                    <th className="p-2.5 text-right text-amber-600">Bank Fees (-)</th>
                    <th className="p-2.5 text-right font-bold text-slate-900 dark:text-white">Calculated Bal</th>
                    <th className="p-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-slate-700 dark:text-slate-300">
                  {summary.accountOverview.accountBreakdowns
                    .filter((b) => {
                      if (ledgerMemberFilter === 'HUSBAND' && b.ownershipType !== 'HUSBAND') return false;
                      if (ledgerMemberFilter === 'WIFE' && b.ownershipType !== 'WIFE') return false;
                      if (ledgerTypeFilter === 'BANK' && b.accountType !== 'BANK_SAVINGS' && b.accountType !== 'BANK_CURRENT') return false;
                      if (ledgerTypeFilter === 'CASH' && b.accountType !== 'CASH') return false;
                      return true;
                    })
                    .map((b) => {
                      const fullAcc = accounts.find((a) => a.id === b.accountId) || null;
                      return (
                        <tr key={b.accountId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-sans font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            {b.accountName}
                            {b.cardLastFour && (
                              <span className="ml-1.5 text-[10px] font-mono px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                •••• {b.cardLastFour}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-sans text-slate-500 whitespace-nowrap">
                            {b.bankName || b.accountType}
                          </td>
                          <td className="p-2.5 font-sans text-slate-500 whitespace-nowrap">
                            {b.ownerName}
                          </td>
                          <td className="p-2.5 text-right whitespace-nowrap">
                            {formatLKR(b.openingBalance, { showDecimals: false })}
                            <span className="block text-[9px] text-slate-400 font-sans">{b.openingBalanceDate}</span>
                          </td>
                          <td className="p-2.5 text-right text-emerald-600 font-semibold whitespace-nowrap">
                            {Number(b.totalIncome) > 0 ? `+${formatLKR(b.totalIncome, { showDecimals: false })}` : '—'}
                          </td>
                          <td className="p-2.5 text-right text-rose-600 font-semibold whitespace-nowrap">
                            {Number(b.totalExpenses) > 0 ? `-${formatLKR(b.totalExpenses, { showDecimals: false })}` : '—'}
                          </td>
                          <td className="p-2.5 text-right text-slate-600 whitespace-nowrap">
                            {Number(b.withdrawals) > 0 ? formatLKR(b.withdrawals, { showDecimals: false }) : '—'}
                          </td>
                          <td className="p-2.5 text-right text-slate-600 whitespace-nowrap">
                            {Number(b.deposits) > 0 ? formatLKR(b.deposits, { showDecimals: false }) : '—'}
                          </td>
                          <td className="p-2.5 text-right text-amber-600 font-semibold whitespace-nowrap">
                            {Number(b.bankCharges) > 0 ? `-${formatLKR(b.bankCharges, { showDecimals: false })}` : '—'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {formatLKR(b.currentCalculatedBalance)}
                          </td>
                          <td className="p-2.5 text-center font-sans whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedAccountIdForReconcile(b.accountId);
                                  setReconcileModalOpen(true);
                                }}
                                title="Reconcile with Statement"
                                className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 transition"
                              >
                                Reconcile
                              </button>
                              {fullAcc && (
                                <button
                                  onClick={() => {
                                    setSelectedAccountForEdit(fullAcc);
                                    setEditAccountModalOpen(true);
                                  }}
                                  title="Edit Account / Card"
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Row: Individual Husband vs Wife Overview & Financial Health Indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Individual Contribution Summary (Husband vs Wife) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Individual Member Overview (Husband vs. Wife)
              </h3>
            </div>
            <span className="text-xs text-slate-500">Shared Household Attribution</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/60">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">
                Tharindu (Husband)
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Income Earned:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatLKR(io.husbandIncomeLkr)} ({io.husbandIncomeSharePct}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expenses Paid:</span>
                  <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                    {formatLKR(io.husbandSpendingLkr)} ({io.husbandSpendingSharePct}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-pink-50/60 dark:bg-pink-950/30 border border-pink-200/70 dark:border-pink-800/60">
              <div className="text-xs font-bold text-pink-700 dark:text-pink-300 mb-1">
                Sudu (Wife)
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Income Earned:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatLKR(io.wifeIncomeLkr)} ({io.wifeIncomeSharePct}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expenses Paid:</span>
                  <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                    {formatLKR(io.wifeSpendingLkr)} ({io.wifeSpendingSharePct}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contribution Share Bars */}
          <div className="space-y-2.5 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Income Contribution Split
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-400">
                  Husband {io.husbandIncomeSharePct}% / Wife {io.wifeIncomeSharePct}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${io.husbandIncomeSharePct}%` }}
                  className="bg-blue-600 h-full"
                />
                <div
                  style={{ width: `${io.wifeIncomeSharePct}%` }}
                  className="bg-pink-500 h-full"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  Expense Payment Split
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-400">
                  Husband {io.husbandSpendingSharePct}% / Wife {io.wifeSpendingSharePct}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                <div
                  style={{ width: `${io.husbandSpendingSharePct}%` }}
                  className="bg-blue-600 h-full"
                />
                <div
                  style={{ width: `${io.wifeSpendingSharePct}%` }}
                  className="bg-pink-500 h-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Health Indicators (Section 12) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Household Financial Health Ratios
              </h3>
            </div>
            <span className="text-xs text-slate-500">Outstanding Loans: {formatLKR(fo.totalLoanLiabilityLkr, { showDecimals: false })}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Income-to-Expense Ratio</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {fh.incomeToExpenseRatio}x
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                {fh.incomeToExpenseRatio >= 1.2 ? 'Healthy buffer (>1.2x)' : 'Monitor closely'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Debt Repayment Burden</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {fh.debtRepaymentBurdenPct}%
              </div>
              <div className="text-[11px] text-slate-500">
                {formatLKR(fo.totalLoanRepaymentsLkr, { showDecimals: false })} / mo
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Fixed Commitment Ratio</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {fh.fixedCommitmentRatioPct}%
              </div>
              <div className="text-[11px] text-slate-500">Of total household income</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Essential Spending Share</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {charts.essentialVsNonEssential.essentialPct}%
              </div>
              <div className="text-[11px] text-slate-500">
                {formatLKR(charts.essentialVsNonEssential.essentialLkr, { showDecimals: false })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Non-Essential Share</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {charts.essentialVsNonEssential.nonEssentialPct}%
              </div>
              <div className="text-[11px] text-slate-500">
                {formatLKR(charts.essentialVsNonEssential.nonEssentialLkr, { showDecimals: false })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500">Recurring vs One-Time</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                {charts.recurringVsOneTime.recurringPct}% / {charts.recurringVsOneTime.oneTimePct}%
              </div>
              <div className="text-[11px] text-slate-500">Scheduled vs Ad-hoc</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid (6 Visualizations) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Income vs Expenses Monthly Trend */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
            1. Monthly Income vs. Expenses & Savings Trend (LKR)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            6-month household cash-flow trajectory excluding internal transfers
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.incomeVsExpensesMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => formatLKR(value)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #334155' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="income" name="Combined Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Total Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="savings" name="Allocated Savings" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Expense Distribution by Category */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
            2. Expense Distribution by Main Category
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Share of {formatLKR(fo.totalExpensesLkr)} period spending
          </p>
          {charts.expenseByCategory.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-xs text-slate-400">
              No expenses recorded in this period
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {charts.expenseByCategory.map((cat) => (
                <div key={cat.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.categoryName}
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {formatLKR(cat.amount, { showDecimals: false })} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, cat.percentage)}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Individual Spending Comparison & Monthly Savings Trend */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
            3. Husband vs. Wife Monthly Spending Comparison
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Individual payment contributions across recent months
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.incomeVsExpensesMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: any) => formatLKR(value)} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="husbandExpenses" name="Husband Paid" stackId="a" fill="#2563eb" />
                <Bar dataKey="wifeExpenses" name="Wife Paid" stackId="a" fill="#db2777" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Loan Repayment Overview */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                4. Loan & Bike Finance Repayment Progress
              </h3>
              <p className="text-xs text-slate-500">
                Principal paid down vs. remaining liability
              </p>
            </div>
            <button
              onClick={() => onNavigate('loans')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Manage Loans →
            </button>
          </div>

          <div className="space-y-3.5">
            {charts.loanOverview.map((loan) => (
              <div
                key={loan.loanId}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-900 dark:text-white">{loan.loanName}</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    Outstanding: {formatLKR(loan.outstandingBalance)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, loan.progressPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{loan.progressPct}% Principal Repaid</span>
                  <span>
                    Installment: {formatLKR(loan.monthlyInstallment, { showDecimals: false })}/mo ({loan.remainingInstallments} left)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Practical Insights Engine & Upcoming Payment Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Practical Financial Insights (Section 12) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Deterministic Financial Insights & Behavior Analysis
              </h3>
              <p className="text-xs text-slate-500">
                Every insight is calculated directly from your verified household ledger
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {summary.insights.map((ins) => {
              const badgeStyles =
                ins.severity === 'CRITICAL'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : ins.severity === 'WARNING'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : ins.severity === 'POSITIVE'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200';

              return (
                <div
                  key={ins.id}
                  className={`p-3.5 rounded-xl border ${badgeStyles} flex items-start justify-between gap-3`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {ins.severity === 'CRITICAL' || ins.severity === 'WARNING' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                      ) : (
                        <Info className="w-4 h-4 shrink-0" />
                      )}
                      <span className="text-xs font-bold">{ins.title}</span>
                    </div>
                    <p className="text-xs opacity-90">{ins.description}</p>
                    <p className="text-[11px] font-mono opacity-75">
                      Formula: {ins.calculationExplanation}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/70 shrink-0">
                    {ins.metricValue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Payment Reminders (Section 8) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Upcoming Scheduled Commitments
              </h3>
              <p className="text-xs text-slate-500">
                Scheduled reminders (only counted as spent once confirmed)
              </p>
            </div>
            <button
              onClick={() => onNavigate('loans')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Mark Paid →
            </button>
          </div>

          <div className="space-y-2.5">
            {summary.upcomingCommitments.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    {c.isPaidThisPeriod ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    {c.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Next Due: {formatDateSL(c.dueDate)} • {c.assignedMemberRole}
                    {c.isVariableAmount ? ' • Variable Bill' : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    {formatLKR(c.expectedAmountLkr)}
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      c.daysUntilDue <= 3
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {c.daysUntilDue === 0
                      ? 'Due Today'
                      : c.daysUntilDue > 0
                        ? `In ${c.daysUntilDue} days`
                        : `${Math.abs(c.daysUntilDue)}d overdue`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AccountReconcileModal
        isOpen={reconcileModalOpen}
        onClose={() => setReconcileModalOpen(false)}
        onReconciled={() => {
          loadAccounts();
          api.getDashboard(startDate, endDate).then((data) => setSummary(data)).catch(() => {});
        }}
        accounts={accounts}
        initialAccountId={selectedAccountIdForReconcile}
        activeUserId={summary.individualOverview ? '22222222-2222-4222-8222-222222222221' : ''}
      />

      <EditAccountModal
        isOpen={editAccountModalOpen}
        onClose={() => setEditAccountModalOpen(false)}
        onSaved={() => {
          loadAccounts();
          api.getDashboard(startDate, endDate).then((data) => setSummary(data)).catch(() => {});
        }}
        account={selectedAccountForEdit}
        allAccounts={accounts}
      />
    </div>
  );
};

