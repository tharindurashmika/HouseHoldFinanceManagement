import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, HelpCircle, History, Landmark, Wallet, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { compareMoney, formatLKR, getTodayDateString, subMoney, toMoneyString } from '../../shared/decimal';
import type { Account, AccountReconciliation } from '../../shared/types';

interface AccountReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReconciled: () => void;
  accounts: Account[];
  initialAccountId?: string;
  activeUserId: string;
}

export const AccountReconcileModal: React.FC<AccountReconcileModalProps> = ({
  isOpen,
  onClose,
  onReconciled,
  accounts,
  initialAccountId,
  activeUserId,
}) => {
  const eligibleAccounts = accounts.filter(
    (a) => a.status === 'ACTIVE' && !a.linkedParentAccountId
  );

  const [accountId, setAccountId] = useState<string>(initialAccountId || eligibleAccounts[0]?.id || '');
  const [actualStatementBalance, setActualStatementBalance] = useState<string>('');
  const [reconciliationDate, setReconciliationDate] = useState<string>(() => getTodayDateString());
  const [notes, setNotes] = useState<string>('');
  const [reconciliations, setReconciliations] = useState<AccountReconciliation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedAccount = eligibleAccounts.find((a) => a.id === accountId) || eligibleAccounts[0];

  useEffect(() => {
    if (initialAccountId) {
      setAccountId(initialAccountId);
    } else if (eligibleAccounts.length > 0 && !accountId) {
      setAccountId(eligibleAccounts[0].id);
    }
  }, [initialAccountId, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedAccount) return;
    setActualStatementBalance('');
    setNotes('');
    setError(null);
    setSuccess(null);
    loadHistory(selectedAccount.id);
  }, [isOpen, selectedAccount?.id]);

  const loadHistory = async (accId: string) => {
    setLoadingHistory(true);
    try {
      const res = await api.getReconciliations();
      const filtered = res.reconciliations.filter((r) => r.accountId === accId);
      setReconciliations(filtered);
    } catch {
      // non-critical
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen || !selectedAccount) return null;

  const currentSysBalance = selectedAccount.currentBalance;
  let discrepancy = '0.00';
  let hasValidActual = false;

  if (actualStatementBalance && !isNaN(Number(actualStatementBalance))) {
    try {
      discrepancy = subMoney(actualStatementBalance, currentSysBalance);
      hasValidActual = true;
    } catch {
      hasValidActual = false;
    }
  }

  const isBalanced = hasValidActual && compareMoney(discrepancy, '0.00') === 0;
  const isActualLower = hasValidActual && compareMoney(discrepancy, '0.00') < 0;
  const isActualHigher = hasValidActual && compareMoney(discrepancy, '0.00') > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidActual) {
      setError('Please enter a valid statement balance from your bank app.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.reconcileAccount(selectedAccount.id, {
        reconciliationDate,
        actualStatementBalance: toMoneyString(actualStatementBalance),
        createAdjustmentTransaction: false,
        reconciledByUserId: activeUserId,
        notes: notes.trim() || null,
      });

      setSuccess('Bank balance recorded. Check the Running Balance Tracker for the difference.');
      await loadHistory(selectedAccount.id);
      onReconciled();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to record reconciliation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              {selectedAccount.accountType === 'CASH' ? <Wallet className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Balance Reconciliation</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compare and verify system balance against your banking application or physical cash
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Account Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Select Account or Wallet
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {eligibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.bankName || a.accountType}) • Current: {formatLKR(a.currentBalance)}
                </option>
              ))}
            </select>
          </div>

          {/* Balance Comparison Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                System Calculated Balance
              </span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {formatLKR(currentSysBalance)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculated from opening balance + recorded transactions
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Actual Bank / Wallet Balance (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 144970.00"
                value={actualStatementBalance}
                onChange={(e) => setActualStatementBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                From Commercial Bank App / BOC / NSB or physical count
              </p>
            </div>
          </div>

          {/* Live Discrepancy & Analysis Banner */}
          {hasValidActual && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                isBalanced
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : isActualLower
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
              }`}
            >
              {isBalanced ? (
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              )}
              <div className="text-sm">
                <div className="font-bold text-base">
                  {isBalanced
                    ? 'Perfect Match! Discrepancy: LKR 0.00'
                    : `Discrepancy: ${formatLKR(discrepancy)}`}
                </div>
                {isActualLower && (
                  <div className="mt-1 space-y-1 text-xs">
                    <p>
                      Your actual bank statement has <strong>{formatLKR(discrepancy.replace('-', ''))} less</strong> than recorded in the system.
                    </p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Possible Causes to Check:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                      <li>Unrecorded ATM withdrawal fees (typically LKR 30.00)</li>
                      <li>Online transfer fees (CEFT LKR 25-50 or SLIPS)</li>
                      <li>Bank monthly SMS alert charges or maintenance fees</li>
                      <li>Unrecorded recent cash withdrawal or debit card swipe</li>
                    </ul>
                  </div>
                )}
                {isActualHigher && (
                  <div className="mt-1 space-y-1 text-xs">
                    <p>
                      Your actual bank statement has <strong>{formatLKR(discrepancy)} more</strong> than recorded in the system.
                    </p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Possible Causes to Check:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                      <li>Unrecorded savings interest credited to your account</li>
                      <li>Unrecorded partial salary tranche or overtime deposit</li>
                      <li>Unrecorded cash deposit back to the bank</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reconciliation Date & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Reconciliation Date
              </label>
              <input
                type="date"
                value={reconciliationDate}
                onChange={(e) => setReconciliationDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Notes / Audit Remarks (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Verified with Commercial Bank mobile app"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !hasValidActual}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition shadow-md flex items-center gap-2"
            >
              {submitting ? 'Recording...' : 'Record Reconciliation & Verify'}
            </button>
          </div>
        </form>

        {/* Reconciliation History for this Account */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">
            <History className="w-4 h-4 text-slate-500" />
            <span>Reconciliation Audit History</span>
          </div>

          {loadingHistory ? (
            <p className="text-xs text-slate-400 py-2">Loading audit history...</p>
          ) : reconciliations.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">No prior reconciliation records found for this account.</p>
          ) : (
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0">
                  <tr>
                    <th className="p-2 rounded-l-lg">Date</th>
                    <th className="p-2">Recorded Balance</th>
                    <th className="p-2">Actual Statement</th>
                    <th className="p-2">Discrepancy</th>
                    <th className="p-2 rounded-r-lg">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reconciliations.map((r) => {
                    const isZero = compareMoney(r.discrepancyAmount, '0.00') === 0;
                    return (
                      <tr key={r.id}>
                        <td className="p-2 whitespace-nowrap">{r.reconciliationDate}</td>
                        <td className="p-2 whitespace-nowrap">{formatLKR(r.recordedBalance)}</td>
                        <td className="p-2 whitespace-nowrap font-medium">{formatLKR(r.actualStatementBalance)}</td>
                        <td className="p-2 whitespace-nowrap font-bold">
                          <span
                            className={
                              isZero
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {formatLKR(r.discrepancyAmount)}
                          </span>
                        </td>
                        <td className="p-2 text-slate-400 max-w-xs truncate">{r.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
