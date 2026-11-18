import type { ReactNode } from 'react';

export type Info = { title: string; text: ReactNode };

/** "How is this worked out?" popups behind the ⓘ on analytics cards. */
export const INFO = {
  classes: {
    title: 'Classes',
    text: 'Taught = classes marked done. Projected = taught so far + classes still on your schedule this month. A group class counts once.',
  },
  taught: {
    title: 'Taught',
    text: 'Money from lessons marked done, at the price charged. Projected adds the classes still on your schedule this month.',
  },
  likely: {
    title: 'Likely to receive',
    text: "Wallets that will run out before month end, based on your schedule. Each counts its usual top-up (or its last one). Pay-after wallets count what they'll owe; families with no classes left count only what they owe.",
  },
  cancelledMonth: {
    title: 'Cancelled',
    text: (
      <>
        Classes cancelled for one date, counted once per class. <b>Not included:</b> time off, ending a
        weekly class, or removing one student from a class.
      </>
    ),
  },
  cancelsMost: {
    title: 'Cancels most',
    text: "Families (by wallet) on cancelled classes. Weather and Me don't count against a family. In a group class, every family on it gets +1.",
  },
  forecast: {
    title: 'Year-end forecast',
    text: 'Taught so far + classes still on your schedule to 31 Dec, minus your usual cancellation rate (last 90 days). Planned time off is already left out.',
  },
  days: {
    title: 'Days',
    text: 'Worked = days with a lesson marked done. Time off = your planned time off. Other = everything else (rain-outs, unplanned days off, lessons not marked done). Counts up to yesterday.',
  },
  cancelledYear: {
    title: 'Cancelled & moved',
    text: (
      <>
        Cancelled = classes cancelled for one date, counted once per class.{' '}
        <b>Time off is not included; it&apos;s under Days.</b> Rescheduled = weekly classes moved to another
        date or time.
      </>
    ),
  },
  byDay: {
    title: 'Classes by day',
    text: 'Classes taught per weekday. Busiest day = the most classes. Busiest time = your most common day + start hour.',
  },
  students: {
    title: 'Students',
    text: 'Taught = students with a lesson marked done this year. Stopped = of those, not on any class on your schedule right now (includes one-off students and breaks).',
  },
} satisfies Record<string, Info>;
