import crypto from 'crypto';
import { query, withTransaction, type DbExecutor } from '../db/pool';
import { AppError } from '../middleware/error';
import { addMoney, compareMoney, toMoneyString } from '../../shared/decimal';
import { mutateAccountBalanceInTx, recalculateAccountBalance } from './accountService';
import type {
  HouseholdMemberScope,
  PaymentMethod,
  Transaction,
  TransactionItem,
  TransactionType,
} from '../../shared/types';

function mapTransactionRow(row: any, items: TransactionItem[] = []): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    transactionDate: row.transaction_date,
    transactionType: row.transaction_type,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    categoryColor: row.category_color || null,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name || null,
    originalAmount: toMoneyString(row.original_amount),
    originalCurrency: row.original_currency,
    exchangeRate: String(row.exchange_rate),
    actualLkrAmount: toMoneyString(row.actual_lkr_amount),
    paymentMethod: row.payment_method,
    sourceAccountId: row.source_account_id,
    sourceAccountName: row.source_account_name || undefined,
    destinationAccountId: row.destination_account_id,
    destinationAccountName: row.destination_account_name || null,
    paidOrReceivedByUserId: row.paid_or_received_by_user_id,
    paidOrReceivedByName: row.paid_by_name || undefined,
    paidOrReceivedByRole: row.paid_by_role || undefined,
    recordedByUserId: row.recorded_by_user_id,
    recordedByName: row.recorded_by_name || undefined,
    householdMemberScope: row.household_member_scope,
    fundingSource: row.funding_source || 'REGULAR_INCOME',
    transferFeeLkr: row.transfer_fee_lkr ? toMoneyString(row.transfer_fee_lkr) : undefined,
    transferFeeCategoryId: row.transfer_fee_category_id || null,
    parentTransactionId: row.parent_transaction_id || null,
    isEssential: Boolean(row.is_essential),
    isFixed: Boolean(row.is_fixed),
    recurringScheduleId: row.recurring_schedule_id,
    subscriptionId: row.subscription_id,
    loanId: row.loan_id,
    utilityBillingPeriodStart: row.utility_billing_period_start,
    utilityBillingPeriodEnd: row.utility_billing_period_end,
    isDemoData: Boolean(row.is_demo_data),
    notes: row.notes,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  transactionType?: TransactionType;
  categoryId?: string;
  subcategoryId?: string;
  memberUserId?: string;
  memberRole?: 'HUSBAND' | 'WIFE';
  accountId?: string;
  search?: string;
  limit?: number;
}

