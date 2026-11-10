import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Filter,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Split,
} from 'lucide-react';
import { api } from '../api';
import { formatDateSL, formatLKR } from '../../shared/decimal';
import type {
  Account,
  Category,
  Transaction,
  TransactionType,
  User,
} from '../../shared/types';

interface TransactionsViewProps {
  categories: Category[];
  accounts: Account[];
  members: User[];
  refreshTrigger: number;
  onRefresh: () => void;
  onOpenNew: (type: TransactionType) => void;
  onOpenEdit: (tx: Transaction) => void;
  startDate?: string;
  endDate?: string;
  onDateChange?: (start: string, end: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  categories,
  accounts,
  members,
  refreshTrigger,
  onRefresh,
  onOpenNew,
  onOpenEdit,
  startDate: propStartDate,
  endDate: propEndDate,
  onDateChange,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [memberRole, setMemberRole] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [internalStartDate, setInternalStartDate] = useState<string>('2026-11-01');
  const [internalEndDate, setInternalEndDate] = useState<string>('2026-11-30');

  const startDate = propStartDate || internalStartDate;
  const endDate = propEndDate || internalEndDate;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getTransactions({
        startDate,
        endDate,
        transactionType: typeFilter || undefined,
        categoryId: categoryId || undefined,
        memberRole: memberRole || undefined,
        accountId: accountId || undefined,
        search: search || undefined,
      })
      .then((res) => {
        if (active) setTransactions(res.transactions);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [startDate, endDate, typeFilter, categoryId, memberRole, accountId, search, refreshTrigger]);

  const handleDelete = async (tx: Transaction) => {
    if (!window.confirm(`Delete transaction "${tx.description}" (${formatLKR(tx.actualLkrAmount)})? Account balances and historical reports will be updated automatically.`)) {
      return;
    }
    await api.deleteTransaction(tx.id);
    onRefresh();
  };

  return (
    <div className="space-y-5">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Household Transaction Ledger
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Complete audit trail of income, expenses, and internal account transfers with member attribution
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenNew('EXPENSE')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record Expense
          </button>
          <button
            onClick={() => onOpenNew('INCOME')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record Income
          </button>
          <button
            onClick={() => onOpenNew('TRANSFER')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
          >
            <ArrowRightLeft className="w-4 h-4" /> Internal Transfer
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search description or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">All Types (Income/Expense/Transfer)</option>
          <option value="EXPENSE">Expenses Only</option>
          <option value="INCOME">Income Only</option>
          <option value="TRANSFER">Transfers Only</option>
        </select>

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>

        <select
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">Both Members (Husband & Wife)</option>
          <option value="HUSBAND">Paid / Earned by Husband</option>
          <option value="WIFE">Paid / Earned by Wife</option>
        </select>

        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">All Accounts & Cards</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) =>
                onDateChange ? onDateChange(e.target.value, endDate) : setInternalStartDate(e.target.value)
              }
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) =>
                onDateChange ? onDateChange(startDate, e.target.value) : setInternalEndDate(e.target.value)
              }
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <span className="text-slate-500 font-medium">
            Showing {transactions.length} transactions
          </span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No transactions match your current filters
            </div>
            <p className="text-xs text-slate-500">
              Try expanding the date range or click "Record Expense" above to add a new entry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Date (DD MMM YYYY)</th>
                  <th className="py-3 px-4">Description & Category</th>
                  <th className="py-3 px-4">Member Attribution</th>
                  <th className="py-3 px-4">Account & Method</th>
                  <th className="py-3 px-4 text-right">Amount (LKR)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                      <div>{formatDateSL(tx.transactionDate)}</div>
                      {tx.isDemoData && (
                        <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-sans">
                          DEMO
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {tx.transactionType === 'INCOME' && (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        )}
                        {tx.transactionType === 'EXPENSE' && (
                          <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        )}
                        {tx.transactionType === 'TRANSFER' && (
                          <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <span>{tx.description}</span>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                        {tx.transactionType === 'TRANSFER' ? (
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            Internal Transfer: {tx.sourceAccountName} → {tx.destinationAccountName}
                          </span>
                        ) : (
                          <>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {tx.categoryName}
                            </span>
                            {tx.subcategoryName && <span>› {tx.subcategoryName}</span>}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] ${
                                tx.isEssential
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                              }`}
                            >
                              {tx.isEssential ? 'Essential' : 'Non-Essential'}
                            </span>
                          </>
                        )}
                      </div>

                      {tx.items && tx.items.length > 0 && (
                        <div className="mt-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 space-y-1">
                          <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Split className="w-3 h-3" /> Itemized Receipt Breakdown ({tx.items.length} items):
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                            {tx.items.map((it, i) => (
                              <div key={i} className="flex justify-between">
                                <span>
                                  • {it.itemName}{' '}
                                  {it.subcategoryName ? `(${it.subcategoryName})` : ''}
                                </span>
                                <span className="font-mono">{formatLKR(it.amountLkr)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          tx.paidOrReceivedByRole === 'HUSBAND'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                            : 'bg-pink-50 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300'
                        }`}
                      >
                        {tx.paidOrReceivedByName || tx.paidOrReceivedByRole}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Scope: {tx.householdMemberScope}
                        {tx.fundingSource && tx.fundingSource !== 'REGULAR_INCOME' && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
                            • {tx.fundingSource.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-700 dark:text-slate-200">
                        {tx.sourceAccountName}
                      </div>
                      <div className="text-[10px] text-slate-400">{tx.paymentMethod}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono">
                      <div
                        className={`text-sm font-bold ${
                          tx.transactionType === 'INCOME'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : tx.transactionType === 'TRANSFER'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {tx.transactionType === 'INCOME'
                          ? `+${formatLKR(tx.actualLkrAmount)}`
                          : tx.transactionType === 'EXPENSE'
                            ? `-${formatLKR(tx.actualLkrAmount)}`
                            : formatLKR(tx.actualLkrAmount)}
                      </div>
                      {tx.originalCurrency !== 'LKR' && (
                        <div className="text-[10px] text-slate-400">
                          Orig: {tx.originalCurrency} {tx.originalAmount}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => onOpenEdit(tx)}
                          title="Edit Transaction"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(tx)}
                          title="Delete Transaction"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

