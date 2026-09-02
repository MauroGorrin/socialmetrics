import 'server-only';

import { and, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { BASE_METRICS, firstOfMonth, type MetricKey, monthBounds } from '@/lib/metrics';
import { db } from '@/server/db';
import type { Metric } from '@/server/db/schema';
import { metrics, reportPosts } from '@/server/db/schema';

/**
 * Metric writes. Org-scoped like every other mutation — `orgId` is in the
 * WHERE clause (or the inserted row), so a metric or client id from another
 * tenant matches no row / is rejected by the caller's client check.
 */

export const METRIC_NAMES = [
  'impressions',
  'clicks',
  'spend',
  'ctr',
  'cpl',
  'roas',
  'conversions',
  'conversion_value',
  'followers_start',
  'followers_end',
  'reach',
  'profile_visits',
  'link_clicks',
  'interactions',
  'posts_published',
  'stories_published',
  'video_views',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export type NewMetric = {
  orgId: string;
  clientId: string;
  createdBy: string;
  metricName: MetricName;
  metricValue: number;
  /** ISO date, `YYYY-MM-DD`. */
  period: string;
};

export async function createMetric(input: NewMetric): Promise<Metric> {
  const [row] = await db
    .insert(metrics)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      createdBy: input.createdBy,
      metricName: input.metricName,
      metricValue: input.metricValue.toFixed(2),
      period: input.period,
    })
    .returning();
  return row;
}

type MetricSource = 'manual' | 'meta' | 'google_ads';

type MetricRow = {
  orgId: string;
  clientId: string;
  createdBy: string;
  updatedBy: string;
  metricName: MetricKey;
  metricValue: string;
  period: string;
  source: MetricSource;
};

/** One month's values, shaped into insertable rows — shared by the single-month and bulk writers. */
function metricRowsFor(
  orgId: string,
  clientId: string,
  actorId: string,
  periodMonth: string,
  values: Partial<Record<MetricKey, number>>,
  source: MetricSource = 'manual',
): MetricRow[] {
  const period = firstOfMonth(periodMonth);
  return (Object.entries(values) as Array<[MetricKey, number | undefined]>)
    .filter(([, value]) => value != null && Number.isFinite(value))
    .map(([metricName, value]) => ({
      orgId,
      clientId,
      createdBy: actorId,
      updatedBy: actorId,
      metricName,
      metricValue: (value as number).toFixed(2),
      period,
      source,
    }));
}

/**
 * Replace a client's whole month with the figures from the monthly entry grid.
 * Every existing metric row for that client + month (base or ratio, whatever
 * the day) is cleared first, then one row per provided base value is written at
 * the first of the month. The month always reflects exactly what the grid holds,
 * and stale directly-entered CTR/CPL/ROAS rows do not linger.
 */
export async function upsertMonthlyMetrics(input: {
  orgId: string;
  clientId: string;
  actorId: string;
  periodMonth: string;
  values: Partial<Record<MetricKey, number>>;
}): Promise<void> {
  const { from, to } = monthBounds(input.periodMonth);
  const rows = metricRowsFor(input.orgId, input.clientId, input.actorId, input.periodMonth, input.values);

  await db.transaction(async (tx) => {
    await tx
      .delete(metrics)
      .where(
        and(
          eq(metrics.orgId, input.orgId),
          eq(metrics.clientId, input.clientId),
          eq(metrics.source, 'manual'),
          gte(metrics.period, from),
          lt(metrics.period, to),
        ),
      );
    if (rows.length > 0) {
      await tx.insert(metrics).values(rows);
    }
  });
}

/**
 * Same "clear the month, rewrite it" contract as {@link upsertMonthlyMetrics},
 * for every given month in **one transaction** — the bulk Excel-upload path.
 * Either every month in the file is replaced, or (on any error) none are.
 */
export async function upsertMonthlyMetricsBulk(input: {
  orgId: string;
  clientId: string;
  actorId: string;
  months: Array<{ periodMonth: string; values: Partial<Record<MetricKey, number>> }>;
}): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { periodMonth, values } of input.months) {
      const { from, to } = monthBounds(periodMonth);
      const rows = metricRowsFor(input.orgId, input.clientId, input.actorId, periodMonth, values);
      await tx
        .delete(metrics)
        .where(
          and(
            eq(metrics.orgId, input.orgId),
            eq(metrics.clientId, input.clientId),
            eq(metrics.source, 'manual'),
            gte(metrics.period, from),
            lt(metrics.period, to),
          ),
        );
      if (rows.length > 0) {
        await tx.insert(metrics).values(rows);
      }
    }
  });
}

