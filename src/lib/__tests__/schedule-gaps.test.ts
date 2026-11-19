import { describe, it, expect } from 'vitest';
import { dayTimeline } from '@/lib/schedule-gaps';
import type { Booking } from '@/types';

function cls(id: string, startTime: string, endTime: string, loc: string): Booking {
  return {
    id,
    locationId: loc.toLowerCase(),
    locationName: loc,
    dayOfWeek: 'tuesday',
    startTime,
    endTime,
    status: 'confirmed',
    className: '',
    notes: '',
    studentIds: ['s1'],
    studentPriceCents: { s1: 6000 },
    studentWallets: {},
    createdAt: new Date(),
  };
}

const anywhere = { locationId: null, locationName: null };
const at = (loc: string) => ({ locationId: loc.toLowerCase(), locationName: loc });

describe('dayTimeline — free time between classes', () => {
  it('fits a class at either pool once the 30-min travel is counted', () => {
    // Granito 12–1, Quavside 2:30–3:30 → Granito 1–2 or Quavside 1:30–2:30; elsewhere doesn't fit.
    const items = dayTimeline([cls('a', '12:00', '13:00', 'Granito'), cls('b', '14:30', '15:30', 'Quavside')], false);
    const gap = items[2];
    expect(gap).toEqual({
      kind: 'free',
      start: '13:00',
      end: '14:30',
      minutes: 90,
      fits: [
        { kind: 'slot', ...at('Granito'), start: '13:00', end: '14:00' },
        { kind: 'slot', ...at('Quavside'), start: '13:30', end: '14:30' },
      ],
    });
  });

  it('needs no travel between two classes at the same pool', () => {
    const items = dayTimeline([cls('a', '12:00', '13:00', 'Granito'), cls('b', '14:00', '15:00', 'Granito')], false);
    expect(items[2]).toMatchObject({ kind: 'free', fits: [{ kind: 'slot', ...at('Granito'), start: '13:00', end: '14:00' }] });
  });

  it('shows a long same-pool gap as one free range (both ends are next to a class)', () => {
    const items = dayTimeline([cls('a', '12:00', '13:00', 'Granito'), cls('b', '15:00', '16:00', 'Granito')], false);
    expect(items[2]).toMatchObject({ fits: [{ kind: 'range', ...at('Granito'), start: '13:00', end: '15:00', best: null }] });
  });

  it('in a long gap between pools, points at the hour next to each class, then how far it stretches', () => {
    // Tamarind 9–10, Permai Garden 3:30–4:30 (the coach's Thursday).
    const items = dayTimeline([cls('a', '09:00', '10:00', 'Tamarind'), cls('b', '15:30', '16:30', 'Permai')], false);
    expect(items.find((i) => i.kind === 'free' && i.start === '10:00')).toMatchObject({
      fits: [
        { kind: 'range', ...at('Tamarind'), start: '10:00', end: '15:00', best: { start: '10:00', end: '11:00' } },
        { kind: 'range', ...at('Permai'), start: '10:30', end: '15:30', best: { start: '14:30', end: '15:30' } },
        { kind: 'range', ...anywhere, start: '10:30', end: '15:00', best: null },
      ],
    });
  });

  it('includes anywhere else when the gap leaves room for travel both ways', () => {
    const items = dayTimeline([cls('a', '12:00', '13:00', 'Granito'), cls('b', '15:00', '16:00', 'Quavside')], false);
    expect(items[2]).toMatchObject({
      fits: [
        { kind: 'slot', ...at('Granito'), start: '13:00', end: '14:00' },
        { kind: 'slot', ...at('Quavside'), start: '14:00', end: '15:00' },
        { kind: 'slot', ...anywhere, start: '13:30', end: '14:30' },
      ],
    });
  });

  it('keeps a short gap with nothing that fits', () => {
    const items = dayTimeline([cls('a', '12:00', '12:30', 'Granito'), cls('b', '13:00', '14:00', 'Tamarind')], false);
    expect(items[2]).toEqual({ kind: 'free', start: '12:30', end: '13:00', minutes: 30, fits: [] });
  });

  it('shows no gap between back-to-back or overlapping classes', () => {
    const items = dayTimeline(
      [cls('a', '12:00', '13:00', 'Granito'), cls('b', '13:00', '14:00', 'Granito'), cls('c', '13:30', '14:30', 'Granito')],
      false,
    );
    expect(items.filter((i) => i.kind === 'free' && i.start >= '12:00' && i.end <= '14:30')).toEqual([]);
  });
});

