const crypto = globalThis.crypto;
import { query, withTransaction } from '../db/pool';
import { AppError } from '../middleware/error';
import { addMoney, compareMoney, subMoney, toMoneyString } from '../../shared/decimal';
import { createTransactionInTx } from './transactionService';
import type { SavingsContribution, SavingsGoal } from '../../shared/types';

export async function listSavingsGoals(householdId: string): Promise<SavingsGoal[]> {
  const res = await query(
    `SELECT sg.*, a.name AS linked_savings_account_name
     FROM savings_goals sg
     LEFT JOIN accounts a ON sg.linked_savings_account_id = a.id
     WHERE sg.household_id = $1
     ORDER BY sg.status ASC, sg.target_date ASC NULLS LAST, sg.name ASC`,
    [householdId]
  );

  if (res.rows.length === 0) return [];

  const goalIds = res.rows.map((r) => r.id);
  const contribRes = await query(
    `SELECT sc.*, u.display_name AS contributed_by_name
     FROM savings_contributions sc
     LEFT JOIN users u ON sc.contributed_by_user_id = u.id
     WHERE sc.savings_goal_id = ANY($1::uuid[])
     ORDER BY sc.contribution_date DESC, sc.created_at DESC`,
    [goalIds]
  );

  const byGoal = new Map<string, SavingsContribution[]>();
  for (const cr of contribRes.rows) {
    const arr = byGoal.get(cr.savings_goal_id) || [];
    arr.push({
      id: cr.id,
      savingsGoalId: cr.savings_goal_id,
      transactionId: cr.transaction_id,
      contributedByUserId: cr.contributed_by_user_id,
      contributedByName: cr.contributed_by_name,
      contributionDate: cr.contribution_date,
      amountLkr: toMoneyString(cr.amount_lkr),
      type: cr.type,
      notes: cr.notes,
    });
    byGoal.set(cr.savings_goal_id, arr);
  }

  return res.rows.map((r) => ({
    id: r.id,
    householdId: r.household_id,
    ownerScope: r.owner_scope,
    ownerUserId: r.owner_user_id,
    name: r.name,
    targetAmountLkr: toMoneyString(r.target_amount_lkr),
    currentAllocatedLkr: toMoneyString(r.current_allocated_lkr),
    monthlyTargetLkr: toMoneyString(r.monthly_target_lkr),
    targetDate: r.target_date,
    linkedSavingsAccountId: r.linked_savings_account_id,
    linkedSavingsAccountName: r.linked_savings_account_name || null,
    status: r.status,
    notes: r.notes,
    contributions: byGoal.get(r.id) || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function listSavingsContributionsByPeriod(
  householdId: string,
  startDate?: string,
  endDate?: string
): Promise<SavingsContribution[]> {
  const params: any[] = [householdId];
  const clauses: string[] = ['sg.household_id = $1'];

  if (startDate) {
    params.push(startDate);
    clauses.push(`sc.contribution_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`sc.contribution_date <= $${params.length}`);
  }

  const res = await query(
    `SELECT sc.*, u.display_name AS contributed_by_name
     FROM savings_contributions sc
     JOIN savings_goals sg ON sc.savings_goal_id = sg.id
     LEFT JOIN users u ON sc.contributed_by_user_id = u.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY sc.contribution_date DESC`,
    params
  );

  return res.rows.map((cr) => ({
    id: cr.id,
    savingsGoalId: cr.savings_goal_id,
    transactionId: cr.transaction_id,
    contributedByUserId: cr.contributed_by_user_id,
    contributedByName: cr.contributed_by_name,
    contributionDate: cr.contribution_date,
    amountLkr: toMoneyString(cr.amount_lkr),
    type: cr.type,
    notes: cr.notes,
  }));
}

export async function createSavingsGoal(
  householdId: string,
  input: {
    ownerScope: 'HOUSEHOLD' | 'HUSBAND' | 'WIFE';
    ownerUserId?: string | null;
    name: string;
    targetAmountLkr: string;
    monthlyTargetLkr: string;
    targetDate?: string | null;
    linkedSavingsAccountId?: string | null;
    status?: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
    notes?: string | null;
  }
): Promise<SavingsGoal> {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO savings_goals (
      id, household_id, owner_scope, owner_user_id, name,
      target_amount_lkr, current_allocated_lkr, monthly_target_lkr, target_date,
      linked_savings_account_id, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, 0.00, $7, $8, $9, $10, $11)`,
    [
      id,
      householdId,
      input.ownerScope,
      input.ownerUserId || null,
      input.name.trim(),
      toMoneyString(input.targetAmountLkr),
      toMoneyString(input.monthlyTargetLkr),
      input.targetDate || null,
      input.linkedSavingsAccountId || null,
      input.status || 'ACTIVE',
      input.notes || null,
    ]
  );

  const list = await listSavingsGoals(householdId);
  return list.find((g) => g.id === id)!;
}

export async function addSavingsContribution(
  householdId: string,
  goalId: string,
  recordedByUserId: string,
  input: {
    contributedByUserId: string;
    contributionDate: string;
    amountLkr: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    sourceAccountId?: string | null;
    destinationAccountId?: string | null;
    createTransferTransaction?: boolean;
    notes?: string | null;
  }
): Promise<SavingsGoal> {
  await withTransaction(async (tx) => {
    const goalRes = await tx.query(
      'SELECT * FROM savings_goals WHERE id = $1 AND household_id = $2',
      [goalId, householdId]
    );
    if (!goalRes.rows[0]) {
      throw new AppError('Savings goal not found', 404);
    }
    const goal = goalRes.rows[0];
    const amt = toMoneyString(input.amountLkr);

    let txId: string | null = null;
    if (
      input.createTransferTransaction &&
      input.sourceAccountId &&
      input.destinationAccountId &&
      input.sourceAccountId !== input.destinationAccountId
    ) {
      txId = await createTransactionInTx(tx, householdId, {
        transactionDate: input.contributionDate,
        transactionType: 'TRANSFER',
        description: `Savings Goal ${input.type === 'DEPOSIT' ? 'Allocation' : 'Withdrawal'}: ${goal.name}`,
        originalAmount: amt,
        originalCurrency: 'LKR',
        exchangeRate: '1.000000',
        actualLkrAmount: amt,
        paymentMethod: 'BANK_TRANSFER',
        sourceAccountId: input.sourceAccountId,
        destinationAccountId: input.destinationAccountId,
        paidOrReceivedByUserId: input.contributedByUserId,
        recordedByUserId,
        householdMemberScope:
          goal.owner_scope === 'HUSBAND'
            ? 'HUSBAND'
            : goal.owner_scope === 'WIFE'
              ? 'WIFE'
              : 'SHARED',
        isEssential: true,
        isFixed: false,
        notes: input.notes || `Internal transfer for savings goal: ${goal.name}`,
      });
    }

    await tx.query(
      `INSERT INTO savings_contributions (
        id, savings_goal_id, transaction_id, contributed_by_user_id, contribution_date, amount_lkr, type, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        goalId,
        txId,
        input.contributedByUserId,
        input.contributionDate,
        amt,
        input.type,
        input.notes || null,
      ]
    );

    const nextAllocated =
      input.type === 'DEPOSIT'
        ? addMoney(goal.current_allocated_lkr, amt)
        : subMoney(goal.current_allocated_lkr, amt);
    const clampedAllocated =
      compareMoney(nextAllocated, '0.00') < 0 ? '0.00' : nextAllocated;
    const nextStatus =
      compareMoney(clampedAllocated, goal.target_amount_lkr) >= 0 ? 'COMPLETED' : goal.status;

    await tx.query(
      `UPDATE savings_goals
       SET current_allocated_lkr = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [clampedAllocated, nextStatus, goalId]
    );
  });

  const list = await listSavingsGoals(householdId);
  return list.find((g) => g.id === goalId)!;
}

