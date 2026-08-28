import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard against rendering raw cents.
 *
 * Money is stored in cents, so interpolating a money value directly — `RM {total}`
 * — prints 10000 where the user expects RM 100. The type system can't catch this:
 * cents and ringgit are both `number`. This scan does.
 *
 * It fired for real: the cents migration converted every `.toFixed(0)` display
 * site but missed the sites that interpolated a bare value, because with whole
 * ringgit prices those had always rendered correctly.
 */

// Landing-page marketing copy — plain ringgit figures, never cents.
const ALLOWED = [
  'src/app/_components/PricingSection.tsx',
  'src/app/_components/OverviewPreview.tsx',
];

const FORMATTERS = ['formatCents', 'formatCentsGrouped', 'formatRM', 'centsToInputValue'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('money rendering', () => {
  it('never interpolates a money value without a formatter', () => {
    const offenders: string[] = [];

    for (const file of [...walk('src/app'), ...walk('src/components')]) {
      if (ALLOWED.includes(file)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // `RM {expr}` in JSX or `RM ${expr}` in a template literal. JSX often
        // wraps, so the expression can land on the following line.
        const m = line.match(/RM\s*(?:\{' '\}\s*)?\$?\{([^}]*)/);
        if (!m) return;
        const expr = m[1] + (lines[i + 1] ?? '');
        if (FORMATTERS.some((fn) => expr.includes(fn))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe('cents into input state', () => {
  it('never stringifies a cents value directly — inputs are ringgit-denominated', () => {
    // String(xCents) puts cents into a field that will be re-parsed as ringgit:
    // the RM 500 preset filled the top-up box with "50000". Converting cents to
    // input text must go through centsToInputValue (or formatCents for display).
    const offenders: string[] = [];
    for (const file of [...walk('src/app'), ...walk('src/components')]) {
      if (ALLOWED.includes(file)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/String\([^)]*[Cc]ents/.test(line)) {
            offenders.push(`${file}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
