import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  ShoppingBag,
  PieChart,
  Landmark,
  Cpu,
  PiggyBank,
  FileBarChart,
  Settings,
  Plus,
  Sun,
  Moon,
  Menu,
  X,
  Users,
  Cloud,
  MoreHorizontal,
} from 'lucide-react';
import { api, setActiveUserIdHeader, type HouseholdContextResponse } from './api';
import { getSupabaseConfig } from '../server/db/pool';
import { TransactionModal } from './components/TransactionModal';
import { SupabaseModal } from './components/SupabaseModal';
import { CommonDateRangeFilter } from './components/CommonDateRangeFilter';
import { getDateRangeForPreset, type DateRangePreset } from '../shared/decimal';
import { DashboardView } from './views/DashboardView';
import { TransactionsView } from './views/TransactionsView';
import { IncomeView } from './views/IncomeView';
import { ExpensesView } from './views/ExpensesView';
import { BudgetsView } from './views/BudgetsView';
import { LoansCommitmentsView } from './views/LoansCommitmentsView';
import { SubscriptionsView } from './views/SubscriptionsView';
import { SavingsGoalsView } from './views/SavingsGoalsView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import type { Transaction, TransactionType } from '../shared/types';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'income', label: 'Income', icon: TrendingUp },
  { id: 'expenses', label: 'Expenses', icon: ShoppingBag },
  { id: 'budgets', label: 'Budgets', icon: PieChart },
  { id: 'loans', label: 'Loans & Cards', icon: Landmark },
  { id: 'subscriptions', label: 'Subscriptions', icon: Cpu },
  { id: 'savings', label: 'Savings Goals', icon: PiggyBank },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

const VALID_TABS = [
  'dashboard',
  'transactions',
  'income',
  'expenses',
  'budgets',
  'loans',
  'subscriptions',
  'savings',
  'reports',
  'settings',
] as const;

type NavTabId = (typeof VALID_TABS)[number];

function getTabFromHash(): NavTabId {
  if (typeof window === 'undefined') return 'dashboard';
  const rawHash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
  const cleanTab = rawHash.split('?')[0].split('/')[0];
  if (VALID_TABS.includes(cleanTab as NavTabId)) {
    return cleanTab as NavTabId;
  }
  return 'dashboard';
}

