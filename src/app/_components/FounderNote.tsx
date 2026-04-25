// src/app/_components/FounderNote.tsx
import { Avatar } from '@/components/paper';

export function FounderNote() {
  return (
    <section
      className="mx-auto max-w-3xl px-6 py-20"
      aria-label="A note from the founder"
    >
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
          I teach swimming. After every lesson I&rsquo;d update each
          student&rsquo;s WhatsApp with their package:
        </p>
        <pre
          className="mono mt-4 rounded-[10px] border p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
          style={{
            background: 'var(--bg)',
            borderColor: 'var(--line)',
            color: 'var(--ink-2)',
          }}
        >
{`swimming lessons
1. 25/4
2.
3.
4.
5.`}
        </pre>
        <p
          className="mt-4 text-[18px] md:text-[19px] leading-relaxed"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          Then when it&rsquo;s time to pay again, I have to make sure I write
          the rate correctly — not every student pays the same. One day I
          marked a lesson done that didn&rsquo;t happen. Another time I
          accidentally overcharged a student and they had to call me out on my
          mistake. I don&rsquo;t want that to happen anymore — that&rsquo;s why
          I built this app. Now it keeps everything in place: the lesson log,
          every student&rsquo;s pricing, the next top-up amount. Everything.
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
