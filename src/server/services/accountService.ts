import Decimal from 'decimal.js';
import { generateUUID } from '../../shared/uuid';
import { query, withTransaction, type DbExecutor } from '../db/pool';
import { AppError } from '../middleware/error';
import { addMoney, compareMoney, subMoney, toDecimal, toMoneyString } from '../../shared/decimal';
import { computeAccountBalanceDelta } from '../../shared/calculations';
import type {
  Account,
  AccountBalanceBreakdown,
  AccountReconciliation,
  AccountType,
} from '../../shared/types';

function mapAccountRow(row: any): Account {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || (row.ownership_type === 'JOINT' ? 'Joint (Husband & Wife)' : row.ownership_type),
    ownershipType: row.ownership_type,
    name: row.name,
    accountType: row.account_type,
    bankName: row.bank_name || null,
    cardLastFour: row.card_last_four || null,
    linkedParentAccountId: row.linked_parent_account_id,
    linkedParentAccountName: row.linked_parent_account_name || null,
    currency: row.currency,
    openingBalance: toMoneyString(row.opening_balance),
    openingBalanceDate: row.opening_balance_date ? String(row.opening_balance_date).slice(0, 10) : '2026-11-01',
    currentBalance: toMoneyString(row.current_balance),
    creditLimit: row.credit_limit !== null ? toMoneyString(row.credit_limit) : null,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccounts(householdId: string): Promise<Account[]> {
  const res = await query(
    `SELECT a.*,
            u.display_name AS owner_name,
            pa.name AS linked_parent_account_name
     FROM accounts a
     LEFT JOIN users u ON a.owner_user_id = u.id
     LEFT JOIN accounts pa ON a.linked_parent_account_id = pa.id
     WHERE a.household_id = $1
     ORDER BY a.status ASC, a.account_type ASC, a.name ASC`,
    [householdId]
  );
  return res.rows.map(mapAccountRow);
}

export async function createAccount(
  householdId: string,
  input: {
    ownerUserId?: string | null;
    ownershipType: 'HUSBAND' | 'WIFE' | 'JOINT';
    name: string;
    accountType: AccountType;
    bankName?: string | null;
    cardLastFour?: string | null;
    linkedParentAccountId?: string | null;
    currency?: string;
    openingBalance: string;
    openingBalanceDate?: string | null;
    creditLimit?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
    notes?: string | null;
  }
): Promise<Account> {
  const id = generateUUID();
  const openBal = toMoneyString(input.openingBalance);
  const openDate = input.openingBalanceDate || '2026-11-01';

  await query(
    `INSERT INTO accounts (
      id, household_id, owner_user_id, ownership_type, name, account_type, bank_name, card_last_four,
      linked_parent_account_id, currency, opening_balance, opening_balance_date, current_balance, credit_limit, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $11, $13, $14, $15)`,
    [
      id,
      householdId,
      input.ownerUserId || null,
      input.ownershipType,
      input.name.trim(),
      input.accountType,
      input.bankName || null,
      input.cardLastFour || null,
      input.linkedParentAccountId || null,
      input.currency || 'LKR',
      openBal,
      openDate,
      input.creditLimit ? toMoneyString(input.creditLimit) : null,
      input.status || 'ACTIVE',
      input.notes || null,
    ]
  );

  const list = await listAccounts(householdId);
  return list.find((a) => a.id === id)!;
}

export async function updateAccount(
  householdId: string,
  accountId: string,
  input: Partial<{
    ownerUserId: string | null;
    ownershipType: 'HUSBAND' | 'WIFE' | 'JOINT';
    name: string;
    bankName: string | null;
    cardLastFour: string | null;
    linkedParentAccountId: string | null;
    openingBalance: string;
    openingBalanceDate: string | null;
    creditLimit: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    notes: string | null;
  }>
): Promise<Account> {
  const existing = await query('SELECT * FROM accounts WHERE id = $1 AND household_id = $2', [
    accountId,
    householdId,
  ]);
  if (!existing.rows[0]) {
    throw new AppError('Account not found', 404);
  }
  const curr = existing.rows[0];

  const openingChanged =
    input.openingBalance !== undefined &&
    toMoneyString(input.openingBalance) !== toMoneyString(curr.opening_balance);

  await query(
    `UPDATE accounts
     SET owner_user_id = $1,
         ownership_type = $2,
         name = $3,
         bank_name = $4,
         card_last_four = $5,
         linked_parent_account_id = $6,
         opening_balance = $7,
         opening_balance_date = $8,
         credit_limit = $9,
         status = $10,
         notes = $11,
         updated_at = NOW()
     WHERE id = $12 AND household_id = $13`,
    [
      input.ownerUserId !== undefined ? input.ownerUserId : curr.owner_user_id,
      input.ownershipType !== undefined ? input.ownershipType : curr.ownership_type,
      input.name !== undefined ? input.name.trim() : curr.name,
      input.bankName !== undefined ? input.bankName : curr.bank_name,
      input.cardLastFour !== undefined ? input.cardLastFour : curr.card_last_four,
      input.linkedParentAccountId !== undefined
        ? input.linkedParentAccountId
        : curr.linked_parent_account_id,
      input.openingBalance !== undefined
        ? toMoneyString(input.openingBalance)
        : curr.opening_balance,
      input.openingBalanceDate !== undefined
        ? input.openingBalanceDate
        : curr.opening_balance_date || '2026-11-01',
      input.creditLimit !== undefined
        ? input.creditLimit
          ? toMoneyString(input.creditLimit)
          : null
        : curr.credit_limit,
      input.status !== undefined ? input.status : curr.status,
      input.notes !== undefined ? input.notes : curr.notes,
      accountId,
      householdId,
    ]
  );

  // If opening balance or linked parent changed, recompute current balance
  if (openingChanged || input.linkedParentAccountId !== undefined) {
    await recalculateAccountBalance(householdId, accountId);
  }

  const list = await listAccounts(householdId);
  return list.find((a) => a.id === accountId)!;
}

/**
 * Automatically recalculates and synchronizes the current balance of an account
 * using its opening balance and all recorded transactions (incomes, expenses, transfers).
 */
export async function recalculateAccountBalance(
  householdId: string,
  accountId: string,
  executor?: DbExecutor
): Promise<string> {
  const db = executor || { query };

  const accRes = await db.query(
    'SELECT id, account_type, opening_balance, linked_parent_account_id FROM accounts WHERE id = $1 AND household_id = $2',
    [accountId, householdId]
  );
  if (!accRes.rows[0]) throw new AppError('Account not found', 404);
  const acc = accRes.rows[0];

  // If this is a debit card linked to a parent bank account, recompute the parent account
  if (acc.linked_parent_account_id) {
    return recalculateAccountBalance(householdId, acc.linked_parent_account_id, db);
  }

  // Find all cards linked to this account
  const linkedCardsRes = await db.query(
    'SELECT id FROM accounts WHERE linked_parent_account_id = $1 AND household_id = $2',
    [accountId, householdId]
  );
  const allAccountIds = [accountId, ...linkedCardsRes.rows.map((r: any) => r.id)];

  const isLiability = acc.account_type === 'CREDIT_CARD';

  // Total Income directly into this account
  const incRes = await db.query(
    `SELECT COALESCE(SUM(actual_lkr_amount), 0) AS total
     FROM transactions
     WHERE household_id = $1 AND transaction_type = 'INCOME' AND source_account_id = $2`,
    [householdId, accountId]
  );
  const totalIncome = toDecimal(incRes.rows[0].total);

  // Total Expenses from this account or its linked cards
  const expRes = await db.query(
    `SELECT COALESCE(SUM(actual_lkr_amount), 0) AS total
     FROM transactions
     WHERE household_id = $1 AND transaction_type = 'EXPENSE' AND source_account_id = ANY($2::uuid[])`,
    [householdId, allAccountIds]
  );
  const totalExpenses = toDecimal(expRes.rows[0].total);

  // Incoming Transfers (destination = accountId)
  const inTransRes = await db.query(
    `SELECT COALESCE(SUM(actual_lkr_amount), 0) AS total
     FROM transactions
     WHERE household_id = $1 AND transaction_type = 'TRANSFER' AND destination_account_id = $2`,
    [householdId, accountId]
  );
  const incomingTransfers = toDecimal(inTransRes.rows[0].total);

  // Outgoing Transfers (source = accountId or linked cards)
  const outTransRes = await db.query(
    `SELECT COALESCE(SUM(actual_lkr_amount), 0) AS total
     FROM transactions
     WHERE household_id = $1 AND transaction_type = 'TRANSFER' AND source_account_id = ANY($2::uuid[])`,
    [householdId, allAccountIds]
  );
  const outgoingTransfers = toDecimal(outTransRes.rows[0].total);

  const opening = toDecimal(acc.opening_balance || 0);

  let newBal: Decimal;
  if (isLiability) {
    newBal = opening.plus(totalExpenses).minus(incomingTransfers).minus(totalIncome).plus(outgoingTransfers);
  } else {
    newBal = opening.plus(totalIncome).plus(incomingTransfers).minus(totalExpenses).minus(outgoingTransfers);
  }

  const currentBalStr = toMoneyString(newBal);
  await db.query(
    'UPDATE accounts SET current_balance = $1, updated_at = NOW() WHERE id = $2 AND household_id = $3',
    [currentBalStr, accountId, householdId]
  );

  return currentBalStr;
}

/**
 * Generates detailed balance breakdowns for all or a specific account:
 * Opening balance, Income, Expenses, Bank Charges, Withdrawals (Bank->Cash), Deposits (Cash->Bank),
 * Transfers In/Out, and Current Calculated Balance.
 */
export async function getAccountBalanceBreakdowns(
  householdId: string,
  filter?: { accountId?: string; memberUserId?: string; startDate?: string; endDate?: string }
): Promise<AccountBalanceBreakdown[]> {
  const accounts = await listAccounts(householdId);
  const filteredAccounts = accounts.filter((a) => {
    if (filter?.accountId && a.id !== filter.accountId) return false;
    if (filter?.memberUserId && a.ownerUserId && a.ownerUserId !== filter.memberUserId) return false;
    return true;
  });

  const breakdowns: AccountBalanceBreakdown[] = [];

  for (const acc of filteredAccounts) {
    if (acc.linkedParentAccountId && !filter?.accountId) {
      continue;
    }

    const linkedCards = accounts.filter((c) => c.linkedParentAccountId === acc.id);
    const allIds = [acc.id, ...linkedCards.map((c) => c.id)];

    const dateClause =
      filter?.startDate && filter?.endDate
        ? 'AND transaction_date BETWEEN $3 AND $4'
        : filter?.startDate
        ? 'AND transaction_date >= $3'
        : filter?.endDate
        ? 'AND transaction_date <= $3'
        : '';
    const dateParams: any[] = [];
    if (filter?.startDate && filter?.endDate) dateParams.push(filter.startDate, filter.endDate);
    else if (filter?.startDate) dateParams.push(filter.startDate);
    else if (filter?.endDate) dateParams.push(filter.endDate);

    const incRes = await query(
      `SELECT COALESCE(SUM(actual_lkr_amount), 0) AS total
       FROM transactions
       WHERE household_id = $1 AND transaction_type = 'INCOME' AND source_account_id = $2 ${dateClause}`,
      [householdId, acc.id, ...dateParams]
    );
    const totalIncome = toMoneyString(incRes.rows[0].total);

    const bankChargesRes = await query(
      `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.household_id = $1 AND t.transaction_type = 'EXPENSE'
         AND t.source_account_id = ANY($2::uuid[])
         AND (c.name ILIKE '%Bank Charge%' OR t.description ILIKE '%Bank Fee%' OR t.description ILIKE '%Service Charge%')
         ${dateClause.replace(/\$3/g, '$3').replace(/\$4/g, '$4')}`,
      [householdId, allIds, ...dateParams]
    );
    const bankCharges = toMoneyString(bankChargesRes.rows[0].total);

    const expRes = await query(
      `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.household_id = $1 AND t.transaction_type = 'EXPENSE'
         AND t.source_account_id = ANY($2::uuid[])
         AND NOT (c.name ILIKE '%Bank Charge%' OR t.description ILIKE '%Bank Fee%' OR t.description ILIKE '%Service Charge%')
         ${dateClause.replace(/\$3/g, '$3').replace(/\$4/g, '$4')}`,
      [householdId, allIds, ...dateParams]
    );
    const totalExpenses = toMoneyString(expRes.rows[0].total);

    let withdrawals = '0.00';
    let deposits = '0.00';
    let incomingTransfers = '0.00';
    let outgoingTransfers = '0.00';

    if (acc.accountType === 'CASH') {
      const wRes = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts src ON t.source_account_id = src.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.destination_account_id = $2
           AND src.account_type IN ('BANK_SAVINGS', 'BANK_CURRENT')
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      withdrawals = toMoneyString(wRes.rows[0].total);

      const dRes = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts dst ON t.destination_account_id = dst.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.source_account_id = $2
           AND dst.account_type IN ('BANK_SAVINGS', 'BANK_CURRENT')
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      deposits = toMoneyString(dRes.rows[0].total);

      const inOther = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts src ON t.source_account_id = src.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.destination_account_id = $2
           AND src.account_type = 'CASH'
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      incomingTransfers = toMoneyString(inOther.rows[0].total);

      const outOther = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts dst ON t.destination_account_id = dst.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.source_account_id = $2
           AND dst.account_type = 'CASH'
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      outgoingTransfers = toMoneyString(outOther.rows[0].total);
    } else {
      const wRes = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts dst ON t.destination_account_id = dst.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.source_account_id = ANY($2::uuid[])
           AND dst.account_type = 'CASH'
           ${dateClause.replace(/\$3/g, '$3').replace(/\$4/g, '$4')}`,
        [householdId, allIds, ...dateParams]
      );
      withdrawals = toMoneyString(wRes.rows[0].total);

      const dRes = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts src ON t.source_account_id = src.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.destination_account_id = $2
           AND src.account_type = 'CASH'
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      deposits = toMoneyString(dRes.rows[0].total);

      const inOther = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts src ON t.source_account_id = src.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.destination_account_id = $2
           AND src.account_type != 'CASH'
           ${dateClause}`,
        [householdId, acc.id, ...dateParams]
      );
      incomingTransfers = toMoneyString(inOther.rows[0].total);

      const outOther = await query(
        `SELECT COALESCE(SUM(t.actual_lkr_amount), 0) AS total
         FROM transactions t
         JOIN accounts dst ON t.destination_account_id = dst.id
         WHERE t.household_id = $1 AND t.transaction_type = 'TRANSFER'
           AND t.source_account_id = ANY($2::uuid[])
           AND dst.account_type != 'CASH'
           ${dateClause.replace(/\$3/g, '$3').replace(/\$4/g, '$4')}`,
        [householdId, allIds, ...dateParams]
      );
      outgoingTransfers = toMoneyString(outOther.rows[0].total);
    }

    const calculatedBal = await recalculateAccountBalance(householdId, acc.id);

    breakdowns.push({
      accountId: acc.id,
      accountName: acc.name,
      accountType: acc.accountType,
      bankName: acc.bankName || (acc.accountType === 'CASH' ? 'Physical Cash' : null),
      ownershipType: acc.ownershipType,
      ownerName: acc.ownerName || acc.ownershipType,
      cardLastFour: acc.cardLastFour || null,
      linkedParentAccountId: acc.linkedParentAccountId,
      openingBalance: acc.openingBalance,
      openingBalanceDate: acc.openingBalanceDate || '2026-11-01',
      totalIncome,
      totalExpenses,
      bankCharges,
      withdrawals,
      deposits,
      incomingTransfers,
      outgoingTransfers,
      currentCalculatedBalance: calculatedBal,
      status: acc.status,
    });
  }

  return breakdowns;
}

