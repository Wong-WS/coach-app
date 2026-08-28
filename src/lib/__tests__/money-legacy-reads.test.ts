import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards for two bugs the cents migration introduced, both caused by a global
 * rename that couldn't tell intent from text.
 *
 * 1. Legacy fallbacks that read the NEW field on both sides.
 *    `centsFromLegacy(d.priceCents, d.priceCents)` is a no-op: when the new
 *    field is absent it falls back to the same absent field and yields 0.
 *    The rename rewrote `d.price` -> `d.priceCents` inside the fallback,
 *    silently disabling every safety net.
 *
 * 2. Shorthand writes to the OLD field name.
 *    `{ studentPrices, ... }` writes cents into the ringgit-denominated field.
 *    An audit that grepped for `name:` missed these because shorthand has no
 *    colon.
 */

const READ_FILES = ['src/hooks/useCoachData.ts', 'src/lib/portal-data.ts'];

const WRITE_FILES = [
  'src/hooks/useCoachData.ts',
  'src/lib/portal-data.ts',
  'src/app/dashboard/page.tsx',
  'src/app/dashboard/payments/page.tsx',
  'src/app/dashboard/students/page.tsx',
  'src/app/dashboard/_components/AddLessonModal.tsx',
  'src/app/dashboard/_components/EditClassModal.tsx',
];

const LEGACY_NAMES = [
  'studentPrices',
  'newStudentPrices',
  'balanceAfter',
  'balance',
  'amount',
  'price',
  'usualTopUp',
];

describe('legacy money reads', () => {
  it('never falls back to the same field it is guarding', () => {
    const offenders: string[] = [];
    for (const file of READ_FILES) {
      // Collapse whitespace, and neutralise empty call parens (`d.data()`)
      // so the argument regexes below aren't fooled by nested brackets.
      const src = readFileSync(file, 'utf8').replace(/\s+/g, ' ').replace(/\(\)/g, '·');

      // centsFromLegacy(a, b) where a and b name the same field
      for (const m of src.matchAll(/centsFromLegacy\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g)) {
        const a = m[1].replace(/ as [^,)]+/g, '').trim();
        const b = m[2].replace(/ as [^,)]+/g, '').trim();
        if (a === b) offenders.push(`${file}: centsFromLegacy(${a}, ${b})`);
      }

      // X ?? mapRmToCents(X)
      for (const m of src.matchAll(/([\w.()]+?)\s*\?\?\s*mapRmToCents\(\s*([\w.()]+?)\s*(?:\?\?|\))/g)) {
        if (m[1].trim() === m[2].trim()) {
          offenders.push(`${file}: ${m[1]} ?? mapRmToCents(${m[2]})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('money writes', () => {
  it('never writes a money field by its pre-migration name', () => {
    const offenders: string[] = [];
    for (const file of WRITE_FILES) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const trimmed = line.trim();
          for (const name of LEGACY_NAMES) {
            // Shorthand property: `studentPrices,` on its own in an object literal.
            if (trimmed === `${name},`) {
              offenders.push(`${file}:${i + 1}  shorthand write of legacy field "${name}"`);
            }
            // Explicit key: `studentPrices: value` — at line start OR inside an
            // inline object literal (`{ balance: ... }`, `, balance: ...`). The
            // line-start-only check missed the delete-transaction handler.
            if (new RegExp(`(^|[{,(]\\s*)${name}\\s*:`).test(trimmed)) {
              offenders.push(`${file}:${i + 1}  writes legacy field "${name}"`);
            }
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
