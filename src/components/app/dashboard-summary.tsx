import { changeIsGood, METRIC_LABELS, type MetricKey, pctChange } from '@/lib/metrics';

type Item = { key: MetricKey; current: number; previous: number };
type Phrase = { key: MetricKey; label: string; text: string; colorClass: string };

function buildPhrase({ key, current, previous }: Item): Phrase | null {
  const pct = pctChange(current, previous);
  if (pct === null) return null; // no prior period to compare against

  const rounded = Math.round(pct);
  const good = changeIsGood(key, current, previous);
  const colorClass =
    good === null
      ? 'text-[var(--fg)]'
      : good
        ? 'text-[var(--success)]'
        : 'text-[var(--destructive)]';
  const text =
    rounded === 0 ? 'se mantuvo' : `${rounded > 0 ? 'subió' : 'bajó'} ${Math.abs(rounded)}%`;

  return { key, label: METRIC_LABELS[key], text, colorClass };
}

/**
 * One-line, plain-language read of the headline metrics vs. the prior
 * period — "ROAS subió 18% · Conversiones bajó 4% vs. el período anterior" —
 * so the panel can be understood in three seconds instead of scanning every
 * card. Renders nothing when none of the metrics have a prior period.
 */
export function DashboardSummary({ items }: { items: Item[] }) {
  const phrases = items.map(buildPhrase).filter((p): p is Phrase => p !== null);
  if (phrases.length === 0) return null;

  return (
    <p className="text-sm text-[var(--fg-muted)]">
      {phrases.map((phrase, index) => (
        <span key={phrase.key}>
          <span className="font-medium text-[var(--fg)]">{phrase.label}</span>{' '}
          <span className={phrase.colorClass}>{phrase.text}</span>
          {index < phrases.length - 1 ? ' · ' : ''}
        </span>
      ))}{' '}
      vs. el período anterior.
    </p>
  );
}
