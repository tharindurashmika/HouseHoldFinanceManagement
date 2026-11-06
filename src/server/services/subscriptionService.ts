import { generateUUID } from '../../shared/uuid';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../middleware/error';
import { divMoney, toMoneyString } from '../../shared/decimal';
import { createTransactionInTx } from './transactionService';
import type {
  BillingFrequency,
  HouseholdMemberScope,
  PaymentMethod,
  Subscription,
  SubscriptionStatus,
} from '../../shared/types';

function mapSubscriptionRow(row: any): Subscription {
  return {
    id: row.id,
    householdId: row.household_id,
    usedByUserId: row.used_by_user_id,
    usedByName: row.used_by_name || (row.member_scope === 'SHARED' ? 'Both (Shared)' : row.member_scope),
    memberScope: row.member_scope,
    name: row.name,
    provider: row.provider,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name || null,
    billingAmount: toMoneyString(row.billing_amount),
    billingCurrency: row.billing_currency,
    estimatedLkrAmount: toMoneyString(row.estimated_lkr_amount),
    billingFrequency: row.billing_frequency,
    nextBillingDate: row.next_billing_date,
    defaultAccountId: row.default_account_id,
    defaultAccountName: row.default_account_name || null,
    paymentMethod: row.payment_method,
    status: row.status,
    lastReviewedDate: row.last_reviewed_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSubscriptions(householdId: string): Promise<Subscription[]> {
  const res = await query(
    `SELECT s.*,
            u.display_name AS used_by_name,
            sc.name AS subcategory_name,
            a.name AS default_account_name
     FROM subscriptions s
     LEFT JOIN users u ON s.used_by_user_id = u.id
     LEFT JOIN categories sc ON s.subcategory_id = sc.id
     LEFT JOIN accounts a ON s.default_account_id = a.id
     WHERE s.household_id = $1
     ORDER BY s.status ASC, s.next_billing_date ASC, s.name ASC`,
    [householdId]
  );
  return res.rows.map(mapSubscriptionRow);
}

export async function createSubscription(
  householdId: string,
  input: {
    usedByUserId?: string | null;
    memberScope: HouseholdMemberScope;
    name: string;
    provider: string;
    categoryId: string;
    subcategoryId?: string | null;
    billingAmount: string;
    billingCurrency: string;
    estimatedLkrAmount: string;
    billingFrequency: BillingFrequency;
    nextBillingDate: string;
    defaultAccountId?: string | null;
    paymentMethod: PaymentMethod;
    status?: SubscriptionStatus;
    lastReviewedDate?: string | null;
    notes?: string | null;
  }
): Promise<Subscription> {
  const id = generateUUID();
  await query(
    `INSERT INTO subscriptions (
      id, household_id, used_by_user_id, member_scope, name, provider,
      category_id, subcategory_id, billing_amount, billing_currency, estimated_lkr_amount,
      billing_frequency, next_billing_date, default_account_id, payment_method, status, last_reviewed_date, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      householdId,
      input.usedByUserId || null,
      input.memberScope,
      input.name.trim(),
      input.provider.trim(),
      input.categoryId,
      input.subcategoryId || null,
      toMoneyString(input.billingAmount),
      input.billingCurrency.toUpperCase(),
      toMoneyString(input.estimatedLkrAmount),
      input.billingFrequency,
      input.nextBillingDate,
      input.defaultAccountId || null,
      input.paymentMethod,
      input.status || 'ACTIVE',
      input.lastReviewedDate || null,
      input.notes || null,
    ]
  );

  const list = await listSubscriptions(householdId);
  return list.find((s) => s.id === id)!;
}

export async function updateSubscription(
  householdId: string,
  subscriptionId: string,
  input: Partial<{
    name: string;
    provider: string;
    billingAmount: string;
    billingCurrency: string;
    estimatedLkrAmount: string;
    billingFrequency: BillingFrequency;
    nextBillingDate: string;
    defaultAccountId: string | null;
    paymentMethod: PaymentMethod;
    status: SubscriptionStatus;
    lastReviewedDate: string | null;
    notes: string | null;
  }>
): Promise<Subscription> {
  const existing = await query(
    'SELECT * FROM subscriptions WHERE id = $1 AND household_id = $2',
    [subscriptionId, householdId]
  );
  if (!existing.rows[0]) {
    throw new AppError('Subscription not found', 404);
  }
  const curr = existing.rows[0];

  await query(
    `UPDATE subscriptions
     SET name = $1,
         provider = $2,
         billing_amount = $3,
         billing_currency = $4,
         estimated_lkr_amount = $5,
         billing_frequency = $6,
         next_billing_date = $7,
         default_account_id = $8,
         payment_method = $9,
         status = $10,
         last_reviewed_date = $11,
         notes = $12,
         updated_at = NOW()
     WHERE id = $13 AND household_id = $14`,
    [
      input.name !== undefined ? input.name.trim() : curr.name,
      input.provider !== undefined ? input.provider.trim() : curr.provider,
      input.billingAmount !== undefined ? toMoneyString(input.billingAmount) : curr.billing_amount,
      input.billingCurrency !== undefined
        ? input.billingCurrency.toUpperCase()
        : curr.billing_currency,
      input.estimatedLkrAmount !== undefined
        ? toMoneyString(input.estimatedLkrAmount)
        : curr.estimated_lkr_amount,
      input.billingFrequency !== undefined ? input.billingFrequency : curr.billing_frequency,
      input.nextBillingDate !== undefined ? input.nextBillingDate : curr.next_billing_date,
      input.defaultAccountId !== undefined ? input.defaultAccountId : curr.default_account_id,
      input.paymentMethod !== undefined ? input.paymentMethod : curr.payment_method,
      input.status !== undefined ? input.status : curr.status,
      input.lastReviewedDate !== undefined ? input.lastReviewedDate : curr.last_reviewed_date,
      input.notes !== undefined ? input.notes : curr.notes,
      subscriptionId,
      householdId,
    ]
  );

  const list = await listSubscriptions(householdId);
  return list.find((s) => s.id === subscriptionId)!;
}

function advanceDateByFrequency(isoDate: string, freq: BillingFrequency): string {
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
 * Records a confirmed subscription charge, storing the original foreign currency amount (e.g. USD 20.00)
 * alongside the exact LKR amount charged on the card/bank statement.
 */
export async function recordSubscriptionPayment(
  householdId: string,
  subscriptionId: string,
  recordedByUserId: string,
  input: {
    paidDate: string;
    sourceAccountId: string;
    paidByUserId: string;
    actualLkrAmount: string;
    advanceNextBillingDate: boolean;
    notes?: string | null;
  }
): Promise<Subscription> {
  await withTransaction(async (tx) => {
    const subRes = await tx.query(
      'SELECT * FROM subscriptions WHERE id = $1 AND household_id = $2',
      [subscriptionId, householdId]
    );
    if (!subRes.rows[0]) {
      throw new AppError('Subscription not found', 404);
    }
    const sub = subRes.rows[0];
    const origAmt = toMoneyString(sub.billing_amount);
    const actualLkr = toMoneyString(input.actualLkrAmount);
    const fxRate = divMoney(actualLkr, origAmt);

    await createTransactionInTx(tx, householdId, {
      transactionDate: input.paidDate,
      transactionType: 'EXPENSE',
      description: `${sub.name} (${sub.billing_currency} ${origAmt})`,
      categoryId: sub.category_id,
      subcategoryId: sub.subcategory_id,
      originalAmount: origAmt,
      originalCurrency: sub.billing_currency,
      exchangeRate: fxRate,
      actualLkrAmount: actualLkr,
      paymentMethod: sub.payment_method,
      sourceAccountId: input.sourceAccountId,
      paidOrReceivedByUserId: input.paidByUserId,
      recordedByUserId,
      householdMemberScope: sub.member_scope,
      isEssential: false,
      isFixed: true,
      subscriptionId: sub.id,
      notes: input.notes || `Subscription billing for ${sub.name} (${sub.provider})`,
    });

    const nextDate = input.advanceNextBillingDate
      ? advanceDateByFrequency(sub.next_billing_date, sub.billing_frequency)
      : sub.next_billing_date;

    await tx.query(
      `UPDATE subscriptions
       SET next_billing_date = $1,
           estimated_lkr_amount = $2,
           last_reviewed_date = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [nextDate, actualLkr, input.paidDate, sub.id]
    );
  });

  const list = await listSubscriptions(householdId);
  return list.find((s) => s.id === subscriptionId)!;
}