export async function listTransactions(
  householdId: string,
  filters: TransactionFilters = {}
): Promise<Transaction[]> {
  const params: any[] = [householdId];
  const clauses: string[] = ['t.household_id = $1'];

  if (filters.startDate) {
    params.push(filters.startDate);
    clauses.push(`t.transaction_date >= $${params.length}`);
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    clauses.push(`t.transaction_date <= $${params.length}`);
  }
  if (filters.transactionType) {
    params.push(filters.transactionType);
    clauses.push(`t.transaction_type = $${params.length}`);
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    clauses.push(`t.category_id = $${params.length}`);
  }
  if (filters.subcategoryId) {
    params.push(filters.subcategoryId);
    clauses.push(`t.subcategory_id = $${params.length}`);
  }
  if (filters.memberUserId) {
    params.push(filters.memberUserId);
    clauses.push(`t.paid_or_received_by_user_id = $${params.length}`);
  }
  if (filters.memberRole) {
    params.push(filters.memberRole);
    clauses.push(`u_paid.member_role = $${params.length}`);
  }
  if (filters.accountId) {
    params.push(filters.accountId);
    clauses.push(`(t.source_account_id = $${params.length} OR t.destination_account_id = $${params.length})`);
  }
  if (filters.search && filters.search.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    clauses.push(`(LOWER(t.description) LIKE $${params.length} OR LOWER(COALESCE(t.notes, '')) LIKE $${params.length})`);
  }

  const limitSql = filters.limit ? `LIMIT ${Number(filters.limit)}` : '';

  const res = await query(
    `SELECT t.*,
            c.name AS category_name,
            c.color AS category_color,
            sc.name AS subcategory_name,
            sa.name AS source_account_name,
            da.name AS destination_account_name,
            u_paid.display_name AS paid_by_name,
            u_paid.member_role AS paid_by_role,
            u_rec.display_name AS recorded_by_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN categories sc ON t.subcategory_id = sc.id
     LEFT JOIN accounts sa ON t.source_account_id = sa.id
     LEFT JOIN accounts da ON t.destination_account_id = da.id
     LEFT JOIN users u_paid ON t.paid_or_received_by_user_id = u_paid.id
     LEFT JOIN users u_rec ON t.recorded_by_user_id = u_rec.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY t.transaction_date DESC, t.created_at DESC
     ${limitSql}`,
    params
  );

  if (res.rows.length === 0) return [];

  const txIds = res.rows.map((r) => r.id);
  const itemsRes = await query(
    `SELECT ti.*, sc.name AS subcategory_name
     FROM transaction_items ti
     LEFT JOIN categories sc ON ti.subcategory_id = sc.id
     WHERE ti.transaction_id = ANY($1::uuid[])`,
    [txIds]
  );

  const itemsByTx = new Map<string, TransactionItem[]>();
  for (const ir of itemsRes.rows) {
    const arr = itemsByTx.get(ir.transaction_id) || [];
    arr.push({
      id: ir.id,
      transactionId: ir.transaction_id,
      subcategoryId: ir.subcategory_id,
      subcategoryName: ir.subcategory_name || undefined,
      itemName: ir.item_name,
      quantity: toMoneyString(ir.quantity),
      amountLkr: toMoneyString(ir.amount_lkr),
    });
    itemsByTx.set(ir.transaction_id, arr);
  }

  return res.rows.map((r) => mapTransactionRow(r, itemsByTx.get(r.id) || []));
}

export interface CreateTransactionInput {
  transactionDate: string;
  transactionType: TransactionType;
  description: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  originalAmount: string;
  originalCurrency?: string;
  exchangeRate?: string;
  actualLkrAmount: string;
  paymentMethod: PaymentMethod;
  sourceAccountId: string;
  destinationAccountId?: string | null;
  paidOrReceivedByUserId: string;
  recordedByUserId: string;
  householdMemberScope?: HouseholdMemberScope;
  fundingSource?: 'REGULAR_INCOME' | 'OVERTIME_INCOME' | 'BORROWED_FRIENDS_PARENTS' | 'PREVIOUS_SAVINGS' | 'OTHER';
  transferFeeLkr?: string;
  transferFeeCategoryId?: string | null;
  parentTransactionId?: string | null;
  isEssential?: boolean;
  isFixed?: boolean;
  recurringScheduleId?: string | null;
  subscriptionId?: string | null;
  loanId?: string | null;
  utilityBillingPeriodStart?: string | null;
  utilityBillingPeriodEnd?: string | null;
  notes?: string | null;
  items?: Array<{
    subcategoryId?: string | null;
    itemName: string;
    quantity?: string;
    amountLkr: string;
  }>;
}

