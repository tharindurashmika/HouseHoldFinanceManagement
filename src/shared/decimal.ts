import Decimal from 'decimal.js';

// Configure Decimal for financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type MoneyValue = string | number | Decimal;

/**
 * Safely converts a string, number, or Decimal into a Decimal instance.
 * Defaults null/undefined/empty string to 0.
 */
export function toDecimal(value: MoneyValue | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(String(value).trim());
}

/**
 * Formats a Decimal or numeric value to a canonical 2-decimal string ("15000.00")
 * suitable for PostgreSQL NUMERIC(15,2) storage and JSON transport.
 */
export function toMoneyString(value: MoneyValue | null | undefined): string {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Converts a Decimal or string to a 2-decimal number for chart libraries only.
 * Never use the returned number for intermediate financial arithmetic.
 */
export function toMoneyNumber(value: MoneyValue | null | undefined): number {
  return Number(toMoneyString(value));
}

export function addMoney(...values: (MoneyValue | null | undefined)[]): string {
  let sum = new Decimal(0);
  for (const v of values) {
    sum = sum.plus(toDecimal(v));
  }
  return toMoneyString(sum);
}

export function subMoney(a: MoneyValue | null | undefined, b: MoneyValue | null | undefined): string {
  return toMoneyString(toDecimal(a).minus(toDecimal(b)));
}

export function mulMoney(a: MoneyValue | null | undefined, factor: MoneyValue | null | undefined): string {
  return toMoneyString(toDecimal(a).times(toDecimal(factor)));
}

export function divMoney(a: MoneyValue | null | undefined, divisor: MoneyValue | null | undefined): string {
  const d = toDecimal(divisor);
  if (d.isZero()) {
    return '0.00';
  }
  return toMoneyString(toDecimal(a).dividedBy(d));
}

/**
 * Calculates (part / whole) * 100 rounded to 2 decimal places.
 */
export function pctOf(part: MoneyValue | null | undefined, whole: MoneyValue | null | undefined): number {
  const w = toDecimal(whole);
  if (w.isZero()) {
    return 0;
  }
  return Number(
    toDecimal(part)
      .dividedBy(w)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2)
  );
}

export function compareMoney(a: MoneyValue | null | undefined, b: MoneyValue | null | undefined): number {
  return toDecimal(a).comparedTo(toDecimal(b));
}

export function isPositiveMoney(value: MoneyValue | null | undefined): boolean {
  return toDecimal(value).greaterThan(0);
}

export function isNegativeMoney(value: MoneyValue | null | undefined): boolean {
  return toDecimal(value).lessThan(0);
}

/**
 * Formats an amount in Sri Lankan Rupees (LKR), e.g., "LKR 15,000.00"
 */
export function formatLKR(
  value: MoneyValue | null | undefined,
  options?: { showDecimals?: boolean; showSign?: boolean; currencyPrefix?: string }
): string {
  const dec = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const isNeg = dec.isNegative();
  const absVal = dec.abs();
  const showDecimals = options?.showDecimals ?? true;
  const prefix = options?.currencyPrefix ?? 'LKR ';

  const fixed = showDecimals ? absVal.toFixed(2) : absVal.toDecimalPlaces(0).toFixed(0);
  const [intPart, fracPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedNum = showDecimals && fracPart !== undefined ? `${formattedInt}.${fracPart}` : formattedInt;

  if (isNeg) {
    return `-${prefix}${formattedNum}`;
  }
  if (options?.showSign && dec.greaterThan(0)) {
    return `+${prefix}${formattedNum}`;
  }
  return `${prefix}${formattedNum}`;
}

/**
 * Formats an amount in any currency (e.g., USD 20.00 or LKR 6,100.00)
 */
export function formatCurrency(value: MoneyValue | null | undefined, currency = 'LKR'): string {
  return formatLKR(value, { currencyPrefix: `${currency.toUpperCase()} ` });
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an ISO date string ("YYYY-MM-DD" or ISO timestamp) into Sri Lanka format: "DD MMM YYYY"
 * Example: "2026-11-03" -> "03 Nov 2026"
 */
export function formatDateSL(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  let year: number;
  let monthIdx: number;
  let day: number;

  if (typeof dateInput === 'string') {
    const clean = dateInput.slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      year = Number(parts[0]);
      monthIdx = Number(parts[1]) - 1;
      day = Number(parts[2]);
      if (!Number.isNaN(year) && monthIdx >= 0 && monthIdx < 12 && !Number.isNaN(day)) {
        const dd = String(day).padStart(2, '0');
        return `${dd} ${MONTHS_SHORT[monthIdx]} ${year}`;
      }
    }
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput);
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTHS_SHORT[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd} ${mmm} ${yyyy}`;
}

/**
 * Formats "YYYY-MM" into "MMM YYYY" (e.g. "Nov 2026")
 */
export function formatMonthYearSL(year: number, month: number): string {
  const mmm = MONTHS_SHORT[(month - 1 + 12) % 12] || 'Jan';
  return `${mmm} ${year}`;
}

