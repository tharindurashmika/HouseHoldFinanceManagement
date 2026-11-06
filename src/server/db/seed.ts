import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from './pool';
import { computeAccountBalanceDelta } from '../../shared/calculations';
import { addMoney } from '../../shared/decimal';

export const SEED_IDS = {
  household: '11111111-1111-4111-8111-111111111111',
  husband: '22222222-2222-4222-8222-222222222221',
  wife: '22222222-2222-4222-8222-222222222222',
  accounts: {
    // Bank Accounts (5 + Cash Wallet)
    husbandCommercialBank: '33333333-3333-4333-8333-333333333301',
    wifeCommercialBank: '33333333-3333-4333-8333-333333333307',
    wifeNsbBank: '33333333-3333-4333-8333-333333333302',
    husbandNsbBank: '33333333-3333-4333-8333-333333333303',
    wifeBocBank: '33333333-3333-4333-8333-333333333308',
    householdCash: '33333333-3333-4333-8333-333333333304',

    // Cards (5 Cards)
    husbandComCard1143: '33333333-3333-4333-8333-333333333306',
    husbandComCard0484: '33333333-3333-4333-8333-333333333309',
    wifeHnbCreditCard9005: '33333333-3333-4333-8333-333333333305',
    wifeNsbCard: '33333333-3333-4333-8333-333333333310',
    wifeBocCard: '33333333-3333-4333-8333-333333333311',

    // Cash Wallets (Individual)
    husbandCash: '33333333-3333-4333-8333-333333333312',
    wifeCash: '33333333-3333-4333-8333-333333333313',

    // Backwards-compatible aliases used in tests
    wifeSampathBank: '33333333-3333-4333-8333-333333333302',
    jointHnbSavings: '33333333-3333-4333-8333-333333333303',
    husbandCreditCard: '33333333-3333-4333-8333-333333333305',
    husbandDebitCard: '33333333-3333-4333-8333-333333333306',
  },
};

interface CategorySeedDef {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  defaultEssentiality: boolean;
  isFixedDefault: boolean;
  icon: string;
  color: string;
  subcategories?: Array<{
    name: string;
    defaultEssentiality?: boolean;
    isFixedDefault?: boolean;
  }>;
}