export async function createTransactionInTx(
  tx: DbExecutor,
  householdId: string,
  input: CreateTransactionInput
): Promise<string> {
  const txId = crypto.randomUUID();
  const actualLkr = toMoneyString(input.actualLkrAmount);
  const origAmt = toMoneyString(input.originalAmount);

  let feeCatId = input.transferFeeCategoryId || null;
  const hasFee = Boolean(input.transferFeeLkr && compareMoney(input.transferFeeLkr, '0.00') > 0);
  if (hasFee && !feeCatId) {
    const catRes = await tx.query(
      `SELECT id FROM categories WHERE household_id = $1 AND name ILIKE '%Bank Charge%' LIMIT 1`,
      [householdId]
    );
    feeCatId = catRes.rows[0]?.id || null;
  }

  await tx.query(
    `INSERT INTO transactions (
      id, household_id, transaction_date, transaction_type, description,
      category_id, subcategory_id, original_amount, original_currency, exchange_rate,
      actual_lkr_amount, payment_method, source_account_id, destination_account_id,
      paid_or_received_by_user_id, recorded_by_user_id, household_member_scope, funding_source,
      transfer_fee_lkr, transfer_fee_category_id, parent_transaction_id,
      is_essential, is_fixed, recurring_schedule_id, subscription_id, loan_id,
      utility_billing_period_start, utility_billing_period_end, is_demo_data, notes
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19, $20, $21,
      $22, $23, $24, $25, $26,
      $27, $28, FALSE, $29
    )`,
    [
      txId,
      householdId,
      input.transactionDate,
      input.transactionType,
      input.description.trim(),
      input.transactionType === 'TRANSFER' ? null : input.categoryId || null,
      input.transactionType === 'TRANSFER' ? null : input.subcategoryId || null,
      origAmt,
      input.originalCurrency || 'LKR',
      input.exchangeRate || '1.000000',
      actualLkr,
      input.paymentMethod,
      input.sourceAccountId,
      input.transactionType === 'TRANSFER' ? input.destinationAccountId || null : null,
      input.paidOrReceivedByUserId,
      input.recordedByUserId,
      input.householdMemberScope || 'SHARED',
      input.fundingSource || 'REGULAR_INCOME',
      hasFee ? toMoneyString(input.transferFeeLkr!) : '0.00',
      hasFee ? feeCatId : null,
      input.parentTransactionId || null,
      input.isEssential ?? true,
      input.isFixed ?? false,
      input.recurringScheduleId || null,
      input.subscriptionId || null,
      input.loanId || null,
      input.utilityBillingPeriodStart || null,
      input.utilityBillingPeriodEnd || null,
      input.notes || null,
    ]
  );

  if (input.items && input.items.length > 0) {
    for (const item of input.items) {
      await tx.query(
        `INSERT INTO transaction_items (id, transaction_id, subcategory_id, item_name, quantity, amount_lkr)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          crypto.randomUUID(),
          txId,
          item.subcategoryId || null,
          item.itemName.trim(),
          toMoneyString(item.quantity || '1'),
          toMoneyString(item.amountLkr),
        ]
      );
    }
  }

  // Update source account balance
  await mutateAccountBalanceInTx(
    tx,
    householdId,
    input.sourceAccountId,
    'SOURCE',
    input.transactionType,
    actualLkr,
    'APPLY'
  );

  // If transfer, update destination account balance
  if (input.transactionType === 'TRANSFER' && input.destinationAccountId) {
    await mutateAccountBalanceInTx(
      tx,
      householdId,
      input.destinationAccountId,
      'DESTINATION',
      'TRANSFER',
      actualLkr,
      'APPLY'
    );
  }

  // If there is an associated bank transfer/service fee, record it as a linked child expense
  if (hasFee) {
    const feeLkr = toMoneyString(input.transferFeeLkr!);
    const childTxId = crypto.randomUUID();
    await tx.query(
      `INSERT INTO transactions (
        id, household_id, transaction_date, transaction_type, description,
        category_id, subcategory_id, original_amount, original_currency, exchange_rate,
        actual_lkr_amount, payment_method, source_account_id, destination_account_id,
        paid_or_received_by_user_id, recorded_by_user_id, household_member_scope, funding_source,
        transfer_fee_lkr, transfer_fee_category_id, parent_transaction_id,
        is_essential, is_fixed, is_demo_data, notes
      ) VALUES (
        $1, $2, $3, 'EXPENSE', $4,
        $5, NULL, $6, 'LKR', '1.000000',
        $6, $7, $8, NULL,
        $9, $10, $11, $12,
        '0.00', NULL, $13,
        TRUE, FALSE, FALSE, $14
      )`,
      [
        childTxId,
        householdId,
        input.transactionDate,
        `Bank Fee / Service Charge (${input.description.trim()})`,
        feeCatId,
        feeLkr,
        input.paymentMethod,
        input.sourceAccountId,
        input.paidOrReceivedByUserId,
        input.recordedByUserId,
        input.householdMemberScope || 'SHARED',
        input.fundingSource || 'REGULAR_INCOME',
        txId,
        `Service charge associated with transaction: ${input.description.trim()}`,
      ]
    );

    await mutateAccountBalanceInTx(
      tx,
      householdId,
      input.sourceAccountId,
      'SOURCE',
      'EXPENSE',
      feeLkr,
      'APPLY'
    );
  }

  // Recalculate deterministic balances
  await recalculateAccountBalance(householdId, input.sourceAccountId, tx);
  if (input.transactionType === 'TRANSFER' && input.destinationAccountId) {
    await recalculateAccountBalance(householdId, input.destinationAccountId, tx);
  }

  return txId;
}

export async function createTransaction(
  householdId: string,
  input: CreateTransactionInput
): Promise<Transaction> {
  const txId = await withTransaction((tx) => createTransactionInTx(tx, householdId, input));
  const list = await listTransactions(householdId);
  return list.find((t) => t.id === txId)!;
}

export async function updateTransaction(
  householdId: string,
  transactionId: string,
  input: CreateTransactionInput
): Promise<Transaction> {
  await withTransaction(async (tx) => {
    const oldRes = await tx.query(
      'SELECT * FROM transactions WHERE id = $1 AND household_id = $2',
      [transactionId, householdId]
    );
    if (!oldRes.rows[0]) {
      throw new AppError('Transaction not found', 404);
    }
    const oldTx = oldRes.rows[0];

    // 1. Reverse old child fee transactions
    const oldChildren = await tx.query(
      'SELECT * FROM transactions WHERE parent_transaction_id = $1',
      [transactionId]
    );
    for (const child of oldChildren.rows) {
      await mutateAccountBalanceInTx(
        tx,
        householdId,
        child.source_account_id,
        'SOURCE',
        child.transaction_type,
        toMoneyString(child.actual_lkr_amount),
        'REVERSE'
      );
    }
    await tx.query('DELETE FROM transactions WHERE parent_transaction_id = $1', [transactionId]);

    // 2. Reverse old balance impacts
    await mutateAccountBalanceInTx(
      tx,
      householdId,
      oldTx.source_account_id,
      'SOURCE',
      oldTx.transaction_type,
      toMoneyString(oldTx.actual_lkr_amount),
      'REVERSE'
    );
    if (oldTx.transaction_type === 'TRANSFER' && oldTx.destination_account_id) {
      await mutateAccountBalanceInTx(
        tx,
        householdId,
        oldTx.destination_account_id,
        'DESTINATION',
        'TRANSFER',
        toMoneyString(oldTx.actual_lkr_amount),
        'REVERSE'
      );
    }

    // 3. Update the transaction record
    const actualLkr = toMoneyString(input.actualLkrAmount);
    const origAmt = toMoneyString(input.originalAmount);

    let feeCatId = input.transferFeeCategoryId || null;
    const hasFee = Boolean(input.transferFeeLkr && compareMoney(input.transferFeeLkr, '0.00') > 0);
    if (hasFee && !feeCatId) {
      const catRes = await tx.query(
        `SELECT id FROM categories WHERE household_id = $1 AND name ILIKE '%Bank Charge%' LIMIT 1`,
        [householdId]
      );
      feeCatId = catRes.rows[0]?.id || null;
    }

    await tx.query(
      `UPDATE transactions
       SET transaction_date = $1,
           transaction_type = $2,
           description = $3,
           category_id = $4,
           subcategory_id = $5,
           original_amount = $6,
           original_currency = $7,
           exchange_rate = $8,
           actual_lkr_amount = $9,
           payment_method = $10,
           source_account_id = $11,
           destination_account_id = $12,
           paid_or_received_by_user_id = $13,
           household_member_scope = $14,
           funding_source = $15,
           transfer_fee_lkr = $16,
           transfer_fee_category_id = $17,
           is_essential = $18,
           is_fixed = $19,
           utility_billing_period_start = $20,
           utility_billing_period_end = $21,
           notes = $22,
           updated_at = NOW()
       WHERE id = $23 AND household_id = $24`,
      [
        input.transactionDate,
        input.transactionType,
        input.description.trim(),
        input.transactionType === 'TRANSFER' ? null : input.categoryId || null,
        input.transactionType === 'TRANSFER' ? null : input.subcategoryId || null,
        origAmt,
        input.originalCurrency || 'LKR',
        input.exchangeRate || '1.000000',
        actualLkr,
        input.paymentMethod,
        input.sourceAccountId,
        input.transactionType === 'TRANSFER' ? input.destinationAccountId || null : null,
        input.paidOrReceivedByUserId,
        input.householdMemberScope || 'SHARED',
        input.fundingSource || 'REGULAR_INCOME',
        hasFee ? toMoneyString(input.transferFeeLkr!) : '0.00',
        hasFee ? feeCatId : null,
        input.isEssential ?? true,
        input.isFixed ?? false,
        input.utilityBillingPeriodStart || null,
        input.utilityBillingPeriodEnd || null,
        input.notes || null,
        transactionId,
        householdId,
      ]
    );

    // Replace transaction_items
    await tx.query('DELETE FROM transaction_items WHERE transaction_id = $1', [transactionId]);
    if (input.items && input.items.length > 0) {
      for (const item of input.items) {
        await tx.query(
          `INSERT INTO transaction_items (id, transaction_id, subcategory_id, item_name, quantity, amount_lkr)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            crypto.randomUUID(),
            transactionId,
            item.subcategoryId || null,
            item.itemName.trim(),
            toMoneyString(item.quantity || '1'),
            toMoneyString(item.amountLkr),
          ]
        );
      }
    }

    // 4. Apply new balance impacts
    await mutateAccountBalanceInTx(
      tx,
      householdId,
      input.sourceAccountId,
      'SOURCE',
      input.transactionType,
      actualLkr,
      'APPLY'
    );
    if (input.transactionType === 'TRANSFER' && input.destinationAccountId) {
      await mutateAccountBalanceInTx(
        tx,
        householdId,
        input.destinationAccountId,
        'DESTINATION',
        'TRANSFER',
        actualLkr,
        'APPLY'
      );
    }

    // 5. If new transfer has fee, insert new child fee transaction
    if (hasFee) {
      const feeLkr = toMoneyString(input.transferFeeLkr!);
      const childTxId = crypto.randomUUID();
      await tx.query(
        `INSERT INTO transactions (
          id, household_id, transaction_date, transaction_type, description,
          category_id, subcategory_id, original_amount, original_currency, exchange_rate,
          actual_lkr_amount, payment_method, source_account_id, destination_account_id,
          paid_or_received_by_user_id, recorded_by_user_id, household_member_scope, funding_source,
          transfer_fee_lkr, transfer_fee_category_id, parent_transaction_id,
          is_essential, is_fixed, is_demo_data, notes
        ) VALUES (
          $1, $2, $3, 'EXPENSE', $4,
          $5, NULL, $6, 'LKR', '1.000000',
          $6, $7, $8, NULL,
          $9, $10, $11, $12,
          '0.00', NULL, $13,
          TRUE, FALSE, FALSE, $14
        )`,
        [
          childTxId,
          householdId,
          input.transactionDate,
          `Bank Fee / Service Charge (${input.description.trim()})`,
          feeCatId,
          feeLkr,
          input.paymentMethod,
          input.sourceAccountId,
          input.paidOrReceivedByUserId,
          input.recordedByUserId,
          input.householdMemberScope || 'SHARED',
          input.fundingSource || 'REGULAR_INCOME',
          transactionId,
          `Service charge associated with transaction: ${input.description.trim()}`,
        ]
      );

      await mutateAccountBalanceInTx(
        tx,
        householdId,
        input.sourceAccountId,
        'SOURCE',
        'EXPENSE',
        feeLkr,
        'APPLY'
      );
    }

    // Recalculate deterministic balances on all touched accounts
    const touchedAccounts = new Set<string>([
      oldTx.source_account_id,
      input.sourceAccountId,
    ]);
    if (oldTx.destination_account_id) touchedAccounts.add(oldTx.destination_account_id);
    if (input.destinationAccountId) touchedAccounts.add(input.destinationAccountId);

    for (const accId of touchedAccounts) {
      await recalculateAccountBalance(householdId, accId, tx);
    }
  });

  const list = await listTransactions(householdId);
  return list.find((t) => t.id === transactionId)!;
}

