import Decimal from 'decimal.js';
import {
  addMoney,
  compareMoney,
  divMoney,
  formatLKR,
  mulMoney,
  pctOf,
  subMoney,
  toDecimal,
  toMoneyNumber,
  toMoneyString,
} from './decimal';
import type {
  Account,
  AccountType,
  Budget,
  FinancialInsight,
  InterestCalculationMethod,
  SavingsContribution,
  Subscription,
  Transaction,
} from './types';

/**
 * Calculates how a transaction affects an account's currentBalance.
 *
 * Conventions:
 * - For Asset accounts (BANK_SAVINGS, BANK_CURRENT, CASH, DEBIT_CARD, DIGITAL_WALLET, OTHER):
 *   currentBalance > 0 means positive cash/asset owned.
 *   - INCOME into sourceAccount -> +amount
 *   - EXPENSE from sourceAccount -> -amount
 *   - TRANSFER: sourceAccount -> -amount, destinationAccount -> +amount
 *
 * - For Liability accounts (CREDIT_CARD):
 *   currentBalance represents the amount currently owed on the card (0 = paid off, >0 = liability owed).
 *   - EXPENSE paid with CREDIT_CARD -> INCREASES liability (+amount)
 *   - INCOME / refund to CREDIT_CARD -> DECREASES liability (-amount)
 *   - TRANSFER into CREDIT_CARD (paying off credit card bill from a Bank Account) ->
 *     source Bank Account decreases (-amount), destination CREDIT_CARD liability decreases (-amount).
 *     Notice: Paying a credit card bill is a TRANSFER, so it is NEVER double-counted as an EXPENSE!
 */
export function computeAccountBalanceDelta(
  accountType: AccountType,
  role: 'SOURCE' | 'DESTINATION',
  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountLkr: string,
  direction: 'APPLY' | 'REVERSE' = 'APPLY'
): string {
  const amt = toDecimal(amountLkr);
  const signMultiplier = direction === 'APPLY' ? new Decimal(1) : new Decimal(-1);
  const isLiability = accountType === 'CREDIT_CARD';

  let rawDelta = new Decimal(0);

  if (transactionType === 'INCOME' && role === 'SOURCE') {
    // Income / refund received into account
    rawDelta = isLiability ? amt.negated() : amt;
  } else if (transactionType === 'EXPENSE' && role === 'SOURCE') {
    // Expense paid from account
    rawDelta = isLiability ? amt : amt.negated();
  } else if (transactionType === 'TRANSFER') {
    if (role === 'SOURCE') {
      // Money leaving source account (or balance transfer / cash advance from credit card)
      rawDelta = isLiability ? amt : amt.negated();
    } else if (role === 'DESTINATION') {
      // Money arriving at destination account (e.g., settling a credit card bill reduces liability!)
      rawDelta = isLiability ? amt.negated() : amt;
    }
  }

  return toMoneyString(rawDelta.times(signMultiplier));
}

/**
 * Calculates the principal and interest breakdown for a loan installment.
 * Supports REDUCING_BALANCE, FLAT_RATE, and CUSTOM_MANUAL.
 */
