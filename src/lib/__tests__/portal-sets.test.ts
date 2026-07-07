import { describe, it, expect } from 'vitest';
import { computeLessonSets, type SetInputTxn } from '@/lib/portal-sets';
import type { WalletTransactionType } from '@/types';

let seq = 0;
function txn(
  type: WalletTransactionType,
  amount: number,
  balanceAfter: number,
  date: string,
): SetInputTxn {
  seq += 1;
  return { type, amount, balanceAfter, date, createdAt: seq };
}

describe('computeLessonSets', () => {
  it('returns an empty sets result for no transactions', () => {
    const r = computeLessonSets([], 80);
    expect(r.mode).toBe('sets');
    expect(r.current).toBeNull();
    expect(r.earlier).toEqual([]);
  });

  it('sizes the current set from the top-up and numbers lessons oldest-first', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 80, 640, '2026-07-11'),
        txn('charge', 80, 560, '2026-07-16'),
      ],
      80,
    );
    expect(r.current).not.toBeNull();
    expect(r.current!.topUp).toEqual({ date: '2026-07-06', amount: 800 });
    expect(r.current!.slots).toBe(10);
    expect(r.current!.done).toBe(3);
    expect(r.current!.left).toBe(7);
    expect(r.current!.lessons).toEqual([
      { n: 1, date: '2026-07-09', price: 80 },
      { n: 2, date: '2026-07-11', price: 80 },
      { n: 3, date: '2026-07-16', price: 80 },
    ]);
    expect(r.current!.reconciliation).toEqual({ kind: 'none', amount: 0 });
  });

  it('flags a pricier lesson as owed without changing the count', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 100, 620, '2026-07-11'),
        txn('charge', 80, 540, '2026-07-16'),
      ],
      80,
    );
    expect(r.current!.done).toBe(3);
    expect(r.current!.left).toBe(7);
    expect(r.current!.lessons[1]).toEqual({ n: 2, date: '2026-07-11', price: 100 });
    expect(r.current!.reconciliation).toEqual({ kind: 'owed', amount: 20 });
  });

  it('flags a cheaper lesson as credit', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 60, 740, '2026-07-09'),
      ],
      80,
    );
    expect(r.current!.done).toBe(1);
    expect(r.current!.left).toBe(9);
    expect(r.current!.reconciliation).toEqual({ kind: 'credit', amount: 20 });
  });

  it('starts a new set when a top-up refills a drained wallet', () => {
    seq = 0;
    const txns: SetInputTxn[] = [txn('top-up', 800, 800, '2026-01-01')];
    let bal = 800;
    for (let i = 0; i < 10; i++) {
      bal -= 80;
      txns.push(txn('charge', 80, bal, `2026-02-0${(i % 9) + 1}`));
    }
    txns.push(txn('top-up', 800, 800, '2026-06-06'));
    const r = computeLessonSets(txns, 80);
    expect(r.earlier).toHaveLength(1);
    expect(r.earlier[0].done).toBe(10);
    expect(r.earlier[0].left).toBe(0);
    expect(r.earlier[0].reconciliation.kind).toBe('none');
    expect(r.current!.topUp).toEqual({ date: '2026-06-06', amount: 800 });
    expect(r.current!.done).toBe(0);
    expect(r.current!.left).toBe(10);
  });

  it('extends the set (no reset) when paying in advance while a lesson remains', () => {
    seq = 0;
    const txns: SetInputTxn[] = [txn('top-up', 800, 800, '2026-06-06')];
    let bal = 800;
    for (let i = 0; i < 9; i++) {
      bal -= 80;
      txns.push(txn('charge', 80, bal, `2026-06-1${i}`));
    }
    // balance is now 80 (>= rate) → advance top-up absorbs into the same set
    txns.push(txn('top-up', 800, 880, '2026-06-30'));
    const r = computeLessonSets(txns, 80);
    expect(r.earlier).toHaveLength(0);
    expect(r.current!.topUp).toEqual({ date: '2026-06-06', amount: 1600 });
    expect(r.current!.done).toBe(9);
    expect(r.current!.slots).toBe(20);
    expect(r.current!.left).toBe(11);
    expect(r.current!.reconciliation).toEqual({ kind: 'none', amount: 0 });
  });

  it('ignores refunds and adjustments for set structure but reflects them in balance', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('adjustment', 20, 740, '2026-07-10'),
      ],
      80,
    );
    expect(r.current!.done).toBe(1);
    expect(r.current!.left).toBe(9);
    // endingBalance 740, left*rate 720 → +20 credit
    expect(r.current!.reconciliation).toEqual({ kind: 'credit', amount: 20 });
  });

  it('falls back to a flat newest-first list when forceFlat is set', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-06'),
        txn('charge', 80, 720, '2026-07-09'),
        txn('charge', 80, 640, '2026-07-11'),
      ],
      80,
      true,
    );
    expect(r.mode).toBe('flat');
    expect(r.current).toBeNull();
    expect(r.flat).toEqual([
      { date: '2026-07-11', price: 80, balanceAfter: 640 },
      { date: '2026-07-09', price: 80, balanceAfter: 720 },
    ]);
  });

  it('falls back to flat when rate is unknown', () => {
    seq = 0;
    const r = computeLessonSets([txn('charge', 80, -80, '2026-07-09')], 0);
    expect(r.mode).toBe('flat');
  });

  it('treats charges before any top-up as a legacy set with no blank slots', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('charge', 80, -80, '2026-07-09'),
        txn('charge', 80, -160, '2026-07-11'),
      ],
      80,
    );
    expect(r.mode).toBe('sets');
    expect(r.current).not.toBeNull();
    expect(r.current!.topUp).toBeNull();
    expect(r.current!.done).toBe(2);
    expect(r.current!.slots).toBe(2); // legacy = no blank slots
    expect(r.current!.left).toBe(0);
    // endingBalance -160, left*rate 0 → raw -160 → owed 160
    expect(r.current!.reconciliation).toEqual({ kind: 'owed', amount: 160 });
  });

  it('moves the legacy set to earlier when a later top-up starts a fresh set', () => {
    seq = 0;
    const r = computeLessonSets(
      [
        txn('charge', 80, -80, '2026-07-09'),
        txn('charge', 80, -160, '2026-07-11'),
        txn('top-up', 800, 640, '2026-07-20'), // pre-balance -160 < rate → new set
      ],
      80,
    );
    expect(r.earlier).toHaveLength(1);
    expect(r.earlier[0].topUp).toBeNull();
    expect(r.earlier[0].done).toBe(2);
    expect(r.current).not.toBeNull();
    expect(r.current!.topUp).toEqual({ date: '2026-07-20', amount: 800 });
    expect(r.current!.done).toBe(0);
  });

  it('numbers lessons by lesson date, not createdAt/replay order (back-dated mark-done)', () => {
    seq = 0;
    // createdAt order (seq): top-up, then the 07-16 charge, then the 07-09 charge —
    // i.e. the later-dated lesson was recorded (createdAt) before the earlier-dated one.
    const r = computeLessonSets(
      [
        txn('top-up', 800, 800, '2026-07-01'),
        txn('charge', 80, 720, '2026-07-16'), // recorded first (lower createdAt), later date
        txn('charge', 80, 640, '2026-07-09'), // recorded second (higher createdAt), earlier date
      ],
      80,
    );
    expect(r.current).not.toBeNull();
    expect(r.current!.done).toBe(2);
    expect(r.current!.lessons).toEqual([
      { n: 1, date: '2026-07-09', price: 80 },
      { n: 2, date: '2026-07-16', price: 80 },
    ]);
  });

  it('sizes the new set from net available money after a carried owed amount', () => {
    seq = 0;
    // Debt set: small top-up (80) then one pricier charge (240) drives balance to -160.
    const r = computeLessonSets(
      [
        txn('top-up', 80, 80, '2026-06-01'),
        txn('charge', 240, -160, '2026-06-05'),
        // pre-top-up balance -160 < rate → new set; opening balance carries the debt.
        txn('top-up', 800, 640, '2026-07-20'),
      ],
      80,
    );
    expect(r.earlier).toHaveLength(1);
    expect(r.earlier[0].done).toBe(1);
    expect(r.earlier[0].left).toBe(0);
    expect(r.earlier[0].reconciliation).toEqual({ kind: 'owed', amount: 160 });

    expect(r.current).not.toBeNull();
    expect(r.current!.topUp).toEqual({ date: '2026-07-20', amount: 800 });
    // slots sized from openingBalance (-160) + topUpSum (800): round(640 / 80) = 8
    expect(r.current!.slots).toBe(8);
    expect(r.current!.done).toBe(0);
    expect(r.current!.left).toBe(8);
    expect(r.current!.reconciliation).toEqual({ kind: 'none', amount: 0 });
  });
});
