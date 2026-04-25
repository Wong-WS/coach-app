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
          Then &ldquo;time to pay for the next 5&rdquo; when they ran out.
          Multiply that by every student, every week. One day I marked a lesson
          done that didn&rsquo;t happen — and I realised I was the bottleneck.
          So I built this for myself. Now I tap once, and the student sees it
          in their own portal.
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