/**
 * Resolves the effective balance-bearing account (e.g. if a Debit Card is linked to a parent Bank Account,
 * updates happen on the parent Bank Account) and applies or reverses a transaction delta inside an active DB transaction.
 */
export async function mutateAccountBalanceInTx(
  tx: DbExecutor,
  householdId: string,
  accountId: string,
  role: 'SOURCE' | 'DESTINATION',
  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountLkr: string,
  direction: 'APPLY' | 'REVERSE'
): Promise<void> {
  const accRes = await tx.query(
    'SELECT id, account_type, linked_parent_account_id, current_balance FROM accounts WHERE id = $1 AND household_id = $2',
    [accountId, householdId]
  );
  if (!accRes.rows[0]) {
    throw new AppError(`Account ${accountId} not found in household`, 404);
  }

  let targetRow = accRes.rows[0];
  if (targetRow.linked_parent_account_id) {
    const parentRes = await tx.query(
      'SELECT id, account_type, current_balance FROM accounts WHERE id = $1 AND household_id = $2',
      [targetRow.linked_parent_account_id, householdId]
    );
    if (parentRes.rows[0]) {
      targetRow = parentRes.rows[0];
    }
  }

  const delta = computeAccountBalanceDelta(
    targetRow.account_type as AccountType,
    role,
    transactionType,
    amountLkr,
    direction
  );
  const newBalance = addMoney(targetRow.current_balance, delta);

  await tx.query(
    'UPDATE accounts SET current_balance = $1, updated_at = NOW() WHERE id = $2 AND household_id = $3',
    [newBalance, targetRow.id, householdId]
  );
}

