'use client';

import { useTheme } from '@/components/layout/theme-provider';

/** Light/dark toggle. Swaps `data-theme` on the root — colors change with no
 *  layout shift and no reload. */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-pressed={isDark}
      className="rounded px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 ease-out hover:opacity-70"
    >
      {isDark ? 'Claro' : 'Oscuro'}
    </button>
  );
}
