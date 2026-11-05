import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle2, PieChart } from 'lucide-react';
import { api } from '../api';
import { formatLKR, formatMonthYearSL } from '../../shared/decimal';
import type { Budget, Category } from '../../shared/types';

interface BudgetsViewProps {
  categories: Category[];
  refreshTrigger: number;
  onRefresh: () => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({
  categories,
  refreshTrigger,
  onRefresh,
}) => {
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(11);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<{
    totalBudgetedLkr: string;
    totalSpentInBudgetedCategoriesLkr: string;
    totalRemainingLkr: string;
    overallUtilizationPct: number;
    exceededCount: number;
    approachingCount: number;
  } | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [memberScope, setMemberScope] = useState<'HOUSEHOLD' | 'HUSBAND' | 'WIFE'>('HOUSEHOLD');
  const [allocatedAmountLkr, setAllocatedAmountLkr] = useState<string>('');
  const [alertThresholdPct, setAlertThresholdPct] = useState<number>(80);

  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const selectedCategory = expenseCategories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (!categoryId && expenseCategories[0]) {
      setCategoryId(expenseCategories[0].id);
    }
  }, [expenseCategories, categoryId]);

  useEffect(() => {
    api.getBudgets(year, month).then((res) => {
      setBudgets(res.evaluatedBudgets);
      setSummary(res.summary);
    });
  }, [year, month, refreshTrigger]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.upsertBudget({
      year,
      month,
      categoryId,
      subcategoryId: subcategoryId || null,
      memberScope,
      allocatedAmountLkr,
      alertThresholdPct,
    });
    setAllocatedAmountLkr('');
    setShowAddForm(false);
    onRefresh();
  };

  const handleDeleteBudget = async (id: string) => {
    await api.deleteBudget(id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Monthly Household & Individual Budgets
          </h2>
          <p className="text-xs text-slate-500">
            Set category or subcategory limits (e.g., Groceries, Vegetables, Meat & Fish, Entertainment) and monitor real-time utilization
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={`${year}-${String(month).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              setYear(y);
              setMonth(m);
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            <option value="2026-11">Nov 2026 (Current Month)</option>
            <option value="2026-10">Oct 2026 (Full Month)</option>
            <option value="2026-09">Sep 2026</option>
          </select>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Set Category Budget
          </button>
        </div>
      </div>

      {/* Add / Update Budget Form */}
      {showAddForm && (
        <form
          onSubmit={handleSaveBudget}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Configure Monthly Budget for {formatMonthYearSL(year, month)}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Main Category *
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId('');
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Subcategory (Optional)
              </label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="">Entire Main Category</option>
                {(selectedCategory?.subcategories || []).map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Budget Scope
              </label>
              <select
                value={memberScope}
                onChange={(e) => setMemberScope(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="HOUSEHOLD">Combined Household</option>
                <option value="HUSBAND">Husband Only</option>
                <option value="WIFE">Wife Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Monthly Limit (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="30000.00"
                value={allocatedAmountLkr}
                onChange={(e) => setAllocatedAmountLkr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Alert Threshold (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={alertThresholdPct}
                  onChange={(e) => setAlertThresholdPct(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold shrink-0"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Summary Banner */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500">Total Allocated Budget</div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(summary.totalBudgetedLkr)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Sub-allocations smartly rolled up
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500">Actual Spent Against Budgets</div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(summary.totalSpentInBudgetedCategoriesLkr)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary.overallUtilizationPct}% overall utilization
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500">Remaining Budget Headroom</div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatLKR(summary.totalRemainingLkr)}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500">Budget Health Alerts</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1.5 flex items-center gap-3">
              <span className="text-rose-600 dark:text-rose-400">
                {summary.exceededCount} Exceeded
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {summary.approachingCount} Approaching
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Budgets Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map((b) => {
          const isExceeded = b.status === 'EXCEEDED';
          const isWarning = b.status === 'APPROACHING_LIMIT';
          const barColor = isExceeded
            ? 'bg-rose-600'
            : isWarning
              ? 'bg-amber-500'
              : 'bg-emerald-500';

          return (
            <div
              key={b.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {b.categoryName}
                      {b.subcategoryName ? ` › ${b.subcategoryName}` : ''}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {b.memberScope}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Prior Month Spent: {formatLKR(b.previousMonthSpentLkr || '0.00')}
                    {b.monthOverMonthDiffPct ? ` (${b.monthOverMonthDiffPct > 0 ? '+' : ''}${b.monthOverMonthDiffPct}%)` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isExceeded ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5" /> Exceeded ({b.utilizationPct}%)
                    </span>
                  ) : isWarning ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" /> {b.utilizationPct}% Used
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {b.utilizationPct}% On Track
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteBudget(b.id)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title="Delete Budget"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(100, b.utilizationPct || 0)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                <div>
                  <div className="text-slate-400 text-[11px]">Allocated Limit</div>
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {formatLKR(b.allocatedAmountLkr)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Actual Spent</div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {formatLKR(b.actualSpentLkr || '0.00')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 text-[11px]">
                    {Number(b.remainingLkr) < 0 ? 'Over Budget By' : 'Remaining'}
                  </div>
                  <div
                    className={`font-mono font-bold ${
                      Number(b.remainingLkr) < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {formatLKR(Math.abs(Number(b.remainingLkr || 0)))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

