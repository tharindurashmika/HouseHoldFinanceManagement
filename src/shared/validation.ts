import { z } from 'zod';
import { toDecimal } from './decimal';

export const moneyStringSchema = z
  .union([z.string(), z.number()])
  .refine(
    (val) => {
      try {
        const d = toDecimal(val);
        return !d.isNaN() && d.isFinite();
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid numeric monetary amount' }
  )
  .transform((val) => toDecimal(val).toFixed(2));

export const positiveMoneySchema = moneyStringSchema.refine(
  (val) => toDecimal(val).greaterThan(0),
  { message: 'Amount must be greater than zero' }
);

export const nonNegativeMoneySchema = moneyStringSchema.refine(
  (val) => toDecimal(val).greaterThanOrEqualTo(0),
  { message: 'Amount cannot be negative' }
);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const loginSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(4, 'Password is required'),
});

export const categorySchema = z.object({
  parentId: z.string().uuid().nullable().optional().default(null),
  name: z.string().trim().min(2, 'Category name is required').max(100),
  type: z.enum(['INCOME', 'EXPENSE']),
  defaultEssentiality: z.boolean().default(true),
  isFixedDefault: z.boolean().default(false),
  icon: z.string().default('Tag'),
  color: z.string().default('#3b82f6'),
  sortOrder: z.number().int().default(100),
});

export const accountSchema = z.object({
  ownerUserId: z.string().uuid().nullable().optional().default(null),
  ownershipType: z.enum(['HUSBAND', 'WIFE', 'JOINT']),
  name: z.string().trim().min(2, 'Account name is required').max(100),
  accountType: z.enum([
    'BANK_SAVINGS',
    'BANK_CURRENT',
    'CASH',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'DIGITAL_WALLET',
    'OTHER',
  ]),
  cardLastFour: z.string().trim().max(15).nullable().optional().default(null),
  linkedParentAccountId: z.string().uuid().nullable().optional().default(null),
  currency: z.string().trim().min(3).max(5).default('LKR'),
  openingBalance: moneyStringSchema,
  creditLimit: moneyStringSchema.nullable().optional().default(null),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  notes: z.string().nullable().optional().default(null),
});

export const reconcileAccountSchema = z.object({
  reconciliationDate: isoDateSchema,
  actualStatementBalance: moneyStringSchema,
  createAdjustmentTransaction: z.boolean().default(true),
  reconciledByUserId: z.string().uuid(),
  notes: z.string().nullable().optional().default(null),
});

export const transactionItemSchema = z.object({
  subcategoryId: z.string().uuid().nullable().optional().default(null),
  itemName: z.string().trim().min(1, 'Item name is required'),
  quantity: z
    .union([z.string(), z.number()])
    .optional()
    .default('1')
    .transform((v) => toDecimal(v).toFixed(2)),
  amountLkr: positiveMoneySchema,
});

export const transactionSchema = z
  .object({
    transactionDate: isoDateSchema,
    transactionType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    description: z.string().trim().min(2, 'Description is required').max(255),
    categoryId: z.string().uuid().nullable().optional().default(null),
    subcategoryId: z.string().uuid().nullable().optional().default(null),
    originalAmount: positiveMoneySchema,
    originalCurrency: z.string().trim().min(3).max(5).default('LKR'),
    exchangeRate: z
      .union([z.string(), z.number()])
      .optional()
      .default('1')
      .transform((v) => toDecimal(v).toFixed(6)),
    actualLkrAmount: positiveMoneySchema,
    paymentMethod: z.enum([
      'BANK_TRANSFER',
      'CASH',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'DIGITAL_WALLET',
      'DIRECT_DEBIT',
      'OTHER',
    ]),
    sourceAccountId: z.string().uuid('Source account is required'),
    destinationAccountId: z.string().uuid().nullable().optional().default(null),
    paidOrReceivedByUserId: z.string().uuid('Household member (Paid/Received by) is required'),
    recordedByUserId: z.string().uuid().optional(),
    householdMemberScope: z.enum(['HUSBAND', 'WIFE', 'SHARED']).default('SHARED'),
    fundingSource: z
      .enum([
        'REGULAR_INCOME',
        'OVERTIME_INCOME',
        'BORROWED_FRIENDS_PARENTS',
        'PREVIOUS_SAVINGS',
        'OTHER',
      ])
      .optional()
      .default('REGULAR_INCOME'),
    isEssential: z.boolean().default(true),
    isFixed: z.boolean().default(false),
    recurringScheduleId: z.string().uuid().nullable().optional().default(null),
    subscriptionId: z.string().uuid().nullable().optional().default(null),
    loanId: z.string().uuid().nullable().optional().default(null),
    utilityBillingPeriodStart: isoDateSchema.nullable().optional().default(null),
    utilityBillingPeriodEnd: isoDateSchema.nullable().optional().default(null),
    notes: z.string().nullable().optional().default(null),
    items: z.array(transactionItemSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.transactionType === 'TRANSFER') {
      if (!data.destinationAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationAccountId'],
          message: 'Destination account is required for internal transfers',
        });
      }
      if (data.destinationAccountId === data.sourceAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destinationAccountId'],
          message: 'Source and destination accounts must be different',
        });
      }
    } else {
      if (!data.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryId'],
          message: 'Main category is required for income and expense transactions',
        });
      }
    }
  });

