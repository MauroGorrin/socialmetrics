/**
 * Design tokens — the single source of truth for the values that also live as
 * CSS custom properties in `src/styles/globals.css`. Keep the two in sync:
 * the stylesheet drives runtime rendering, this module drives logic and tests.
 */

export const colors = {
  light: {
    primary: '#0F172A',
    primaryFg: '#FFFFFF',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    border: '#E2E8F0',
    fg: '#1E293B',
    fgMuted: '#64748B',
    destructive: '#DC2626',
    success: '#16A34A',
    warning: '#EA580C',
  },
  dark: {
    primary: '#E0E7FF',
    primaryFg: '#000000',
    background: '#0F172A',
    surface: '#1E293B',
    border: '#334155',
    fg: '#F1F5F9',
    fgMuted: '#94A3B8',
    destructive: '#EF4444',
    success: '#22C55E',
    warning: '#FB923C',
  },
} as const;

export type ThemeName = keyof typeof colors;
export type ColorToken = keyof typeof colors.light;

export const typography = {
  display: { size: 48, lineHeight: 1.2, weight: 700, tracking: '-0.02em' },
  h1: { size: 32, lineHeight: 1.25, weight: 700, tracking: '-0.01em' },
  h2: { size: 24, lineHeight: 1.33, weight: 700, tracking: '0' },
  h3: { size: 20, lineHeight: 1.4, weight: 600, tracking: '0' },
  body: { size: 16, lineHeight: 1.5, weight: 400, tracking: '0' },
  bodySmall: { size: 14, lineHeight: 1.5, weight: 400, tracking: '0' },
  mono: { size: 14, lineHeight: 1.5, weight: 400, tracking: '0' },
} as const;

/** 4px base spacing scale (Tailwind default subset used across the app). */
export const spacing = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export const radius = {
  control: 4,
  card: 8,
  modal: 12,
} as const;

/** Mobile-first breakpoints (px), matching Tailwind's defaults. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export const layout = {
  /** Fixed sidebar width on desktop. */
  sidebarWidth: 256,
  /** At or above this viewport width the sidebar is docked; below it the
   *  sidebar is off-canvas (a drawer) and occupies no inline space. */
  sidebarDockedAt: breakpoints.md,
  /** Content column never grows past this, regardless of viewport. */
  maxContentWidth: breakpoints.xl,
} as const;

/**
 * Horizontal space the app shell occupies at a given viewport width.
 *
 * The shell must never be wider than the viewport — that is what keeps the
 * page from scrolling horizontally at any size. Below the `md` breakpoint the
 * sidebar is a drawer (0 inline px); at and above it the sidebar is docked and
 * the content column takes the remaining width, capped at `maxContentWidth`.
 */
export function shellFootprint(viewportWidth: number): number {
  const sidebar = viewportWidth >= layout.sidebarDockedAt ? layout.sidebarWidth : 0;
  const content = Math.max(0, Math.min(viewportWidth - sidebar, layout.maxContentWidth));
  return sidebar + content;
}
