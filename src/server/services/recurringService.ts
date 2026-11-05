const crypto = globalThis.crypto;
import { query, withTransaction } from '../db/pool';
import { AppError } from '../middleware/error';
import { toMoneyString } from '../../shared/decimal';
import { createTransactionInTx } from './transactionService';
import type {
  BillingFrequency,
  PaymentMethod,
  RecurringSchedule,
  TransactionType,
} from '../../shared/types';

function mapRecurringRow(row: any): RecurringSchedule {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    transactionType: row.transaction_type,
    categoryId: row.category_id,
    categoryName: row.category_name || undefined,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name || null,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name || undefined,
    assignedMemberRole: row.assigned_member_role || undefined,
    defaultAccountId: row.default_account_id,
    defaultAccountName: row.default_account_name || undefined,
    paymentMethod: row.payment_method,
    frequency: row.frequency,
    dueDayOfMonth: row.due_day_of_month !== null ? Number(row.due_day_of_month) : null,
    startDate: row.start_date,
    endDate: row.end_date,
    nextDueDate: row.next_due_date,
    expectedAmountLkr: toMoneyString(row.expected_amount_lkr),
    isVariableAmount: Boolean(row.is_variable_amount),
    isEssential: Boolean(row.is_essential),
    isFixed: Boolean(row.is_fixed),
    linkedLoanId: row.linked_loan_id,
    linkedSubscriptionId: row.linked_subscription_id,
    reminderDaysBefore: Number(row.reminder_days_before),
    isActive: Boolean(row.is_active),
    notes: row.notes,
  };
}

export async function listRecurringSchedules(householdId: string): Promise<RecurringSchedule[]> {
  const res = await query(
    `SELECT r.*,
            c.name AS category_name,
            sc.name AS subcategory_name,
            u.display_name AS assigned_user_name,
            u.member_role AS assigned_member_role,
            a.name AS default_account_name
     FROM recurring_schedules r
     LEFT JOIN categories c ON r.category_id = c.id
     LEFT JOIN categories sc ON r.subcategory_id = sc.id
     LEFT JOIN users u ON r.assigned_user_id = u.id
     LEFT JOIN accounts a ON r.default_account_id = a.id
     WHERE r.household_id = $1
     ORDER BY r.is_active DESC, r.next_due_date ASC, r.title ASC`,
    [householdId]
  );
  return res.rows.map(mapRecurringRow);
}

export async function createRecurringSchedule(
  householdId: string,
  input: {
    title: string;
    transactionType?: TransactionType;
    categoryId: string;
    subcategoryId?: string | null;
    assignedUserId: string;
    defaultAccountId: string;
    paymentMethod?: PaymentMethod;
    frequency?: BillingFrequency;
    dueDayOfMonth?: number | null;
    startDate: string;
    endDate?: string | null;
    nextDueDate: string;
    expectedAmountLkr: string;
    isVariableAmount?: boolean;
    isEssential?: boolean;
    isFixed?: boolean;
    linkedLoanId?: string | null;
    linkedSubscriptionId?: string | null;
    reminderDaysBefore?: number;
    isActive?: boolean;
    notes?: string | null;
  }
): Promise<RecurringSchedule> {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO recurring_schedules (
      id, household_id, title, transaction_type, category_id, subcategory_id,
      assigned_user_id, default_account_id, payment_method, frequency, due_day_of_month,
      start_date, end_date, next_due_date, expected_amount_lkr, is_variable_amount,
      is_essential, is_fixed, linked_loan_id, linked_subscription_id, reminder_days_before, is_active, notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23
    )`,
    [
      id,
      householdId,
      input.title.trim(),
      input.transactionType || 'EXPENSE',
      input.categoryId,
      input.subcategoryId || null,
      input.assignedUserId,
      input.defaultAccountId,
      input.paymentMethod || 'BANK_TRANSFER',
      input.frequency || 'MONTHLY',
      input.dueDayOfMonth ?? null,
      input.startDate,
      input.endDate || null,
      input.nextDueDate,
      toMoneyString(input.expectedAmountLkr),
      input.isVariableAmount ?? false,
      input.isEssential ?? true,
      input.isFixed ?? true,
      input.linkedLoanId || null,
      input.linkedSubscriptionId || null,
      input.reminderDaysBefore ?? 3,
      input.isActive ?? true,
      input.notes || null,
    ]
  );

  const list = await listRecurringSchedules(householdId);
  return list.find((r) => r.id === id)!;
}

function advanceRecurringDate(isoDate: string, freq: BillingFrequency): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (freq === 'YEARLY') {
    dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  } else if (freq === 'QUARTERLY') {
    dt.setUTCMonth(dt.getUTCMonth() + 3);
  } else if (freq === 'WEEKLY') {
    dt.setUTCDate(dt.getUTCDate() + 7);
  } else {
    dt.setUTCMonth(dt.getUTCMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Marks a scheduled recurring payment / utility bill as PAID by creating a confirmed Transaction
 * and advancing the schedule's nextDueDate.
 * Explicitly separates scheduled commitments from confirmed cash-flow transactions (Section 8).
 */
export async function markRecurringSchedulePaid(
  householdId: string,
  scheduleId: string,
  recordedByUserId: string,
  input: {
    paidDate: string;
    actualLkrAmount: string;
    sourceAccountId: string;
    paidByUserId: string;
    utilityBillingPeriodStart?: string | null;
    utilityBillingPeriodEnd?: string | null;
    notes?: string | null;
  }
): Promise<RecurringSchedule> {
  await withTransaction(async (tx) => {
    const recRes = await tx.query(
      'SELECT * FROM recurring_schedules WHERE id = $1 AND household_id = $2',
      [scheduleId, householdId]
    );
    if (!recRes.rows[0]) {
      throw new AppError('Recurring schedule not found', 404);
    }
    const rec = recRes.rows[0];
    const actualLkr = toMoneyString(input.actualLkrAmount);

    await createTransactionInTx(tx, householdId, {
      transactionDate: input.paidDate,
      transactionType: rec.transaction_type,
      description: `${rec.title}`,
      categoryId: rec.category_id,
      subcategoryId: rec.subcategory_id,
      originalAmount: actualLkr,
      originalCurrency: 'LKR',
      exchangeRate: '1.000000',
      actualLkrAmount: actualLkr,
      paymentMethod: rec.payment_method,
      sourceAccountId: input.sourceAccountId,
      paidOrReceivedByUserId: input.paidByUserId,
      recordedByUserId,
      householdMemberScope: 'SHARED',
      isEssential: Boolean(rec.is_essential),
      isFixed: Boolean(rec.is_fixed),
      recurringScheduleId: rec.id,
      loanId: rec.linked_loan_id,
      subscriptionId: rec.linked_subscription_id,
      utilityBillingPeriodStart: input.utilityBillingPeriodStart || null,
      utilityBillingPeriodEnd: input.utilityBillingPeriodEnd || null,
      notes: input.notes || `Confirmed recurring payment for ${rec.title}`,
    });

    const nextDue = advanceRecurringDate(rec.next_due_date, rec.frequency);
    await tx.query(
      `UPDATE recurring_schedules
       SET next_due_date = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [nextDue, rec.id]
    );
  });

  const list = await listRecurringSchedules(householdId);
  return list.find((r) => r.id === scheduleId)!;
}

