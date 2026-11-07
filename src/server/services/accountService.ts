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
 *
 * Vectorized high-performance implementation:
 * Uses a single query for all transactions instead of 180+ individual SQL requests.
 */
export async function getAccountBalanceBreakdowns(
  householdId: string,
  filter?: { accountId?: string; memberUserId?: string; startDate?: string; endDate?: string },
  preloaded?: { accounts?: Account[]; transactions?: any[] }
): Promise<AccountBalanceBreakdown[]> {
  const accounts = preloaded?.accounts || (await listAccounts(householdId));
  const filteredAccounts = accounts.filter((a) => {
    if (filter?.accountId && a.id !== filter.accountId) return false;
    if (filter?.memberUserId && a.ownerUserId && a.ownerUserId !== filter.memberUserId) return false;
    return true;
  });

  // Fetch all transactions once for all accounts in this household
  const txRows: any[] =
    preloaded?.transactions ||
    (
      await query(
        `SELECT t.id, t.transaction_date, t.transaction_type, t.actual_lkr_amount,
                t.source_account_id, t.destination_account_id, t.description,
                c.name AS category_name,
                src.account_type AS source_account_type,
                dst.account_type AS destination_account_type
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts src ON t.source_account_id = src.id
         LEFT JOIN accounts dst ON t.destination_account_id = dst.id
         WHERE t.household_id = $1`,
        [householdId]
      )
    ).rows;

  const inDateRange = (dateStr: string) => {
    if (filter?.startDate && filter?.endDate) {
      return dateStr >= filter.startDate && dateStr <= filter.endDate;
    }
    if (filter?.startDate) return dateStr >= filter.startDate;
    if (filter?.endDate) return dateStr <= filter.endDate;
    return true;
  };

  const isBankFee = (catName: string | null, desc: string | null) => {
    const c = (catName || '').toLowerCase();
    const d = (desc || '').toLowerCase();
    return (
      c.includes('bank charge') ||
      c.includes('bank fee') ||
      d.includes('bank fee') ||
      d.includes('service charge') ||
      d.includes('bank charge')
    );
  };

  const breakdowns: AccountBalanceBreakdown[] = [];

  for (const acc of filteredAccounts) {
    if (acc.linkedParentAccountId && !filter?.accountId) {
      continue;
    }

    const linkedCards = accounts.filter((c) => c.linkedParentAccountId === acc.id);
    const allIds = new Set([acc.id, ...linkedCards.map((c) => c.id)]);
    const isLiability = acc.accountType === 'CREDIT_CARD';

    let totalIncomeDec = new Decimal(0);
    let totalExpensesDec = new Decimal(0);
    let bankChargesDec = new Decimal(0);
    let withdrawalsDec = new Decimal(0);
    let depositsDec = new Decimal(0);
    let incomingTransfersDec = new Decimal(0);
    let outgoingTransfersDec = new Decimal(0);

    // All-time balance accumulators
    let allTimeIncome = new Decimal(0);
    let allTimeExpenses = new Decimal(0);
    let allTimeInTrans = new Decimal(0);
    let allTimeOutTrans = new Decimal(0);

    for (const t of txRows) {
      const amt = toDecimal(t.actual_lkr_amount || 0);
      const isSrc = allIds.has(t.source_account_id);
      const isDirectSrc = t.source_account_id === acc.id;
      const isDst = t.destination_account_id === acc.id;
      const inRange = inDateRange(t.transaction_date);

      // All-time balance tracking
      if (t.transaction_type === 'INCOME' && isDirectSrc) {
        allTimeIncome = allTimeIncome.plus(amt);
      } else if (t.transaction_type === 'EXPENSE' && isSrc) {
        allTimeExpenses = allTimeExpenses.plus(amt);
      } else if (t.transaction_type === 'TRANSFER') {
        if (isDst) allTimeInTrans = allTimeInTrans.plus(amt);
        if (isSrc) allTimeOutTrans = allTimeOutTrans.plus(amt);
      }

      // Date-filtered breakdown tracking
      if (!inRange) continue;

      if (t.transaction_type === 'INCOME' && isDirectSrc) {
        totalIncomeDec = totalIncomeDec.plus(amt);
      } else if (t.transaction_type === 'EXPENSE' && isSrc) {
        if (isBankFee(t.category_name, t.description)) {
          bankChargesDec = bankChargesDec.plus(amt);
        } else {
          totalExpensesDec = totalExpensesDec.plus(amt);
        }
      } else if (t.transaction_type === 'TRANSFER') {
        const srcIsBank =
          t.source_account_type === 'BANK_SAVINGS' || t.source_account_type === 'BANK_CURRENT';
        const dstIsBank =
          t.destination_account_type === 'BANK_SAVINGS' || t.destination_account_type === 'BANK_CURRENT';
        const srcIsCash = t.source_account_type === 'CASH';
        const dstIsCash = t.destination_account_type === 'CASH';

        if (acc.accountType === 'CASH') {
          if (isDst && srcIsBank) {
            withdrawalsDec = withdrawalsDec.plus(amt);
          } else if (isDirectSrc && dstIsBank) {
            depositsDec = depositsDec.plus(amt);
          } else if (isDst && srcIsCash) {
            incomingTransfersDec = incomingTransfersDec.plus(amt);
          } else if (isDirectSrc && dstIsCash) {
            outgoingTransfersDec = outgoingTransfersDec.plus(amt);
          }
        } else {
          if (isSrc && dstIsCash) {
            withdrawalsDec = withdrawalsDec.plus(amt);
          } else if (isDst && srcIsCash) {
            depositsDec = depositsDec.plus(amt);
          } else if (isDst && !srcIsCash) {
            incomingTransfersDec = incomingTransfersDec.plus(amt);
          } else if (isSrc && !dstIsCash) {
            outgoingTransfersDec = outgoingTransfersDec.plus(amt);
          }
        }
      }
    }

    const opening = toDecimal(acc.openingBalance || 0);
    let calculatedBalDec: Decimal;
    if (isLiability) {
      calculatedBalDec = opening.plus(allTimeExpenses).minus(allTimeInTrans).minus(allTimeIncome).plus(allTimeOutTrans);
    } else {
      calculatedBalDec = opening.plus(allTimeIncome).plus(allTimeInTrans).minus(allTimeExpenses).minus(allTimeOutTrans);
    }

    const currentCalculatedBalance = toMoneyString(calculatedBalDec);

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
      totalIncome: toMoneyString(totalIncomeDec),
      totalExpenses: toMoneyString(totalExpensesDec),
      bankCharges: toMoneyString(bankChargesDec),
      withdrawals: toMoneyString(withdrawalsDec),
      deposits: toMoneyString(depositsDec),
      incomingTransfers: toMoneyString(incomingTransfersDec),
      outgoingTransfers: toMoneyString(outgoingTransfersDec),
      currentCalculatedBalance,
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