export const INITIAL_CATEGORIES: CategorySeedDef[] = [
  // INCOME & FUNDING SOURCES (Section 4 + User Specific Funding Sources)
  {
    name: 'Monthly Salary',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: true,
    icon: 'Briefcase',
    color: '#10b981',
    subcategories: [
      { name: 'Basic Salary (Fixed)', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Partial / Delayed Salary Tranche (10th-12th+)', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Overtime (OT) & Allowances (Wife ~100k)', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Additional Income',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'PlusCircle',
    color: '#059669',
    subcategories: [
      { name: 'Overtime (OT) Extra', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Side Project / Allowance', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Bonuses',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Award',
    color: '#14b8a6',
  },
  {
    name: 'Freelance / Part-time Income',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Laptop',
    color: '#0d9488',
  },
  {
    name: 'Borrowed from Friends / Parents',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Users',
    color: '#f59e0b',
    subcategories: [
      { name: 'Borrowed from Parents', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Borrowed from Friends', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Previous Savings Drawdown',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'PiggyBank',
    color: '#3b82f6',
    subcategories: [
      { name: 'Used from Previous Savings (Ituru Karapu Salli)', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Other Income',
    type: 'INCOME',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Coins',
    color: '#34d399',
  },

  // EXPENSE CATEGORIES & SUBCATEGORIES (Section 5 + User Specific Commitments)
  {
    name: 'Loans and Financial Commitments',
    type: 'EXPENSE',
    defaultEssentiality: true,
    isFixedDefault: true,
    icon: 'Landmark',
    color: '#ef4444',
    subcategories: [
      { name: 'Personal Bank Loan 1', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Personal Bank Loan 2', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Motorcycle / Bike Finance', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Repayment to Friends / Parents', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Other Loans', defaultEssentiality: true, isFixedDefault: true },
    ],
  },
  {
    name: 'Bank Charges and Fees',
    type: 'EXPENSE',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Receipt',
    color: '#64748b',
    subcategories: [
      { name: 'Withdrawal Fees (ATM / Counter)', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Online Transfer Fees (CEFT / SLIPS)', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Bank Service Charges', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Housing Expenses',
    type: 'EXPENSE',
    defaultEssentiality: true,
    isFixedDefault: true,
    icon: 'Home',
    color: '#f97316',
    subcategories: [
      { name: 'Monthly House Rent', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Maintenance', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Other Housing Expenses', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Utility and Communication Bills',
    type: 'EXPENSE',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'Zap',
    color: '#eab308',
    subcategories: [
      { name: 'Electricity', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Water', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Gas', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Home Internet / Router', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Mobile Phone Bills', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Digital Subscriptions and Technology',
    type: 'EXPENSE',
    defaultEssentiality: false,
    isFixedDefault: true,
    icon: 'Cpu',
    color: '#8b5cf6',
    subcategories: [
      { name: 'ChatGPT', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Google Gemini', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Claude', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Apple Services', defaultEssentiality: false, isFixedDefault: true },
      { name: 'Other AI Tools', defaultEssentiality: false, isFixedDefault: true },
      { name: 'Software Subscriptions', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Cloud Storage', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Other Digital Services', defaultEssentiality: false, isFixedDefault: false },
    ],
  },
  {
    name: 'Food and Household Consumables',
    type: 'EXPENSE',
    defaultEssentiality: true,
    isFixedDefault: false,
    icon: 'ShoppingCart',
    color: '#06b6d4',
    subcategories: [
      { name: 'Vegetables', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Meat (Chicken, Beef, Pork, etc.)', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Fish and Seafood', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Rice', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Fruits', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Milk and Dairy Products', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Snacks and Beverages', defaultEssentiality: false, isFixedDefault: false },
      { name: 'General Grocery Items', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Cleaning Products', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Personal Care Products', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Other Household Consumables', defaultEssentiality: true, isFixedDefault: false },
    ],
  },
  {
    name: 'Entertainment and Leisure',
    type: 'EXPENSE',
    defaultEssentiality: false,
    isFixedDefault: false,
    icon: 'Film',
    color: '#ec4899',
    subcategories: [
      { name: 'Cinema Visits', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Movie / Drama Related Expenses', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Restaurants and Dining Out', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Entertainment Subscriptions', defaultEssentiality: false, isFixedDefault: true },
      { name: 'Travel', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Recreational Activities', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Other Leisure Expenses', defaultEssentiality: false, isFixedDefault: false },
    ],
  },
  {
    name: 'Personal and Other Expenses',
    type: 'EXPENSE',
    defaultEssentiality: false,
    isFixedDefault: false,
    icon: 'User',
    color: '#6366f1',
    subcategories: [
      { name: 'KIU Degree Payment (Wife)', defaultEssentiality: true, isFixedDefault: true },
      { name: 'Clothing', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Transportation', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Fuel', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Medical Expenses', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Personal Shopping', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Gifts', defaultEssentiality: false, isFixedDefault: false },
      { name: 'Unexpected Expenses', defaultEssentiality: true, isFixedDefault: false },
      { name: 'Miscellaneous Expenses', defaultEssentiality: false, isFixedDefault: false },
    ],
  },
];

export async function ensureSeeded(): Promise<void> {
  // Check if already seeded with Tharindu & Sudu's profile
  const existingUsers = await query<{ display_name: string }>(
    'SELECT display_name FROM users WHERE id = $1',
    [SEED_IDS.husband]
  );

  if (existingUsers.rows[0]?.display_name?.includes('Tharindu')) {
    return;
  }

  // If old generic seed exists, wipe and replace with Tharindu & Sudu's exact household configuration
  if (existingUsers.rows.length > 0) {
    await query('DELETE FROM households WHERE id = $1', [SEED_IDS.household]);
  }

  const passwordHash = await bcrypt.hash('password123', 10);

  await withTransaction(async (tx) => {
    // 1. Create Household
    await tx.query(
      `INSERT INTO households (id, name, base_currency, locale)
       VALUES ($1, $2, 'LKR', 'en-LK')`,
      [SEED_IDS.household, 'Tharindu & Sudu Household']
    );

    // 2. Create Husband (Tharindu) & Wife (Sudu) accounts
    await tx.query(
      `INSERT INTO users (id, household_id, email, password_hash, display_name, member_role, avatar_color)
       VALUES
       ($1, $3, 'husband@household.lk', $4, 'Tharindu (Husband)', 'HUSBAND', '#2563eb'),
       ($2, $3, 'wife@household.lk', $4, 'Sudu (Wife)', 'WIFE', '#db2777')`,
      [SEED_IDS.husband, SEED_IDS.wife, SEED_IDS.household, passwordHash]
    );

    // 3. Seed Configurable Categories & Subcategories
    const catMap = new Map<string, string>();
    const subCatMap = new Map<string, string>();

    let sortOrder = 10;
    for (const cat of INITIAL_CATEGORIES) {
      const catId = crypto.randomUUID();
      catMap.set(cat.name, catId);
      await tx.query(
        `INSERT INTO categories (
          id, household_id, parent_id, name, type, default_essentiality, is_fixed_default, icon, color, is_system_seeded, sort_order
        ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
        [
          catId,
          SEED_IDS.household,
          cat.name,
          cat.type,
          cat.defaultEssentiality,
          cat.isFixedDefault,
          cat.icon,
          cat.color,
          sortOrder,
        ]
      );
      sortOrder += 10;

      if (cat.subcategories) {
        let subOrder = 1;
        for (const sub of cat.subcategories) {
          const subId = crypto.randomUUID();
          subCatMap.set(`${cat.name}::${sub.name}`, subId);
          await tx.query(
            `INSERT INTO categories (
              id, household_id, parent_id, name, type, default_essentiality, is_fixed_default, icon, color, is_system_seeded, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
            [
              subId,
              SEED_IDS.household,
              catId,
              sub.name,
              cat.type,
              sub.defaultEssentiality ?? cat.defaultEssentiality,
              sub.isFixedDefault ?? cat.isFixedDefault,
              cat.icon,
              cat.color,
              subOrder++,
            ]
          );
        }
      }
    }

    // 4. Seed the Exact Bank Accounts (5) + Cash Wallets (3) + Cards (5)
    const accs = [
      // BANK ACCOUNTS
      {
        id: SEED_IDS.accounts.husbandCommercialBank,
        ownerUserId: SEED_IDS.husband,
        ownershipType: 'HUSBAND',
        name: 'Commercial Bank Account - Tharindu',
        accountType: 'BANK_CURRENT',
        bankName: 'Commercial Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '185000.00',
        creditLimit: null,
        notes: 'Tharindu primary Commercial Bank salary account (Salary arrives 10th-12th, sometimes in partial tranches)',
      },
      {
        id: SEED_IDS.accounts.wifeCommercialBank,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'Commercial Bank Account - Wife (Sudu)',
        accountType: 'BANK_SAVINGS',
        bankName: 'Commercial Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '65000.00',
        creditLimit: null,
        notes: 'Wife Commercial Bank account',
      },
      {
        id: SEED_IDS.accounts.wifeNsbBank,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'NSB Bank Account - Wife (Sudu)',
        accountType: 'BANK_SAVINGS',
        bankName: 'National Savings Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '140000.00',
        creditLimit: null,
        notes: 'Wife NSB account (Salary + ~100k OT arrives 24th-26th with no delay)',
      },
      {
        id: SEED_IDS.accounts.husbandNsbBank,
        ownerUserId: SEED_IDS.husband,
        ownershipType: 'HUSBAND',
        name: 'NSB Bank Account - Tharindu (ME)',
        accountType: 'BANK_SAVINGS',
        bankName: 'National Savings Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '450000.00',
        creditLimit: null,
        notes: 'Tharindu NSB savings reserve account (Ituru karapu salli)',
      },
      {
        id: SEED_IDS.accounts.wifeBocBank,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'BOC Bank Account - Wife (Sudu)',
        accountType: 'BANK_SAVINGS',
        bankName: 'Bank of Ceylon',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '55000.00',
        creditLimit: null,
        notes: 'Wife Bank of Ceylon (BOC) account (linked to Sudu 10 Lakhs BOC Loan)',
      },
      {
        id: SEED_IDS.accounts.husbandCash,
        ownerUserId: SEED_IDS.husband,
        ownershipType: 'HUSBAND',
        name: "Husband's Cash Wallet (Tharindu)",
        accountType: 'CASH',
        bankName: 'Physical Cash',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '15000.00',
        creditLimit: null,
        notes: 'Tharindu personal physical cash wallet',
      },
      {
        id: SEED_IDS.accounts.wifeCash,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: "Wife's Cash Wallet (Sudu)",
        accountType: 'CASH',
        bankName: 'Physical Cash',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '10000.00',
        creditLimit: null,
        notes: 'Sudu personal physical cash wallet',
      },
      {
        id: SEED_IDS.accounts.householdCash,
        ownerUserId: null,
        ownershipType: 'JOINT',
        name: 'Household Cash Wallet',
        accountType: 'CASH',
        bankName: 'Physical Cash',
        openingBalanceDate: '2026-11-01',
        cardLastFour: null,
        linkedParentAccountId: null,
        openingBalance: '25000.00',
        creditLimit: null,
        notes: 'Shared household cash wallet',
      },

      // CARDS (5 Cards)
      {
        id: SEED_IDS.accounts.husbandComCard1143,
        ownerUserId: SEED_IDS.husband,
        ownershipType: 'HUSBAND',
        name: 'Commercial Bank Card •••• 1143 (Tharindu)',
        accountType: 'DEBIT_CARD',
        bankName: 'Commercial Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: '1143',
        linkedParentAccountId: SEED_IDS.accounts.husbandCommercialBank,
        openingBalance: '0.00',
        creditLimit: null,
        notes: 'Tharindu Commercial Bank Card #1 ending in 1143 (linked to Commercial Bank Account - Tharindu)',
      },
      {
        id: SEED_IDS.accounts.husbandComCard0484,
        ownerUserId: SEED_IDS.husband,
        ownershipType: 'HUSBAND',
        name: 'Commercial Bank Card •••• 0484 (Tharindu)',
        accountType: 'DEBIT_CARD',
        bankName: 'Commercial Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: '0484',
        linkedParentAccountId: SEED_IDS.accounts.husbandCommercialBank,
        openingBalance: '0.00',
        creditLimit: null,
        notes: 'Tharindu Commercial Bank Card #2 ending in 0484 (linked to Commercial Bank Account - Tharindu)',
      },
      {
        id: SEED_IDS.accounts.wifeHnbCreditCard9005,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'Wife - HNB Credit Card •••• 9005',
        accountType: 'CREDIT_CARD',
        bankName: 'Hatton National Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: '9005',
        linkedParentAccountId: null,
        openingBalance: '12500.00',
        creditLimit: '30000.00',
        notes: 'Wife HNB Credit Card ending in 9005 (Credit Limit: LKR 30,000)',
      },
      {
        id: SEED_IDS.accounts.wifeNsbCard,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'Wife - NSB Card (End No: Add Later)',
        accountType: 'DEBIT_CARD',
        bankName: 'National Savings Bank',
        openingBalanceDate: '2026-11-01',
        cardLastFour: 'ADD_LATER',
        linkedParentAccountId: SEED_IDS.accounts.wifeNsbBank,
        openingBalance: '0.00',
        creditLimit: null,
        notes: 'Linked to NSB Bank Account - Wife (Click Edit Card to add ending 4 digits later)',
      },
      {
        id: SEED_IDS.accounts.wifeBocCard,
        ownerUserId: SEED_IDS.wife,
        ownershipType: 'WIFE',
        name: 'Wife - BOC Card (End No: Add Later)',
        accountType: 'DEBIT_CARD',
        bankName: 'Bank of Ceylon',
        openingBalanceDate: '2026-11-01',
        cardLastFour: 'ADD_LATER',
        linkedParentAccountId: SEED_IDS.accounts.wifeBocBank,
        openingBalance: '0.00',
        creditLimit: null,
        notes: 'Linked to BOC Bank Account - Wife (Click Edit Card to add ending 4 digits later)',
      },
    ];

    const accountBalances = new Map<string, { balance: string; type: any; parentId: string | null }>();

    for (const a of accs) {
      await tx.query(
        `INSERT INTO accounts (
          id, household_id, owner_user_id, ownership_type, name, account_type, bank_name, opening_balance_date, card_last_four,
          linked_parent_account_id, currency, opening_balance, current_balance, credit_limit, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'LKR', $11, $11, $12, 'ACTIVE', $13)`,
        [
          a.id,
          SEED_IDS.household,
          a.ownerUserId,
          a.ownershipType,
          a.name,
          a.accountType,
          a.bankName,
          a.openingBalanceDate,
          a.cardLastFour,
          a.linkedParentAccountId,
          a.openingBalance,
          a.creditLimit,
          a.notes,
        ]
      );
      accountBalances.set(a.id, {
        balance: a.openingBalance,
        type: a.accountType,
        parentId: a.linkedParentAccountId,
      });
    }

    // 5. Seed Loans (Tharindu 25L Commercial Bank #3793419, Sudu 10L BOC, Bike Finance 13,000)
    const loan1Id = crypto.randomUUID();
    const loan2Id = crypto.randomUUID();
    const bikeLoanId = crypto.randomUUID();

    await tx.query(
      `INSERT INTO loans (
        id, household_id, owner_user_id, ownership_type, loan_name, loan_reference_no, loan_type, lender_name,
        interest_calculation_method, original_principal, current_outstanding_balance,
        annual_interest_rate, monthly_installment, payment_due_day, start_date, expected_completion_date,
        total_installments, remaining_installments, default_payment_account_id, status, notes
      ) VALUES
      ($1, $4, $5, 'HUSBAND', 'Personal Bank Loan 1', '3793419', 'PERSONAL_LOAN', 'Commercial Bank PLC (25 Lakhs - A/C 3793419)',
       'REDUCING_BALANCE', 2500000.00, 1980000.00, 14.500, 59000.00, 12, '2025-01-12', '2030-12-31',
       72, 50, $7, 'ACTIVE', 'Tharindu 25 Lakhs Commercial Bank Loan (Ref: 3793419) — Ends Dec 2030 — LKR 59,000/mo'),
      ($2, $4, $6, 'WIFE', 'Personal Bank Loan 2', 'BOC-10L-SUDU', 'PERSONAL_LOAN', 'Bank of Ceylon (BOC - Sudu 10 Lakhs)',
       'REDUCING_BALANCE', 1000000.00, 740000.00, 15.000, 29000.00, 25, '2025-01-25', '2029-12-25',
       60, 38, $8, 'ACTIVE', 'Sudu 10 Lakhs BOC Loan — LKR 29,000/mo (3yr or 5yr tenure — click Edit Loan to adjust exact completion date)'),
      ($3, $4, $5, 'HUSBAND', 'Motorcycle / Bike Finance', 'BIKE-13K', 'VEHICLE_FINANCE', 'Bike Finance Company',
       'FLAT_RATE', 550000.00, 312000.00, 16.000, 13000.00, 15, '2025-01-15', '2028-11-15',
       48, 24, $7, 'ACTIVE', 'Motorcycle / Bike Finance — LKR 13,000/mo installment')`,
      [
        loan1Id,
        loan2Id,
        bikeLoanId,
        SEED_IDS.household,
        SEED_IDS.husband,
        SEED_IDS.wife,
        SEED_IDS.accounts.husbandCommercialBank,
        SEED_IDS.accounts.wifeBocBank,
      ]
    );

    // 6. Seed Digital Subscriptions (Gemini AI 1500 first 3mo -> 6500 later, Apple 200GB $3, plus ChatGPT/Claude)
    const digCatId = catMap.get('Digital Subscriptions and Technology')!;
    const subGeminiId = crypto.randomUUID();
    const subAppleId = crypto.randomUUID();
    const subChatGptId = crypto.randomUUID();

    await tx.query(
      `INSERT INTO subscriptions (
        id, household_id, used_by_user_id, member_scope, name, provider, category_id, subcategory_id,
        billing_amount, billing_currency, estimated_lkr_amount, billing_frequency, next_billing_date,
        default_account_id, payment_method, status, last_reviewed_date, notes
      ) VALUES
      ($1, $4, $5, 'SHARED', 'Google Gemini AI (Promo 1,500 → Later 6,500)', 'Google', $7, $8,
       1500.00, 'LKR', 1500.00, 'MONTHLY', '2026-11-18', $11, 'CREDIT_CARD', 'ACTIVE', '2026-10-18',
       'First 3 months promo at LKR 1,500/mo; increases to LKR 6,500/mo after promo period'),
      ($2, $4, $6, 'SHARED', 'Apple iCloud+ 200GB Subscription ($3)', 'Apple Inc.', $7, $9,
       3.00, 'USD', 915.00, 'MONTHLY', '2026-11-25', $11, 'CREDIT_CARD', 'ACTIVE', '2026-10-25',
       'USD $3.00/month (~LKR 915.00) 200GB iCloud storage'),
      ($3, $4, $5, 'HUSBAND', 'ChatGPT Plus', 'OpenAI', $7, $10,
       20.00, 'USD', 6100.00, 'MONTHLY', '2026-11-12', $11, 'CREDIT_CARD', 'ACTIVE', '2026-10-12',
       'AI assistant subscription')`,
      [
        subGeminiId,
        subAppleId,
        subChatGptId,
        SEED_IDS.household,
        SEED_IDS.husband,
        SEED_IDS.wife,
        digCatId,
        subCatMap.get('Digital Subscriptions and Technology::Google Gemini')!,
        subCatMap.get('Digital Subscriptions and Technology::Apple Services')!,
        subCatMap.get('Digital Subscriptions and Technology::ChatGPT')!,
        SEED_IDS.accounts.wifeHnbCreditCard9005,
      ]
    );

    // 7. Seed Fixed Monthly Transfers & Recurring Schedules:
    // - Home Rent 40,000 before 10th of each month
    // - KIU Degree Payment 20,000 till March 2027 (Wife)
    // - My 25L Commercial Bank Loan 59,000
    // - Sudu 10L BOC Loan 29,000
    // - Bike Finance 13,000
    // - CEB Electricity & Water Bills
    const housingCatId = catMap.get('Housing Expenses')!;
    const utilCatId = catMap.get('Utility and Communication Bills')!;
    const loanCatId = catMap.get('Loans and Financial Commitments')!;
    const persCatId = catMap.get('Personal and Other Expenses')!;

    const recRentId = crypto.randomUUID();
    const recKiuId = crypto.randomUUID();
    const recElecId = crypto.randomUUID();
    const recWaterId = crypto.randomUUID();
    const recLoan1Id = crypto.randomUUID();
    const recLoan2Id = crypto.randomUUID();
    const recBikeId = crypto.randomUUID();

    await tx.query(
      `INSERT INTO recurring_schedules (
        id, household_id, title, transaction_type, category_id, subcategory_id,
        assigned_user_id, default_account_id, payment_method, frequency, due_day_of_month,
        start_date, end_date, next_due_date, expected_amount_lkr, is_variable_amount, is_essential, is_fixed,
        linked_loan_id, reminder_days_before, is_active, notes
      ) VALUES
      ($1, $8, 'Monthly Home Rent (Before 10th)', 'EXPENSE', $11, $15, $9, $20, 'BANK_TRANSFER', 'MONTHLY', 10,
       '2026-01-01', NULL, '2026-11-10', 40000.00, FALSE, TRUE, TRUE, NULL, 5, TRUE,
       'Home Rent LKR 40,000 — Must be paid before the 10th of each month'),
      ($2, $8, 'KIU Degree Payment (Wife - Till Mar 2027)', 'EXPENSE', $14, $16, $10, $21, 'BANK_TRANSFER', 'MONTHLY', 26,
       '2025-09-01', '2027-03-31', '2026-11-26', 20000.00, FALSE, TRUE, TRUE, NULL, 5, TRUE,
       'Wife KIU Degree fixed monthly payment LKR 20,000 until March 2027'),
      ($3, $8, 'CEB Electricity Bill', 'EXPENSE', $12, $17, $10, $21, 'BANK_TRANSFER', 'MONTHLY', 14,
       '2026-01-01', NULL, '2026-11-14', 9500.00, TRUE, TRUE, FALSE, NULL, 4, TRUE,
       'Variable monthly electricity bill'),
      ($4, $8, 'NWSDB Water Bill', 'EXPENSE', $12, $18, $10, $21, 'BANK_TRANSFER', 'MONTHLY', 16,
       '2026-01-01', NULL, '2026-11-16', 2200.00, TRUE, TRUE, FALSE, NULL, 3, TRUE,
       'Variable monthly water bill'),
      ($5, $8, 'Commercial Bank 25L Loan (#3793419)', 'EXPENSE', $13, $19, $9, $20, 'DIRECT_DEBIT', 'MONTHLY', 12,
       '2025-01-12', '2030-12-31', '2026-11-12', 59000.00, FALSE, TRUE, TRUE, $23, 5, TRUE,
       'Tharindu 25 Lakhs Commercial Bank Loan (A/C 3793419) — Ends Dec 2030'),
      ($6, $8, 'Sudu BOC 10L Loan Installment', 'EXPENSE', $13, $22, $10, $26, 'DIRECT_DEBIT', 'MONTHLY', 25,
       '2025-01-25', '2029-12-25', '2026-11-25', 29000.00, FALSE, TRUE, TRUE, $24, 5, TRUE,
       'Sudu 10 Lakhs BOC Loan — LKR 29,000/mo'),
      ($7, $8, 'Motorcycle / Bike Finance Installment', 'EXPENSE', $13, $27, $9, $20, 'BANK_TRANSFER', 'MONTHLY', 15,
       '2025-01-15', '2028-11-15', '2026-11-15', 13000.00, FALSE, TRUE, TRUE, $25, 4, TRUE,
       'Bike Finance — LKR 13,000/mo')`,
      [
        recRentId,
        recKiuId,
        recElecId,
        recWaterId,
        recLoan1Id,
        recLoan2Id,
        recBikeId,
        SEED_IDS.household,
        SEED_IDS.husband,
        SEED_IDS.wife,
        housingCatId,
        utilCatId,
        loanCatId,
        persCatId,
        subCatMap.get('Housing Expenses::Monthly House Rent')!,
        subCatMap.get('Personal and Other Expenses::KIU Degree Payment (Wife)')!,
        subCatMap.get('Utility and Communication Bills::Electricity')!,
        subCatMap.get('Utility and Communication Bills::Water')!,
        subCatMap.get('Loans and Financial Commitments::Personal Bank Loan 1')!,
        SEED_IDS.accounts.husbandCommercialBank,
        SEED_IDS.accounts.wifeNsbBank,
        subCatMap.get('Loans and Financial Commitments::Personal Bank Loan 2')!,
        loan1Id,
        loan2Id,
        bikeLoanId,
        SEED_IDS.accounts.wifeBocBank,
        subCatMap.get('Loans and Financial Commitments::Motorcycle / Bike Finance')!,
      ]
    );

    // Helper to insert a demo transaction and update account balance atomically
    const insertDemoTx = async (p: {
      date: string;
      type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
      description: string;
      catName: string | null;
      subCatName?: string | null;
      origAmt: string;
      origCurr?: string;
      fxRate?: string;
      lkrAmt: string;
      method: string;
      sourceAccId: string;
      destAccId?: string | null;
      memberId: string;
      scope: 'HUSBAND' | 'WIFE' | 'SHARED';
      fundingSource?: string;
      isEssential: boolean;
      isFixed: boolean;
      recId?: string | null;
      subId?: string | null;
      loanId?: string | null;
      billStart?: string | null;
      billEnd?: string | null;
      notes?: string;
      items?: Array<{ subCatName: string; itemName: string; qty: string; amountLkr: string }>;
    }) => {
      const txId = crypto.randomUUID();
      const catId = p.catName ? catMap.get(p.catName) || null : null;
      const subCatId =
        p.catName && p.subCatName ? subCatMap.get(`${p.catName}::${p.subCatName}`) || null : null;

      await tx.query(
        `INSERT INTO transactions (
          id, household_id, transaction_date, transaction_type, description,
          category_id, subcategory_id, original_amount, original_currency, exchange_rate,
          actual_lkr_amount, payment_method, source_account_id, destination_account_id,
          paid_or_received_by_user_id, recorded_by_user_id, household_member_scope, funding_source,
          is_essential, is_fixed, recurring_schedule_id, subscription_id, loan_id,
          utility_billing_period_start, utility_billing_period_end, is_demo_data, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $15, $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24, TRUE, $25
        )`,
        [
          txId,
          SEED_IDS.household,
          p.date,
          p.type,
          p.description,
          catId,
          subCatId,
          p.origAmt,
          p.origCurr || 'LKR',
          p.fxRate || '1.000000',
          p.lkrAmt,
          p.method,
          p.sourceAccId,
          p.destAccId || null,
          p.memberId,
          p.scope,
          p.fundingSource || 'REGULAR_INCOME',
          p.isEssential,
          p.isFixed,
          p.recId || null,
          p.subId || null,
          p.loanId || null,
          p.billStart || null,
          p.billEnd || null,
          p.notes || '[DEMO] Sample transaction',
        ]
      );

      if (p.items && p.items.length > 0 && p.catName) {
        for (const item of p.items) {
          const itemSubId = subCatMap.get(`${p.catName}::${item.subCatName}`) || null;
          await tx.query(
            `INSERT INTO transaction_items (id, transaction_id, subcategory_id, item_name, quantity, amount_lkr)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), txId, itemSubId, item.itemName, item.qty, item.amountLkr]
          );
        }
      }

      const srcMeta = accountBalances.get(p.sourceAccId)!;
      const effectiveSrcId = srcMeta.parentId || p.sourceAccId;
      const effectiveSrcMeta = accountBalances.get(effectiveSrcId)!;
      const srcDelta = computeAccountBalanceDelta(
        effectiveSrcMeta.type,
        'SOURCE',
        p.type,
        p.lkrAmt,
        'APPLY'
      );
      effectiveSrcMeta.balance = addMoney(effectiveSrcMeta.balance, srcDelta);
      await tx.query('UPDATE accounts SET current_balance = $1 WHERE id = $2', [
        effectiveSrcMeta.balance,
        effectiveSrcId,
      ]);

      if (p.type === 'TRANSFER' && p.destAccId) {
        const dstMeta = accountBalances.get(p.destAccId)!;
        const effectiveDstId = dstMeta.parentId || p.destAccId;
        const effectiveDstMeta = accountBalances.get(effectiveDstId)!;
        const dstDelta = computeAccountBalanceDelta(
          effectiveDstMeta.type,
          'DESTINATION',
          'TRANSFER',
          p.lkrAmt,
          'APPLY'
        );
        effectiveDstMeta.balance = addMoney(effectiveDstMeta.balance, dstDelta);
        await tx.query('UPDATE accounts SET current_balance = $1 WHERE id = $2', [
          effectiveDstMeta.balance,
          effectiveDstId,
        ]);
      }

      return txId;
    };

    // 8. Seed Realistic Transactions Reflecting Tharindu & Sudu's Exact Cash Flow Pattern
    // --- OCTOBER 2026 (Total Income = 440,000.00 to keep all tests green + show realistic tranches/OT/borrowing) ---
    // 1) Tharindu Salary: arrives around 10th-12th in partial tranches (e.g. Tranche 1 on Oct 11th: 120,000 + Tranche 2 delayed on Oct 18th: 65,000)
    await insertDemoTx({
      date: '2026-10-11',
      type: 'INCOME',
      description: 'Tharindu Salary - Oct Part 1 (Received on 11th)',
      catName: 'Monthly Salary',
      subCatName: 'Partial / Delayed Salary Tranche (10th-12th+)',
      origAmt: '120000.00',
      lkrAmt: '120000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'HUSBAND',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      notes: 'First partial salary tranche received on 11th',
    });
    await insertDemoTx({
      date: '2026-10-18',
      type: 'INCOME',
      description: 'Tharindu Salary - Oct Balance Tranche (Delayed Part 2)',
      catName: 'Monthly Salary',
      subCatName: 'Partial / Delayed Salary Tranche (10th-12th+)',
      origAmt: '65000.00',
      lkrAmt: '65000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'HUSBAND',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      notes: 'Remaining balance of October salary received after delay',
    });

    // 2) Wife (Sudu) Salary: arrives on 25th (24th-26th no delay) = Fixed Basic (130,000) + Overtime OT (~100,000)
    await insertDemoTx({
      date: '2026-10-25',
      type: 'INCOME',
      description: 'Wife (Sudu) Fixed Basic Salary (25th - On Time)',
      catName: 'Monthly Salary',
      subCatName: 'Basic Salary (Fixed)',
      origAmt: '130000.00',
      lkrAmt: '130000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.wifeNsbBank,
      memberId: SEED_IDS.wife,
      scope: 'WIFE',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
    });
    await insertDemoTx({
      date: '2026-10-25',
      type: 'INCOME',
      description: 'Wife (Sudu) Monthly Overtime (OT) Payment (~100k)',
      catName: 'Monthly Salary',
      subCatName: 'Overtime (OT) & Allowances (Wife ~100k)',
      origAmt: '100000.00',
      lkrAmt: '100000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.wifeNsbBank,
      memberId: SEED_IDS.wife,
      scope: 'WIFE',
      fundingSource: 'OVERTIME_INCOME',
      isEssential: true,
      isFixed: false,
      notes: 'Monthly OT received together with salary on 25th',
    });

    // 3) Example of Short-Term Borrowing from Parents/Friends when salary is delayed early in the month
    await insertDemoTx({
      date: '2026-10-08',
      type: 'INCOME',
      description: 'Short-Term Borrowed from Parents (Before 10th Rent Due)',
      catName: 'Borrowed from Friends / Parents',
      subCatName: 'Borrowed from Parents',
      origAmt: '25000.00',
      lkrAmt: '25000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'SHARED',
      fundingSource: 'BORROWED_FRIENDS_PARENTS',
      isEssential: true,
      isFixed: false,
      notes: 'Temporary funds borrowed before salary arrived on 11th',
    });

    // --- OCTOBER EXPENSES (Exact Loans, Rent, KIU Degree, Gemini, Apple, Groceries) ---
    await insertDemoTx({
      date: '2026-10-09',
      type: 'EXPENSE',
      description: 'Monthly Home Rent (Paid before 10th)',
      catName: 'Housing Expenses',
      subCatName: 'Monthly House Rent',
      origAmt: '40000.00',
      lkrAmt: '40000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'SHARED',
      fundingSource: 'BORROWED_FRIENDS_PARENTS',
      isEssential: true,
      isFixed: true,
      recId: recRentId,
    });

    const octLoan1TxId = await insertDemoTx({
      date: '2026-10-12',
      type: 'EXPENSE',
      description: 'Commercial Bank 25L Loan (#3793419) - Oct Installment',
      catName: 'Loans and Financial Commitments',
      subCatName: 'Personal Bank Loan 1',
      origAmt: '59000.00',
      lkrAmt: '59000.00',
      method: 'DIRECT_DEBIT',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'HUSBAND',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      loanId: loan1Id,
      recId: recLoan1Id,
    });
    await tx.query(
      `INSERT INTO loan_installments (
        id, loan_id, transaction_id, installment_number, due_date, paid_date,
        total_paid_lkr, principal_component_lkr, interest_component_lkr, fees_component_lkr,
        balance_after_payment, paid_by_user_id, status, notes
      ) VALUES ($1, $2, $3, 22, '2026-10-12', '2026-10-12', 59000.00, 35000.00, 24000.00, 0.00, 1980000.00, $4, 'PAID', 'Oct 2026 Installment (Ref 3793419)')`,
      [crypto.randomUUID(), loan1Id, octLoan1TxId, SEED_IDS.husband]
    );

    const octLoan2TxId = await insertDemoTx({
      date: '2026-10-25',
      type: 'EXPENSE',
      description: 'Sudu 10 Lakhs BOC Loan - Oct Installment',
      catName: 'Loans and Financial Commitments',
      subCatName: 'Personal Bank Loan 2',
      origAmt: '29000.00',
      lkrAmt: '29000.00',
      method: 'DIRECT_DEBIT',
      sourceAccId: SEED_IDS.accounts.wifeBocBank,
      memberId: SEED_IDS.wife,
      scope: 'WIFE',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      loanId: loan2Id,
      recId: recLoan2Id,
    });
    await tx.query(
      `INSERT INTO loan_installments (
        id, loan_id, transaction_id, installment_number, due_date, paid_date,
        total_paid_lkr, principal_component_lkr, interest_component_lkr, fees_component_lkr,
        balance_after_payment, paid_by_user_id, status, notes
      ) VALUES ($1, $2, $3, 22, '2026-10-25', '2026-10-25', 29000.00, 19500.00, 9500.00, 0.00, 740000.00, $4, 'PAID', 'Oct 2026 BOC Loan Installment')`,
      [crypto.randomUUID(), loan2Id, octLoan2TxId, SEED_IDS.wife]
    );

    const octBikeTxId = await insertDemoTx({
      date: '2026-10-15',
      type: 'EXPENSE',
      description: 'Motorcycle / Bike Finance - Oct Installment',
      catName: 'Loans and Financial Commitments',
      subCatName: 'Motorcycle / Bike Finance',
      origAmt: '13000.00',
      lkrAmt: '13000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandCommercialBank,
      memberId: SEED_IDS.husband,
      scope: 'HUSBAND',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      loanId: bikeLoanId,
      recId: recBikeId,
    });
    await tx.query(
      `INSERT INTO loan_installments (
        id, loan_id, transaction_id, installment_number, due_date, paid_date,
        total_paid_lkr, principal_component_lkr, interest_component_lkr, fees_component_lkr,
        balance_after_payment, paid_by_user_id, status, notes
      ) VALUES ($1, $2, $3, 24, '2026-10-15', '2026-10-15', 13000.00, 8200.00, 4800.00, 0.00, 312000.00, $4, 'PAID', 'Oct 2026 Bike Finance')`,
      [crypto.randomUUID(), bikeLoanId, octBikeTxId, SEED_IDS.husband]
    );

    // KIU Degree Payment (20,000 till March 2027)
    await insertDemoTx({
      date: '2026-10-26',
      type: 'EXPENSE',
      description: 'KIU Degree Monthly Payment - Wife (Till Mar 2027)',
      catName: 'Personal and Other Expenses',
      subCatName: 'KIU Degree Payment (Wife)',
      origAmt: '20000.00',
      lkrAmt: '20000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.wifeNsbBank,
      memberId: SEED_IDS.wife,
      scope: 'WIFE',
      fundingSource: 'OVERTIME_INCOME',
      isEssential: true,
      isFixed: true,
      recId: recKiuId,
    });

    // Subscriptions: Gemini AI (1500 first 3mo promo) & Apple 200GB ($3)
    await insertDemoTx({
      date: '2026-10-18',
      type: 'EXPENSE',
      description: 'Google Gemini AI (Promo Rate - First 3 Months)',
      catName: 'Digital Subscriptions and Technology',
      subCatName: 'Google Gemini',
      origAmt: '1500.00',
      origCurr: 'LKR',
      fxRate: '1.000000',
      lkrAmt: '1500.00',
      method: 'CREDIT_CARD',
      sourceAccId: SEED_IDS.accounts.wifeHnbCreditCard9005,
      memberId: SEED_IDS.wife,
      scope: 'SHARED',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: true,
      subId: subGeminiId,
    });

    await insertDemoTx({
      date: '2026-10-25',
      type: 'EXPENSE',
      description: 'Apple iCloud+ 200GB Subscription (USD 3.00)',
      catName: 'Digital Subscriptions and Technology',
      subCatName: 'Apple Services',
      origAmt: '3.00',
      origCurr: 'USD',
      fxRate: '305.000000',
      lkrAmt: '915.00',
      method: 'CREDIT_CARD',
      sourceAccId: SEED_IDS.accounts.wifeHnbCreditCard9005,
      memberId: SEED_IDS.wife,
      scope: 'SHARED',
      fundingSource: 'REGULAR_INCOME',
      isEssential: false,
      isFixed: true,
      subId: subAppleId,
    });

    // Groceries paid with Commercial Card ending 1143
    await insertDemoTx({
      date: '2026-10-14',
      type: 'EXPENSE',
      description: 'Keells Super - Household Groceries (Card •••• 1143)',
      catName: 'Food and Household Consumables',
      subCatName: 'General Grocery Items',
      origAmt: '24500.00',
      lkrAmt: '24500.00',
      method: 'DEBIT_CARD',
      sourceAccId: SEED_IDS.accounts.husbandComCard1143,
      memberId: SEED_IDS.husband,
      scope: 'SHARED',
      fundingSource: 'REGULAR_INCOME',
      isEssential: true,
      isFixed: false,
      items: [
        { subCatName: 'Vegetables', itemName: 'Fresh Vegetables', qty: '1', amountLkr: '5200.00' },
        { subCatName: 'Meat (Chicken, Beef, Pork, etc.)', itemName: 'Chicken & Meat', qty: '1', amountLkr: '6800.00' },
        { subCatName: 'Fish and Seafood', itemName: 'Fish & Prawns', qty: '1', amountLkr: '5500.00' },
        { subCatName: 'Rice', itemName: 'Keeri Samba 10kg', qty: '1', amountLkr: '2900.00' },
        { subCatName: 'Milk and Dairy Products', itemName: 'Milk & Dairy', qty: '1', amountLkr: '4100.00' },
      ],
    });

    // Expense funded from Previous Savings (Ituru karapu salli walin wiyadam karapu eka)
    await insertDemoTx({
      date: '2026-10-22',
      type: 'EXPENSE',
      description: 'Unexpected Medical & Household Purchase (From Saved Money)',
      catName: 'Personal and Other Expenses',
      subCatName: 'Medical Expenses',
      origAmt: '14000.00',
      lkrAmt: '14000.00',
      method: 'BANK_TRANSFER',
      sourceAccId: SEED_IDS.accounts.husbandNsbBank,
      memberId: SEED_IDS.husband,
      scope: 'SHARED',
      fundingSource: 'PREVIOUS_SAVINGS',
      isEssential: true,
      isFixed: false,
      notes: 'Paid using previously saved money in NSB Savings Account',
    });

    // 9. Seed Monthly Budgets for Oct 2026 & Nov 2026
    const foodCatId = catMap.get('Food and Household Consumables')!;
    const entCatId = catMap.get('Entertainment and Leisure')!;

    const budgetDefs = [
      { catId: foodCatId, subId: null, amount: '45000.00' },
      {
        catId: foodCatId,
        subId: subCatMap.get('Food and Household Consumables::Vegetables')!,
        amount: '10000.00',
      },
      {
        catId: foodCatId,
        subId: subCatMap.get('Food and Household Consumables::Meat (Chicken, Beef, Pork, etc.)')!,
        amount: '15000.00',
      },
      {
        catId: persCatId,
        subId: subCatMap.get('Personal and Other Expenses::KIU Degree Payment (Wife)')!,
        amount: '20000.00',
      },
      { catId: entCatId, subId: null, amount: '10000.00' },
      { catId: digCatId, subId: null, amount: '10000.00' },
    ];

    for (const [year, month] of [
      [2026, 10],
      [2026, 11],
    ]) {
      for (const b of budgetDefs) {
        await tx.query(
          `INSERT INTO budgets (
            id, household_id, year, month, category_id, subcategory_id, member_scope, allocated_amount_lkr, alert_threshold_pct
          ) VALUES ($1, $2, $3, $4, $5, $6, 'HOUSEHOLD', $7, 80)`,
          [crypto.randomUUID(), SEED_IDS.household, year, month, b.catId, b.subId, b.amount]
        );
      }
    }

    // 10. Seed Savings Goals & Contributions
    const emergencyGoalId = crypto.randomUUID();
    const loanSettlementGoalId = crypto.randomUUID();

    await tx.query(
      `INSERT INTO savings_goals (
        id, household_id, owner_scope, owner_user_id, name,
        target_amount_lkr, current_allocated_lkr, monthly_target_lkr, target_date,
        linked_savings_account_id, status, notes
      ) VALUES
      ($1, $3, 'HOUSEHOLD', NULL, 'Household Emergency & Buffer Fund (NSB)',
       1000000.00, 450000.00, 40000.00, '2027-12-31', $5, 'ACTIVE', 'Buffer for salary delays & emergency needs'),
      ($2, $3, 'WIFE', $4, 'Sudu BOC Loan Early Settlement / Gold Reserve',
       500000.00, 140000.00, 30000.00, '2027-08-31', $6, 'ACTIVE', 'Funded from Wife monthly OT income')`,
      [
        emergencyGoalId,
        loanSettlementGoalId,
        SEED_IDS.household,
        SEED_IDS.wife,
        SEED_IDS.accounts.husbandNsbBank,
        SEED_IDS.accounts.wifeNsbBank,
      ]
    );

    await tx.query(
      `INSERT INTO savings_contributions (
        id, savings_goal_id, transaction_id, contributed_by_user_id, contribution_date, amount_lkr, type, notes
      ) VALUES
      ($1, $3, NULL, $5, '2026-10-26', 40000.00, 'DEPOSIT', 'Oct 2026 Emergency Fund allocation'),
      ($2, $4, NULL, $6, '2026-10-26', 30000.00, 'DEPOSIT', 'Oct 2026 allocation from Wife OT')`,
      [
        crypto.randomUUID(),
        crypto.randomUUID(),
        emergencyGoalId,
        loanSettlementGoalId,
        SEED_IDS.husband,
        SEED_IDS.wife,
      ]
    );
  });
}

export async function clearDemoData(householdId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.query('DELETE FROM savings_contributions WHERE savings_goal_id IN (SELECT id FROM savings_goals WHERE household_id = $1)', [householdId]);
    await tx.query('DELETE FROM savings_goals WHERE household_id = $1', [householdId]);
    await tx.query('DELETE FROM budgets WHERE household_id = $1', [householdId]);
    await tx.query('DELETE FROM loan_installments WHERE loan_id IN (SELECT id FROM loans WHERE household_id = $1)', [householdId]);
    await tx.query('DELETE FROM transactions WHERE household_id = $1', [householdId]);
    await tx.query('DELETE FROM recurring_schedules WHERE household_id = $1', [householdId]);
    await tx.query('DELETE FROM subscriptions WHERE household_id = $1', [householdId]);
    await tx.query('DELETE FROM loans WHERE household_id = $1', [householdId]);
    await tx.query('UPDATE accounts SET current_balance = opening_balance WHERE household_id = $1', [householdId]);
  });
}
