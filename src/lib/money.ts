/**
 * Money is stored as an integer number of cents everywhere — never as a float.
 * RM 150.50 is 15050. Integers are exact, so balances can never drift the way
 * repeated float arithmetic does.
 *
 * Field names carry the unit (`balanceCents`, `priceCents`, …) so a document
 * still holding the old ringgit-denominated `balance`/`price` is recognisably
 * un-migrated.
 */

/**
 * Format cents for display, without a currency prefix.
 * Shows decimals only when there are cents: 20000 -> "200", 15050 -> "150.50".
 * Callers add "RM " themselves, and most call Math.abs first to handle the sign.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const ringgit = Math.floor(abs / 100);
  const rest = abs % 100;
  if (rest === 0) return `${sign}${ringgit}`;
  return `${sign}${ringgit}.${String(rest).padStart(2, '0')}`;
}

/**
 * Parse typed input into cents. Returns null for blank or non-numeric input so
 * callers can distinguish "nothing entered" from a genuine zero.
 *
 * Rounds to the nearest cent, and does so via the decimal string rather than
 * `value * 100` — 1.15 * 100 is 114.99999999999999 in IEEE 754, which would
 * truncate to the wrong cent.
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^-?\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return null;

  const negative = trimmed.startsWith('-');
  const [whole = '0', frac = ''] = trimmed.replace('-', '').split('.');
  // Take three fractional digits so the third can round the second.
  const padded = (frac + '000').slice(0, 3);
  const thousandths = Number(whole) * 1000 + Number(padded);
  const cents = Math.round(thousandths / 10);
  return negative ? -cents : cents;
}

/**
 * Render cents for a text/number input. Zero becomes an empty string so the
 * field shows its placeholder rather than a stray 0.
 */
export function centsToInputValue(cents: number): string {
  if (cents === 0) return '';
  return formatCents(cents);
}

/**
 * Convert a legacy ringgit float to cents. Used by the migration and when
 * reading any document that has not been migrated yet.
 */
export function rmToCents(rm: number): number {
  return Math.round(rm * 100);
}

/**
 * Read a money field that may not have been migrated yet.
 *
 * Writes always target the `*Cents` field, but a document written before the
 * migration ran still carries the ringgit-denominated one. Preferring cents and
 * falling back keeps the app correct regardless of deploy/migration ordering.
 */
export function centsFromLegacy(cents: number | undefined, rm: number | undefined): number {
  if (typeof cents === 'number') return cents;
  if (typeof rm === 'number') return rmToCents(rm);
  return 0;
}

/** Same idea for the per-student price maps. */
export function mapRmToCents(map: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) out[k] = rmToCents(v);
  return out;
}

/**
 * Same as formatCents, with thousands separators — for totals and summary
 * figures where the number can get long. Inline amounts use formatCents.
 */
export function formatCentsGrouped(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const ringgit = Math.floor(abs / 100).toLocaleString('en-MY');
  const rest = abs % 100;
  if (rest === 0) return `${sign}${ringgit}`;
  return `${sign}${ringgit}.${String(rest).padStart(2, '0')}`;
}