export const loanSchema = z.object({
  ownerUserId: z.string().uuid().nullable().optional().default(null),
  ownershipType: z.enum(['HUSBAND', 'WIFE', 'JOINT']).default('HUSBAND'),
  loanName: z.string().trim().min(2, 'Loan name is required').max(120),
  loanReferenceNo: z.string().trim().max(60).nullable().optional().default(null),
  loanType: z.enum(['PERSONAL_LOAN', 'VEHICLE_FINANCE', 'MORTGAGE', 'OTHER']),
  lenderName: z.string().trim().min(2, 'Lender / Bank name is required').max(120),
  interestCalculationMethod: z
    .enum(['REDUCING_BALANCE', 'FLAT_RATE', 'CUSTOM_MANUAL'])
    .default('REDUCING_BALANCE'),
  originalPrincipal: positiveMoneySchema,
  currentOutstandingBalance: nonNegativeMoneySchema,
  annualInterestRate: nonNegativeMoneySchema,
  monthlyInstallment: positiveMoneySchema,
  paymentDueDay: z.number().int().min(1).max(31),
  startDate: isoDateSchema,
  expectedCompletionDate: isoDateSchema,
  totalInstallments: z.number().int().min(1),
  remainingInstallments: z.number().int().min(0),
  defaultPaymentAccountId: z.string().uuid().nullable().optional().default(null),
  status: z.enum(['ACTIVE', 'PAID_OFF', 'CLOSED']).default('ACTIVE'),
  notes: z.string().nullable().optional().default(null),
});

export const payLoanInstallmentSchema = z.object({
  paidDate: isoDateSchema,
  sourceAccountId: z.string().uuid('Payment account is required'),
  paidByUserId: z.string().uuid('Paid by member is required'),
  totalPaidLkr: positiveMoneySchema,
  principalComponentLkr: nonNegativeMoneySchema,
  interestComponentLkr: nonNegativeMoneySchema,
  feesComponentLkr: nonNegativeMoneySchema.optional().default('0.00'),
  paymentMethod: z
    .enum([
      'BANK_TRANSFER',
      'CASH',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'DIGITAL_WALLET',
      'DIRECT_DEBIT',
      'OTHER',
    ])
    .default('BANK_TRANSFER'),
  notes: z.string().nullable().optional().default(null),
});

export const subscriptionSchema = z.object({
  usedByUserId: z.string().uuid().nullable().optional().default(null),
  memberScope: z.enum(['HUSBAND', 'WIFE', 'SHARED']).default('SHARED'),
  name: z.string().trim().min(2, 'Subscription name is required').max(120),
  provider: z.string().trim().min(2, 'Provider is required').max(120),
  categoryId: z.string().uuid('Category is required'),
  subcategoryId: z.string().uuid().nullable().optional().default(null),
  billingAmount: positiveMoneySchema,
  billingCurrency: z.string().trim().min(3).max(5).default('USD'),
  estimatedLkrAmount: positiveMoneySchema,
  billingFrequency: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY', 'WEEKLY', 'CUSTOM']).default('MONTHLY'),
  nextBillingDate: isoDateSchema,
  defaultAccountId: z.string().uuid().nullable().optional().default(null),
  paymentMethod: z
    .enum([
      'BANK_TRANSFER',
      'CASH',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'DIGITAL_WALLET',
      'DIRECT_DEBIT',
      'OTHER',
    ])
    .default('CREDIT_CARD'),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']).default('ACTIVE'),
  lastReviewedDate: isoDateSchema.nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
});

