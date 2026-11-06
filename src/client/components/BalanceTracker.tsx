import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Save, Scale } from 'lucide-react';
import { api } from '../api';
import { compareMoney, formatLKR, subMoney, toMoneyString } from '../../shared/decimal';
import type { AccountBalanceBreakdown, AccountReconciliation } from '../../shared/types';

interface BalanceTrackerProps {
  breakdowns: AccountBalanceBreakdown[];
  refreshTrigger: number;
  activeUserId: string;
  onSaved: () => void;
}

const todayIso = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/**
 * Running balance tracker: shows the last balance the user typed in from the bank app,
 * the balance the system calculates from recorded transactions, and the deviation between them.
 * Saving a bank balance only records a reconciliation entry – it never edits transactions or the
 * calculated balance, so deviations stay visible until the missing transactions are recorded.
 */
export const BalanceTracker: React.FC<BalanceTrackerProps> = ({
  breakdowns,
  refreshTrigger,
  activeUserId,
  onSaved,
}) => {
  const [reconciliations, setReconciliations] = useState<AccountReconciliation[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getReconciliations()
      .then((res) => {
        if (active) setReconciliations(res.reconciliations);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshTrigger, breakdowns]);

  const rows = breakdowns.filter(
    (b) => b.status === 'ACTIVE' && !b.linkedParentAccountId && b.accountType !== 'DEBIT_CARD'
  );

  const latestFor = (accountId: string): AccountReconciliation | undefined =>
    reconciliations.find((r) => r.accountId === accountId);

  const handleSave = async (b: AccountBalanceBreakdown) => {
    const raw = (inputs[b.accountId] || '').trim();
    if (!raw || isNaN(Number(raw))) {
      setMessage({
        ok: false,
        text: `Enter the balance shown in your ${b.accountType === 'CASH' ? 'cash wallet' : 'bank app'} first.`,
      });
      return;
    }
    setSavingId(b.accountId);
    setMessage(null);
    try {
      await api.reconcileAccount(b.accountId, {
        reconciliationDate: todayIso(),
        actualStatementBalance: toMoneyString(raw),
        createAdjustmentTransaction: false,
        reconciledByUserId: activeUserId,
        notes: b.accountType === 'CASH' ? 'Cash count check (Balance Tracker)' : 'Quick bank balance check (Balance Tracker)',
      });
      setInputs((prev) => ({ ...prev, [b.accountId]: '' }));
      setMessage({ ok: true, text: `Saved verified balance for ${b.accountName}.` });
      onSaved();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Failed to save balance' });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Scale className="w-4 h-4 text-blue-600" />
          Running Balance Tracker — Bank Accounts & Cash Wallets
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Enter the balance shown in your bank app or counted physical cash in hand, then click Save.
          Difference = Actual balance − System balance. Updates instantly as you add expenses, income, or ATM withdrawals.
        </p>
      </div>

      {message && (
        <div
          className={`p-2.5 rounded-lg text-xs border ${
            message.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-2.5">Account / Wallet</th>
              <th className="p-2.5 text-right">System Balance (now)</th>
              <th className="p-2.5 text-right">Last Verified Balance</th>
              <th className="p-2.5 text-right">Difference (Deviation)</th>
              <th className="p-2.5">Since Last Check</th>
              <th className="p-2.5">Verify Current Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
            {rows.map((b) => {
              const last = latestFor(b.accountId);
              const system = b.currentCalculatedBalance;
              const diff = last ? subMoney(last.actualStatementBalance, system) : null;
              const matched = diff !== null && compareMoney(diff, '0.00') === 0;
              const sinceCheck = last ? subMoney(system, last.recordedBalance) : null;
              const atCheckDiff = last ? last.discrepancyAmount : null;

              return (
                <tr key={b.accountId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900 dark:text-white">{b.accountName}</div>
                    <div className="text-[10px] text-slate-400">{b.bankName || b.accountType}</div>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatLKR(system)}
                  </td>
                  <td className="p-2.5 text-right font-mono whitespace-nowrap">
                    {last ? (
                      <>
                        {formatLKR(last.actualStatementBalance)}
                        <span className="block text-[10px] text-slate-400 font-sans">
                          as of {last.reconciliationDate}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400 font-sans">Not entered yet</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right font-mono whitespace-nowrap">
                    {diff === null ? (
                      '—'
                    ) : matched ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          compareMoney(diff, '0.00') < 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {compareMoney(diff, '0.00') > 0 ? '+' : ''}
                        {formatLKR(diff)}
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {last && sinceCheck !== null && atCheckDiff !== null ? (
                      <>
                        <div>
                          Recorded since: {compareMoney(sinceCheck, '0.00') > 0 ? '+' : ''}
                          {formatLKR(sinceCheck)}
                        </div>
                        <div>
                          Gap at check: {formatLKR(atCheckDiff)}
                          {compareMoney(atCheckDiff, '0.00') !== 0 ? ' (unexplained)' : ''}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={b.accountType === 'CASH' ? 'Cash in wallet' : 'Bank app balance'}
                        value={inputs[b.accountId] || ''}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [b.accountId]: e.target.value }))}
                        className="w-36 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleSave(b)}
                        disabled={savingId === b.accountId}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-semibold"
                      >
                        <Save className="w-3 h-3" />
                        {savingId === b.accountId ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
