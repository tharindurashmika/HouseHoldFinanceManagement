export type MemberRole = 'HUSBAND' | 'WIFE';
export type HouseholdMemberScope = 'HUSBAND' | 'WIFE' | 'SHARED';
export type OwnershipType = 'HUSBAND' | 'WIFE' | 'JOINT';

export type AccountType =
  | 'BANK_SAVINGS'
  | 'BANK_CURRENT'
  | 'CASH'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'DIGITAL_WALLET'
  | 'OTHER';

export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'CASH'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'DIGITAL_WALLET'
  | 'DIRECT_DEBIT'
  | 'OTHER';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type CategoryType = 'INCOME' | 'EXPENSE';

export type FundingSourceType =
  | 'REGULAR_INCOME'
  | 'OVERTIME_INCOME'
  | 'BORROWED_FRIENDS_PARENTS'
  | 'PREVIOUS_SAVINGS'
  | 'OTHER';

export type LoanType = 'PERSONAL_LOAN' | 'VEHICLE_FINANCE' | 'MORTGAGE' | 'OTHER';
export type InterestCalculationMethod = 'REDUCING_BALANCE' | 'FLAT_RATE' | 'CUSTOM_MANUAL';

export type BillingFrequency = 'MONTHLY' | 'YEARLY' | 'QUARTERLY' | 'WEEKLY' | 'CUSTOM';
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface Household {
  id: string;
  name: string;
  baseCurrency: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  householdId: string;
  email: string;
  displayName: string;
  memberRole: MemberRole;
  avatarColor: string;
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  householdId: string;
  parentId: string | null;
  name: string;
  type: CategoryType;
  defaultEssentiality: boolean; // true = Essential, false = Non-Essential
  isFixedDefault: boolean; // true = Fixed, false = Variable
  icon: string;
  color: string;
  isSystemSeeded: boolean;
  isActive: boolean;
  sortOrder: number;
  subcategories?: Category[];
}

