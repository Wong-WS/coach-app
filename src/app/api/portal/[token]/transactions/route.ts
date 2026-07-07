import { NextResponse } from 'next/server';
import {
  resolvePortalToken,
  fetchChargesPage,
  fetchTopUpsPage,
  PORTAL_PAGE_SIZE,
} from '@/lib/portal-data';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await resolvePortalToken(token);
  if (!ctx) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const cursorStr = url.searchParams.get('cursor');
  const cursor = cursorStr ? Number(cursorStr) : null;
  if (cursor != null && !Number.isFinite(cursor)) {
    return NextResponse.json({ error: 'bad_cursor' }, { status: 400 });
  }

  if (type === 'charge') {
    const page = await fetchChargesPage(ctx, cursor, PORTAL_PAGE_SIZE);
    return NextResponse.json(page);
  }
  if (type === 'topup') {
    const page = await fetchTopUpsPage(ctx, cursor, PORTAL_PAGE_SIZE);
    return NextResponse.json(page);
  }
  return NextResponse.json({ error: 'bad_type' }, { status: 400 });
}