/** A single day's synced ad figures — only the five additive base metrics. */
export type SyncedDailyRow = { date: string } & Partial<
  Record<'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value', number>
>;

const SYNCED_METRIC_KEYS = [
  'impressions',
  'clicks',
  'spend',
  'conversions',
  'conversion_value',
] as const satisfies ReadonlyArray<MetricKey>;

/**
 * Replace an ad-platform's contribution to a client over `[from, to]` with a
 * fresh set of daily rows. The delete is scoped by `source` so it never touches
 * hand-entered (`source='manual'`) or the other platform's rows — and the
 * rewrite is wholesale ("API pisa todo"). One transaction.
 */
export async function upsertSyncedMetrics(input: {
  orgId: string;
  clientId: string;
  connectedBy: string;
  source: 'meta' | 'google_ads';
  /** Inclusive ISO date bounds, `YYYY-MM-DD`. */
  from: string;
  to: string;
  rows: SyncedDailyRow[];
}): Promise<void> {
  const insertRows: MetricRow[] = input.rows.flatMap((row) =>
    SYNCED_METRIC_KEYS.filter((key) => {
      const value = row[key];
      return value != null && Number.isFinite(value);
    }).map((key) => ({
      orgId: input.orgId,
      clientId: input.clientId,
      createdBy: input.connectedBy,
      updatedBy: input.connectedBy,
      metricName: key,
      metricValue: (row[key] as number).toFixed(2),
      period: row.date,
      source: input.source,
    })),
  );

  await db.transaction(async (tx) => {
    await tx
      .delete(metrics)
      .where(
        and(
          eq(metrics.orgId, input.orgId),
          eq(metrics.clientId, input.clientId),
          eq(metrics.source, input.source),
          gte(metrics.period, input.from),
          lte(metrics.period, input.to),
        ),
      );
    if (insertRows.length > 0) {
      await tx.insert(metrics).values(insertRows);
    }
  });
}

/**
 * Drop a client's hand-entered rows for the five base ad metrics. Run once when
 * a client connects an ad platform, so the sync's daily rows are the only source
 * for those metrics and the read layer does not double-count.
 */
export async function deleteManualBaseMetrics(orgId: string, clientId: string): Promise<void> {
  await db
    .delete(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        eq(metrics.clientId, clientId),
        eq(metrics.source, 'manual'),
        inArray(metrics.metricName, [...BASE_METRICS]),
      ),
    );
}

export type MonthlyPostInput = {
  url: string;
  format?: string | null;
  reach?: number | null;
  interactions?: number | null;
};

/**
 * Replace a client's best-posts list for the month. Same "clear the month,
 * rewrite it" contract as {@link upsertMonthlyMetrics}: whatever the organic
 * grid submits is exactly what the month holds afterwards. Rows without a URL
 * are dropped by the caller.
 */
export async function upsertMonthlyPosts(input: {
  orgId: string;
  clientId: string;
  actorId: string;
  periodMonth: string;
  posts: MonthlyPostInput[];
}): Promise<void> {
  const { from, to } = monthBounds(input.periodMonth);
  const period = firstOfMonth(input.periodMonth);

  const rows = input.posts
    .filter((post) => post.url.trim().length > 0)
    .slice(0, 5)
    .map((post) => ({
      orgId: input.orgId,
      clientId: input.clientId,
      createdBy: input.actorId,
      period,
      url: post.url.trim(),
      format: post.format?.trim() || null,
      reach: post.reach != null && Number.isFinite(post.reach) ? post.reach.toFixed(2) : null,
      interactions:
        post.interactions != null && Number.isFinite(post.interactions)
          ? post.interactions.toFixed(2)
          : null,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(reportPosts)
      .where(
        and(
          eq(reportPosts.orgId, input.orgId),
          eq(reportPosts.clientId, input.clientId),
          gte(reportPosts.period, from),
          lt(reportPosts.period, to),
        ),
      );
    if (rows.length > 0) {
      await tx.insert(reportPosts).values(rows);
    }
  });
}

/** Delete a metric, returning the deleted row (for auditing), or `null`. */
export async function deleteMetric(orgId: string, metricId: string): Promise<Metric | null> {
  const [row] = await db
    .delete(metrics)
    .where(and(eq(metrics.orgId, orgId), eq(metrics.id, metricId)))
    .returning();
  return row ?? null;
}
