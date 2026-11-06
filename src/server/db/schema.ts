export const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  base_currency VARCHAR(10) NOT NULL DEFAULT 'LKR',
  locale VARCHAR(20) NOT NULL DEFAULT 'en-LK',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  member_role VARCHAR(20) NOT NULL CHECK (member_role IN ('HUSBAND', 'WIFE')),
  avatar_color VARCHAR(20) NOT NULL DEFAULT '#2563eb',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  default_essentiality BOOLEAN NOT NULL DEFAULT TRUE,
  is_fixed_default BOOLEAN NOT NULL DEFAULT FALSE,
  icon VARCHAR(50) NOT NULL DEFAULT 'Tag',
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  is_system_seeded BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_household ON categories(household_id, type, parent_id);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ownership_type VARCHAR(20) NOT NULL CHECK (ownership_type IN ('HUSBAND', 'WIFE', 'JOINT')),
  name VARCHAR(120) NOT NULL,
  account_type VARCHAR(30) NOT NULL CHECK (account_type IN (
    'BANK_SAVINGS', 'BANK_CURRENT', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'DIGITAL_WALLET', 'OTHER'
  )),
  bank_name VARCHAR(120),
  card_last_four VARCHAR(15),
  linked_parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'LKR',
  opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  opening_balance_date DATE DEFAULT '2026-11-01',
  current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(15, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_household ON accounts(household_id, status);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ownership_type VARCHAR(20) NOT NULL DEFAULT 'HUSBAND' CHECK (ownership_type IN ('HUSBAND', 'WIFE', 'JOINT')),
  loan_name VARCHAR(120) NOT NULL,
  loan_reference_no VARCHAR(60),
  loan_type VARCHAR(30) NOT NULL CHECK (loan_type IN ('PERSONAL_LOAN', 'VEHICLE_FINANCE', 'MORTGAGE', 'OTHER')),
  lender_name VARCHAR(120) NOT NULL,
  interest_calculation_method VARCHAR(30) NOT NULL DEFAULT 'REDUCING_BALANCE' CHECK (
    interest_calculation_method IN ('REDUCING_BALANCE', 'FLAT_RATE', 'CUSTOM_MANUAL')
  ),
  original_principal NUMERIC(15, 2) NOT NULL CHECK (original_principal > 0),
  current_outstanding_balance NUMERIC(15, 2) NOT NULL CHECK (current_outstanding_balance >= 0),
  annual_interest_rate NUMERIC(6, 3) NOT NULL DEFAULT 0.000,
  monthly_installment NUMERIC(15, 2) NOT NULL CHECK (monthly_installment > 0),
  payment_due_day INT NOT NULL CHECK (payment_due_day BETWEEN 1 AND 31),
  start_date DATE NOT NULL,
  expected_completion_date DATE NOT NULL,
  total_installments INT NOT NULL CHECK (total_installments >= 1),
  remaining_installments INT NOT NULL CHECK (remaining_installments >= 0),
  default_payment_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAID_OFF', 'CLOSED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  used_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  member_scope VARCHAR(20) NOT NULL DEFAULT 'SHARED' CHECK (member_scope IN ('HUSBAND', 'WIFE', 'SHARED')),
  name VARCHAR(120) NOT NULL,
  provider VARCHAR(120) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  billing_amount NUMERIC(15, 2) NOT NULL CHECK (billing_amount > 0),
  billing_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  estimated_lkr_amount NUMERIC(15, 2) NOT NULL CHECK (estimated_lkr_amount > 0),
  billing_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (
    billing_frequency IN ('MONTHLY', 'YEARLY', 'QUARTERLY', 'WEEKLY', 'CUSTOM')
  ),
  next_billing_date DATE NOT NULL,
  default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'CREDIT_CARD',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
  last_reviewed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL DEFAULT 'EXPENSE' CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  assigned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  default_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
  frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (
    frequency IN ('MONTHLY', 'YEARLY', 'QUARTERLY', 'WEEKLY', 'CUSTOM')
  ),
  due_day_of_month INT CHECK (due_day_of_month BETWEEN 1 AND 31),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  expected_amount_lkr NUMERIC(15, 2) NOT NULL CHECK (expected_amount_lkr > 0),
  is_variable_amount BOOLEAN NOT NULL DEFAULT FALSE,
  is_essential BOOLEAN NOT NULL DEFAULT TRUE,
  is_fixed BOOLEAN NOT NULL DEFAULT TRUE,
  linked_loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  linked_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  reminder_days_before INT NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
  description VARCHAR(255) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  original_amount NUMERIC(15, 2) NOT NULL CHECK (original_amount > 0),
  original_currency VARCHAR(10) NOT NULL DEFAULT 'LKR',
  exchange_rate NUMERIC(15, 6) NOT NULL DEFAULT 1.000000,
  actual_lkr_amount NUMERIC(15, 2) NOT NULL CHECK (actual_lkr_amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN (
    'BANK_TRANSFER', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'DIGITAL_WALLET', 'DIRECT_DEBIT', 'OTHER'
  )),
  source_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  paid_or_received_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  household_member_scope VARCHAR(20) NOT NULL DEFAULT 'SHARED' CHECK (
    household_member_scope IN ('HUSBAND', 'WIFE', 'SHARED')
  ),
  funding_source VARCHAR(40) NOT NULL DEFAULT 'REGULAR_INCOME',
  transfer_fee_lkr NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  transfer_fee_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  is_essential BOOLEAN NOT NULL DEFAULT TRUE,
  is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_schedule_id UUID REFERENCES recurring_schedules(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  utility_billing_period_start DATE,
  utility_billing_period_end DATE,
  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions(household_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(household_id, category_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(household_id, paid_or_received_by_user_id);

CREATE TABLE IF NOT EXISTS transaction_items (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  item_name VARCHAR(160) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
  amount_lkr NUMERIC(15, 2) NOT NULL CHECK (amount_lkr > 0)
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_tx ON transaction_items(transaction_id);

CREATE TABLE IF NOT EXISTS account_reconciliations (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reconciled_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reconciliation_date DATE NOT NULL,
  recorded_balance NUMERIC(15, 2) NOT NULL,
  actual_statement_balance NUMERIC(15, 2) NOT NULL,
  discrepancy_amount NUMERIC(15, 2) NOT NULL,
  adjustment_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_installments (
  id UUID PRIMARY KEY,
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  transaction_id UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  installment_number INT NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  total_paid_lkr NUMERIC(15, 2) NOT NULL CHECK (total_paid_lkr >= 0),
  principal_component_lkr NUMERIC(15, 2) NOT NULL CHECK (principal_component_lkr >= 0),
  interest_component_lkr NUMERIC(15, 2) NOT NULL CHECK (interest_component_lkr >= 0),
  fees_component_lkr NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (fees_component_lkr >= 0),
  balance_after_payment NUMERIC(15, 2) NOT NULL CHECK (balance_after_payment >= 0),
  paid_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PAID' CHECK (status IN ('SCHEDULED', 'PAID', 'OVERDUE')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON loan_installments(loan_id, installment_number DESC);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  member_scope VARCHAR(20) NOT NULL DEFAULT 'HOUSEHOLD' CHECK (
    member_scope IN ('HOUSEHOLD', 'HUSBAND', 'WIFE')
  ),
  allocated_amount_lkr NUMERIC(15, 2) NOT NULL CHECK (allocated_amount_lkr > 0),
  alert_threshold_pct INT NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 10 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(household_id, year, month);

CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_scope VARCHAR(20) NOT NULL DEFAULT 'HOUSEHOLD' CHECK (
    owner_scope IN ('HOUSEHOLD', 'HUSBAND', 'WIFE')
  ),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(120) NOT NULL,
  target_amount_lkr NUMERIC(15, 2) NOT NULL CHECK (target_amount_lkr > 0),
  current_allocated_lkr NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  monthly_target_lkr NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  target_date DATE,
  linked_savings_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'PAUSED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id UUID PRIMARY KEY,
  savings_goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  contributed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contribution_date DATE NOT NULL,
  amount_lkr NUMERIC(15, 2) NOT NULL CHECK (amount_lkr > 0),
  type VARCHAR(20) NOT NULL DEFAULT 'DEPOSIT' CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_contrib_date ON savings_contributions(contribution_date DESC);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(15);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_balance_date DATE DEFAULT '2026-11-01';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_reference_no VARCHAR(60);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS funding_source VARCHAR(40) NOT NULL DEFAULT 'REGULAR_INCOME';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_fee_lkr NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_fee_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE;
`;

