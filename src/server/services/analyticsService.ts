import Decimal from 'decimal.js';
import Papa from 'papaparse';
import {
  addMoney,
  formatDateSL,
  formatLKR,
  formatMonthYearSL,
  pctOf,
  subMoney,
  toDecimal,
  toMoneyNumber,
  toMoneyString,
} from '../../shared/decimal';
import {
  aggregatePeriodTransactions,
  generatePracticalInsights,
} from '../../shared/calculations';
import { listAccounts } from './accountService';
import { listLoans } from './loanService';
import { listSubscriptions } from './subscriptionService';
import { listRecurringSchedules } from './recurringService';
import { getMonthlyBudgetsWithActuals } from './budgetService';
import { listSavingsContributionsByPeriod, listSavingsGoals } from './savingsService';
import { listTransactions } from './transactionService';
import type { DashboardSummary } from '../../shared/types';

function getPreviousPeriodRange(startDate: string, endDate: string): {
  prevStart: string;
  prevEnd: string;
} {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  const diffDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // If it's a single calendar month, use the exact previous calendar month
  if (startDate.endsWith('-01') && s.getUTCMonth() === e.getUTCMonth()) {
    const year = s.getUTCFullYear();
    const month = s.getUTCMonth() + 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    return {
      prevStart: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
      prevEnd: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  const prevEndDt = new Date(s.getTime() - 24 * 60 * 60 * 1000);
  const prevStartDt = new Date(prevEndDt.getTime() - (diffDays - 1) * 24 * 60 * 60 * 1000);
  return {
    prevStart: prevStartDt.toISOString().slice(0, 10),
    prevEnd: prevEndDt.toISOString().slice(0, 10),
  };
}

export async function getDashboardSummary(
  householdId: string,
  startDate: string,
  endDate: string
): Promise<DashboardSummary> {
  const { prevStart, prevEnd } = getPreviousPeriodRange(startDate, endDate);

  // Determine target year/month for budget lookup from endDate
  const [endYear, endMonth] = endDate.split('-').map(Number);

  // Fetch 6-month historical window ending at endDate for trend charts
  const sixMonthsAgoDt = new Date(Date.UTC(endYear, endMonth - 6, 1));
  const sixMonthsStart = sixMonthsAgoDt.toISOString().slice(0, 10);

  const [
    currTxs,
    prevTxs,
    sixMonthTxs,
    currSavingsContribs,
    prevSavingsContribs,
    sixMonthSavingsContribs,
    accounts,
    loans,
    subscriptions,
    recurringSchedules,
    budgetEval,
  ] = await Promise.all([
    listTransactions(householdId, { startDate, endDate }),
    listTransactions(householdId, { startDate: prevStart, endDate: prevEnd }),
    listTransactions(householdId, { startDate: sixMonthsStart, endDate }),
    listSavingsContributionsByPeriod(householdId, startDate, endDate),
    listSavingsContributionsByPeriod(householdId, prevStart, prevEnd),
    listSavingsContributionsByPeriod(householdId, sixMonthsStart, endDate),
    listAccounts(householdId),
    listLoans(householdId),
    listSubscriptions(householdId),
    listRecurringSchedules(householdId),
    getMonthlyBudgetsWithActuals(householdId, endYear, endMonth),
  ]);

  const currAgg = aggregatePeriodTransactions(currTxs, currSavingsContribs);
  const prevAgg = aggregatePeriodTransactions(prevTxs, prevSavingsContribs);

  // Total asset & liability balances across active accounts & loans
  let totalBankAndCashAssets = '0.00';
  let totalCreditCardLiability = '0.00';
  for (const a of accounts) {
    if (a.status !== 'ACTIVE' || a.linkedParentAccountId) continue;
    if (a.accountType === 'CREDIT_CARD') {
      totalCreditCardLiability = addMoney(totalCreditCardLiability, a.currentBalance);
    } else {
      totalBankAndCashAssets = addMoney(totalBankAndCashAssets, a.currentBalance);
    }
  }

  let totalLoanLiability = '0.00';
  for (const l of loans) {
    if (l.status === 'ACTIVE') {
      totalLoanLiability = addMoney(totalLoanLiability, l.currentOutstandingBalance);
    }
  }

  // Expense distribution by category
  const catMap = new Map<
    string,
    { categoryId: string; categoryName: string; color: string; amountDec: string }
  >();
  for (const tx of currTxs) {
    if (tx.transactionType !== 'EXPENSE') continue;
    const catId = tx.categoryId || 'uncategorized';
    const catName = tx.categoryName || 'Uncategorized';
    const color = tx.categoryColor || '#64748b';
    const existing = catMap.get(catId) || {
      categoryId: catId,
      categoryName: catName,
      color,
      amountDec: '0.00',
    };
    existing.amountDec = addMoney(existing.amountDec, tx.actualLkrAmount);
    catMap.set(catId, existing);
  }

  const expenseByCategory = Array.from(catMap.values())
    .map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      color: c.color,
      amount: toMoneyNumber(c.amountDec),
      percentage: pctOf(c.amountDec, currAgg.totalExpensesLkr),
    }))
    .sort((a, b) => b.amount - a.amount);

  // Previous period category totals for MoM insights
  const prevCatMap = new Map<string, string>();
  for (const tx of prevTxs) {
    if (tx.transactionType !== 'EXPENSE') continue;
    const catName = tx.categoryName || 'Uncategorized';
    prevCatMap.set(catName, addMoney(prevCatMap.get(catName) || '0.00', tx.actualLkrAmount));
  }

  const categoryComparison = Array.from(catMap.values()).map((c) => ({
    categoryName: c.categoryName,
    currentLkr: c.amountDec,
    previousLkr: prevCatMap.get(c.categoryName) || '0.00',
  }));

  // Build 6-month series
  const monthlySeriesMap = new Map<
    string,
    {
      monthLabel: string;
      yearMonth: string;
      income: string;
      expenses: string;
      savings: string;
      husbandExpenses: string;
      wifeExpenses: string;
    }
  >();

  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(endYear, endMonth - 1 - i, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    monthlySeriesMap.set(ym, {
      monthLabel: formatMonthYearSL(y, m),
      yearMonth: ym,
      income: '0.00',
      expenses: '0.00',
      savings: '0.00',
      husbandExpenses: '0.00',
      wifeExpenses: '0.00',
    });
  }

  for (const tx of sixMonthTxs) {
    const ym = tx.transactionDate.slice(0, 7);
    const bucket = monthlySeriesMap.get(ym);
    if (!bucket) continue;
    if (tx.transactionType === 'INCOME') {
      bucket.income = addMoney(bucket.income, tx.actualLkrAmount);
    } else if (tx.transactionType === 'EXPENSE') {
      bucket.expenses = addMoney(bucket.expenses, tx.actualLkrAmount);
      if (tx.paidOrReceivedByRole === 'HUSBAND') {
        bucket.husbandExpenses = addMoney(bucket.husbandExpenses, tx.actualLkrAmount);
      } else if (tx.paidOrReceivedByRole === 'WIFE') {
        bucket.wifeExpenses = addMoney(bucket.wifeExpenses, tx.actualLkrAmount);
      }
    }
  }

  for (const sc of sixMonthSavingsContribs) {
    const ym = sc.contributionDate.slice(0, 7);
    const bucket = monthlySeriesMap.get(ym);
    if (!bucket) continue;
    if (sc.type === 'DEPOSIT') {
      bucket.savings = addMoney(bucket.savings, sc.amountLkr);
    } else {
      bucket.savings = subMoney(bucket.savings, sc.amountLkr);
    }
  }

  const incomeVsExpensesMonthly = Array.from(monthlySeriesMap.values()).map((b) => ({
    monthLabel: b.monthLabel,
    yearMonth: b.yearMonth,
    income: toMoneyNumber(b.income),
    expenses: toMoneyNumber(b.expenses),
    savings: toMoneyNumber(b.savings),
    husbandExpenses: toMoneyNumber(b.husbandExpenses),
    wifeExpenses: toMoneyNumber(b.wifeExpenses),
  }));

  // Loan repayment overview
  const loanOverview = loans.map((l) => {
    const orig = toDecimal(l.originalPrincipal);
    const out = toDecimal(l.currentOutstandingBalance);
    const paidPrincipal = Decimal.max(0, orig.minus(out));
    return {
      loanId: l.id,
      loanName: l.loanName,
      originalPrincipal: toMoneyNumber(orig),
      outstandingBalance: toMoneyNumber(out),
      paidPrincipal: toMoneyNumber(paidPrincipal),
      monthlyInstallment: toMoneyNumber(l.monthlyInstallment),
      remainingInstallments: l.remainingInstallments,
      progressPct: pctOf(paidPrincipal, orig),
    };
  });

  // Upcoming commitments checklist
  const todayIso = '2026-11-03';
  const paidScheduleIds = new Set(
    currTxs.filter((t) => t.recurringScheduleId).map((t) => t.recurringScheduleId!)
  );

  const upcomingCommitments = recurringSchedules
    .filter((r) => r.isActive)
    .map((r) => {
      const dueDt = new Date(`${r.nextDueDate}T00:00:00Z`);
      const nowDt = new Date(`${todayIso}T00:00:00Z`);
      const daysUntilDue = Math.round(
        (dueDt.getTime() - nowDt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: r.id,
        title: r.title,
        dueDate: r.nextDueDate,
        expectedAmountLkr: r.expectedAmountLkr,
        isVariableAmount: r.isVariableAmount,
        assignedMemberRole: r.assignedMemberRole || 'HUSBAND',
        categoryName: r.categoryName || 'Recurring',
        daysUntilDue,
        isPaidThisPeriod: paidScheduleIds.has(r.id),
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const insights = generatePracticalInsights({
    currentPeriodSummary: currAgg,
    previousPeriodSummary: prevAgg,
    evaluatedBudgets: budgetEval.evaluatedBudgets,
    activeSubscriptions: subscriptions,
    monthlySeries: incomeVsExpensesMonthly,
    categoryComparison,
  });

  return {
    period: {
      startDate,
      endDate,
      label: `${formatDateSL(startDate)} – ${formatDateSL(endDate)}`,
    },
    financialOverview: {
      combinedIncomeLkr: currAgg.combinedIncomeLkr,
      totalExpensesLkr: currAgg.totalExpensesLkr,
      totalLoanRepaymentsLkr: currAgg.totalLoanRepaymentsLkr,
      totalFixedCommitmentsLkr: currAgg.totalFixedCommitmentsLkr,
      totalVariableExpensesLkr: currAgg.totalVariableExpensesLkr,
      cashFlowSurplusLkr: currAgg.cashFlowSurplusLkr,
      allocatedSavingsLkr: currAgg.allocatedSavingsLkr,
      remainingAvailableBalanceLkr: currAgg.remainingAvailableBalanceLkr,
      totalBankAndCashAssetsLkr: totalBankAndCashAssets,
      totalCreditCardLiabilityLkr: totalCreditCardLiability,
      totalLoanLiabilityLkr: totalLoanLiability,
    },
    individualOverview: {
      husbandIncomeLkr: currAgg.husbandIncomeLkr,
      wifeIncomeLkr: currAgg.wifeIncomeLkr,
      husbandSpendingLkr: currAgg.husbandSpendingLkr,
      wifeSpendingLkr: currAgg.wifeSpendingLkr,
      husbandIncomeSharePct: currAgg.husbandIncomeSharePct,
      wifeIncomeSharePct: currAgg.wifeIncomeSharePct,
      husbandSpendingSharePct: currAgg.husbandSpendingSharePct,
      wifeSpendingSharePct: currAgg.wifeSpendingSharePct,
    },
    financialHealth: currAgg.ratios,
    charts: {
      incomeVsExpensesMonthly,
      expenseByCategory,
      essentialVsNonEssential: {
        essentialLkr: currAgg.essentialExpensesLkr,
        nonEssentialLkr: currAgg.nonEssentialExpensesLkr,
        essentialPct: pctOf(currAgg.essentialExpensesLkr, currAgg.totalExpensesLkr),
        nonEssentialPct: pctOf(currAgg.nonEssentialExpensesLkr, currAgg.totalExpensesLkr),
      },
      fixedVsVariable: {
        fixedLkr: currAgg.totalFixedCommitmentsLkr,
        variableLkr: currAgg.totalVariableExpensesLkr,
        fixedPct: pctOf(currAgg.totalFixedCommitmentsLkr, currAgg.totalExpensesLkr),
        variablePct: pctOf(currAgg.totalVariableExpensesLkr, currAgg.totalExpensesLkr),
      },
      recurringVsOneTime: {
        recurringLkr: currAgg.recurringExpensesLkr,
        oneTimeLkr: currAgg.oneTimeExpensesLkr,
        recurringPct: pctOf(currAgg.recurringExpensesLkr, currAgg.totalExpensesLkr),
        oneTimePct: pctOf(currAgg.oneTimeExpensesLkr, currAgg.totalExpensesLkr),
      },
      loanOverview,
    },
    upcomingCommitments,
    insights,
  };
}

export type ReportType =
  | 'MONTHLY_FINANCIAL'
  | 'YEARLY_FINANCIAL'
  | 'CATEGORY_EXPENSE'
  | 'INDIVIDUAL_SPENDING'
  | 'LOAN_REPAYMENT'
  | 'SUBSCRIPTION'
  | 'BUDGET_PERFORMANCE'
  | 'SAVINGS';

export async function generateReportData(
  householdId: string,
  params: {
    reportType: ReportType;
    startDate: string;
    endDate: string;
    categoryId?: string;
    memberRole?: 'HUSBAND' | 'WIFE';
    transactionType?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  }
) {
  const { reportType, startDate, endDate, categoryId, memberRole, transactionType } = params;
  const [endYear, endMonth] = endDate.split('-').map(Number);

  const [txs, loans, subscriptions, budgetEval, savingsGoals, savingsContribs] = await Promise.all([
    listTransactions(householdId, {
      startDate,
      endDate,
      categoryId,
      memberRole,
      transactionType,
    }),
    listLoans(householdId),
    listSubscriptions(householdId),
    getMonthlyBudgetsWithActuals(householdId, endYear, endMonth),
    listSavingsGoals(householdId),
    listSavingsContributionsByPeriod(householdId, startDate, endDate),
  ]);

  const agg = aggregatePeriodTransactions(txs, savingsContribs);

  let rows: Array<Record<string, string | number>> = [];
  let title = 'Financial Report';

  switch (reportType) {
    case 'MONTHLY_FINANCIAL':
    case 'YEARLY_FINANCIAL':
      title =
        reportType === 'MONTHLY_FINANCIAL'
          ? `Monthly Financial Report (${formatDateSL(startDate)} – ${formatDateSL(endDate)})`
          : `Yearly Financial Report (${formatDateSL(startDate)} – ${formatDateSL(endDate)})`;
      rows = txs.map((t) => ({
        Date: formatDateSL(t.transactionDate),
        Type: t.transactionType,
        Description: t.description,
        Category: t.categoryName || 'Internal Transfer',
        Subcategory: t.subcategoryName || '—',
        'Paid / Received By': t.paidOrReceivedByName || t.paidOrReceivedByRole || '—',
        Account: t.sourceAccountName || '—',
        'Payment Method': t.paymentMethod,
        'Essential / Non-Essential': t.isEssential ? 'Essential' : 'Non-Essential',
        'Original Amount': `${t.originalCurrency} ${t.originalAmount}`,
        'Actual LKR Amount': Number(t.actualLkrAmount),
      }));
      break;

    case 'CATEGORY_EXPENSE': {
      title = `Category & Subcategory Expense Report (${formatDateSL(startDate)} – ${formatDateSL(endDate)})`;
      const grouped = new Map<
        string,
        { cat: string; sub: string; count: number; total: string; husband: string; wife: string }
      >();
      for (const t of txs) {
        if (t.transactionType !== 'EXPENSE') continue;
        const key = `${t.categoryName || 'Uncategorized'}::${t.subcategoryName || 'General'}`;
        const g = grouped.get(key) || {
          cat: t.categoryName || 'Uncategorized',
          sub: t.subcategoryName || 'General',
          count: 0,
          total: '0.00',
          husband: '0.00',
          wife: '0.00',
        };
        g.count += 1;
        g.total = addMoney(g.total, t.actualLkrAmount);
        if (t.paidOrReceivedByRole === 'HUSBAND') {
          g.husband = addMoney(g.husband, t.actualLkrAmount);
        } else {
          g.wife = addMoney(g.wife, t.actualLkrAmount);
        }
        grouped.set(key, g);
      }
      rows = Array.from(grouped.values())
        .sort((a, b) => Number(b.total) - Number(a.total))
        .map((g) => ({
          'Main Category': g.cat,
          Subcategory: g.sub,
          Transactions: g.count,
          'Husband Spent (LKR)': Number(g.husband),
          'Wife Spent (LKR)': Number(g.wife),
          'Total Household Spent (LKR)': Number(g.total),
          'Share of Expenses (%)': pctOf(g.total, agg.totalExpensesLkr),
        }));
      break;
    }

    case 'INDIVIDUAL_SPENDING':
      title = `Husband vs. Wife Individual Financial Report (${formatDateSL(startDate)} – ${formatDateSL(endDate)})`;
      rows = txs
        .filter((t) => t.transactionType !== 'TRANSFER')
        .map((t) => ({
          Date: formatDateSL(t.transactionDate),
          Member: t.paidOrReceivedByName || t.paidOrReceivedByRole || '—',
          Role: t.paidOrReceivedByRole || '—',
          Type: t.transactionType,
          Category: t.categoryName || '—',
          Subcategory: t.subcategoryName || '—',
          Description: t.description,
          Scope: t.householdMemberScope,
          'Amount (LKR)': Number(t.actualLkrAmount),
        }));
      break;

    case 'LOAN_REPAYMENT':
      title = `Loan & Vehicle Finance Repayment Report`;
      rows = loans.map((l) => ({
        'Loan Name': l.loanName,
        Type: l.loanType,
        Lender: l.lenderName,
        Owner: l.ownerName || l.ownershipType,
        'Interest Method': l.interestCalculationMethod,
        'Original Principal (LKR)': Number(l.originalPrincipal),
        'Outstanding Balance (LKR)': Number(l.currentOutstandingBalance),
        'Interest Rate (%)': Number(l.annualInterestRate),
        'Monthly Installment (LKR)': Number(l.monthlyInstallment),
        'Remaining Installments': `${l.remainingInstallments} / ${l.totalInstallments}`,
        'Expected Completion': formatDateSL(l.expectedCompletionDate),
        Status: l.status,
      }));
      break;

    case 'SUBSCRIPTION':
      title = `Digital Subscriptions & Technology Report`;
      rows = subscriptions.map((s) => ({
        Subscription: s.name,
        Provider: s.provider,
        Subcategory: s.subcategoryName || 'Digital Service',
        'Used By': s.usedByName || s.memberScope,
        'Billing Amount': `${s.billingCurrency} ${s.billingAmount}`,
        'Estimated LKR Amount': Number(s.estimatedLkrAmount),
        Frequency: s.billingFrequency,
        'Next Billing Date': formatDateSL(s.nextBillingDate),
        'Payment Method': s.paymentMethod,
        Status: s.status,
      }));
      break;

    case 'BUDGET_PERFORMANCE':
      title = `Monthly Budget Performance Report (${formatMonthYearSL(endYear, endMonth)})`;
      rows = budgetEval.evaluatedBudgets.map((b) => ({
        Category: b.categoryName || '—',
        Subcategory: b.subcategoryName || 'All Subcategories',
        Scope: b.memberScope,
        'Allocated Budget (LKR)': Number(b.allocatedAmountLkr),
        'Actual Spent (LKR)': Number(b.actualSpentLkr || '0.00'),
        'Remaining Budget (LKR)': Number(b.remainingLkr || '0.00'),
        'Utilization (%)': b.utilizationPct || 0,
        'Prior Month Spent (LKR)': Number(b.previousMonthSpentLkr || '0.00'),
        Status: b.status || 'ON_TRACK',
      }));
      break;

    case 'SAVINGS':
      title = `Household Savings & Financial Goals Report`;
      rows = savingsGoals.map((g) => ({
        'Goal Name': g.name,
        Scope: g.ownerScope,
        'Target Amount (LKR)': Number(g.targetAmountLkr),
        'Currently Allocated (LKR)': Number(g.currentAllocatedLkr),
        'Remaining to Goal (LKR)': Number(
          subMoney(g.targetAmountLkr, g.currentAllocatedLkr)
        ),
        'Progress (%)': pctOf(g.currentAllocatedLkr, g.targetAmountLkr),
        'Monthly Target (LKR)': Number(g.monthlyTargetLkr),
        'Target Date': formatDateSL(g.targetDate),
        'Linked Account': g.linkedSavingsAccountName || '—',
        Status: g.status,
      }));
      break;
  }

  return {
    title,
    reportType,
    period: { startDate, endDate, formatted: `${formatDateSL(startDate)} – ${formatDateSL(endDate)}` },
    summary: agg,
    rows,
  };
}

export async function exportReportToCsv(
  householdId: string,
  params: Parameters<typeof generateReportData>[1]
): Promise<{ filename: string; csv: string }> {
  const data = await generateReportData(householdId, params);
  const csv = Papa.unparse(data.rows);
  const filename = `${params.reportType.toLowerCase()}_${params.startDate}_to_${params.endDate}.csv`;
  return { filename, csv };
}
