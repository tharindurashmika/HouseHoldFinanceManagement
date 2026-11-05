import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  Copy,
  Check,
  Smartphone,
  Database,
  X,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  saveSupabaseConfig,
  SUPABASE_FULL_SETUP_SQL,
  testSupabaseConnection,
} from '../../server/db/pool';
import { resetDbReadyCache } from '../api';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => Promise<void>;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const existing = getSupabaseConfig();
  const [url, setUrl] = useState(existing.url);
  const [anonKey, setAnonKey] = useState(existing.anonKey);
  const [activeTab, setActiveTab] = useState<'SUPABASE' | 'IPHONE'>('SUPABASE');
  const [copiedSql, setCopiedSql] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isOpen) return null;

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_FULL_SETUP_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) {
      setStatusMsg({
        ok: false,
        text: 'Please enter both your Supabase Project URL and Anon Public Key.',
      });
      return;
    }

    setTesting(true);
    setStatusMsg(null);
    try {
      const testRes = await testSupabaseConnection(url, anonKey);
      if (!testRes.ok) {
        setStatusMsg({ ok: false, text: testRes.message });
        setTesting(false);
        return;
      }

      saveSupabaseConfig(url, anonKey);
      resetDbReadyCache();
      await onConnected();
      setStatusMsg({
        ok: true,
        text: 'Connected to Supabase Cloud! Tharindu & Sudu household tables and data are now live & synced across devices.',
      });
    } catch (err: any) {
      setStatusMsg({
        ok: false,
        text: err?.message || 'Failed to initialize Supabase tables.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    clearSupabaseConfig();
    resetDbReadyCache();
    setUrl('');
    setAnonKey('');
    await onConnected();
    setStatusMsg({
      ok: true,
      text: 'Switched back to Local Device IndexedDB mode.',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Supabase Cloud Sync & iPhone App Setup
              </h2>
              <p className="text-xs text-slate-500">
                Sync live between your iPhone, Sudu&apos;s Phone &amp; Laptop via GitHub Pages + Supabase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 pt-3 gap-2 bg-slate-50/40 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab('SUPABASE')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all ${
              activeTab === 'SUPABASE'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            1. Connect Supabase Database
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('IPHONE')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all ${
              activeTab === 'IPHONE'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            2. Install on iPhone (PWA Guide)
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {activeTab === 'SUPABASE' ? (
            <>
              {/* Step 1: Copy SQL */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[11px]">
                      1
                    </span>
                    Run Setup SQL in Supabase SQL Editor (One-Time Only)
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied SQL Script!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy supabase_setup.sql
                      </>
                    )}
                  </button>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Open{' '}
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 underline font-semibold"
                  >
                    supabase.com/dashboard
                  </a>{' '}
                  ➔ Select your free project ➔ Click <strong>SQL Editor</strong> ➔ <strong>New Query</strong> ➔ Paste the copied SQL (or open <code>supabase_setup.sql</code>) and click <strong>Run</strong>.
                </p>
              </div>

              {/* Step 2: Enter URL & Anon Key */}
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[11px]">
                    2
                  </span>
                  Enter Supabase Project URL &amp; Anon Key (Project Settings ➔ API)
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Supabase Anon / Public Key (<code>anon</code> <code>public</code>)
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                  />
                </div>

                {statusMsg && (
                  <div
                    className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                      statusMsg.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {statusMsg.ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    )}
                    <div className="leading-relaxed">{statusMsg.text}</div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  {existing.isConfigured ? (
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      Disconnect Cloud (Use Local Device DB)
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Currently using Local Browser IndexedDB until connected.
                    </span>
                  )}

                  <button
                    type="submit"
                    disabled={testing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold shadow-md shadow-emerald-600/20"
                  >
                    {testing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Connecting &amp; Syncing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" /> Connect &amp; Sync Supabase Cloud
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  How to Install as a Full-Screen App on Your iPhone
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                  <li>
                    Open your hosted <strong>GitHub Pages link</strong> in <strong>Safari</strong> on your iPhone (and on Sudu&apos;s phone).
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button at the bottom center of Safari (the square with an upward arrow <code>[↑]</code>).
                  </li>
                  <li>
                    Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> in the top-right corner.
                  </li>
                </ol>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1.5">
                <div className="font-bold text-emerald-900 dark:text-emerald-200">
                  Real-Time Sync Between iPhone &amp; Laptop
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Once you connect your <strong>Supabase Project URL &amp; Anon Key</strong> in Tab 1 (or set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in GitHub Actions Secrets), every transaction you record on your iPhone immediately updates on your Laptop and Sudu&apos;s phone!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

