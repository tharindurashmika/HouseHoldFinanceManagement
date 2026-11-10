import React, { useState } from 'react';
import {
  Users,
  Tag,
  Plus,
  Download,
  Trash2,
  Shield,
  Landmark,
  CreditCard,
  Wallet,
  Edit,
  Scale,
  Camera,
  ExternalLink,
  Key,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api';
import { formatLKR } from '../../shared/decimal';
import { EditAccountModal } from '../components/EditAccountModal';
import { AccountReconcileModal } from '../components/AccountReconcileModal';
import { getGeminiApiKey, setGeminiApiKey, testGeminiApiKey } from '../services/geminiReceiptService';
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
  const [accBankName, setAccBankName] = useState('');
  const [accCardLastFour, setAccCardLastFour] = useState('');
  const [accType, setAccType] = useState<'BANK_SAVINGS' | 'BANK_CURRENT' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'DIGITAL_WALLET'>('BANK_SAVINGS');
  const [accOwner, setAccOwner] = useState<'HUSBAND' | 'WIFE' | 'JOINT'>('JOINT');
  const [accOpeningBal, setAccOpeningBal] = useState('0.00');
  const [accOpeningBalDate, setAccOpeningBalDate] = useState('2026-11-01');
  const [linkedParentId, setLinkedParentId] = useState('');

  // Modals state
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [reconcilingAccId, setReconcilingAccId] = useState<string | null>(null);

  // Gemini API Key state
  const [geminiKey, setGeminiKey] = useState(() => getGeminiApiKey());
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveGeminiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiApiKey(geminiKey);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestGeminiKey = async () => {
    if (!geminiKey) return;
    setTestingKey(true);
    setTestResult(null);
    const res = await testGeminiApiKey(geminiKey);
    setTestingKey(false);
    setTestResult(res);
  };

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
      bankName: accBankName.trim() || null,
      accountType: accType,
      cardLastFour: accType === 'DEBIT_CARD' || accType === 'CREDIT_CARD' ? accCardLastFour.trim() || null : null,
      ownershipType: accOwner,
      openingBalance: accOpeningBal,
      openingBalanceDate: accOpeningBalDate || '2026-11-01',
      linkedParentAccountId: accType === 'DEBIT_CARD' && linkedParentId ? linkedParentId : null,
      currency: 'LKR',
    });
    setAccName('');
    setAccBankName('');
    setAccCardLastFour('');
    setAccOpeningBal('0.00');
    onRefresh();
  };

  const handleClearDemoData = async () => {
    if (
      !window.confirm(
        'Clear all seeded Demo Transactions, Loans, Subscriptions, Budgets, and Savings Goals? Your Household members, Categories, and Bank Accounts will be kept.'
      )
    ) {
      return;
    }
    await api.clearDemoData();
    onRefresh();
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

      {/* 3. Bank Accounts, Cards & Cash Wallets Configuration (Requirement 8) */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-5 h-5 text-blue-600" />
              <span>Accounts, Debit/Credit Cards & Cash Wallets</span>
            </h2>
            <p className="text-xs text-slate-500">
              Manage Commercial Bank, BOC, NSB, physical cash wallets, card-to-account mappings, and opening balances
            </p>
          </div>
        </div>

        {/* Existing Accounts & Cards Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Account / Card Name</th>
                <th className="p-2.5">Bank / Institution</th>
                <th className="p-2.5">Type</th>
                <th className="p-2.5">Owner</th>
                <th className="p-2.5">Card Digits</th>
                <th className="p-2.5">Linked Parent Account</th>
                <th className="p-2.5 text-right">Opening Balance</th>
                <th className="p-2.5 text-right font-bold text-slate-900 dark:text-white">Current Balance</th>
                <th className="p-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {accounts.map((acc) => {
                const parent = acc.linkedParentAccountId
                  ? accounts.find((a) => a.id === acc.linkedParentAccountId)
                  : null;
                return (
                  <tr key={acc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {acc.name}
                    </td>
                    <td className="p-2.5 text-slate-500 whitespace-nowrap">
                      {acc.bankName || (acc.accountType === 'CASH' ? 'Physical Cash' : '—')}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold">
                        {acc.accountType}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-500 whitespace-nowrap">
                      {acc.ownershipType}
                    </td>
                    <td className="p-2.5 font-mono whitespace-nowrap">
                      {acc.cardLastFour ? `•••• ${acc.cardLastFour}` : '—'}
                    </td>
                    <td className="p-2.5 text-indigo-600 dark:text-indigo-400 font-medium whitespace-nowrap">
                      {parent ? `Linked to ${parent.name}` : '—'}
                    </td>
                    <td className="p-2.5 text-right font-mono whitespace-nowrap">
                      {formatLKR(acc.openingBalance, { showDecimals: false })}
                      <span className="block text-[9px] text-slate-400 font-sans">{acc.openingBalanceDate || '2026-11-01'}</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatLKR(acc.currentBalance)}
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setEditingAcc(acc)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> Edit
                        </button>
                        {!acc.linkedParentAccountId && (
                          <button
                            onClick={() => setReconcilingAccId(acc.id)}
                            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 transition flex items-center gap-1"
                          >
                            <Scale className="w-3 h-3" /> Reconcile
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add New Account Form */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Add New Bank Account, Debit/Credit Card, or Cash Wallet
          </h3>
          <form onSubmit={handleAddAccount} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Account / Card Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Commercial Bank New, Wallet..."
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Bank / Institution Name</label>
              <input
                type="text"
                placeholder="e.g. Commercial Bank, BOC, NSB"
                value={accBankName}
                onChange={(e) => setAccBankName(e.target.value)}
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
                <option value="HUSBAND">Husband (Tharindu)</option>
                <option value="WIFE">Wife (Sudu)</option>
              </select>
            </div>

            {(accType === 'DEBIT_CARD' || accType === 'CREDIT_CARD') && (
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Card Ending 4 Digits</label>
                <input
                  type="text"
                  placeholder="e.g. 1143 or ADD_LATER"
                  value={accCardLastFour}
                  onChange={(e) => setAccCardLastFour(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            )}

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

            <div>
              <label className="block font-semibold text-slate-500 mb-1">Opening Balance Date</label>
              <input
                type="date"
                value={accOpeningBalDate}
                onChange={(e) => setAccOpeningBalDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modals for Edit & Reconciliation */}
      <EditAccountModal
        isOpen={Boolean(editingAcc)}
        onClose={() => setEditingAcc(null)}
        onSaved={onRefresh}
        account={editingAcc}
        allAccounts={accounts}
      />

      <AccountReconcileModal
        isOpen={Boolean(reconcilingAccId)}
        onClose={() => setReconcilingAccId(null)}
        onReconciled={onRefresh}
        accounts={accounts}
        initialAccountId={reconcilingAccId || undefined}
        activeUserId={activeUserId}
      />

      {/* 4. Smart Bill / Receipt Scanner Settings (Google Gemini 1.5 Flash) */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Smart Receipt & Bill Scanner (Gemini 3.8 Flash Vision)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold uppercase">
                  100% Free
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Auto-extract total amounts, dates, merchants, and categories from phone camera photos of Keells, Cargills, CEB, and fuel slips.
              </p>
            </div>
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 shrink-0"
          >
            <span>Get Free Google Key</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <form onSubmit={handleSaveGeminiKey} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                placeholder="Paste your Gemini API Key (e.g. AIzaSy...)"
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  setTestResult(null);
                }}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shrink-0"
            >
              Save Key
            </button>
            <button
              type="button"
              disabled={!geminiKey || testingKey}
              onClick={handleTestGeminiKey}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 shrink-0"
            >
              {testingKey ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {saveSuccess && (
            <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Gemini API Key saved to this device!
            </div>
          )}

          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </form>
      </div>

      {/* 5. Backup & Demo Data Controls */}
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
          <a
            href="/api/settings/backup"
            download="household_finance_backup.json"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
          >
            <Download className="w-4 h-4" /> Download Backup (.json)
          </a>
          <button
            onClick={handleClearDemoData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold"
          >
            <Trash2 className="w-4 h-4" /> Clear Demo Data
          </button>
        </div>
      </div>
    </div>
  );
};

