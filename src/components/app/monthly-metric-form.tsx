'use client';

import { type FormEvent, useState } from 'react';
import { TopPostsFields, type PostRow } from '@/components/app/top-posts-fields';
import {
  BASE_METRICS,
  computeKpis,
  computeOrganicKpis,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  RATIO_METRICS,
  type ReportProfile,
} from '@/lib/metrics';

type Values = Partial<Record<MetricKey, number>>;

type Props = {
  orgSlug: string;
  clientId: string;
  clientName: string;
  periodMonth: string;
  monthLabel: string;
  profile: ReportProfile;
  initial: Values;
  initialPosts: PostRow[];
  /** `saveMonthlyMetricsAction`, passed in by the page. */
  action: (formData: FormData) => void | Promise<void>;
};

const FIELD =
  'w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const ADS_KEYS: MetricKey[] = [...BASE_METRICS];
const ADS_PREVIEW: MetricKey[] = [...RATIO_METRICS];

/** Organic input fields, in entry order. `impressions` is shared with the ads section. */
const ORGANIC_ORDER: MetricKey[] = [
  'followers_start',
  'followers_end',
  'reach',
  'impressions',
  'interactions',
  'profile_visits',
  'link_clicks',
  'video_views',
  'posts_published',
  'stories_published',
];
const ORGANIC_PREVIEW: MetricKey[] = ['follower_growth', 'follower_growth_rate', 'engagement_rate'];

function organicKeys(profile: ReportProfile): MetricKey[] {
  return profile === 'mixed' ? ORGANIC_ORDER.filter((key) => key !== 'impressions') : ORGANIC_ORDER;
}

/** Read the given numeric fields straight off the form DOM. */
function readValues(form: HTMLFormElement, keys: MetricKey[]): Values {
  const out: Values = {};
  for (const key of keys) {
    const field = form.elements.namedItem(key);
    const parsed = field instanceof HTMLInputElement ? Number.parseFloat(field.value) : Number.NaN;
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function NumberField({ metricKey, initial }: { metricKey: MetricKey; initial?: number }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
      {METRIC_LABELS[metricKey]}
      <input
        name={metricKey}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        defaultValue={initial ?? ''}
        className={FIELD}
      />
    </label>
  );
}

function PreviewRow({ keys, kpis }: { keys: MetricKey[]; kpis: ReturnType<typeof computeKpis> }) {
  return (
    <div className="flex flex-wrap gap-6 rounded border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm">
      {keys.map((key) => (
        <span key={key} className="text-[var(--fg-muted)]">
          {METRIC_LABELS[key]}{' '}
          <span className="font-semibold text-[var(--fg)]" data-preview={key}>
            {formatMetric(key, kpis[key])}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * One client, one month. Uncontrolled fields — the page reloads on save so
 * `initial` is always fresh — with the derived KPIs previewed live. The set of
 * fields follows the client's report profile: ads figures, organic figures, or
 * both, plus a best-posts list for organic / mixed.
 */
export function MonthlyMetricForm({
  orgSlug,
  clientId,
  clientName,
  periodMonth,
  monthLabel,
  profile,
  initial,
  initialPosts,
  action,
}: Props) {
  const showAds = profile === 'ads' || profile === 'mixed';
  const showOrganic = profile === 'organic' || profile === 'mixed';
  const orgKeys = organicKeys(profile);

  const [preview, setPreview] = useState<Values>(initial);
  const adsKpis = computeKpis(preview);
  const organicKpis = computeOrganicKpis(preview);

  function onChange(event: FormEvent<HTMLFormElement>) {
    setPreview(readValues(event.currentTarget, [...ADS_KEYS, ...ORGANIC_ORDER]));
  }

  return (
    <form
      action={action}
      onChange={onChange}
      className="space-y-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="periodMonth" value={periodMonth} />

      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">{clientName}</h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Totales de {monthLabel}. Deja un campo vacío si no tienes el dato.
        </p>
      </div>

      {showOrganic ? (
        <div className="space-y-4">
          {profile === 'mixed' ? (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Orgánico
            </h3>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {orgKeys.map((key) => (
              <NumberField key={key} metricKey={key} initial={initial[key]} />
            ))}
          </div>
          <PreviewRow keys={ORGANIC_PREVIEW} kpis={organicKpis} />
        </div>
      ) : null}

      {showAds ? (
        <div className="space-y-4">
          {profile === 'mixed' ? (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Pauta
            </h3>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {ADS_KEYS.map((key) => (
              <NumberField key={key} metricKey={key} initial={initial[key]} />
            ))}
          </div>
          <PreviewRow keys={ADS_PREVIEW} kpis={adsKpis} />
        </div>
      ) : null}

      {showOrganic ? <TopPostsFields initial={initialPosts} /> : null}

      <button
        type="submit"
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Guardar el mes
      </button>
    </form>
  );
}