describe('dayTimeline — start and end of the day', () => {
  it('on a weekday, spans the morning but points at the slot right before the first class', () => {
    const [lead] = dayTimeline([cls('a', '16:30', '17:30', 'Permai')], false);
    expect(lead).toEqual({
      kind: 'free',
      start: '08:00',
      end: '16:30',
      minutes: 510,
      fits: [
        { kind: 'slot', ...at('Permai'), start: '15:30', end: '16:30' },
        { kind: 'slot', ...anywhere, start: '15:00', end: '16:00' },
      ],
    });
  });

  it('on a weekend, shows the whole morning, pointing at the hour before the first class', () => {
    const [lead] = dayTimeline([cls('a', '11:00', '12:00', 'Quavside')], true);
    expect(lead).toMatchObject({
      start: '08:00',
      end: '11:00',
      fits: [
        { kind: 'range', ...at('Quavside'), start: '08:00', end: '11:00', best: { start: '10:00', end: '11:00' } },
        { kind: 'range', ...anywhere, start: '08:00', end: '10:30', best: null },
      ],
    });
  });

  it('on a weekday with an early first class, treats the short morning like any gap', () => {
    const [lead] = dayTimeline([cls('a', '09:00', '10:00', 'Permai')], false);
    expect(lead).toMatchObject({ start: '08:00', end: '09:00', fits: [{ kind: 'slot', ...at('Permai'), start: '08:00', end: '09:00' }] });
  });

  it('shows what fits after the last class until 9 pm', () => {
    const items = dayTimeline([cls('a', '19:00', '20:00', 'Quavside')], false);
    expect(items[items.length - 1]).toEqual({
      kind: 'free',
      start: '20:00',
      end: '21:00',
      minutes: 60,
      fits: [{ kind: 'slot', ...at('Quavside'), start: '20:00', end: '21:00' }],
    });
  });

  it('shows a long evening as the hour after the last class, then until 9 pm', () => {
    const items = dayTimeline([cls('a', '16:00', '17:00', 'Quavside')], false);
    expect(items[items.length - 1]).toMatchObject({
      start: '17:00',
      fits: [
        { kind: 'range', ...at('Quavside'), start: '17:00', end: '21:00', best: { start: '17:00', end: '18:00' } },
        { kind: 'range', ...anywhere, start: '17:30', end: '21:00', best: null },
      ],
    });
  });

  it('adds nothing after a class ending less than an hour before 9 pm', () => {
    const items = dayTimeline([cls('a', '19:30', '20:30', 'Quavside')], false);
    expect(items[items.length - 1].kind).toBe('class');
  });

  it('adds nothing before a class starting at or before 8 am', () => {
    const items = dayTimeline([cls('a', '07:30', '08:30', 'Quavside')], true);
    expect(items[0].kind).toBe('class');
  });

  it('shows a day with no classes as free all day', () => {
    expect(dayTimeline([], false)).toEqual([
      { kind: 'free', start: '08:00', end: '21:00', minutes: 780, fits: [{ kind: 'range', ...anywhere, start: '08:00', end: '21:00', best: null }] },
    ]);
  });

  it('sorts classes by start time', () => {
    const items = dayTimeline([cls('late', '18:00', '19:00', 'Permai'), cls('early', '10:00', '11:00', 'Permai')], true);
    expect(items.filter((i) => i.kind === 'class').map((i) => (i.kind === 'class' ? i.booking.id : ''))).toEqual(['early', 'late']);
  });
});
