import { PGlite } from '@electric-sql/pglite';
import { POSTGRES_DDL } from './schema';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbExecutor {
  query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export const SUPABASE_RPC_FUNCTION_SQL = `-- ============================================================================
-- 1. SUPABASE RPC BRIDGE FUNCTION FOR HOUSEHOLD FINANCE PWA
-- Paste and Run this script in your Supabase SQL Editor (https://supabase.com)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  res jsonb;
  trimmed text;
BEGIN
  trimmed := btrim(sql_query, E' \\t\\n\\r;');
  IF trimmed = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  IF (trimmed ~* '^select\\M' OR trimmed ~* '\\mreturning\\M[^;]*$') AND trimmed !~ ';.*\\S' THEN
    EXECUTE format(
      'WITH _q AS (%s) SELECT COALESCE(jsonb_agg(row_to_json(_q)), ''[]''::jsonb) FROM _q',
      trimmed
    ) INTO res;
    RETURN COALESCE(res, '[]'::jsonb);
  ELSE
    EXECUTE trimmed;
    RETURN '[]'::jsonb;
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO PUBLIC;
`;

export const SUPABASE_FULL_SETUP_SQL = `${SUPABASE_RPC_FUNCTION_SQL}\n\n-- ============================================================================\n-- 2. HOUSEHOLD FINANCE DATABASE SCHEMA (11 TABLES & INDEXES)\n-- ============================================================================\n${POSTGRES_DDL}`;

const LS_SUPABASE_URL = 'hf_supabase_url';
const LS_SUPABASE_KEY = 'hf_supabase_anon_key';

function getStorageItem(key: string): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) || '';
    }
  } catch {
    // ignore storage errors
  }
  return '';
}

function setStorageItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (val) localStorage.setItem(key, val);
      else localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  source: 'env' | 'localStorage' | 'none';
} {
  const lsUrl = getStorageItem(LS_SUPABASE_URL).trim().replace(/\/+$/, '');
  const lsKey = getStorageItem(LS_SUPABASE_KEY).trim();

  if (lsUrl && lsKey) {
    return { url: lsUrl, anonKey: lsKey, isConfigured: true, source: 'localStorage' };
  }

  const envObj = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const envUrl = String(envObj.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const envKey = String(envObj.VITE_SUPABASE_ANON_KEY || '').trim();

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, isConfigured: true, source: 'env' };
  }

  return { url: '', anonKey: '', isConfigured: false, source: 'none' };
}

let isInitialized = false;
let pgliteInstance: PGlite | null = null;
let txMutex: Promise<unknown> = Promise.resolve();

export function saveSupabaseConfig(url: string, anonKey: string): void {
  setStorageItem(LS_SUPABASE_URL, url.trim().replace(/\/+$/, ''));
  setStorageItem(LS_SUPABASE_KEY, anonKey.trim());
  isInitialized = false;
}

export function clearSupabaseConfig(): void {
  setStorageItem(LS_SUPABASE_URL, '');
  setStorageItem(LS_SUPABASE_KEY, '');
  isInitialized = false;
}

function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    const elements = val.map((item) => {
      if (item === null || item === undefined) return 'NULL';
      const s = String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${s}"`;
    });
    const pgArrayLiteral = `{${elements.join(',')}}`.replace(/'/g, "''");
    return `'${pgArrayLiteral}'`;
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

export function formatSqlWithParams(sql: string, params: unknown[] = []): string {
  if (!params || params.length === 0) return sql;
  return sql.replace(/'(?:''|[^'])*'|(\$\d+)/g, (match, paramToken) => {
    if (!paramToken) return match;
    const index = parseInt(paramToken.slice(1), 10) - 1;
    if (index < 0 || index >= params.length) return match;
    return escapeSqlValue(params[index]);
  });
}

async function executeSupabaseRpc<T = any>(sqlQuery: string): Promise<QueryResult<T>> {
  const cfg = getSupabaseConfig();
  const endpoint = `${cfg.url}/rest/v1/rpc/exec_sql`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
    },
    body: JSON.stringify({ sql_query: sqlQuery }),
  });

  if (!response.ok) {
    let errText = '';
    try {
      const errJson = await response.json();
      errText = errJson.message || errJson.details || errJson.hint || JSON.stringify(errJson);
    } catch {
      errText = await response.text();
    }
    throw new Error(
      `Supabase SQL Error (${response.status}): ${errText}. Make sure you ran supabase_setup.sql in the Supabase SQL Editor.`
    );
  }

  const data = await response.json();
  const rows: T[] = Array.isArray(data) ? data : [];
  return {
    rows,
    rowCount: rows.length,
  };
}

async function getPglite(): Promise<PGlite> {
  if (!pgliteInstance) {
    const isTest =
      typeof process !== 'undefined' && process.env && process.env.PGLITE_DATA_DIR === 'memory://';
    const dataDir = isTest ? 'memory://' : 'idb://household-finance-sl-pwa';
    pgliteInstance = new PGlite(dataDir);
  }
  return pgliteInstance;
}

export async function initDatabase(): Promise<void> {
  if (isInitialized) return;

  const cfg = getSupabaseConfig();
  if (cfg.isConfigured) {
    await executeSupabaseRpc(POSTGRES_DDL);
    isInitialized = true;
    return;
  }

  const db = await getPglite();
  await db.exec(POSTGRES_DDL);
  isInitialized = true;
}

export async function query<T = any>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  await initDatabase();

  const cfg = getSupabaseConfig();
  if (cfg.isConfigured) {
    const formattedSql = formatSqlWithParams(text, params);
    return executeSupabaseRpc<T>(formattedSql);
  }

  const db = await getPglite();
  const res = await db.query<T>(text, params);
  return {
    rows: res.rows,
    rowCount: res.affectedRows ?? res.rows.length,
  };
}

export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  await initDatabase();

  const cfg = getSupabaseConfig();
  if (cfg.isConfigured) {
    const prev = txMutex;
    let release!: () => void;
    txMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      const executor: DbExecutor = {
        async query<R = any>(text: string, params: unknown[] = []): Promise<QueryResult<R>> {
          const formattedSql = formatSqlWithParams(text, params);
          return executeSupabaseRpc<R>(formattedSql);
        },
      };
      return await fn(executor);
    } finally {
      release();
    }
  }

  const db = await getPglite();
  const prev = txMutex;
  let release!: () => void;
  txMutex = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prev;
  try {
    return await db.transaction(async (pgTx) => {
      const executor: DbExecutor = {
        async query<R = any>(text: string, params: unknown[] = []): Promise<QueryResult<R>> {
          const res = await pgTx.query<R>(text, params);
          return {
            rows: res.rows,
            rowCount: res.affectedRows ?? res.rows.length,
          };
        },
      };
      return await fn(executor);
    });
  } finally {
    release();
  }
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{
  ok: boolean;
  message: string;
}> {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  const endpoint = `${cleanUrl}/rest/v1/rpc/exec_sql`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cleanKey,
      Authorization: `Bearer ${cleanKey}`,
    },
    body: JSON.stringify({ sql_query: 'SELECT 1 AS ok' }),
  });

  if (!response.ok) {
    let errText = '';
    try {
      const errJson = await response.json();
      errText = errJson.message || errJson.details || JSON.stringify(errJson);
    } catch {
      errText = await response.text();
    }
    return {
      ok: false,
      message: `Connection failed (${response.status}): ${errText}. Did you run supabase_setup.sql in Supabase SQL Editor first?`,
    };
  }

  return { ok: true, message: 'Connected to Supabase PostgreSQL successfully!' };
}

