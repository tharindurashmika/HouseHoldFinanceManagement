const crypto = globalThis.crypto;
import { query } from '../db/pool';
import { AppError } from '../middleware/error';
import { toMoneyString } from '../../shared/decimal';
import { evaluateMonthlyBudgets } from '../../shared/calculations';
import { listTransactions } from './transactionService';
import type { Budget } from '../../shared/types';

function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

export async function getMonthlyBudgetsWithActuals(
  householdId: string,
  year: number,
  month: number
) {
  const res = await query(
    `SELECT b.*,
            c.name AS category_name,
            c.color AS category_color,
            sc.name AS subcategory_name
     FROM budgets b
     JOIN categories c ON b.category_id = c.id
     LEFT JOIN categories sc ON b.subcategory_id = sc.id
     WHERE b.household_id = $1 AND b.year = $2 AND b.month = $3
     ORDER BY c.sort_order ASC, sc.sort_order ASC NULLS FIRST, b.member_scope ASC`,
    [householdId, year, month]
  );

  const budgets: Budget[] = res.rows.map((r) => ({
    id: r.id,
    householdId: r.household_id,
    year: Number(r.year),
    month: Number(r.month),
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    subcategoryId: r.subcategory_id,
    subcategoryName: r.subcategory_name || null,
    memberScope: r.member_scope,
    allocatedAmountLkr: toMoneyString(r.allocated_amount_lkr),
    alertThresholdPct: Number(r.alert_threshold_pct),
  }));

  const currRange = getMonthDateRange(year, month);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevRange = getMonthDateRange(prevYear, prevMonth);

  const [currTxs, prevTxs] = await Promise.all([
    listTransactions(householdId, {
      startDate: currRange.startDate,
      endDate: currRange.endDate,
      transactionType: 'EXPENSE',
    }),
    listTransactions(householdId, {
      startDate: prevRange.startDate,
      endDate: prevRange.endDate,
      transactionType: 'EXPENSE',
    }),
  ]);

  return evaluateMonthlyBudgets(budgets, currTxs, prevTxs);
}

export async function upsertBudget(
  householdId: string,
  input: {
    year: number;
    month: number;
    categoryId: string;
    subcategoryId?: string | null;
    memberScope: 'HOUSEHOLD' | 'HUSBAND' | 'WIFE';
    allocatedAmountLkr: string;
    alertThresholdPct?: number;
  }
): Promise<Budget> {
  const existing = await query(
    `SELECT id FROM budgets
     WHERE household_id = $1
       AND year = $2
       AND month = $3
       AND category_id = $4
       AND COALESCE(subcategory_id::text, '') = COALESCE($5::text, '')
       AND member_scope = $6`,
    [
      householdId,
      input.year,
      input.month,
      input.categoryId,
      input.subcategoryId || null,
      input.memberScope,
    ]
  );

  const amt = toMoneyString(input.allocatedAmountLkr);
  const threshold = input.alertThresholdPct ?? 80;
  let id: string;

  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await query(
      `UPDATE budgets
       SET allocated_amount_lkr = $1,
           alert_threshold_pct = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [amt, threshold, id]
    );
  } else {
    id = crypto.randomUUID();
    await query(
      `INSERT INTO budgets (
        id, household_id, year, month, category_id, subcategory_id, member_scope, allocated_amount_lkr, alert_threshold_pct
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        householdId,
        input.year,
        input.month,
        input.categoryId,
        input.subcategoryId || null,
        input.memberScope,
        amt,
        threshold,
      ]
    );
  }

  const evaluated = await getMonthlyBudgetsWithActuals(householdId, input.year, input.month);
  return evaluated.evaluatedBudgets.find((b) => b.id === id)!;
}

export async function deleteBudget(householdId: string, budgetId: string): Promise<void> {
  const res = await query('DELETE FROM budgets WHERE id = $1 AND household_id = $2', [
    budgetId,
    householdId,
  ]);
  if (res.rowCount === 0) {
    throw new AppError('Budget not found', 404);
  }
}