export async function deleteTransaction(
  householdId: string,
  transactionId: string
): Promise<void> {
  await withTransaction(async (tx) => {
    const oldRes = await tx.query(
      'SELECT * FROM transactions WHERE id = $1 AND household_id = $2',
      [transactionId, householdId]
    );
    if (!oldRes.rows[0]) {
      throw new AppError('Transaction not found', 404);
    }
    const oldTx = oldRes.rows[0];

    // If linked to a loan installment, restore loan principal & remaining installments
    const instRes = await tx.query(
      'SELECT * FROM loan_installments WHERE transaction_id = $1',
      [transactionId]
    );
    if (instRes.rows[0]) {
      const inst = instRes.rows[0];
      const loanRes = await tx.query('SELECT * FROM loans WHERE id = $1', [inst.loan_id]);
      if (loanRes.rows[0]) {
        const restoredBalance = addMoney(
          loanRes.rows[0].current_outstanding_balance,
          inst.principal_component_lkr
        );
        await tx.query(
          `UPDATE loans
           SET current_outstanding_balance = $1,
               remaining_installments = remaining_installments + 1,
               status = 'ACTIVE',
               updated_at = NOW()
           WHERE id = $2`,
          [restoredBalance, inst.loan_id]
        );
      }
      await tx.query('DELETE FROM loan_installments WHERE id = $1', [inst.id]);
    }

    // Reverse child fee transactions if any
    const childTxs = await tx.query(
      'SELECT * FROM transactions WHERE parent_transaction_id = $1',
      [transactionId]
    );
    for (const child of childTxs.rows) {
      await mutateAccountBalanceInTx(
        tx,
        householdId,
        child.source_account_id,
        'SOURCE',
        child.transaction_type,
        toMoneyString(child.actual_lkr_amount),
        'REVERSE'
      );
    }
    await tx.query('DELETE FROM transactions WHERE parent_transaction_id = $1', [transactionId]);

    // Reverse account balance impact
    await mutateAccountBalanceInTx(
      tx,
      householdId,
      oldTx.source_account_id,
      'SOURCE',
      oldTx.transaction_type,
      toMoneyString(oldTx.actual_lkr_amount),
      'REVERSE'
    );
    if (oldTx.transaction_type === 'TRANSFER' && oldTx.destination_account_id) {
      await mutateAccountBalanceInTx(
        tx,
        householdId,
        oldTx.destination_account_id,
        'DESTINATION',
        'TRANSFER',
        toMoneyString(oldTx.actual_lkr_amount),
        'REVERSE'
      );
    }

    await tx.query('DELETE FROM transactions WHERE id = $1 AND household_id = $2', [
      transactionId,
      householdId,
    ]);

    // Recalculate deterministic balances on touched accounts
    await recalculateAccountBalance(householdId, oldTx.source_account_id, tx);
    if (oldTx.destination_account_id) {
      await recalculateAccountBalance(householdId, oldTx.destination_account_id, tx);
    }
  });
}