export function calculateLoanInstallmentSplit(params: {
  method: InterestCalculationMethod;
  originalPrincipal: string;
  currentOutstandingBalance: string;
  annualInterestRate: string;
  monthlyInstallment: string;
  totalInstallments: number;
}): {
  principalComponentLkr: string;
  interestComponentLkr: string;
  totalInstallmentLkr: string;
  nextBalanceAfterPaymentLkr: string;
} {
  const {
    method,
    originalPrincipal,
    currentOutstandingBalance,
    annualInterestRate,
    monthlyInstallment,
    totalInstallments,
  } = params;

  const balance = toDecimal(currentOutstandingBalance);
  const installment = toDecimal(monthlyInstallment);
  const rateAnnual = toDecimal(annualInterestRate).dividedBy(100);
  const monthlyRate = rateAnnual.dividedBy(12);

  if (balance.lessThanOrEqualTo(0)) {
    return {
      principalComponentLkr: '0.00',
      interestComponentLkr: '0.00',
      totalInstallmentLkr: '0.00',
      nextBalanceAfterPaymentLkr: '0.00',
    };
  }

  let interest = new Decimal(0);
  if (method === 'REDUCING_BALANCE') {
    interest = balance.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (method === 'FLAT_RATE') {
    const orig = toDecimal(originalPrincipal);
    interest = orig.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    // Default estimate for CUSTOM_MANUAL when pre-filling
    interest = balance.times(monthlyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  let principal = installment.minus(interest);
  if (principal.lessThan(0)) {
    principal = new Decimal(0);
  }
  if (principal.greaterThan(balance)) {
    principal = balance;
  }

  const actualTotal = principal.plus(interest);
  const nextBalance = Decimal.max(new Decimal(0), balance.minus(principal));

  return {
    principalComponentLkr: toMoneyString(principal),
    interestComponentLkr: toMoneyString(interest),
    totalInstallmentLkr: toMoneyString(actualTotal),
    nextBalanceAfterPaymentLkr: toMoneyString(nextBalance),
  };
}

/**
 * Aggregates transactions for a period without double-counting internal transfers,
 * credit card bill settlements, or loan principal splits.
 */
export function aggregatePeriodTransactions(
  transactions: Transaction[],
  savingsContributions: SavingsContribution[] = []
) {
  let combinedIncome = new Decimal(0);
  let totalExpenses = new Decimal(0);
  let husbandIncome = new Decimal(0);
  let wifeIncome = new Decimal(0);
  let husbandSpending = new Decimal(0);
  let wifeSpending = new Decimal(0);

  let totalLoanRepayments = new Decimal(0);
  let totalFixedCommitments = new Decimal(0);
  let totalVariableExpenses = new Decimal(0);
  let essentialExpenses = new Decimal(0);
  let nonEssentialExpenses = new Decimal(0);
  let recurringExpenses = new Decimal(0);
  let oneTimeExpenses = new Decimal(0);

  for (const tx of transactions) {
    const amt = toDecimal(tx.actualLkrAmount);

    // Rule 2: Internal Money Transfers are NEVER counted as income or expense
    if (tx.transactionType === 'TRANSFER') {
      continue;
    }

    if (tx.transactionType === 'INCOME') {
      combinedIncome = combinedIncome.plus(amt);
      if (tx.paidOrReceivedByRole === 'HUSBAND') {
        husbandIncome = husbandIncome.plus(amt);
      } else if (tx.paidOrReceivedByRole === 'WIFE') {
        wifeIncome = wifeIncome.plus(amt);
      }
    } else if (tx.transactionType === 'EXPENSE') {
      // Rule 1 & Rule 4: Count expense once toward household total and attribute to payer
      totalExpenses = totalExpenses.plus(amt);

      if (tx.paidOrReceivedByRole === 'HUSBAND') {
        husbandSpending = husbandSpending.plus(amt);
      } else if (tx.paidOrReceivedByRole === 'WIFE') {
        wifeSpending = wifeSpending.plus(amt);
      }

      if (tx.loanId || (tx.categoryName && tx.categoryName.toLowerCase().includes('loan'))) {
        totalLoanRepayments = totalLoanRepayments.plus(amt);
      }

      if (tx.isFixed) {
        totalFixedCommitments = totalFixedCommitments.plus(amt);
      } else {
        totalVariableExpenses = totalVariableExpenses.plus(amt);
      }

      if (tx.isEssential) {
        essentialExpenses = essentialExpenses.plus(amt);
      } else {
        nonEssentialExpenses = nonEssentialExpenses.plus(amt);
      }

      if (tx.recurringScheduleId || tx.subscriptionId || tx.loanId) {
        recurringExpenses = recurringExpenses.plus(amt);
      } else {
        oneTimeExpenses = oneTimeExpenses.plus(amt);
      }
    }
  }

  // Calculate net explicit savings allocated during the period
  let allocatedSavings = new Decimal(0);
  for (const sc of savingsContributions) {
    const amt = toDecimal(sc.amountLkr);
    if (sc.type === 'DEPOSIT') {
      allocatedSavings = allocatedSavings.plus(amt);
    } else if (sc.type === 'WITHDRAWAL') {
      allocatedSavings = allocatedSavings.minus(amt);
    }
  }

  const cashFlowSurplus = combinedIncome.minus(totalExpenses);
  const remainingAvailableBalance = cashFlowSurplus.minus(Decimal.max(new Decimal(0), allocatedSavings));

  const combinedIncomeStr = toMoneyString(combinedIncome);
  const totalExpensesStr = toMoneyString(totalExpenses);
  const cashFlowSurplusStr = toMoneyString(cashFlowSurplus);
  const allocatedSavingsStr = toMoneyString(allocatedSavings);

  return {
    combinedIncomeLkr: combinedIncomeStr,
    totalExpensesLkr: totalExpensesStr,
    husbandIncomeLkr: toMoneyString(husbandIncome),
    wifeIncomeLkr: toMoneyString(wifeIncome),
    husbandSpendingLkr: toMoneyString(husbandSpending),
    wifeSpendingLkr: toMoneyString(wifeSpending),
    husbandIncomeSharePct: pctOf(husbandIncome, combinedIncome),
    wifeIncomeSharePct: pctOf(wifeIncome, combinedIncome),
    husbandSpendingSharePct: pctOf(husbandSpending, totalExpenses),
    wifeSpendingSharePct: pctOf(wifeSpending, totalExpenses),
    totalLoanRepaymentsLkr: toMoneyString(totalLoanRepayments),
    totalFixedCommitmentsLkr: toMoneyString(totalFixedCommitments),
    totalVariableExpensesLkr: toMoneyString(totalVariableExpenses),
    essentialExpensesLkr: toMoneyString(essentialExpenses),
    nonEssentialExpensesLkr: toMoneyString(nonEssentialExpenses),
    recurringExpensesLkr: toMoneyString(recurringExpenses),
    oneTimeExpensesLkr: toMoneyString(oneTimeExpenses),
    cashFlowSurplusLkr: cashFlowSurplusStr,
    allocatedSavingsLkr: allocatedSavingsStr,
    remainingAvailableBalanceLkr: toMoneyString(remainingAvailableBalance),
    ratios: {
      incomeToExpenseRatio: totalExpenses.greaterThan(0)
        ? Number(combinedIncome.dividedBy(totalExpenses).toDecimalPlaces(2).toFixed(2))
        : 0,
      savingsRatePct: pctOf(Decimal.max(new Decimal(0), allocatedSavings), combinedIncome),
      cashFlowSurplusRatePct: pctOf(cashFlowSurplus, combinedIncome),
      debtRepaymentBurdenPct: pctOf(totalLoanRepayments, combinedIncome),
      fixedCommitmentRatioPct: pctOf(totalFixedCommitments, combinedIncome),
      essentialExpenseRatioPct: pctOf(essentialExpenses, totalExpenses),
    },
  };
}

/**
 * Evaluates a list of monthly budgets against actual transactions for the target month
 * and previous month, handling both Main Category budgets and Subcategory budgets
 * (including itemized receipt splits in `tx.items`).
 *
 * Also computes total household budget without double-counting subcategory sub-allocations
 * when a parent Main Category budget is also present.
 */
export function evaluateMonthlyBudgets(
  budgets: Budget[],
  currentMonthTransactions: Transaction[],
  previousMonthTransactions: Transaction[] = []
): {
  evaluatedBudgets: Budget[];
  summary: {
    totalBudgetedLkr: string;
    totalSpentInBudgetedCategoriesLkr: string;
    totalRemainingLkr: string;
    overallUtilizationPct: number;
    exceededCount: number;
    approachingCount: number;
  };
} {
  const computeSpentForBudget = (b: Budget, txs: Transaction[]): Decimal => {
    let spent = new Decimal(0);
    for (const tx of txs) {
      if (tx.transactionType !== 'EXPENSE') continue;

      // Filter by memberScope if budget is individual
      if (b.memberScope === 'HUSBAND' && tx.paidOrReceivedByRole !== 'HUSBAND') continue;
      if (b.memberScope === 'WIFE' && tx.paidOrReceivedByRole !== 'WIFE') continue;

      if (b.subcategoryId) {
        // Subcategory-specific budget (e.g. "Vegetables")
        if (tx.items && tx.items.length > 0) {
          for (const item of tx.items) {
            if (item.subcategoryId === b.subcategoryId) {
              spent = spent.plus(toDecimal(item.amountLkr));
            }
          }
        } else if (tx.subcategoryId === b.subcategoryId) {
          spent = spent.plus(toDecimal(tx.actualLkrAmount));
        }
      } else {
        // Main category budget (e.g. "Food and Household Consumables")
        if (tx.categoryId === b.categoryId) {
          spent = spent.plus(toDecimal(tx.actualLkrAmount));
        }
      }
    }
    return spent;
  };

  let exceededCount = 0;
  let approachingCount = 0;

  const evaluatedBudgets: Budget[] = budgets.map((b) => {
    const allocated = toDecimal(b.allocatedAmountLkr);
    const actualSpent = computeSpentForBudget(b, currentMonthTransactions);
    const prevSpent = computeSpentForBudget(b, previousMonthTransactions);
    const remaining = allocated.minus(actualSpent);
    const utilizationPct = pctOf(actualSpent, allocated);

    let momDiffPct = 0;
    if (prevSpent.greaterThan(0)) {
      momDiffPct = Number(
        actualSpent
          .minus(prevSpent)
          .dividedBy(prevSpent)
          .times(100)
          .toDecimalPlaces(1)
          .toFixed(1)
      );
    }

    let status: 'ON_TRACK' | 'APPROACHING_LIMIT' | 'EXCEEDED' = 'ON_TRACK';
    if (actualSpent.greaterThan(allocated)) {
      status = 'EXCEEDED';
      exceededCount++;
    } else if (utilizationPct >= b.alertThresholdPct) {
      status = 'APPROACHING_LIMIT';
      approachingCount++;
    }

    return {
      ...b,
      actualSpentLkr: toMoneyString(actualSpent),
      remainingLkr: toMoneyString(remaining),
      utilizationPct,
      previousMonthSpentLkr: toMoneyString(prevSpent),
      monthOverMonthDiffPct: momDiffPct,
      status,
    };
  });

  // Avoid double-counting in overall total if both a parent category AND its subcategory have budgets for the same scope
  const parentBudgetKeys = new Set(
    evaluatedBudgets
      .filter((b) => !b.subcategoryId)
      .map((b) => `${b.categoryId}:${b.memberScope}`)
  );

  let totalBudgeted = new Decimal(0);
  let totalSpent = new Decimal(0);

  for (const b of evaluatedBudgets) {
    if (b.subcategoryId && parentBudgetKeys.has(`${b.categoryId}:${b.memberScope}`)) {
      // Subcategory is a sub-allocation within an existing parent category budget
      continue;
    }
    totalBudgeted = totalBudgeted.plus(toDecimal(b.allocatedAmountLkr));
    totalSpent = totalSpent.plus(toDecimal(b.actualSpentLkr));
  }

  return {
    evaluatedBudgets,
    summary: {
      totalBudgetedLkr: toMoneyString(totalBudgeted),
      totalSpentInBudgetedCategoriesLkr: toMoneyString(totalSpent),
      totalRemainingLkr: toMoneyString(totalBudgeted.minus(totalSpent)),
      overallUtilizationPct: pctOf(totalSpent, totalBudgeted),
      exceededCount,
      approachingCount,
    },
  };
}

/**
 * Generates deterministic, formula-backed financial insights from recorded household data.
 * Never invents conclusions without underlying numerical evidence.
 */
export function generatePracticalInsights(params: {
  currentPeriodSummary: ReturnType<typeof aggregatePeriodTransactions>;
  previousPeriodSummary: ReturnType<typeof aggregatePeriodTransactions>;
  evaluatedBudgets: Budget[];
  activeSubscriptions: Subscription[];
  monthlySeries: Array<{ monthLabel: string; income: number; expenses: number }>;
  categoryComparison: Array<{
    categoryName: string;
    currentLkr: string;
    previousLkr: string;
  }>;
}): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const {
    currentPeriodSummary,
    previousPeriodSummary,
    evaluatedBudgets,
    activeSubscriptions,
    monthlySeries,
    categoryComparison,
  } = params;

  // 1. Category Month-over-Month Spike / Drop
  for (const cat of categoryComparison) {
    const curr = toDecimal(cat.currentLkr);
    const prev = toDecimal(cat.previousLkr);
    if (prev.greaterThanOrEqualTo(2000) && curr.greaterThan(prev)) {
      const diff = curr.minus(prev);
      const growthPct = Number(diff.dividedBy(prev).times(100).toDecimalPlaces(1).toFixed(1));
      if (growthPct >= 10) {
        insights.push({
          id: `cat-growth-${cat.categoryName}`,
          severity: growthPct >= 25 ? 'WARNING' : 'INFO',
          category: 'SPENDING',
          title: `${cat.categoryName} spending increased by ${growthPct}%`,
          description: `Spending on ${cat.categoryName} rose from ${formatLKR(prev)} last period to ${formatLKR(curr)} this period (+${formatLKR(diff)}).`,
          calculationExplanation: `((${formatLKR(curr)} - ${formatLKR(prev)}) / ${formatLKR(prev)}) × 100 = +${growthPct}%`,
          metricValue: `+${growthPct}%`,
        });
      }
    }
  }

  // 2. Budget Exceeded or Approaching Warnings
  for (const b of evaluatedBudgets) {
    const label = b.subcategoryName ? `${b.categoryName} › ${b.subcategoryName}` : b.categoryName || 'Category';
    if (b.status === 'EXCEEDED') {
      const overBy = subMoney(b.actualSpentLkr, b.allocatedAmountLkr);
      insights.push({
        id: `budget-exceeded-${b.id}`,
        severity: 'CRITICAL',
        category: 'BUDGET',
        title: `${label} exceeded its allocated budget`,
        description: `Actual spending of ${formatLKR(b.actualSpentLkr)} has exceeded the ${formatLKR(b.allocatedAmountLkr)} budget by ${formatLKR(overBy)} (${b.utilizationPct}% utilized).`,
        calculationExplanation: `Actual ${formatLKR(b.actualSpentLkr)} - Budget ${formatLKR(b.allocatedAmountLkr)} = +${formatLKR(overBy)} (${b.utilizationPct}%)`,
        metricValue: `${b.utilizationPct}%`,
      });
    } else if (b.status === 'APPROACHING_LIMIT') {
      insights.push({
        id: `budget-warn-${b.id}`,
        severity: 'WARNING',
        category: 'BUDGET',
        title: `${label} is at ${b.utilizationPct}% of monthly budget`,
        description: `${formatLKR(b.remainingLkr)} remains out of the ${formatLKR(b.allocatedAmountLkr)} allocated budget.`,
        calculationExplanation: `${formatLKR(b.actualSpentLkr)} / ${formatLKR(b.allocatedAmountLkr)} = ${b.utilizationPct}% (Threshold: ${b.alertThresholdPct}%)`,
        metricValue: `${b.utilizationPct}%`,
      });
    }
  }

  // 3. Digital Subscriptions Monthly Burden
  const activeSubs = activeSubscriptions.filter((s) => s.status === 'ACTIVE');
  if (activeSubs.length > 0) {
    let monthlySubTotal = new Decimal(0);
    for (const s of activeSubs) {
      const est = toDecimal(s.estimatedLkrAmount);
      if (s.billingFrequency === 'YEARLY') {
        monthlySubTotal = monthlySubTotal.plus(est.dividedBy(12));
      } else if (s.billingFrequency === 'QUARTERLY') {
        monthlySubTotal = monthlySubTotal.plus(est.dividedBy(3));
      } else if (s.billingFrequency === 'WEEKLY') {
        monthlySubTotal = monthlySubTotal.plus(est.times(4.33));
      } else {
        monthlySubTotal = monthlySubTotal.plus(est);
      }
    }
    const annualized = monthlySubTotal.times(12);
    insights.push({
      id: 'digital-subscriptions-summary',
      severity: 'INFO',
      category: 'SUBSCRIPTIONS',
      title: `Digital subscriptions account for ${formatLKR(monthlySubTotal)} per month`,
      description: `Across ${activeSubs.length} active subscriptions (${activeSubs.map((s) => s.name).slice(0, 4).join(', ')}), your annualized commitment is ${formatLKR(annualized)}.`,
      calculationExplanation: `Sum of normalized monthly LKR equivalents across ${activeSubs.length} active subscriptions = ${formatLKR(monthlySubTotal)}/mo`,
      metricValue: formatLKR(monthlySubTotal),
    });
  }

  // 4. Debt Repayment Burden Check
  const debtBurden = currentPeriodSummary.ratios.debtRepaymentBurdenPct;
  if (debtBurden > 0) {
    insights.push({
      id: 'debt-repayment-burden',
      severity: debtBurden > 35 ? 'WARNING' : 'INFO',
      category: 'DEBT',
      title: `Loan & finance repayments absorb ${debtBurden}% of household income`,
      description: `Total loan and vehicle finance repayments of ${formatLKR(currentPeriodSummary.totalLoanRepaymentsLkr)} out of ${formatLKR(currentPeriodSummary.combinedIncomeLkr)} total household income.`,
      calculationExplanation: `(${formatLKR(currentPeriodSummary.totalLoanRepaymentsLkr)} / ${formatLKR(currentPeriodSummary.combinedIncomeLkr)}) × 100 = ${debtBurden}%`,
      metricValue: `${debtBurden}%`,
    });
  }

  // 5. Consecutive Monthly Expense Trend (3 months check)
  if (monthlySeries.length >= 3) {
    const last3 = monthlySeries.slice(-3);
    if (
      last3[0].expenses > 0 &&
      last3[1].expenses > last3[0].expenses &&
      last3[2].expenses > last3[1].expenses
    ) {
      insights.push({
        id: 'consecutive-expense-increase',
        severity: 'WARNING',
        category: 'SPENDING',
        title: `Household expenses have increased across 3 consecutive months`,
        description: `Monthly expenses progressed from ${formatLKR(last3[0].expenses)} (${last3[0].monthLabel}) → ${formatLKR(last3[1].expenses)} (${last3[1].monthLabel}) → ${formatLKR(last3[2].expenses)} (${last3[2].monthLabel}).`,
        calculationExplanation: `${last3[0].monthLabel}: ${formatLKR(last3[0].expenses)} < ${last3[1].monthLabel}: ${formatLKR(last3[1].expenses)} < ${last3[2].monthLabel}: ${formatLKR(last3[2].expenses)}`,
        metricValue: formatLKR(last3[2].expenses),
      });
    }
  }

  // 6. Savings Rate & Cash Flow Surplus Health
  const savingsRate = currentPeriodSummary.ratios.savingsRatePct;
  const surplusRate = currentPeriodSummary.ratios.cashFlowSurplusRatePct;
  if (compareMoney(currentPeriodSummary.combinedIncomeLkr, 0) > 0) {
    insights.push({
      id: 'savings-rate-health',
      severity: savingsRate >= 15 || surplusRate >= 20 ? 'POSITIVE' : 'INFO',
      category: 'SAVINGS',
      title: `Allocated savings rate is ${savingsRate}% (Cash-flow surplus: ${surplusRate}%)`,
      description: `Out of ${formatLKR(currentPeriodSummary.combinedIncomeLkr)} income, ${formatLKR(currentPeriodSummary.allocatedSavingsLkr)} was explicitly allocated to savings goals, leaving ${formatLKR(currentPeriodSummary.remainingAvailableBalanceLkr)} unallocated cash surplus.`,
      calculationExplanation: `Allocated Savings (${formatLKR(currentPeriodSummary.allocatedSavingsLkr)}) / Total Income (${formatLKR(currentPeriodSummary.combinedIncomeLkr)}) = ${savingsRate}%`,
      metricValue: `${savingsRate}%`,
    });
  }

  return insights;
}

