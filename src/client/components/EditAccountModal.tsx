import React, { useState, useEffect } from 'react';
import { X, CreditCard, Landmark, Wallet, Save } from 'lucide-react';
import { api } from '../api';
import { toMoneyString } from '../../shared/decimal';
import type { Account, AccountType } from '../../shared/types';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  account: Account | null;
  allAccounts: Account[];
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  account,
  allAccounts,
}) => {
  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [linkedParentAccountId, setLinkedParentAccountId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceDate, setOpeningBalanceDate] = useState('2026-11-01');
  const [creditLimit, setCreditLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankParentAccounts = allAccounts.filter(
    (a) =>
      a.id !== account?.id &&
      (a.accountType === 'BANK_SAVINGS' || a.accountType === 'BANK_CURRENT') &&
      !a.linkedParentAccountId
  );

  useEffect(() => {
    if (!isOpen || !account) return;
    setName(account.name);
    setBankName(account.bankName || '');
    setCardLastFour(account.cardLastFour || '');
    setLinkedParentAccountId(account.linkedParentAccountId || '');
    setOpeningBalance(account.openingBalance || '0.00');
    setOpeningBalanceDate(account.openingBalanceDate || '2026-11-01');
    setCreditLimit(account.creditLimit || '');
    setNotes(account.notes || '');
    setError(null);
  }, [isOpen, account]);

  if (!isOpen || !account) return null;

  const isCard = account.accountType === 'DEBIT_CARD' || account.accountType === 'CREDIT_CARD';
  const isCreditCard = account.accountType === 'CREDIT_CARD';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.updateAccount(account.id, {
        name: name.trim(),
        bankName: bankName.trim() || null,
        cardLastFour: isCard ? cardLastFour.trim() || null : null,
        linkedParentAccountId: account.accountType === 'DEBIT_CARD' ? linkedParentAccountId || null : null,
        openingBalance: toMoneyString(openingBalance || '0'),
        openingBalanceDate: openingBalanceDate || '2026-11-01',
        creditLimit: isCreditCard && creditLimit ? toMoneyString(creditLimit) : null,
        notes: notes.trim() || null,
      });

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              {isCard ? <CreditCard className="w-5 h-5" /> : account.accountType === 'CASH' ? <Wallet className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Edit {isCard ? 'Card & Account Mapping' : 'Account Details'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure bank name, opening balances, and card connections
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
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
              Account / Card Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Bank / Institution Name
              </label>
              <input
                type="text"
                placeholder="e.g. Commercial Bank, BOC, NSB"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            {isCard && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Card Ending 4 Digits
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1143 or ADD_LATER"
                  maxLength={10}
                  value={cardLastFour}
                  onChange={(e) => setCardLastFour(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            )}
          </div>

          {account.accountType === 'DEBIT_CARD' && (
            <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
              <label className="block text-xs font-bold text-indigo-950 dark:text-indigo-200 mb-1">
                Linked Parent Bank Account
              </label>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2">
                Expenses recorded with this debit card will automatically deduct from the selected bank account.
              </p>
              <select
                value={linkedParentAccountId}
                onChange={(e) => setLinkedParentAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">-- No Linked Parent Account --</option>
                {bankParentAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.bankName || b.accountType})
                  </option>
                ))}
              </select>
            </div>
          )}

          {isCreditCard && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Credit Limit (LKR)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 30000.00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Opening Balance (LKR)
              </label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Starting balance for calculations
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Opening Balance Date
              </label>
              <input
                type="date"
                value={openingBalanceDate}
                onChange={(e) => setOpeningBalanceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                Default: 2026-11-01
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
              Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Salary account, OT account, personal cash"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

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
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition shadow-md flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {submitting ? 'Saving...' : 'Save Account Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
