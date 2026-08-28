import { describe, expect, it } from 'vitest';
import {
  addKpis,
  changeIsGood,
  computeKpis,
  formatMetric,
  monthLabel,
  monthsEndingAt,
  pctChange,
  previousMonth,
} from '@/lib/metrics';

/**
 * The report used to `sum()` every metric, so five daily CTR rows of ~5% each
 * showed up as "CTR 25%". These tests pin the fix: ratios are recomputed from
 * the base metrics, never added.
 */
describe('computeKpis', () => {
  it('derives CTR / CPL / ROAS from base metrics, not by summing them', () => {
    const kpis = computeKpis({
      impressions: 10_000,
      clicks: 400,
      spend: 200,
      conversions: 20,
      conversion_value: 800,
      // a stored ratio must be ignored when the base inputs exist
      ctr: 999,
      roas: 999,
    } as never);

    expect(kpis.ctr).toBeCloseTo(4); // 400 / 10000 * 100
    expect(kpis.cpl).toBeCloseTo(10); // 200 / 20
    expect(kpis.roas).toBeCloseTo(4); // 800 / 200
  });

  it('falls back to an entered ratio only when its base inputs are absent', () => {
    const kpis = computeKpis({ clicks: 50 }, { ctr: 3.2, roas: 2.1 });
    expect(kpis.ctr).toBe(3.2);
    expect(kpis.roas).toBe(2.1);
  });

  it('never divides by zero', () => {
    const kpis = computeKpis({});
    expect(kpis.ctr).toBe(0);
    expect(kpis.cpl).toBe(0);
    expect(kpis.roas).toBe(0);
  });
});

describe('addKpis', () => {
  it('sums base metrics and recomputes ratios from the combined totals', () => {
    const a = computeKpis({ impressions: 1000, clicks: 100, spend: 50, conversion_value: 150 });
    const b = computeKpis({ impressions: 1000, clicks: 50, spend: 50, conversion_value: 50 });
    const total = addKpis(a, b);

    expect(total.impressions).toBe(2000);
    expect(total.clicks).toBe(150);
    expect(total.ctr).toBeCloseTo(7.5); // 150 / 2000 * 100, not 10 + 5
    expect(total.roas).toBeCloseTo(2); // 200 / 100
  });
});

describe('pctChange', () => {
  it('returns the signed percentage change', () => {
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
  });

  it('has no baseline when prev is 0', () => {
    expect(pctChange(50, 0)).toBeNull();
  });
});

describe('changeIsGood', () => {
  it('more impressions is good, fewer is bad', () => {
    expect(changeIsGood('impressions', 120, 100)).toBe(true);
    expect(changeIsGood('impressions', 80, 100)).toBe(false);
  });

  it('a lower CPL is good', () => {
    expect(changeIsGood('cpl', 8, 10)).toBe(true);
    expect(changeIsGood('cpl', 12, 10)).toBe(false);
  });

  it('spend is neutral', () => {
    expect(changeIsGood('spend', 200, 100)).toBeNull();
  });

  it('a flat or missing change is neutral', () => {
    expect(changeIsGood('clicks', 100, 100)).toBeNull();
    expect(changeIsGood('clicks', 50, 0)).toBeNull();
  });
});

describe('formatMetric', () => {
  it('suffixes CTR with % and ROAS with x', () => {
    expect(formatMetric('ctr', 4.29)).toBe('4,29%');
    expect(formatMetric('roas', 3.4)).toBe('3,4x');
  });

  it('renders counts without decimals', () => {
    expect(formatMetric('impressions', 26_040)).toBe('26.040');
  });
});

describe('month helpers', () => {
  it('steps back one month across a year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-08')).toBe('2026-07');
  });

  it('lists N months ending at a given month, oldest first', () => {
    expect(monthsEndingAt('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('labels a month in Spanish', () => {
    expect(monthLabel('2026-08')).toMatch(/agosto/i);
  });
});