export const recordSubscriptionPaymentSchema = z.object({
  paidDate: isoDateSchema,
  sourceAccountId: z.string().uuid('Source account is required'),
  paidByUserId: z.string().uuid('Paid by member is required'),
  actualLkrAmount: positiveMoneySchema,
  advanceNextBillingDate: z.boolean().default(true),
  notes: z.string().nullable().optional().default(null),
});

export const recurringScheduleSchema = z.object({
  title: z.string().trim().min(2, 'Schedule title is required').max(120),
  transactionType: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).default('EXPENSE'),
  categoryId: z.string().uuid('Main category is required'),
  subcategoryId: z.string().uuid().nullable().optional().default(null),
  assignedUserId: z.string().uuid('Assigned member is required'),
  defaultAccountId: z.string().uuid('Default account is required'),
  paymentMethod: z
    .enum([
      'BANK_TRANSFER',
      'CASH',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'DIGITAL_WALLET',
      'DIRECT_DEBIT',
      'OTHER',
    ])
    .default('BANK_TRANSFER'),
  frequency: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY', 'WEEKLY', 'CUSTOM']).default('MONTHLY'),
  dueDayOfMonth: z.number().int().min(1).max(31).nullable().optional().default(null),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable().optional().default(null),
  nextDueDate: isoDateSchema,
  expectedAmountLkr: positiveMoneySchema,
  isVariableAmount: z.boolean().default(false),
  isEssential: z.boolean().default(true),
  isFixed: z.boolean().default(true),
  linkedLoanId: z.string().uuid().nullable().optional().default(null),
  linkedSubscriptionId: z.string().uuid().nullable().optional().default(null),
  reminderDaysBefore: z.number().int().min(0).max(30).default(3),
  isActive: z.boolean().default(true),
  notes: z.string().nullable().optional().default(null),
});

export const markRecurringPaidSchema = z.object({
  paidDate: isoDateSchema,
  actualLkrAmount: positiveMoneySchema,
  sourceAccountId: z.string().uuid('Source account is required'),
  paidByUserId: z.string().uuid('Paid by member is required'),
  utilityBillingPeriodStart: isoDateSchema.nullable().optional().default(null),
  utilityBillingPeriodEnd: isoDateSchema.nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
});

export const budgetSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  categoryId: z.string().uuid('Category is required'),
  subcategoryId: z.string().uuid().nullable().optional().default(null),
  memberScope: z.enum(['HOUSEHOLD', 'HUSBAND', 'WIFE']).default('HOUSEHOLD'),
  allocatedAmountLkr: positiveMoneySchema,
  alertThresholdPct: z.number().int().min(10).max(100).default(80),
});

export const savingsGoalSchema = z.object({
  ownerScope: z.enum(['HOUSEHOLD', 'HUSBAND', 'WIFE']).default('HOUSEHOLD'),
  ownerUserId: z.string().uuid().nullable().optional().default(null),
  name: z.string().trim().min(2, 'Goal name is required').max(120),
  targetAmountLkr: positiveMoneySchema,
  monthlyTargetLkr: nonNegativeMoneySchema,
  targetDate: isoDateSchema.nullable().optional().default(null),
  linkedSavingsAccountId: z.string().uuid().nullable().optional().default(null),
  status: z.enum(['ACTIVE', 'COMPLETED', 'PAUSED']).default('ACTIVE'),
  notes: z.string().nullable().optional().default(null),
});

export const savingsContributionSchema = z.object({
  contributedByUserId: z.string().uuid('Contributing member is required'),
  contributionDate: isoDateSchema,
  amountLkr: positiveMoneySchema,
  type: z.enum(['DEPOSIT', 'WITHDRAWAL']).default('DEPOSIT'),
  sourceAccountId: z.string().uuid().nullable().optional().default(null),
  destinationAccountId: z.string().uuid().nullable().optional().default(null),
  createTransferTransaction: z.boolean().default(false),
  notes: z.string().nullable().optional().default(null),
});

