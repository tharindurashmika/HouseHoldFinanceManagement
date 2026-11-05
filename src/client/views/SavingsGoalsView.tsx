import React, { useState, useEffect } from 'react';
import { PiggyBank, Plus, Target, Wallet, TrendingUp } from 'lucide-react';
import { api } from '../api';
import { addMoney, formatDateSL, formatLKR, pctOf, subMoney } from '../../shared/decimal';
import type { Account, SavingsGoal, User } from '../../shared/types';

interface SavingsGoalsViewProps {
  accounts: Account[];
  members: User[];
  activeUserId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const SavingsGoalsView: React.FC<SavingsGoalsViewProps> = ({
  accounts,
  members,
  activeUserId,
  refreshTrigger,
  onRefresh,
}) => {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [cashFlowSurplus, setCashFlowSurplus] = useState<string>('0.00');
  const [allocatedPeriodSavings, setAllocatedPeriodSavings] = useState<string>('0.00');
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null);

  // Add Goal state
  const [goalName, setGoalName] = useState('');
  const [ownerScope, setOwnerScope] = useState<'HOUSEHOLD' | 'HUSBAND' | 'WIFE'>('HOUSEHOLD');
  const [targetAmount, setTargetAmount] = useState('500000.00');
  const [monthlyTarget, setMonthlyTarget] = useState('25000.00');
  const [targetDate, setTargetDate] = useState('2027-12-31');
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id || '');

  // Contribution modal state
  const [contribDate, setContribDate] = useState('2026-11-03');
  const [contribAmount, setContribAmount] = useState('25000.00');
  const [contribType, setContribType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [contribUserId, setContribUserId] = useState(activeUserId);
  const [contribNotes, setContribNotes] = useState('');

  useEffect(() => {
    Promise.all([
      api.getSavingsGoals(),
      api.getDashboard('2026-11-01', '2026-11-30'),
    ]).then(([gRes, dRes]) => {
      setGoals(gRes.goals);
      setCashFlowSurplus(dRes.financialOverview.cashFlowSurplusLkr);
      setAllocatedPeriodSavings(dRes.financialOverview.allocatedSavingsLkr);
    });
  }, [refreshTrigger]);

  let totalAvailableBankCash = '0.00';
  for (const a of accounts) {
    if (a.status === 'ACTIVE' && !a.linkedParentAccountId && a.accountType !== 'CREDIT_CARD') {
      totalAvailableBankCash = addMoney(totalAvailableBankCash, a.currentBalance);
    }
  }

  let totalGoalAllocated = '0.00';
  for (const g of goals) {
    totalGoalAllocated = addMoney(totalGoalAllocated, g.currentAllocatedLkr);
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createSavingsGoal({
      name: goalName,
      ownerScope,
      targetAmountLkr: targetAmount,
      monthlyTargetLkr: monthlyTarget,
      targetDate: targetDate || null,
      linkedSavingsAccountId: linkedAccountId || null,
    });
    setGoalName('');
    setShowAddGoal(false);
    onRefresh();
  };

  const handleSaveContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributingGoal) return;
    await api.contributeSavings(contributingGoal.id, {
      contributedByUserId: contribUserId,
      contributionDate: contribDate,
      amountLkr: contribAmount,
      type: contribType,
      notes: contribNotes || null,
    });
    setContributingGoal(null);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Household Savings & Financial Goals
          </h2>
          <p className="text-xs text-slate-500">
            Track dedicated savings allocations separately from raw monthly cash-flow surplus
          </p>
        </div>

        <button
          onClick={() => setShowAddGoal(!showAddGoal)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4" /> Create Savings Goal
        </button>
      </div>

      {/* Explicit 3-Way Distinction Banner (Section 11 Requirement) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase mb-1">
            <span>1. Monthly Cash Flow Surplus (Oct)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(cashFlowSurplus)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Formula: Total Income minus Total Confirmed Expenses
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase mb-1">
            <span>2. Actual Money Allocated to Savings</span>
            <PiggyBank className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {formatLKR(totalGoalAllocated)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Cumulatively earmarked across {goals.length} active goals ({formatLKR(allocatedPeriodSavings)} in Oct)
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase mb-1">
            <span>3. Available Bank & Cash Balances</span>
            <Wallet className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {formatLKR(totalAvailableBankCash)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Total liquid funds across all active household bank & cash accounts
          </p>
        </div>
      </div>

      {showAddGoal && (
        <form
          onSubmit={handleCreateGoal}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Create Household or Individual Financial Goal
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="lg:col-span-2">
              <label className="block font-semibold text-slate-500 mb-1">Goal Name *</label>
              <input
                type="text"
                required
                placeholder="e.g., Emergency Fund, Solar Panels, Fixed Deposit..."
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Owner Scope</label>
              <select
                value={ownerScope}
                onChange={(e) => setOwnerScope(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="HOUSEHOLD">Shared Household</option>
                <option value="HUSBAND">Husband Goal</option>
                <option value="WIFE">Wife Goal</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Target Amount (LKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Monthly Target (LKR) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Target Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block font-semibold text-slate-500 mb-1">Linked Savings Account</label>
              <select
                value={linkedAccountId}
                onChange={(e) => setLinkedAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-emerald-600 text-white font-semibold"
              >
                Save Goal
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Goals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {goals.map((goal) => {
          const progress = pctOf(goal.currentAllocatedLkr, goal.targetAmountLkr);
          const remaining = subMoney(goal.targetAmountLkr, goal.currentAllocatedLkr);

          return (
            <div
              key={goal.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {goal.ownerScope}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                      {goal.name}
                    </h3>
                  </div>
                  <Target className="w-5 h-5 text-emerald-500 shrink-0" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatLKR(goal.currentAllocatedLkr)}
                    </span>
                    <span className="font-mono text-slate-500">
                      of {formatLKR(goal.targetAmountLkr)} ({progress}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <div className="text-slate-400 text-[11px]">Planned Monthly</div>
                    <div className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                      {formatLKR(goal.monthlyTargetLkr)}/mo
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-[11px]">Target Date</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-200">
                      {formatDateSL(goal.targetDate)}
                    </div>
                  </div>
                </div>

                {goal.contributions && goal.contributions.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">
                      Recent Allocations:
                    </div>
                    {goal.contributions.slice(0, 3).map((c) => (
                      <div key={c.id} className="flex justify-between text-[11px]">
                        <span className="text-slate-500">
                          {formatDateSL(c.contributionDate)} ({c.contributedByName?.split(' ')[0]})
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            c.type === 'DEPOSIT' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {c.type === 'DEPOSIT' ? '+' : '-'}
                          {formatLKR(c.amountLkr)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Remaining: {formatLKR(Math.max(0, Number(remaining)), { showDecimals: false })}
                </span>
                <button
                  onClick={() => {
                    setContributingGoal(goal);
                    setContribAmount(goal.monthlyTargetLkr);
                    setContribType('DEPOSIT');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  + Record Contribution
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {contributingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveContribution}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Allocate Savings: {contributingGoal.name}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Type</label>
                <select
                  value={contribType}
                  onChange={(e) => setContribType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="DEPOSIT">Deposit / Allocation (+)</option>
                  <option value="WITHDRAWAL">Withdrawal (-)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={contribDate}
                  onChange={(e) => setContribDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Amount (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={contribAmount}
                onChange={(e) => setContribAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Contributed By Member *
              </label>
              <select
                value={contribUserId}
                onChange={(e) => setContribUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.memberRole})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setContributingGoal(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                Save Allocation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

