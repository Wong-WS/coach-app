export type Option = { value: string; label: string };

export type OptionGroup = {
  label: string;
  options: Option[];
};

/**
 * Narrow grouped combobox options to those matching `query`.
 *
 * Case-insensitive substring match on the option label. Groups left with no
 * matches are dropped so the panel never shows a bare header. An empty or
 * whitespace-only query returns the groups untouched.
 */
export function filterOptionGroups(groups: OptionGroup[], query: string): OptionGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  const result: OptionGroup[] = [];
  for (const g of groups) {
    const options = g.options.filter((o) => o.label.toLowerCase().includes(q));
    if (options.length > 0) result.push({ label: g.label, options });
  }
  return result;
}