export interface Account {
  id: string;
  householdId: string;
  ownerUserId: string | null;
  ownerName?: string;
  ownershipType: OwnershipType;
  name: string;
  accountType: AccountType;
  bankName?: string | null;
  cardLastFour?: string | null;
  linkedParentAccountId: string | null;
  linkedParentAccountName?: string | null;
  currency: string;
  openingBalance: string; // NUMERIC(15,2) string
  openingBalanceDate?: string | null; // YYYY-MM-DD
  currentBalance: string; // NUMERIC(15,2) string — positive = asset balance (or for CREDIT_CARD, positive = amount owed / liability balance)
  creditLimit: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountBalanceBreakdown {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  bankName: string | null;
  ownershipType: OwnershipType;
  ownerName: string;
  cardLastFour: string | null;
  linkedParentAccountId: string | null;
  openingBalance: string;
  openingBalanceDate: string;
  totalIncome: string;
  totalExpenses: string;
  bankCharges: string;
  withdrawals: string; // Transfers from Bank -> Cash (or into Cash from Bank)
  deposits: string; // Transfers from Cash -> Bank (or into Bank from Cash)
  incomingTransfers: string; // Other incoming transfers
  outgoingTransfers: string; // Other outgoing transfers
  currentCalculatedBalance: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface DashboardAccountOverview {
  commercialBankBalance: string;
  bocBalance: string;
  nsbBalance: string;
  husbandCashBalance: string;
  wifeCashBalance: string;
  totalHouseholdBankBalance: string;
  totalHouseholdCashBalance: string;
  totalHouseholdAvailableFunds: string;
  accountBreakdowns: AccountBalanceBreakdown[];
}

export interface AccountReconciliation {
  id: string;
  accountId: string;
  accountName?: string;
  reconciledByUserId: string;
  reconciledByName?: string;
  reconciliationDate: string;
  recordedBalance: string;
  actualStatementBalance: string;
  discrepancyAmount: string;
  adjustmentTransactionId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface TransactionItem {
  id?: string;
  transactionId?: string;
  subcategoryId: string | null;
  subcategoryName?: string;
  itemName: string;
  quantity: string;
  amountLkr: string;
}

export interface Transaction {
  id: string;
  householdId: string;
  transactionDate: string; // YYYY-MM-DD
  transactionType: TransactionType;
  description: string;
  categoryId: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  subcategoryId: string | null;
  subcategoryName?: string | null;
  originalAmount: string;
  originalCurrency: string;
  exchangeRate: string;
  actualLkrAmount: string; // Authoritative LKR amount
  paymentMethod: PaymentMethod;
  sourceAccountId: string;
  sourceAccountName?: string;
  destinationAccountId: string | null;
  destinationAccountName?: string | null;
  paidOrReceivedByUserId: string;
  paidOrReceivedByName?: string;
  paidOrReceivedByRole?: MemberRole;
  recordedByUserId: string;
  recordedByName?: string;
  householdMemberScope: HouseholdMemberScope;
  fundingSource?: FundingSourceType;
  transferFeeLkr?: string;
  transferFeeCategoryId?: string | null;
  parentTransactionId?: string | null;
  isEssential: boolean;
  isFixed: boolean;
  recurringScheduleId: string | null;
  subscriptionId: string | null;
  loanId: string | null;
  utilityBillingPeriodStart: string | null;
  utilityBillingPeriodEnd: string | null;
  isDemoData: boolean;
  notes: string | null;
  items?: TransactionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  householdId: string;
  ownerUserId: string | null;
  ownerName?: string;
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
  defaultPaymentAccountId: string | null;
  status: 'ACTIVE' | 'PAID_OFF' | 'CLOSED';
  notes: string | null;
  installments?: LoanInstallment[];
  createdAt: string;
  updatedAt: string;
}

export interface LoanInstallment {
  id: string;
  loanId: string;
  transactionId: string | null;
  installmentNumber: number;
  dueDate: string;
  paidDate: string | null;
  totalPaidLkr: string;
  principalComponentLkr: string;
  interestComponentLkr: string;
  feesComponentLkr: string;
  balanceAfterPayment: string;
  paidByUserId: string | null;
  paidByName?: string | null;
  status: 'SCHEDULED' | 'PAID' | 'OVERDUE';
  notes: string | null;
}

export interface Subscription {
  id: string;
  householdId: string;
  usedByUserId: string | null;
  usedByName?: string | null;
  memberScope: HouseholdMemberScope;
  name: string;
  provider: string;
  categoryId: string;
  subcategoryId: string | null;
  subcategoryName?: string | null;
  billingAmount: string;
  billingCurrency: string;
  estimatedLkrAmount: string;
  billingFrequency: BillingFrequency;
  nextBillingDate: string;
  defaultAccountId: string | null;
  defaultAccountName?: string | null;
  paymentMethod: PaymentMethod;
  status: SubscriptionStatus;
  lastReviewedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSchedule {
  id: string;
  householdId: string;
  title: string;
  transactionType: TransactionType;
  categoryId: string;
  categoryName?: string;
  subcategoryId: string | null;
  subcategoryName?: string | null;
  assignedUserId: string;
  assignedUserName?: string;
  assignedMemberRole?: MemberRole;
  defaultAccountId: string;
  defaultAccountName?: string;
  paymentMethod: PaymentMethod;
  frequency: BillingFrequency;
  dueDayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  nextDueDate: string;
  expectedAmountLkr: string;
  isVariableAmount: boolean;
  isEssential: boolean;
  isFixed: boolean;
  linkedLoanId: string | null;
  linkedSubscriptionId: string | null;
  reminderDaysBefore: number;
  isActive: boolean;
  notes: string | null;
}

export interface Budget {
  id: string;
  householdId: string;
  year: number;
  month: number;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  subcategoryId: string | null;
  subcategoryName?: string | null;
  memberScope: 'HOUSEHOLD' | 'HUSBAND' | 'WIFE';
  allocatedAmountLkr: string;
  alertThresholdPct: number;
  actualSpentLkr?: string;
  remainingLkr?: string;
  utilizationPct?: number;
  previousMonthSpentLkr?: string;
  monthOverMonthDiffPct?: number;
  status?: 'ON_TRACK' | 'APPROACHING_LIMIT' | 'EXCEEDED';
}

export interface SavingsGoal {
  id: string;
  householdId: string;
  ownerScope: 'HOUSEHOLD' | 'HUSBAND' | 'WIFE';
  ownerUserId: string | null;
  name: string;
  targetAmountLkr: string;
  currentAllocatedLkr: string;
  monthlyTargetLkr: string;
  targetDate: string | null;
  linkedSavingsAccountId: string | null;
  linkedSavingsAccountName?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  notes: string | null;
  contributions?: SavingsContribution[];
  createdAt: string;
  updatedAt: string;
}

export interface SavingsContribution {
  id: string;
  savingsGoalId: string;
  transactionId: string | null;
  contributedByUserId: string;
  contributedByName?: string;
  contributionDate: string;
  amountLkr: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  notes: string | null;
}

export interface FinancialInsight {
  id: string;
  severity: 'INFO' | 'POSITIVE' | 'WARNING' | 'CRITICAL';
  category: 'SPENDING' | 'BUDGET' | 'SAVINGS' | 'DEBT' | 'SUBSCRIPTIONS' | 'INCOME';
  title: string;
  description: string;
  calculationExplanation: string;
  metricValue: string;
}

export interface DashboardSummary {
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  financialOverview: {
    combinedIncomeLkr: string;
    totalExpensesLkr: string;
    totalLoanRepaymentsLkr: string;
    totalFixedCommitmentsLkr: string;
    totalVariableExpensesLkr: string;
    cashFlowSurplusLkr: string;
    allocatedSavingsLkr: string;
    remainingAvailableBalanceLkr: string;
    totalBankAndCashAssetsLkr: string;
    totalCreditCardLiabilityLkr: string;
    totalLoanLiabilityLkr: string;
  };
  individualOverview: {
    husbandIncomeLkr: string;
    wifeIncomeLkr: string;
    husbandSpendingLkr: string;
    wifeSpendingLkr: string;
    husbandIncomeSharePct: number;
    wifeIncomeSharePct: number;
    husbandSpendingSharePct: number;
    wifeSpendingSharePct: number;
  };
  financialHealth: {
    incomeToExpenseRatio: number;
    savingsRatePct: number;
    cashFlowSurplusRatePct: number;
    debtRepaymentBurdenPct: number;
    fixedCommitmentRatioPct: number;
    essentialExpenseRatioPct: number;
  };
  accountOverview: DashboardAccountOverview;
  charts: {
    incomeVsExpensesMonthly: Array<{
      monthLabel: string;
      yearMonth: string;
      income: number;
      expenses: number;
      savings: number;
      husbandExpenses: number;
      wifeExpenses: number;
    }>;
    expenseByCategory: Array<{
      categoryId: string;
      categoryName: string;
      color: string;
      amount: number;
      percentage: number;
    }>;
    essentialVsNonEssential: {
      essentialLkr: string;
      nonEssentialLkr: string;
      essentialPct: number;
      nonEssentialPct: number;
    };
    fixedVsVariable: {
      fixedLkr: string;
      variableLkr: string;
      fixedPct: number;
      variablePct: number;
    };
    recurringVsOneTime: {
      recurringLkr: string;
      oneTimeLkr: string;
      recurringPct: number;
      oneTimePct: number;
    };
    loanOverview: Array<{
      loanId: string;
      loanName: string;
      originalPrincipal: number;
      outstandingBalance: number;
      paidPrincipal: number;
      monthlyInstallment: number;
      remainingInstallments: number;
      progressPct: number;
    }>;
  };
  upcomingCommitments: Array<{
    id: string;
    title: string;
    dueDate: string;
    expectedAmountLkr: string;
    isVariableAmount: boolean;
    assignedMemberRole: MemberRole;
    categoryName: string;
    daysUntilDue: number;
    isPaidThisPeriod: boolean;
  }>;
  insights: FinancialInsight[];
}