function setHashForTab(tab: string) {
  if (typeof window === 'undefined') return;
  const targetHash = `#/${tab}`;
  if (window.location.hash !== targetHash) {
    if (!window.location.hash || window.location.hash === '#') {
      window.history.replaceState(null, '', targetHash);
    } else {
      window.location.hash = targetHash;
    }
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTabState] = useState<string>(() => getTabFromHash());

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    setHashForTab(tab);
  }, []);

  useEffect(() => {
    if (!window.location.hash || window.location.hash === '#') {
      setHashForTab('dashboard');
    }

    const handleHashChange = () => {
      const tab = getTabFromHash();
      setActiveTabState(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const currentNav = NAV_ITEMS.find((n) => n.id === activeTab);
    const label = currentNav?.label || 'Dashboard';
    document.title = `${label} — Tharindu & Sudu Household Finance`;
  }, [activeTab]);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('hf_theme') === 'dark';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState<boolean>(false);
  const [context, setContext] = useState<HouseholdContextResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Global Quick-Add / Edit Transaction Modal state
  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [txModalInitialType, setTxModalInitialType] = useState<TransactionType>('EXPENSE');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // Global Shared Date Range Filter state across all views
  const [commonDateRange, setCommonDateRange] = useState<{
    startDate: string;
    endDate: string;
    preset: DateRangePreset;
  }>(() => {
    try {
      const saved = localStorage.getItem('hf_common_date_filter');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.startDate && parsed.endDate) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    const def = getDateRangeForPreset('CURRENT_MONTH');
    return {
      startDate: def.startDate,
      endDate: def.endDate,
      preset: 'CURRENT_MONTH',
    };
  });

  const handleCommonDateRangeChange = useCallback(
    (startDate: string, endDate: string, preset: DateRangePreset) => {
      setCommonDateRange({ startDate, endDate, preset });
      try {
        localStorage.setItem(
          'hf_common_date_filter',
          JSON.stringify({ startDate, endDate, preset })
        );
      } catch {
        // ignore
      }
    },
    []
  );

  const handleSimpleDateChange = useCallback(
    (startDate: string, endDate: string) => {
      handleCommonDateRangeChange(startDate, endDate, 'CUSTOM');
    },
    [handleCommonDateRangeChange]
  );

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('hf_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('hf_theme', 'light');
    }
  }, [darkMode]);

  const loadContext = useCallback(async () => {
    try {
      setErrorMsg(null);
      const ctx = await api.getContext();
      setContext(ctx);
    } catch (err: any) {
      console.error('Failed to load household context:', err);
      setErrorMsg(err?.message || 'Failed to connect to database.');
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext, refreshTrigger]);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSwitchMember = async (userId: string) => {
    setActiveUserIdHeader(userId);
    await api.switchMember(userId);
    triggerRefresh();
  };

  const handleOpenNewTx = (type: TransactionType = 'EXPENSE') => {
    setEditingTx(null);
    setTxModalInitialType(type);
    setTxModalOpen(true);
  };

  const handleOpenEditTx = (tx: Transaction) => {
    setEditingTx(tx);
    setTxModalInitialType(tx.transactionType);
    setTxModalOpen(true);
  };

  const supaCfg = getSupabaseConfig();

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 p-4">
        <div className="text-center space-y-3 max-w-md">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center mx-auto shadow-lg">
            LKR
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            Tharindu &amp; Sudu Household Finance
          </div>
          {errorMsg ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
              <button
                onClick={() => setSupabaseModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow"
              >
                Configure Supabase Cloud Connection
              </button>
              <SupabaseModal
                isOpen={supabaseModalOpen}
                onClose={() => setSupabaseModalOpen(false)}
                onConnected={async () => {
                  triggerRefresh();
                }}
              />
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              Initializing Sri Lanka (LKR) financial ledger...
            </div>
          )}
        </div>
      </div>
    );
  }

  const { household, activeUser, members, categories, accounts } = context;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar Navigation */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              LKR
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {household.name}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sri Lanka • DD MMM YYYY
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          <button
            onClick={() => handleOpenNewTx('EXPENSE')}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Quick-Add Transaction
          </button>

          <button
            onClick={() => setSupabaseModalOpen(true)}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[11px] font-bold border transition ${
              supaCfg.isConfigured
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            {supaCfg.isConfigured ? 'Supabase Cloud Synced' : 'Connect Supabase Cloud'}
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {/* Active Household Member Switcher in Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> Active Household Member
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {members.map((m) => {
              const isSelected = m.id === activeUser.userId;
              return (
                <button
                  key={m.id}
                  onClick={() => handleSwitchMember(m.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition truncate ${
                    isSelected
                      ? m.memberRole === 'HUSBAND'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-pink-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {m.memberRole === 'HUSBAND' ? 'Tharindu' : 'Sudu'}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header (iPhone Safe Area Top Aware) */}
        <header className="no-print sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Dashboard'}
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                <strong>{activeUser.displayName}</strong> • Shared LKR Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Husband/Wife Quick Switcher */}
            <div className="flex lg:hidden bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              {members.map((m) => {
                const isSelected = m.id === activeUser.userId;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleSwitchMember(m.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition ${
                      isSelected
                        ? m.memberRole === 'HUSBAND'
                          ? 'bg-blue-600 text-white'
                          : 'bg-pink-600 text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {m.memberRole === 'HUSBAND' ? 'Tharindu' : 'Sudu'}
                  </button>
                );
              })}
            </div>

            {/* Supabase Cloud Status Pill */}
            <button
              onClick={() => setSupabaseModalOpen(true)}
              title="Supabase Cloud Sync & iPhone Setup"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                supaCfg.isConfigured
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  supaCfg.isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="hidden sm:inline">
                {supaCfg.isConfigured ? 'Supabase Cloud' : 'Connect Cloud'}
              </span>
              <Cloud className="w-3.5 h-3.5 sm:hidden" />
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              title="Toggle Light / Dark Theme"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Full Navigation Sheet */}
        {mobileMenuOpen && (
          <div className="no-print lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-1.5 shadow-xl">
            <div className="grid grid-cols-2 gap-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.id}
                    href={`#/${item.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      activeTab === item.id
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </div>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setSupabaseModalOpen(true);
              }}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow"
            >
              <Cloud className="w-4 h-4" /> Supabase Cloud Sync &amp; iPhone Install Guide
            </button>
          </div>
        )}

        {/* Active View Content (with bottom padding on mobile for iPhone Bottom Tab Bar) */}
        <main className="flex-1 p-3.5 sm:p-6 pb-24 lg:pb-6 max-w-7xl w-full mx-auto">
          {/* Common Date Range Filter Bar across analytics and ledger pages */}
          {['dashboard', 'transactions', 'income', 'expenses', 'budgets', 'reports'].includes(activeTab) && (
            <div className="mb-5">
              <CommonDateRangeFilter
                startDate={commonDateRange.startDate}
                endDate={commonDateRange.endDate}
                preset={commonDateRange.preset}
                onDateRangeChange={handleCommonDateRangeChange}
              />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              refreshTrigger={refreshTrigger}
              startDate={commonDateRange.startDate}
              endDate={commonDateRange.endDate}
              onQuickAdd={handleOpenNewTx}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              categories={categories}
              accounts={accounts}
              members={members}
              refreshTrigger={refreshTrigger}
              onRefresh={triggerRefresh}
              onOpenNew={handleOpenNewTx}
              onOpenEdit={handleOpenEditTx}
              startDate={commonDateRange.startDate}
              endDate={commonDateRange.endDate}
              onDateChange={handleSimpleDateChange}
            />
          )}

          {activeTab === 'income' && (
            <IncomeView
              refreshTrigger={refreshTrigger}
              startDate={commonDateRange.startDate}
              endDate={commonDateRange.endDate}
              onOpenNew={handleOpenNewTx}
              onOpenEdit={handleOpenEditTx}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesView
              categories={categories}
              refreshTrigger={refreshTrigger}
              startDate={commonDateRange.startDate}
              endDate={commonDateRange.endDate}
              onOpenNew={handleOpenNewTx}
              onOpenEdit={handleOpenEditTx}
            />
          )}

          {activeTab === 'budgets' && (
            <BudgetsView
              categories={categories}
              refreshTrigger={refreshTrigger}
              onRefresh={triggerRefresh}
              startDate={commonDateRange.startDate}
            />
          )}

          {activeTab === 'loans' && (
            <LoansCommitmentsView
              categories={categories}
              accounts={accounts}
              members={members}
              activeUserId={activeUser.userId}
              refreshTrigger={refreshTrigger}
              onRefresh={triggerRefresh}
              onOpenNewTx={handleOpenNewTx}
            />
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionsView
              categories={categories}
              accounts={accounts}
              members={members}
              activeUserId={activeUser.userId}
              refreshTrigger={refreshTrigger}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'savings' && (
            <SavingsGoalsView
              accounts={accounts}
              members={members}
              activeUserId={activeUser.userId}
              refreshTrigger={refreshTrigger}
              onRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              categories={categories}
              refreshTrigger={refreshTrigger}
              startDate={commonDateRange.startDate}
              endDate={commonDateRange.endDate}
              onDateChange={handleSimpleDateChange}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              categories={categories}
              accounts={accounts}
              members={members}
              activeUserId={activeUser.userId}
              onSwitchMember={handleSwitchMember}
              onRefresh={triggerRefresh}
            />
          )}
        </main>

        {/* Native iPhone / Mobile Bottom Navigation Bar */}
        <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around">
          <a
            href="#/dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
              setMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-bold ${
              activeTab === 'dashboard'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Home</span>
          </a>

          <a
            href="#/income"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('income');
              setMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-bold ${
              activeTab === 'income'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span>Income</span>
          </a>

          {/* Center Floating + Add Transaction Button */}
          <button
            onClick={() => handleOpenNewTx('EXPENSE')}
            className="flex flex-col items-center justify-center -mt-5 w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 active:scale-95 transition"
            aria-label="Add Transaction"
          >
            <Plus className="w-6 h-6" />
          </button>

          <a
            href="#/loans"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('loans');
              setMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-bold ${
              activeTab === 'loans'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Landmark className="w-5 h-5" />
            <span>Loans/Cards</span>
          </a>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-bold ${
              mobileMenuOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </nav>
      </div>

      {/* Global Add / Edit Transaction Modal */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onSaved={triggerRefresh}
        categories={categories}
        accounts={accounts}
        members={members}
        activeUserId={activeUser.userId}
        editingTransaction={editingTx}
        initialType={txModalInitialType}
      />

      {/* Supabase Cloud & iPhone PWA Setup Modal */}
      <SupabaseModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
        onConnected={async () => {
          triggerRefresh();
        }}
      />
    </div>
  );
};
