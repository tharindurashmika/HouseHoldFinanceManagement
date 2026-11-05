const crypto = globalThis.crypto;
import { query, withTransaction, type DbExecutor } from '../db/pool';
import { AppError } from '../middleware/error';
import { addMoney, compareMoney, subMoney, toMoneyString } from '../../shared/decimal';
import { computeAccountBalanceDelta } from '../../shared/calculations';
import type { Account, AccountReconciliation, AccountType } from '../../shared/types';

function mapAccountRow(row: any): Account {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || (row.ownership_type === 'JOINT' ? 'Joint (Husband & Wife)' : row.ownership_type),
    ownershipType: row.ownership_type,
    name: row.name,
    accountType: row.account_type,
    cardLastFour: row.card_last_four || null,
    linkedParentAccountId: row.linked_parent_account_id,
    linkedParentAccountName: row.linked_parent_account_name || null,
    currency: row.currency,
    openingBalance: toMoneyString(row.opening_balance),
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
    cardLastFour?: string | null;
    linkedParentAccountId?: string | null;
    currency?: string;
    openingBalance: string;
    creditLimit?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
    notes?: string | null;
  }
): Promise<Account> {
  const id = crypto.randomUUID();
  const openBal = toMoneyString(input.openingBalance);

  await query(
    `INSERT INTO accounts (
      id, household_id, owner_user_id, ownership_type, name, account_type, card_last_four,
      linked_parent_account_id, currency, opening_balance, current_balance, credit_limit, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13)`,
    [
      id,
      householdId,
      input.ownerUserId || null,
      input.ownershipType,
      input.name.trim(),
      input.accountType,
      input.cardLastFour || null,
      input.linkedParentAccountId || null,
      input.currency || 'LKR',
      openBal,
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
    cardLastFour: string | null;
    linkedParentAccountId: string | null;
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

  await query(
    `UPDATE accounts
     SET owner_user_id = $1,
         ownership_type = $2,
         name = $3,
         card_last_four = $4,
         linked_parent_account_id = $5,
         credit_limit = $6,
         status = $7,
         notes = $8,
         updated_at = NOW()
     WHERE id = $9 AND household_id = $10`,
    [
      input.ownerUserId !== undefined ? input.ownerUserId : curr.owner_user_id,
      input.ownershipType !== undefined ? input.ownershipType : curr.ownership_type,
      input.name !== undefined ? input.name.trim() : curr.name,
      input.cardLastFour !== undefined ? input.cardLastFour : curr.card_last_four,
      input.linkedParentAccountId !== undefined
        ? input.linkedParentAccountId
        : curr.linked_parent_account_id,
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

  const list = await listAccounts(householdId);
  return list.find((a) => a.id === accountId)!;
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

    if (compareMoney(discrepancy, '0.00') !== 0) {
      await tx.query(
        'UPDATE accounts SET current_balance = $1, updated_at = NOW() WHERE id = $2',
        [actualBalance, accountId]
      );
    }

    const recId = crypto.randomUUID();
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
