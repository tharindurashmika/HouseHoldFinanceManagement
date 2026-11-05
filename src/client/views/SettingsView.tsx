import React, { useState } from 'react';
import { Users, Tag, Plus, Download, Trash2, Shield } from 'lucide-react';
import { api } from '../api';
import type { Account, Category, User } from '../../shared/types';

interface SettingsViewProps {
  categories: Category[];
  accounts: Account[];
  members: User[];
  activeUserId: string;
  onSwitchMember: (userId: string) => void;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  categories,
  accounts,
  members,
  activeUserId,
  onSwitchMember,
  onRefresh,
}) => {
  // New Category / Subcategory state
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [parentId, setParentId] = useState<string>('');
  const [catColor, setCatColor] = useState('#3b82f6');
  const [isEssential, setIsEssential] = useState(true);

  // New Account state
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'BANK_SAVINGS' | 'BANK_CURRENT' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'DIGITAL_WALLET'>('BANK_SAVINGS');
  const [accOwner, setAccOwner] = useState<'HUSBAND' | 'WIFE' | 'JOINT'>('JOINT');
  const [accOpeningBal, setAccOpeningBal] = useState('0.00');
  const [linkedParentId, setLinkedParentId] = useState('');

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createCategory({
      name: catName,
      type: catType,
      parentId: parentId || null,
      color: catColor,
      defaultEssentiality: isEssential,
      isFixedDefault: false,
    });
    setCatName('');
    onRefresh();
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createAccount({
      name: accName,
      accountType: accType,
      ownershipType: accOwner,
      openingBalance: accOpeningBal,
      linkedParentAccountId: accType === 'DEBIT_CARD' && linkedParentId ? linkedParentId : null,
      currency: 'LKR',
    });
    setAccName('');
    setAccOpeningBal('0.00');
    onRefresh();
  };

  const handleClearDemoData = async () => {
    if (
      !window.confirm(
        'Reset all Transactions and Account Balances to LKR 0.00 so you can start fresh from November? (Your 5 Bank Accounts, 5 Cards, 3 Loans, Subscriptions, Recurring Schedules, and Categories will be kept intact.)'
      )
    ) {
      return;
    }
    await api.clearDemoData();
    onRefresh();
  };

  const handleDownloadBackup = async () => {
    const [txRes, loansRes, subsRes, recRes, goalsRes] = await Promise.all([
      api.getTransactions({}),
      api.getLoans(),
      api.getSubscriptions(),
      api.getRecurring(),
      api.getSavingsGoals(),
    ]);
    const backup = {
      exportedAt: new Date().toISOString(),
      members,
      categories,
      accounts,
      loans: loansRes.loans,
      subscriptions: subsRes.subscriptions,
      recurringSchedules: recRes.schedules,
      savingsGoals: goalsRes.goals,
      transactions: txRes.transactions,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `household_finance_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parentCategories = categories.filter((c) => c.type === catType);

  return (
    <div className="space-y-6">
      {/* 1. Household Members & Active Session */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Household Members & Active Recorder Session
            </h2>
            <p className="text-xs text-slate-500">
              Both Husband and Wife share the same household while every transaction tracks who recorded it and who paid/received it
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {members.map((m) => {
            const isActive = m.id === activeUserId;
            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border flex items-center justify-between ${
                  isActive
                    ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {m.displayName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {m.email} • Role: <strong>{m.memberRole}</strong>
                  </div>
                </div>
                {isActive ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white">
                    Active Session
                  </span>
                ) : (
                  <button
                    onClick={() => onSwitchMember(m.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Switch to {m.memberRole}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Configurable Categories & Subcategories (Section 5) */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-emerald-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Configurable Categories & Subcategories
            </h2>
            <p className="text-xs text-slate-500">
              Add custom main categories or subcategories to tailor the system to your evolving household needs
            </p>
          </div>
        </div>

        <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <div>
            <label className="block font-semibold text-slate-500 mb-1">Type</label>
            <select
              value={catType}
              onChange={(e) => {
                setCatType(e.target.value as any);
                setParentId('');
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="EXPENSE">Expense Category</option>
              <option value="INCOME">Income Category</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Parent Category (Optional)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="">None (Create New Main Category)</option>
              {parentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  Subcategory under: {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Category Name *</label>
            <input
              type="text"
              required
              placeholder="e.g., Baby Care, Pet Supplies..."
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <input
              type="color"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer"
            />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isEssential}
                onChange={(e) => setIsEssential(e.target.checked)}
              />
              Essential Default
            </label>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg bg-emerald-600 text-white font-semibold"
            >
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {cat.type}
                </span>
              </div>
              {cat.subcategories && cat.subcategories.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {cat.subcategories.map((sub) => (
                    <span
                      key={sub.id}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700"
                    >
                      {sub.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Add New Bank Account, Card, or Digital Wallet */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Add Bank Account, Card, or Digital Wallet
        </h2>
        <form onSubmit={handleAddAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-500 mb-1">Account Name *</label>
            <input
              type="text"
              required
              placeholder="e.g., BOC Savings A/C, PickMe Wallet..."
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Account Type</label>
            <select
              value={accType}
              onChange={(e) => setAccType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="BANK_SAVINGS">Bank Savings Account</option>
              <option value="BANK_CURRENT">Bank Current Account</option>
              <option value="CASH">Cash Wallet</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="DIGITAL_WALLET">Digital Wallet</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 mb-1">Owner</label>
            <select
              value={accOwner}
              onChange={(e) => setAccOwner(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="JOINT">Joint (Husband & Wife)</option>
              <option value="HUSBAND">Husband</option>
              <option value="WIFE">Wife</option>
            </select>
          </div>

          {accType === 'DEBIT_CARD' ? (
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Linked Parent Bank Account</label>
              <select
                value={linkedParentId}
                onChange={(e) => setLinkedParentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Standalone Balance</option>
                {accounts
                  .filter((a) => a.accountType.startsWith('BANK_'))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Link to: {a.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Opening Balance (LKR)</label>
              <input
                type="number"
                step="0.01"
                value={accOpeningBal}
                onChange={(e) => setAccOpeningBal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
          )}

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold"
            >
              Create Account
            </button>
          </div>
        </form>
      </div>

      {/* 4. Backup & Demo Data Controls */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Database Backup & Demo Data Controls
            </h3>
            <p className="text-xs text-slate-500">
              Download a full JSON snapshot of your household database or clear seeded demo transactions to start fresh.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
          >
            <Download className="w-4 h-4" /> Download Backup (.json)
          </button>
          <button
            onClick={handleClearDemoData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold"
          >
            <Trash2 className="w-4 h-4" /> Reset All Records to 0
          </button>
        </div>
      </div>
    </div>
  );
};

