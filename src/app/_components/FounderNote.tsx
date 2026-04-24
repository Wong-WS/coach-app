// src/app/_components/FounderNote.tsx
import { Avatar } from '@/components/paper';

export function FounderNote() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <div
        className="rounded-[14px] border p-8 md:p-10"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--ink-4)' }}
        >
          Why I built this
        </div>
        <p
          className="mt-4 text-[18px] md:text-[19px] leading-relaxed"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          I coach on weekends and spent every Sunday buried in a spreadsheet —
          who paid, who&rsquo;s on which package, who&rsquo;s coming next week.
          Nobody was going to build this for me, so I built it for myself. Now
          it runs my coaching business while I&rsquo;m on the court.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Avatar name="Wei Siang" size={36} />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>
              Wei Siang
            </p>
            <p className="text-[12px]" style={{ color: 'var(--ink-3)' }}>
              Founder, Coach
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
