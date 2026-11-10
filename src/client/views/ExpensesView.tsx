import React, { useState, useEffect } from 'react';
import { Plus, Layers, ShoppingBag, Zap } from 'lucide-react';
import { api } from '../api';
import { addMoney, formatDateSL, formatLKR, pctOf } from '../../shared/decimal';
import type { Category, Transaction, TransactionType } from '../../shared/types';

interface ExpensesViewProps {
  categories: Category[];
  refreshTrigger: number;
  startDate?: string;
  endDate?: string;
  onOpenNew: (type: TransactionType) => void;
  onOpenEdit: (tx: Transaction) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  categories,
  refreshTrigger,
  startDate,
  endDate,
  onOpenNew,
  onOpenEdit,
}) => {
  const [expenses, setExpenses] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');

  const effectiveMonth = startDate ? startDate.slice(0, 7) : selectedMonth;
  const effectiveStartDate = startDate || `${selectedMonth}-01`;
  const effectiveEndDate = endDate || `${selectedMonth}-31`;

  useEffect(() => {
    api
      .getTransactions({
        transactionType: 'EXPENSE',
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      })
      .then((res) => setExpenses(res.transactions));
  }, [effectiveStartDate, effectiveEndDate, refreshTrigger]);

  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');

  let totalPeriodExpense = '0.00';
  for (const tx of expenses) {
    totalPeriodExpense = addMoney(totalPeriodExpense, tx.actualLkrAmount);
  }

  // Compute Main Category & Subcategory Breakdown (including split items!)
  const categoryBreakdown = expenseCategories.map((cat) => {
    const catTxs = expenses.filter((t) => t.categoryId === cat.id);
    let catTotal = '0.00';
    const subTotals = new Map<string, string>();

    for (const tx of catTxs) {
      catTotal = addMoney(catTotal, tx.actualLkrAmount);
      if (tx.items && tx.items.length > 0) {
        for (const item of tx.items) {
          const subName = item.subcategoryName || 'Other';
          subTotals.set(subName, addMoney(subTotals.get(subName) || '0.00', item.amountLkr));
        }
      } else {
        const subName = tx.subcategoryName || 'General';
        subTotals.set(subName, addMoney(subTotals.get(subName) || '0.00', tx.actualLkrAmount));
      }
    }

    return {
      category: cat,
      totalLkr: catTotal,
      sharePct: pctOf(catTotal, totalPeriodExpense),
      txCount: catTxs.length,
      subBreakdown: Array.from(subTotals.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    };
  });

  const filteredTxs =
    selectedCategoryId === 'ALL'
      ? expenses
      : expenses.filter((t) => t.categoryId === selectedCategoryId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Expense Category & Subcategory Explorer
          </h2>
          <p className="text-xs text-slate-500">
            Analyze spending across Loans, Housing, Utilities, Digital Subscriptions, Groceries/Consumables, and Leisure
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            <option value="2026-11">Nov 2026 (Current)</option>
            <option value="2026-10">Oct 2026 (Full Month)</option>
            <option value="2026-09">Sep 2026</option>
          </select>

          <button
            onClick={() => onOpenNew('EXPENSE')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoryBreakdown.map(({ category, totalLkr, sharePct, txCount, subBreakdown }) => {
          const isSelected = selectedCategoryId === category.id;
          return (
            <div
              key={category.id}
              onClick={() =>
                setSelectedCategoryId(isSelected ? 'ALL' : category.id)
              }
              className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border transition cursor-pointer ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              } shadow-sm flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {category.name}
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-500">
                    {sharePct}%
                  </span>
                </div>

                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mb-3">
                  {formatLKR(totalLkr)}
                </div>

                {subBreakdown.length > 0 ? (
                  <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-2.5 text-xs">
                    {subBreakdown.slice(0, 5).map((sb) => (
                      <div key={sb.name} className="flex items-center justify-between">
                        <span className="text-slate-600 dark:text-slate-400 truncate pr-2">
                          • {sb.name}
                        </span>
                        <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                          {formatLKR(sb.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic pt-2 border-t border-slate-100 dark:border-slate-800">
                    No expenses recorded in {effectiveMonth}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                <span>{txCount} transaction(s)</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {isSelected ? 'Showing below ✓' : 'Filter table →'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtered Expense List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {selectedCategoryId === 'ALL'
                ? `All Expenses in ${effectiveMonth}`
                : `Filtered Category Expenses (${effectiveMonth})`}
            </h3>
          </div>
          {selectedCategoryId !== 'ALL' && (
            <button
              onClick={() => setSelectedCategoryId('ALL')}
              className="text-xs text-blue-600 hover:underline"
            >
              Show All Categories
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold uppercase text-slate-500">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Category › Subcategory</th>
                <th className="py-3 px-4">Paid By</th>
                <th className="py-3 px-4">Billing Period / Info</th>
                <th className="py-3 px-4 text-right">Amount (LKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTxs.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => onOpenEdit(tx)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono">{formatDateSL(tx.transactionDate)}</td>
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                    {tx.description}
                  </td>
                  <td className="py-3 px-4">
                    {tx.categoryName} {tx.subcategoryName ? `› ${tx.subcategoryName}` : ''}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        tx.paidOrReceivedByRole === 'HUSBAND'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300'
                      }`}
                    >
                      {tx.paidOrReceivedByName || tx.paidOrReceivedByRole}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {tx.utilityBillingPeriodStart && tx.utilityBillingPeriodEnd ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <Zap className="w-3 h-3" />
                        {formatDateSL(tx.utilityBillingPeriodStart)} –{' '}
                        {formatDateSL(tx.utilityBillingPeriodEnd)}
                      </span>
                    ) : tx.originalCurrency !== 'LKR' ? (
                      <span>
                        Foreign Charge: {tx.originalCurrency} {tx.originalAmount}
                      </span>
                    ) : (
                      <span>{tx.isFixed ? 'Fixed Commitment' : 'Variable Expense'}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatLKR(tx.actualLkrAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

