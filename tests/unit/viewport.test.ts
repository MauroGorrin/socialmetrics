import { describe, expect, it } from 'vitest';
import { layout, shellFootprint } from '@/lib/design-tokens';

/**
 * Acceptance: the app shell must not scroll horizontally at any viewport width,
 * specifically 375px (small mobile) and 1440px (large desktop). The shell's
 * inline footprint — docked sidebar plus the capped content column — must
 * always be <= the viewport width. `shellFootprint` is the pure layout rule
 * the CSS shell mirrors (`min-w-0` content column, `hidden md:flex` sidebar).
 */
describe('app shell horizontal fit', () => {
  const widths = [320, 360, 375, 414, 640, 768, 1024, 1280, 1440, 1920, 2560];

  it.each(widths)('does not exceed the viewport at %ipx wide', (width) => {
    expect(shellFootprint(width)).toBeLessThanOrEqual(width);
  });

  it('keeps the sidebar off-canvas below the md breakpoint (375px)', () => {
    expect(shellFootprint(375)).toBe(375);
  });

  it('docks the sidebar and still fits at 1440px', () => {
    const footprint = shellFootprint(1440);
    expect(footprint).toBeGreaterThan(layout.sidebarWidth);
    expect(footprint).toBeLessThanOrEqual(1440);
  });

  it('caps the content column at maxContentWidth on very wide screens', () => {
    expect(shellFootprint(4000)).toBe(layout.sidebarWidth + layout.maxContentWidth);
  });
});
