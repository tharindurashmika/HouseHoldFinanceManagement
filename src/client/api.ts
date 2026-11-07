import { ZodError } from 'zod';
import { initDatabase, query } from '../server/db/pool';
import { clearDemoData, ensureSeeded, SEED_IDS } from '../server/db/seed';
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  loanSchema,
  markRecurringPaidSchema,
  payLoanInstallmentSchema,
  reconcileAccountSchema,
  recordSubscriptionPaymentSchema,
  recurringScheduleSchema,
  savingsContributionSchema,
  savingsGoalSchema,
  subscriptionSchema,
  transactionSchema,
} from '../shared/validation';
import { createCategory, listCategories, updateCategory } from '../server/services/categoryService';
import {
  createAccount,
  getAccountBalanceBreakdowns,
  listAccountReconciliations,
  listAccounts,
  recalculateAccountBalance,
  reconcileAccountBalance,
  updateAccount,
} from '../server/services/accountService';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from '../server/services/transactionService';
import {
  createLoan,
  listLoans,
  payLoanInstallment,
  updateLoan,
} from '../server/services/loanService';
import {
  createSubscription,
  listSubscriptions,
  recordSubscriptionPayment,
  updateSubscription,
} from '../server/services/subscriptionService';
import {
  createRecurringSchedule,
  listRecurringSchedules,
  markRecurringSchedulePaid,
} from '../server/services/recurringService';
import {
  deleteBudget,
  getMonthlyBudgetsWithActuals,
  upsertBudget,
} from '../server/services/budgetService';
import {
  addSavingsContribution,
  createSavingsGoal,
  listSavingsGoals,
} from '../server/services/savingsService';
import {
  generateReportData,
  getDashboardSummary,
  type ReportType,
} from '../server/services/analyticsService';
import type {
  Account,
  AccountBalanceBreakdown,
  AccountReconciliation,
  Budget,
  Category,
  DashboardSummary,
  Household,
  Loan,
  MemberRole,
  RecurringSchedule,
  SavingsGoal,
  Subscription,
  Transaction,
  User,
} from '../shared/types';

export interface HouseholdContextResponse {
  household: Household;
  activeUser: {
    userId: string;
    householdId: string;
    email: string;
    displayName: string;
    memberRole: MemberRole;
  };
  members: User[];
  categories: Category[];
  accounts: Account[];
}

let activeUserIdHeader: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem('hf_active_user_id') : null;

export function setActiveUserIdHeader(userId: string | null) {
  activeUserIdHeader = userId;
  try {
    if (typeof localStorage !== 'undefined') {
      if (userId) localStorage.setItem('hf_active_user_id', userId);
      else localStorage.removeItem('hf_active_user_id');
    }
  } catch {
    // ignore storage errors
  }
}

let dbReadyPromise: Promise<void> | null = null;

export function resetDbReadyCache(): void {
  dbReadyPromise = null;
}

async function ensureDbReady(): Promise<void> {
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      await initDatabase();
      await ensureSeeded();
    })().catch((err) => {
      dbReadyPromise = null;
      throw err;
    });
  }
  return dbReadyPromise;
}

async function resolveActiveUser(): Promise<HouseholdContextResponse['activeUser']> {
  await ensureDbReady();
  const targetUserId = activeUserIdHeader || SEED_IDS.husband;
  const userRes = await query(
    'SELECT * FROM users WHERE id = $1 AND household_id = $2 LIMIT 1',
    [targetUserId, SEED_IDS.household]
  );
  const u = userRes.rows[0];
  if (u) {
    return {
      userId: u.id,
      householdId: u.household_id,
      email: u.email,
      displayName: u.display_name,
      memberRole: u.member_role,
    };
  }
  return {
    userId: SEED_IDS.husband,
    householdId: SEED_IDS.household,
    email: 'husband@household.lk',
    displayName: 'Tharindu (Husband)',
    memberRole: 'HUSBAND',
  };
}

