import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { currentMonth, firstOfMonth, previousMonth, today } from '@/lib/metrics';
import { listConnected } from '@/server/queries/platform-connections';
import { syncConnection } from '@/server/sync/ads-sync';

/**
 * POST /api/cron/sync-ads — the daily Vercel Cron. Bearer-authenticated with
 * `CRON_SECRET`. Re-syncs the current + previous month for every connected
 * client. Always 200 unless auth fails, with per-connection failures collected
 * in `errors` so one bad grant does not stop the rest.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = `Bearer ${env.CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const from = firstOfMonth(previousMonth(currentMonth()));
  const to = today();

  const conns = await listConnected();
  const errors: Array<{ connectionId: string; message: string }> = [];

  for (const conn of conns) {
    try {
      await syncConnection(conn, { from, to });
    } catch (err) {
      errors.push({
        connectionId: conn.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ synced: conns.length - errors.length, errors });
}
