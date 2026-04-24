/**
 * Compute the suggested top-up amount for a wallet portal.
 *
 * `usualTopUp` is the coach-set default for this wallet. When unset (null),
 * the caller passes null and no suggestion is computed.
 *
 * Returns null when there's no anchor (coach hasn't set one) or when the
 * suggestion rounds to 0 (wallet already at or above usual).
 *
 * Examples:
 *   usual=500, balance=23   → { usual: 500, amount: 477 }
 *   usual=500, balance=-30  → { usual: 500, amount: 530 }
 *   usual=500, balance=500  → null (already topped up)
 *   usual=500, balance=600  → null (over-topped-up)
 *   usual=null, balance=20  → null (no usual set)
 */
export function getSuggestedTopUp(
  usualTopUp: number | null,
  balance: number,
): { usual: number; amount: number } | null {
  if (usualTopUp == null || usualTopUp <= 0) return null;
  const amount = Math.max(Math.round(usualTopUp - balance), 0);
  if (amount === 0) return null;
  return { usual: usualTopUp, amount };
}