/**
 * Reconciles an account's recorded balance with the actual bank statement balance.
 */
export async function reconcileAccountBalance(
  householdId: string,
  accountId: string,
  input: {
    reconciliationDate: string;
    actualStatementBalance: string;
    createAdjustmentTransaction: boolean;
    reconciledByUserId: string;
    notes?: string | null;
  }
): Promise<{ account: Account; reconciliation: AccountReconciliation }> {
  const r = await withTransaction(async (tx) => {
    const accRes = await tx.query(
      'SELECT * FROM accounts WHERE id = $1 AND household_id = $2',
      [accountId, householdId]
    );
    if (!accRes.rows[0]) {
      throw new AppError('Account not found', 404);
    }
    const acc = accRes.rows[0];
    const recordedBalance = toMoneyString(acc.current_balance);
    const actualBalance = toMoneyString(input.actualStatementBalance);
    const discrepancy = subMoney(actualBalance, recordedBalance);

    const adjustmentTxId: string | null = null;

    // The calculated balance (opening balance + transactions) is intentionally NOT overwritten here.
    // The reconciliation only records the bank-reported balance so that the difference stays visible
    // until the missing transactions (e.g. bank fees) are recorded.

    const recId = generateUUID();
    const recRes = await tx.query(
      `INSERT INTO account_reconciliations (
        id, account_id, reconciled_by_user_id, reconciliation_date,
        recorded_balance, actual_statement_balance, discrepancy_amount, adjustment_transaction_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        recId,
        accountId,
        input.reconciledByUserId,
        input.reconciliationDate,
        recordedBalance,
        actualBalance,
        discrepancy,
        adjustmentTxId,
        input.notes || null,
      ]
    );

    return recRes.rows[0];
  });

  const updatedAccounts = await listAccounts(householdId);
  const updatedAcc = updatedAccounts.find((a) => a.id === accountId)!;

  return {
    account: updatedAcc,
    reconciliation: {
      id: r.id,
      accountId: r.account_id,
      reconciledByUserId: r.reconciled_by_user_id,
      reconciliationDate: r.reconciliation_date,
      recordedBalance: toMoneyString(r.recorded_balance),
      actualStatementBalance: toMoneyString(r.actual_statement_balance),
      discrepancyAmount: toMoneyString(r.discrepancy_amount),
      adjustmentTransactionId: r.adjustment_transaction_id,
      notes: r.notes,
      createdAt: r.created_at,
    },
  };
}

export async function listAccountReconciliations(
  householdId: string,
  accountId?: string
): Promise<AccountReconciliation[]> {
  const params: any[] = [householdId];
  let filterSql = '';
  if (accountId) {
    params.push(accountId);
    filterSql = `AND ar.account_id = $2`;
  }

  const res = await query(
    `SELECT ar.*, a.name AS account_name, u.display_name AS reconciled_by_name
     FROM account_reconciliations ar
     JOIN accounts a ON ar.account_id = a.id
     JOIN users u ON ar.reconciled_by_user_id = u.id
     WHERE a.household_id = $1 ${filterSql}
     ORDER BY ar.reconciliation_date DESC, ar.created_at DESC`,
    params
  );

  return res.rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    accountName: r.account_name,
    reconciledByUserId: r.reconciled_by_user_id,
    reconciledByName: r.reconciled_by_name,
    reconciliationDate: r.reconciliation_date,
    recordedBalance: toMoneyString(r.recorded_balance),
    actualStatementBalance: toMoneyString(r.actual_statement_balance),
    discrepancyAmount: toMoneyString(r.discrepancy_amount),
    adjustmentTransactionId: r.adjustment_transaction_id,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}