async function runAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await ensureDbReady();
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Validation failed: ${msg}`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

let cachedDashboard: {
  key: string;
  data: DashboardSummary;
  expiresAt: number;
} | null = null;

export function invalidateDashboardCache(): void {
  cachedDashboard = null;
}

export const api = {
  getContext: (): Promise<HouseholdContextResponse> =>
    runAction(async () => {
      const activeUser = await resolveActiveUser();
      const householdId = activeUser.householdId;
      const [hhRes, membersRes, categories, accounts] = await Promise.all([
        query('SELECT * FROM households WHERE id = $1', [householdId]),
        query(
          'SELECT id, household_id, email, display_name, member_role, avatar_color, is_active, created_at FROM users WHERE household_id = $1 ORDER BY member_role ASC',
          [householdId]
        ),
        listCategories(householdId),
        listAccounts(householdId),
      ]);

      const hh = hhRes.rows[0] || {
        id: SEED_IDS.household,
        name: 'Tharindu & Sudu Household',
        base_currency: 'LKR',
        locale: 'en-LK',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const members: User[] = membersRes.rows.map((u: any) => ({
        id: u.id,
        householdId: u.household_id,
        email: u.email,
        displayName: u.display_name,
        memberRole: u.member_role,
        avatarColor: u.avatar_color,
        isActive: Boolean(u.is_active),
        createdAt: u.created_at,
      }));

      return {
        household: {
          id: hh.id,
          name: hh.name,
          baseCurrency: hh.base_currency,
          locale: hh.locale,
          createdAt: hh.created_at || new Date().toISOString(),
          updatedAt: hh.updated_at || new Date().toISOString(),
        },
        activeUser,
        members,
        categories,
        accounts,
      };
    }),

  login: (email: string, _password: string) =>
    runAction(async () => {
      const userRes = await query(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE LIMIT 1',
        [email]
      );
      const u = userRes.rows[0];
      if (!u) throw new Error('Invalid email or password');
      setActiveUserIdHeader(u.id);
      const user = {
        userId: u.id,
        householdId: u.household_id,
        email: u.email,
        displayName: u.display_name,
        memberRole: u.member_role as MemberRole,
      };
      return { token: 'pwa-session', user };
    }),

  switchMember: (userId: string) =>
    runAction(async () => {
      invalidateDashboardCache();
      setActiveUserIdHeader(userId);
      const user = await resolveActiveUser();
      return { token: 'pwa-session', user };
    }),

  getDashboard: (startDate: string, endDate: string): Promise<DashboardSummary> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const cacheKey = `${user.householdId}_${startDate}_${endDate}`;
      const now = Date.now();
      if (cachedDashboard && cachedDashboard.key === cacheKey && cachedDashboard.expiresAt > now) {
        return cachedDashboard.data;
      }
      const data = await getDashboardSummary(user.householdId, startDate, endDate);
      cachedDashboard = {
        key: cacheKey,
        data,
        expiresAt: now + 45000,
      };
      return data;
    }),

  getTransactions: (params: Record<string, string | undefined> = {}): Promise<{ transactions: Transaction[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const transactions = await listTransactions(user.householdId, {
        startDate: params.startDate,
        endDate: params.endDate,
        transactionType: (params.transactionType || params.type) as any,
        categoryId: params.categoryId,
        subcategoryId: params.subcategoryId,
        memberUserId: params.memberUserId,
        memberRole: params.memberRole as any,
        accountId: params.accountId,
        search: params.search,
        limit: params.limit ? Number(params.limit) : undefined,
      });
      return { transactions };
    }),

  createTransaction: (payload: any): Promise<{ transaction: Transaction }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      const parsed = transactionSchema.parse(payload);
      const transaction = await createTransaction(user.householdId, {
        ...parsed,
        recordedByUserId: parsed.recordedByUserId || user.userId,
      });
      return { transaction };
    }),

  updateTransaction: (id: string, payload: any): Promise<{ transaction: Transaction }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      const parsed = transactionSchema.parse(payload);
      const transaction = await updateTransaction(user.householdId, id, {
        ...parsed,
        recordedByUserId: parsed.recordedByUserId || user.userId,
      });
      return { transaction };
    }),

  deleteTransaction: (id: string): Promise<{ deleted: boolean }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      await deleteTransaction(user.householdId, id);
      return { deleted: true };
    }),

  getCategories: (): Promise<{ categories: Category[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const categories = await listCategories(user.householdId);
      return { categories };
    }),

  createCategory: (payload: any): Promise<{ category: Category }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = categorySchema.parse(payload);
      const category = await createCategory(user.householdId, parsed);
      return { category };
    }),

  updateCategory: (id: string, payload: any): Promise<{ category: Category }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const category = await updateCategory(user.householdId, id, payload);
      return { category };
    }),

  getAccounts: (): Promise<{ accounts: Account[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const accounts = await listAccounts(user.householdId);
      return { accounts };
    }),

  getAccountBreakdowns: (params: Record<string, string | undefined> = {}): Promise<{ breakdowns: AccountBalanceBreakdown[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const breakdowns = await getAccountBalanceBreakdowns(user.householdId, {
        accountId: params.accountId,
        memberUserId: params.memberUserId,
        startDate: params.startDate,
        endDate: params.endDate,
      });
      return { breakdowns };
    }),

  recalculateAccount: (id: string): Promise<{ currentCalculatedBalance: string }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const currentCalculatedBalance = await recalculateAccountBalance(user.householdId, id);
      return { currentCalculatedBalance };
    }),

  createAccount: (payload: any): Promise<{ account: Account }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      const parsed = accountSchema.parse(payload);
      const account = await createAccount(user.householdId, parsed);
      return { account };
    }),

  updateAccount: (id: string, payload: any): Promise<{ account: Account }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      const account = await updateAccount(user.householdId, id, payload);
      return { account };
    }),

  reconcileAccount: (
    id: string,
    payload: any
  ): Promise<{ account: Account; reconciliation: AccountReconciliation }> =>
    runAction(async () => {
      invalidateDashboardCache();
      const user = await resolveActiveUser();
      const parsed = reconcileAccountSchema.parse({
        ...payload,
        reconciledByUserId: payload.reconciledByUserId || user.userId,
      });
      return reconcileAccountBalance(user.householdId, id, parsed);
    }),

  getReconciliations: (): Promise<{ reconciliations: AccountReconciliation[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const reconciliations = await listAccountReconciliations(user.householdId);
      return { reconciliations };
    }),

  getLoans: (): Promise<{ loans: Loan[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const loans = await listLoans(user.householdId);
      return { loans };
    }),

  createLoan: (payload: any): Promise<{ loan: Loan }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = loanSchema.parse(payload);
      const loan = await createLoan(user.householdId, parsed);
      return { loan };
    }),

  updateLoan: (id: string, payload: any): Promise<{ loan: Loan }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const loan = await updateLoan(user.householdId, id, payload);
      return { loan };
    }),

  payLoanInstallment: (id: string, payload: any): Promise<{ loan: Loan }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = payLoanInstallmentSchema.parse(payload);
      const loan = await payLoanInstallment(user.householdId, id, user.userId, parsed);
      return { loan };
    }),

  getSubscriptions: (): Promise<{ subscriptions: Subscription[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const subscriptions = await listSubscriptions(user.householdId);
      return { subscriptions };
    }),

  createSubscription: (payload: any): Promise<{ subscription: Subscription }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = subscriptionSchema.parse(payload);
      const subscription = await createSubscription(user.householdId, parsed);
      return { subscription };
    }),

  updateSubscription: (id: string, payload: any): Promise<{ subscription: Subscription }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const subscription = await updateSubscription(user.householdId, id, payload);
      return { subscription };
    }),

  paySubscription: (id: string, payload: any): Promise<{ subscription: Subscription }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = recordSubscriptionPaymentSchema.parse(payload);
      const subscription = await recordSubscriptionPayment(user.householdId, id, user.userId, parsed);
      return { subscription };
    }),

  getRecurring: (): Promise<{ schedules: RecurringSchedule[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const schedules = await listRecurringSchedules(user.householdId);
      return { schedules };
    }),

  createRecurring: (payload: any): Promise<{ schedule: RecurringSchedule }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = recurringScheduleSchema.parse(payload);
      const schedule = await createRecurringSchedule(user.householdId, parsed);
      return { schedule };
    }),

  payRecurring: (id: string, payload: any): Promise<{ schedule: RecurringSchedule }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = markRecurringPaidSchema.parse(payload);
      const schedule = await markRecurringSchedulePaid(user.householdId, id, user.userId, parsed);
      return { schedule };
    }),

  getBudgets: (year: number, month: number) =>
    runAction(async () => {
      const user = await resolveActiveUser();
      return getMonthlyBudgetsWithActuals(user.householdId, year, month);
    }),

  upsertBudget: (payload: any): Promise<{ budget: Budget }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = budgetSchema.parse(payload);
      const budget = await upsertBudget(user.householdId, parsed);
      return { budget };
    }),

  deleteBudget: (id: string): Promise<{ deleted: boolean }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      await deleteBudget(user.householdId, id);
      return { deleted: true };
    }),

  getSavingsGoals: (): Promise<{ goals: SavingsGoal[] }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const goals = await listSavingsGoals(user.householdId);
      return { goals };
    }),

  createSavingsGoal: (payload: any): Promise<{ goal: SavingsGoal }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = savingsGoalSchema.parse(payload);
      const goal = await createSavingsGoal(user.householdId, parsed);
      return { goal };
    }),

  contributeSavings: (id: string, payload: any): Promise<{ goal: SavingsGoal }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      const parsed = savingsContributionSchema.parse(payload);
      const goal = await addSavingsContribution(user.householdId, id, user.userId, parsed);
      return { goal };
    }),

  getReport: (params: Record<string, string | undefined>) =>
    runAction(async () => {
      const user = await resolveActiveUser();
      return generateReportData(user.householdId, {
        reportType: (params.reportType || 'MONTHLY_FINANCIAL') as ReportType,
        startDate: params.startDate || '2026-10-01',
        endDate: params.endDate || '2026-10-31',
        categoryId: params.categoryId,
        memberRole: params.memberRole as any,
        transactionType: params.transactionType as any,
      });
    }),

  clearDemoData: (): Promise<{ cleared: boolean }> =>
    runAction(async () => {
      const user = await resolveActiveUser();
      await clearDemoData(user.householdId);
      return { cleared: true };
    }),
};
