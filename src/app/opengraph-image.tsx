import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt =
  'CoachSimplify — Run your coaching business, not your spreadsheet.';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// Paper & Ink palette (light mode hex values from globals.css)
const BG = '#faf9f6';
const INK = '#1a1917';
const INK_2 = '#4a4845';
const INK_3 = '#807d77';
const LINE = '#ece9e1';
const GOOD_BG = '#dff1e6';
const GOOD_INK = '#216b3f';

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BG,
          padding: '72px 80px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Brand row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: INK,
              color: BG,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            C
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 600,
              color: INK,
              letterSpacing: '-0.5px',
            }}
          >
            CoachSimplify
          </div>
        </div>

        {/* Centre stack: chip + headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          <div style={{ display: 'flex' }}>
            <div
              style={{
                background: GOOD_BG,
                color: GOOD_INK,
                fontSize: 22,
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 999,
                letterSpacing: '0.01em',
              }}
            >
              Free during early access
            </div>
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              color: INK,
              letterSpacing: '-3px',
              lineHeight: 1.05,
              maxWidth: 1040,
            }}
          >
            Run your coaching business, not your spreadsheet.
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 24,
            fontSize: 22,
          }}
        >
          <div style={{ color: INK_2 }}>
            For independent coaches who&rsquo;d rather be teaching than typing.
          </div>
          <div style={{ color: INK_3, fontFamily: 'ui-monospace, monospace' }}>
            coach-simplify.com
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
