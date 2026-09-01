import { describe, expect, it } from 'vitest';
import {
  pickChartChips,
  pickGroupedCard,
  pickStatCards,
  rangeToMonths,
  resolveChartMetric,
} from '@/lib/dashboard-view';

describe('resolveChartMetric', () => {
  it('falls back to the first chip when the param is not in the profile lane', () => {
    expect(resolveChartMetric('followers_end', 'ads')).toBe('impressions');
    expect(resolveChartMetric('garbage', 'organic')).toBe('followers_end');
  });

  it('falls back to the first chip when the param is undefined', () => {
    expect(resolveChartMetric(undefined, 'ads')).toBe('impressions');
    expect(resolveChartMetric(undefined, 'organic')).toBe('followers_end');
  });

  it('returns a valid param unchanged', () => {
    expect(resolveChartMetric('spend', 'ads')).toBe('spend');
    expect(resolveChartMetric('reach', 'organic')).toBe('reach');
  });
});

describe('pickChartChips', () => {
  it('returns the four ads keys in order', () => {
    expect(pickChartChips('ads').map((c) => c.key)).toEqual([
      'impressions',
      'clicks',
      'spend',
      'roas',
    ]);
  });

  it('labels every chip from METRIC_LABELS', () => {
    for (const chip of pickChartChips('organic')) {
      expect(typeof chip.label).toBe('string');
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });
});

describe('pickStatCards / pickGroupedCard', () => {
  it('ads stat cards are three keys, disjoint from the grouped card', () => {
    const cards = pickStatCards('ads');
    expect(cards).toHaveLength(3);
    const grouped = pickGroupedCard('ads');
    const groupedKeys = new Set<string>([grouped.feature, ...grouped.parts]);
    for (const key of cards) expect(groupedKeys.has(key)).toBe(false);
  });

  it('organic selection is also disjoint', () => {
    const cards = pickStatCards('organic');
    const grouped = pickGroupedCard('organic');
    const groupedKeys = new Set<string>([grouped.feature, ...grouped.parts]);
    for (const key of cards) expect(groupedKeys.has(key)).toBe(false);
  });
});

describe('rangeToMonths', () => {
  it('splits a double window into previous + window of equal length ending at the ref month', () => {
    const { window, previous } = rangeToMonths(6, '2026-09');
    expect(window).toHaveLength(6);
    expect(previous).toHaveLength(6);
    expect(window[window.length - 1]).toBe('2026-09');
  });

  it('previous ends the month immediately before window starts', () => {
    const { window, previous } = rangeToMonths(6, '2026-09');
    const [y, m] = previous[previous.length - 1].split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    expect(next).toBe(window[0]);
  });

  it('trend is at least six months even for a 1-month period', () => {
    expect(rangeToMonths(1, '2026-09').trend).toHaveLength(6);
  });
});
