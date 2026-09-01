import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors } from '@/lib/design-tokens';

/**
 * The stylesheet drives runtime rendering; `design-tokens.ts` drives logic and
 * tests. This suite is the sync contract between the two, plus the dark-mode
 * invariant: every semantic token on bare `:root` must have a dark override.
 */

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

/** The body of the first block matching `selector` (no nested braces expected). */
function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`CSS block not found for ${selector}`);
  return m[1];
}

const rootBlock = block(/:root\s*\{([^}]*)\}/);
const darkBlock = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

/** The declared value of `--name` inside `src`, upper-cased, or null if absent. */
function readVar(src: string, name: string): string | null {
  const m = src.match(new RegExp(`(?:^|[\\s;{])${name}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim().toUpperCase() : null;
}

/** design-tokens.ts key → the CSS custom property it mirrors. */
const MAP: Record<keyof typeof colors.light, string> = {
  primary: '--primary',
  primaryFg: '--primary-fg',
  background: '--background',
  surface: '--surface',
  border: '--border',
  fg: '--fg',
  fgMuted: '--fg-muted',
  destructive: '--destructive',
  success: '--success',
  warning: '--warning',
};

describe('design tokens <-> globals.css', () => {
  it('primary is the BrightBean orange', () => {
    expect(colors.light.primary).toBe('#F97316');
  });

  it('every colors.light value matches its :root declaration', () => {
    for (const [key, cssVar] of Object.entries(MAP)) {
      expect(readVar(rootBlock, cssVar)).toBe(
        colors.light[key as keyof typeof colors.light].toUpperCase(),
      );
    }
  });

  it('every colors.dark value matches its :root[data-theme="dark"] declaration', () => {
    for (const [key, cssVar] of Object.entries(MAP)) {
      expect(readVar(darkBlock, cssVar)).toBe(
        colors.dark[key as keyof typeof colors.dark].toUpperCase(),
      );
    }
  });

  it('colors.light and colors.dark have identical key sets', () => {
    expect(Object.keys(colors.light)).toEqual(Object.keys(colors.dark));
  });

  it('every semantic token on :root is redefined under :root[data-theme="dark"]', () => {
    for (const cssVar of Object.values(MAP)) {
      expect(readVar(rootBlock, cssVar), `${cssVar} missing on :root`).not.toBeNull();
      expect(readVar(darkBlock, cssVar), `${cssVar} missing under dark`).not.toBeNull();
    }
  });
});
