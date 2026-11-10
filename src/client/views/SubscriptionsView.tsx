import React, { useState, useEffect } from 'react';
import { Cpu, Plus, CheckCircle2, Globe, CreditCard } from 'lucide-react';
import { api } from '../api';
import { addMoney, formatDateSL, formatLKR, getTodayDateString } from '../../shared/decimal';
import type { Account, Category, Subscription, User } from '../../shared/types';

interface SubscriptionsViewProps {
  categories: Category[];
  accounts: Account[];
  members: User[];
  activeUserId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({
  categories,
  accounts,
  members,
  activeUserId,
  refreshTrigger,
  onRefresh,
}) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [payingSub, setPayingSub] = useState<Subscription | null>(null);

  // Add Subscription state
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [billingCurrency, setBillingCurrency] = useState('USD');
  const [billingAmount, setBillingAmount] = useState('20.00');
  const [estimatedLkrAmount, setEstimatedLkrAmount] = useState('6100.00');
  const [billingFrequency, setBillingFrequency] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [nextBillingDate, setNextBillingDate] = useState('2026-11-15');
  const [memberScope, setMemberScope] = useState<'HUSBAND' | 'WIFE' | 'SHARED'>('SHARED');
  const [defaultAccountId, setDefaultAccountId] = useState(accounts[0]?.id || '');

  // Pay Subscription modal state
  const [paidDate, setPaidDate] = useState(() => getTodayDateString());
  const [actualLkrCharged, setActualLkrCharged] = useState('');
  const [paidSourceAccountId, setPaidSourceAccountId] = useState('');
  const [paidByUserId, setPaidByUserId] = useState(activeUserId);

  const digitalCategory =
    categories.find((c) => c.name.toLowerCase().includes('digital subscription')) ||
    categories.find((c) => c.type === 'EXPENSE');

  useEffect(() => {
    api.getSubscriptions().then((res) => setSubscriptions(res.subscriptions));
  }, [refreshTrigger]);

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!digitalCategory) return;
    await api.createSubscription({
      name,
      provider,
      categoryId: digitalCategory.id,
      subcategoryId: subcategoryId || digitalCategory.subcategories?.[0]?.id || null,
      billingAmount,
      billingCurrency,
      estimatedLkrAmount,
      billingFrequency,
      nextBillingDate,
      memberScope,
      defaultAccountId: defaultAccountId || accounts[0]?.id || null,
      paymentMethod: 'CREDIT_CARD',
      status: 'ACTIVE',
    });
    setName('');
    setProvider('');
    setShowAdd(false);
    onRefresh();
  };

  const handleToggleStatus = async (sub: Subscription) => {
    const nextStatus = sub.status === 'ACTIVE' ? 'CANCELLED' : 'ACTIVE';
    await api.updateSubscription(sub.id, { status: nextStatus });
    onRefresh();
  };

  const handleConfirmCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSub) return;
    await api.paySubscription(payingSub.id, {
      paidDate,
      sourceAccountId: paidSourceAccountId || payingSub.defaultAccountId || accounts[0].id,
      paidByUserId,
      actualLkrAmount: actualLkrCharged,
      advanceNextBillingDate: true,
    });
    setPayingSub(null);
    onRefresh();
  };

  const activeSubs = subscriptions.filter((s) => s.status === 'ACTIVE');
  let totalMonthlyEstLkr = '0.00';
  for (const s of activeSubs) {
    totalMonthlyEstLkr = addMoney(totalMonthlyEstLkr, s.estimatedLkrAmount);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Digital Subscriptions & AI Tools Manager
          </h2>
          <p className="text-xs text-slate-500">
            Track ChatGPT, Google Gemini, Claude, Apple Services, Cloud Storage, and foreign currency USD/LKR charges
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] text-slate-400">Active Monthly Commitment</div>
            <div className="text-base font-bold font-mono text-purple-600 dark:text-purple-400">
              {formatLKR(totalMonthlyEstLkr)} / mo
            </div>
          </div>

          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Subscription
          </button>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={handleCreateSubscription}
          className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Add Digital Subscription (Foreign or LKR)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Subscription Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., ChatGPT Plus, Cursor Pro..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Provider *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., OpenAI, Google, Apple..."
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Subcategory
              </label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {(digitalCategory?.subcategories || []).map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Used By Member
              </label>
              <select
                value={memberScope}
                onChange={(e) => setMemberScope(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                <option value="SHARED">Shared (Husband & Wife)</option>
                <option value="HUSBAND">Husband</option>
                <option value="WIFE">Wife</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Billing Currency & Amount *
              </label>
              <div className="flex gap-1.5">
                <select
                  value={billingCurrency}
                  onChange={(e) => setBillingCurrency(e.target.value)}
                  className="px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                >
                  <option value="USD">USD</option>
                  <option value="LKR">LKR</option>
                  <option value="EUR">EUR</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={billingAmount}
                  onChange={(e) => setBillingAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Estimated LKR Amount *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={estimatedLkrAmount}
                onChange={(e) => setEstimatedLkrAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Next Billing Date *
              </label>
              <input
                type="date"
                required
                value={nextBillingDate}
                onChange={(e) => setNextBillingDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-purple-600 text-white text-xs font-semibold"
              >
                Save Subscription
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Subscriptions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {sub.name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sub.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {sub.provider} • {sub.subcategoryName || 'Digital Service'} • Scope: {sub.memberScope}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  {formatLKR(sub.estimatedLkrAmount)}
                </div>
                {sub.billingCurrency !== 'LKR' && (
                  <div className="text-xs font-mono text-purple-600 dark:text-purple-400 flex items-center justify-end gap-1">
                    <Globe className="w-3 h-3" /> {sub.billingCurrency} {sub.billingAmount} /{' '}
                    {sub.billingFrequency.toLowerCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-500 flex items-center gap-3">
                <span>Next Billing: <strong>{formatDateSL(sub.nextBillingDate)}</strong></span>
                <span className="flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> {sub.defaultAccountName || sub.paymentMethod}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleStatus(sub)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {sub.status === 'ACTIVE' ? 'Cancel' : 'Reactivate'}
                </button>
                {sub.status === 'ACTIVE' && (
                  <button
                    onClick={() => {
                      setPayingSub(sub);
                      setActualLkrCharged(sub.estimatedLkrAmount);
                      setPaidSourceAccountId(sub.defaultAccountId || accounts[0]?.id || '');
                    }}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Record Charge
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Record Subscription Charge Modal */}
      {payingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmCharge}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Record Subscription Charge: {payingSub.name}
            </h3>
            <p className="text-xs text-slate-500">
              Original Plan: <strong>{payingSub.billingCurrency} {payingSub.billingAmount}</strong>. Enter the exact LKR amount charged on your card/bank statement.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Billing Date *
              </label>
              <input
                type="date"
                required
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Actual LKR Amount Charged on Statement *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={actualLkrCharged}
                onChange={(e) => setActualLkrCharged(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Charged Account / Card *
              </label>
              <select
                value={paidSourceAccountId}
                onChange={(e) => setPaidSourceAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Paid By Member *
              </label>
              <select
                value={paidByUserId}
                onChange={(e) => setPaidByUserId(e.target.value)}
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
                onClick={() => setPayingSub(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold"
              >
                Confirm & Advance Cycle
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

