import { generateUUID } from '../../shared/uuid';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../middleware/error';
import { compareMoney, subMoney, toDecimal, toMoneyString } from '../../shared/decimal';
import { createTransactionInTx } from './transactionService';
import type {
  InterestCalculationMethod,
  Loan,
  LoanInstallment,
  LoanType,
  OwnershipType,
  PaymentMethod,
} from '../../shared/types';

function mapLoanRow(row: any, installments: LoanInstallment[] = []): Loan {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name || (row.ownership_type === 'JOINT' ? 'Joint' : row.ownership_type),
    ownershipType: row.ownership_type,
    loanName: row.loan_name,
    loanReferenceNo: row.loan_reference_no || null,
    loanType: row.loan_type,
    lenderName: row.lender_name,
    interestCalculationMethod: row.interest_calculation_method,
    originalPrincipal: toMoneyString(row.original_principal),
    currentOutstandingBalance: toMoneyString(row.current_outstanding_balance),
    annualInterestRate: toDecimal(row.annual_interest_rate).toFixed(3),
    monthlyInstallment: toMoneyString(row.monthly_installment),
    paymentDueDay: Number(row.payment_due_day),
    startDate: row.start_date,
    expectedCompletionDate: row.expected_completion_date,
    totalInstallments: Number(row.total_installments),
    remainingInstallments: Number(row.remaining_installments),
    defaultPaymentAccountId: row.default_payment_account_id,
    status: row.status,
    notes: row.notes,
    installments,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listLoans(householdId: string): Promise<Loan[]> {
  const res = await query(
    `SELECT l.*, u.display_name AS owner_name
     FROM loans l
     LEFT JOIN users u ON l.owner_user_id = u.id
     WHERE l.household_id = $1
     ORDER BY l.status ASC, l.payment_due_day ASC, l.loan_name ASC`,
    [householdId]
  );

  if (res.rows.length === 0) return [];

  const loanIds = res.rows.map((r) => r.id);
  const instRes = await query(
    `SELECT li.*, u.display_name AS paid_by_name
     FROM loan_installments li
     LEFT JOIN users u ON li.paid_by_user_id = u.id
     WHERE li.loan_id = ANY($1::uuid[])
     ORDER BY li.installment_number DESC, li.paid_date DESC`,
    [loanIds]
  );

  const byLoan = new Map<string, LoanInstallment[]>();
  for (const ir of instRes.rows) {
    const arr = byLoan.get(ir.loan_id) || [];
    arr.push({
      id: ir.id,
      loanId: ir.loan_id,
      transactionId: ir.transaction_id,
      installmentNumber: Number(ir.installment_number),
      dueDate: ir.due_date,
      paidDate: ir.paid_date,
      totalPaidLkr: toMoneyString(ir.total_paid_lkr),
      principalComponentLkr: toMoneyString(ir.principal_component_lkr),
      interestComponentLkr: toMoneyString(ir.interest_component_lkr),
      feesComponentLkr: toMoneyString(ir.fees_component_lkr),
      balanceAfterPayment: toMoneyString(ir.balance_after_payment),
      paidByUserId: ir.paid_by_user_id,
      paidByName: ir.paid_by_name || null,
      status: ir.status,
      notes: ir.notes,
    });
    byLoan.set(ir.loan_id, arr);
  }

  return res.rows.map((r) => mapLoanRow(r, byLoan.get(r.id) || []));
}

export async function createLoan(
  householdId: string,
  input: {
    ownerUserId?: string | null;
    ownershipType: OwnershipType;
    loanName: string;
    loanReferenceNo?: string | null;
    loanType: LoanType;
    lenderName: string;
    interestCalculationMethod: InterestCalculationMethod;
    originalPrincipal: string;
    currentOutstandingBalance: string;
    annualInterestRate: string;
    monthlyInstallment: string;
    paymentDueDay: number;
    startDate: string;
    expectedCompletionDate: string;
    totalInstallments: number;
    remainingInstallments: number;
    defaultPaymentAccountId?: string | null;
    status?: 'ACTIVE' | 'PAID_OFF' | 'CLOSED';
    notes?: string | null;
  }
): Promise<Loan> {
  const id = generateUUID();
  await query(
    `INSERT INTO loans (
      id, household_id, owner_user_id, ownership_type, loan_name, loan_reference_no, loan_type, lender_name,
      interest_calculation_method, original_principal, current_outstanding_balance,
      annual_interest_rate, monthly_installment, payment_due_day, start_date, expected_completion_date,
      total_installments, remaining_installments, default_payment_account_id, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      id,
      householdId,
      input.ownerUserId || null,
      input.ownershipType,
      input.loanName.trim(),
      input.loanReferenceNo || null,
      input.loanType,
      input.lenderName.trim(),
      input.interestCalculationMethod,
      toMoneyString(input.originalPrincipal),
      toMoneyString(input.currentOutstandingBalance),
      toDecimal(input.annualInterestRate).toFixed(3),
      toMoneyString(input.monthlyInstallment),
      input.paymentDueDay,
      input.startDate,
      input.expectedCompletionDate,
      input.totalInstallments,
      input.remainingInstallments,
      input.defaultPaymentAccountId || null,
      input.status || 'ACTIVE',
      input.notes || null,
    ]
  );

  const list = await listLoans(householdId);
  return list.find((l) => l.id === id)!;
}

export async function updateLoan(
  householdId: string,
  loanId: string,
  input: Partial<{
    loanName: string;
    loanReferenceNo: string | null;
    lenderName: string;
    currentOutstandingBalance: string;
    monthlyInstallment: string;
    expectedCompletionDate: string;
    totalInstallments: number;
    remainingInstallments: number;
    notes: string | null;
  }>
): Promise<Loan> {
  const existing = await query('SELECT * FROM loans WHERE id = $1 AND household_id = $2', [
    loanId,
    householdId,
  ]);
  if (!existing.rows[0]) {
    throw new AppError('Loan not found', 404);
  }
  const curr = existing.rows[0];

  await query(
    `UPDATE loans
     SET loan_name = $1,
         loan_reference_no = $2,
         lender_name = $3,
         current_outstanding_balance = $4,
         monthly_installment = $5,
         expected_completion_date = $6,
         total_installments = $7,
         remaining_installments = $8,
         notes = $9,
         updated_at = NOW()
     WHERE id = $10 AND household_id = $11`,
    [
      input.loanName !== undefined ? input.loanName.trim() : curr.loan_name,
      input.loanReferenceNo !== undefined ? input.loanReferenceNo : curr.loan_reference_no,
      input.lenderName !== undefined ? input.lenderName.trim() : curr.lender_name,
      input.currentOutstandingBalance !== undefined
        ? toMoneyString(input.currentOutstandingBalance)
        : curr.current_outstanding_balance,
      input.monthlyInstallment !== undefined
        ? toMoneyString(input.monthlyInstallment)
        : curr.monthly_installment,
      input.expectedCompletionDate !== undefined
        ? input.expectedCompletionDate
        : curr.expected_completion_date,
      input.totalInstallments !== undefined ? input.totalInstallments : curr.total_installments,
      input.remainingInstallments !== undefined
        ? input.remainingInstallments
        : curr.remaining_installments,
      input.notes !== undefined ? input.notes : curr.notes,
      loanId,
      householdId,
    ]
  );

  const list = await listLoans(householdId);
  return list.find((l) => l.id === loanId)!;
}

/**
 * Records a loan installment payment:
 * - Enforces Rule 4 (No Double Counting): Creates ONE cash-flow EXPENSE transaction for totalPaidLkr
 * - Separately records the principal, interest, and fees breakdown in loan_installments
 * - Reduces the loan's current_outstanding_balance by principalComponentLkr
 * - Decrements remaining_installments
 */
export async function payLoanInstallment(
  householdId: string,
  loanId: string,
  recordedByUserId: string,
  input: {
    paidDate: string;
    sourceAccountId: string;
    paidByUserId: string;
    totalPaidLkr: string;
    principalComponentLkr: string;
    interestComponentLkr: string;
    feesComponentLkr?: string;
    paymentMethod: PaymentMethod;
    notes?: string | null;
  }
): Promise<Loan> {
  await withTransaction(async (tx) => {
    const loanRes = await tx.query(
      'SELECT * FROM loans WHERE id = $1 AND household_id = $2',
      [loanId, householdId]
    );
    if (!loanRes.rows[0]) {
      throw new AppError('Loan not found', 404);
    }
    const loan = loanRes.rows[0];

    // Resolve "Loans and Financial Commitments" category & matching subcategory
    const catRes = await tx.query(
      `SELECT id FROM categories WHERE household_id = $1 AND parent_id IS NULL AND name ILIKE '%Loan%' LIMIT 1`,
      [householdId]
    );
    const categoryId = catRes.rows[0]?.id || null;

    let subcategoryId: string | null = null;
    if (categoryId) {
      const subRes = await tx.query(
        `SELECT id FROM categories WHERE household_id = $1 AND parent_id = $2 AND LOWER(name) = LOWER($3) LIMIT 1`,
        [householdId, categoryId, loan.loan_name]
      );
      subcategoryId = subRes.rows[0]?.id || null;
    }

    const totalPaid = toMoneyString(input.totalPaidLkr);
    const principalPaid = toMoneyString(input.principalComponentLkr);
    const interestPaid = toMoneyString(input.interestComponentLkr);
    const feesPaid = toMoneyString(input.feesComponentLkr || '0.00');

    // Create the single cash-flow EXPENSE transaction
    const txId = await createTransactionInTx(tx, householdId, {
      transactionDate: input.paidDate,
      transactionType: 'EXPENSE',
      description: `${loan.loan_name} - Installment Payment`,
      categoryId,
      subcategoryId,
      originalAmount: totalPaid,
      originalCurrency: 'LKR',
      exchangeRate: '1.000000',
      actualLkrAmount: totalPaid,
      paymentMethod: input.paymentMethod,
      sourceAccountId: input.sourceAccountId,
      paidOrReceivedByUserId: input.paidByUserId,
      recordedByUserId,
      householdMemberScope:
        loan.ownership_type === 'HUSBAND'
          ? 'HUSBAND'
          : loan.ownership_type === 'WIFE'
            ? 'WIFE'
            : 'SHARED',
      isEssential: true,
      isFixed: true,
      loanId: loan.id,
      notes:
        input.notes ||
        `Principal: LKR ${principalPaid} | Interest: LKR ${interestPaid}${compareMoney(feesPaid, '0') > 0 ? ` | Fees: LKR ${feesPaid}` : ''}`,
    });

    const rawNextBal = subMoney(loan.current_outstanding_balance, principalPaid);
    const nextBalance = compareMoney(rawNextBal, '0.00') < 0 ? '0.00' : rawNextBal;
    const paidInstallmentsSoFar = Math.max(
      1,
      Number(loan.total_installments) - Number(loan.remaining_installments) + 1
    );
    const nextRemaining = Math.max(0, Number(loan.remaining_installments) - 1);
    const nextStatus = compareMoney(nextBalance, '0.00') === 0 ? 'PAID_OFF' : loan.status;

    await tx.query(
      `INSERT INTO loan_installments (
        id, loan_id, transaction_id, installment_number, due_date, paid_date,
        total_paid_lkr, principal_component_lkr, interest_component_lkr, fees_component_lkr,
        balance_after_payment, paid_by_user_id, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PAID', $13)`,
      [
        generateUUID(),
        loan.id,
        txId,
        paidInstallmentsSoFar,
        input.paidDate,
        input.paidDate,
        totalPaid,
        principalPaid,
        interestPaid,
        feesPaid,
        nextBalance,
        input.paidByUserId,
        input.notes || null,
      ]
    );

    await tx.query(
      `UPDATE loans
       SET current_outstanding_balance = $1,
           remaining_installments = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [nextBalance, nextRemaining, nextStatus, loan.id]
    );
  });

  const list = await listLoans(householdId);
  return list.find((l) => l.id === loanId)!;
}

