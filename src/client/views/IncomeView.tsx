import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Plus, Briefcase, Users } from 'lucide-react';
import { api } from '../api';
import { addMoney, formatDateSL, formatLKR, pctOf, toMoneyNumber } from '../../shared/decimal';
import type { Transaction, TransactionType } from '../../shared/types';

interface IncomeViewProps {
  refreshTrigger: number;
  startDate?: string;
  endDate?: string;
  onOpenNew: (type: TransactionType) => void;
  onOpenEdit: (tx: Transaction) => void;
}

export const IncomeView: React.FC<IncomeViewProps> = ({
  refreshTrigger,
  startDate,
  endDate,
  onOpenNew,
  onOpenEdit,
}) => {
  const [incomeTxs, setIncomeTxs] = useState<Transaction[]>([]);
  const [allMonthTxs, setAllMonthTxs] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [loading, setLoading] = useState(true);

  const effectiveMonth = startDate ? startDate.slice(0, 7) : selectedMonth;
  const effectiveStartDate = startDate || `${selectedMonth}-01`;
  const effectiveEndDate = endDate || `${selectedMonth}-31`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.getTransactions({
        transactionType: 'INCOME',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      }),
      api.getTransactions({
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      }),
    ])
      .then(([incRes, allRes]) => {
        if (active) {
          setIncomeTxs(incRes.transactions);
          setAllMonthTxs(allRes.transactions);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger, effectiveStartDate, effectiveEndDate]);

  const monthTxs = incomeTxs.filter(
    (t) => t.transactionDate >= effectiveStartDate && t.transactionDate <= effectiveEndDate
  );

  let husbandMonthTotal = '0.00';
  let wifeMonthTotal = '0.00';
  let combinedMonthTotal = '0.00';
  let wifeOtMonthTotal = '0.00';
  let borrowedMonthTotal = '0.00';

  for (const t of monthTxs) {
    combinedMonthTotal = addMoney(combinedMonthTotal, t.actualLkrAmount);
    if (t.paidOrReceivedByRole === 'HUSBAND') {
      husbandMonthTotal = addMoney(husbandMonthTotal, t.actualLkrAmount);
    } else {
      wifeMonthTotal = addMoney(wifeMonthTotal, t.actualLkrAmount);
    }
    if (t.fundingSource === 'OVERTIME_INCOME' || t.subcategoryName?.toLowerCase().includes('overtime')) {
      wifeOtMonthTotal = addMoney(wifeOtMonthTotal, t.actualLkrAmount);
    }
    if (t.fundingSource === 'BORROWED_FRIENDS_PARENTS' || t.categoryName?.toLowerCase().includes('borrowed')) {
      borrowedMonthTotal = addMoney(borrowedMonthTotal, t.actualLkrAmount);
    }
  }

  let spentFromSavingsMonthTotal = '0.00';
  for (const t of allMonthTxs) {
    if (t.transactionType === 'EXPENSE' && t.fundingSource === 'PREVIOUS_SAVINGS') {
      spentFromSavingsMonthTotal = addMoney(spentFromSavingsMonthTotal, t.actualLkrAmount);
    }
  }

  // Group historical comparison by month
  const historyMap = new Map<
    string,
    { month: string; husband: string; wife: string; combined: string }
  >();
  for (const ym of ['2026-09', '2026-10', '2026-11']) {
    historyMap.set(ym, { month: ym, husband: '0.00', wife: '0.00', combined: '0.00' });
  }
  for (const t of incomeTxs) {
    const ym = t.transactionDate.slice(0, 7);
    const entry = historyMap.get(ym) || {
      month: ym,
      husband: '0.00',
      wife: '0.00',
      combined: '0.00',
    };
    entry.combined = addMoney(entry.combined, t.actualLkrAmount);
    if (t.paidOrReceivedByRole === 'HUSBAND') {
      entry.husband = addMoney(entry.husband, t.actualLkrAmount);
    } else {
      entry.wife = addMoney(entry.wife, t.actualLkrAmount);
    }
    historyMap.set(ym, entry);
  }

  const chartData = Array.from(historyMap.values()).map((h) => ({
    month: h.month,
    Husband: toMoneyNumber(h.husband),
    Wife: toMoneyNumber(h.wife),
    Combined: toMoneyNumber(h.combined),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Household Income Management
          </h2>
          <p className="text-xs text-slate-500">
            Track Monthly Salaries, Additional Income, Bonuses, and Freelance earnings for Husband & Wife
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            <option value="2026-11">Nov 2026</option>
            <option value="2026-10">Oct 2026</option>
            <option value="2026-09">Sep 2026</option>
          </select>

          <button
            onClick={() => onOpenNew('INCOME')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record Income
          </button>
        </div>
      </div>

      {/* 4 Money Sources Breakdown ("Api wiyadam karana salli kohenda enne kiyana eka") */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Household Funding Sources (Api Wiyadam Karana Salli Kohenda Enne — {effectiveMonth})
          </h3>
          <p className="text-xs text-slate-500">
            Tracks the 4 exact sources of household cash flow: Tharindu's salary (10th-12th / partial tranches), Wife's Basic + OT (~100k on 24th-26th), Borrowed from Friends/Parents, and Previous Savings Drawdowns
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="font-bold text-blue-700 dark:text-blue-300">
              1. Tharindu Salary (10th–12th)
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(husbandMonthTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Supports partial / delayed salary tranches
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-pink-50/60 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800">
            <div className="font-bold text-pink-700 dark:text-pink-300">
              2. Wife Basic + OT (24th–26th)
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(wifeMonthTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Includes OT (~100k): <strong>{formatLKR(wifeOtMonthTotal)}</strong>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="font-bold text-amber-800 dark:text-amber-300">
              3. Borrowed (Friends / Parents)
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(borrowedMonthTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Yaluwangen / Parentlagen illagatta salli
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <div className="font-bold text-emerald-800 dark:text-emerald-300">
              4. Spent from Saved Money
            </div>
            <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
              {formatLKR(spentFromSavingsMonthTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Ituru karapu salli walin wiyadam karapuwa
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase mb-2">
            <span>Combined Household Income ({effectiveMonth})</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatLKR(combinedMonthTotal)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {monthTxs.length} recorded income entries
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase mb-2">
            <span>Husband's Monthly Income</span>
            <Briefcase className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(husbandMonthTotal)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {pctOf(husbandMonthTotal, combinedMonthTotal)}% of combined household income
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-pink-600 dark:text-pink-400 font-semibold uppercase mb-2">
            <span>Wife's Monthly Income</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(wifeMonthTotal)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {pctOf(wifeMonthTotal, combinedMonthTotal)}% of combined household income
          </div>
        </div>
      </div>

      {/* Historical Income Comparison Chart */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
          Historical Monthly Income Comparison (Husband vs. Wife)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Monthly salaries and additional freelance/bonus income across months
        </p>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: any) => formatLKR(value)} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Husband" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Wife" fill="#db2777" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Income Entries Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Recorded Income History
          </h3>
          <span className="text-xs text-slate-500">Click any row to edit</span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500">Loading income records...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold uppercase text-slate-500">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source / Description</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Earned By</th>
                  <th className="py-3 px-4">Deposited Account</th>
                  <th className="py-3 px-4 text-right">Amount (LKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {incomeTxs.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => onOpenEdit(tx)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono">{formatDateSL(tx.transactionDate)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {tx.description}
                    </td>
                    <td className="py-3 px-4">{tx.categoryName}</td>
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
                    <td className="py-3 px-4">{tx.sourceAccountName}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatLKR(tx.actualLkrAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

