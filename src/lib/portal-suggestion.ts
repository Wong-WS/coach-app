/**
 * Compute the suggested top-up amount for a wallet portal.
 *
 * Strategy: anchor on the parent's most recent top-up amount ("usual"), then
 * suggest the difference needed to get back to that level. Matches the
 * "parent usually tops up RM 500" mental model.
 *
 * Returns null when there's no signal to anchor on (no prior top-ups) or when
 * the suggestion rounds to 0 (wallet already at or above usual).
 *
 * Examples:
 *   usual=500, balance=23   → { usual: 500, amount: 477 }
 *   usual=500, balance=-30  → { usual: 500, amount: 530 }
 *   usual=500, balance=500  → null (already topped up)
 *   usual=500, balance=600  → null (over-topped-up)
 *   usual=null, balance=20  → null (no prior top-up signal)
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
