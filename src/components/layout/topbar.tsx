'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NAV_LINKS } from '@/components/layout/sidebar';
import { useTheme } from '@/components/layout/theme-provider';

export function Topbar() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--background)]">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded p-2 text-[var(--fg)] transition-opacity duration-150 ease-out hover:opacity-70 md:hidden"
          >
            <span aria-hidden className="block h-0.5 w-5 bg-current" />
            <span aria-hidden className="mt-1 block h-0.5 w-5 bg-current" />
            <span aria-hidden className="mt-1 block h-0.5 w-5 bg-current" />
          </button>
          <span className="text-sm font-medium text-[var(--fg-muted)]">Panel</span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            resolvedTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
          }
          className="rounded px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 ease-out hover:opacity-70"
        >
          {resolvedTheme === 'dark' ? 'Claro' : 'Oscuro'}
        </button>
      </div>

      {menuOpen ? (
        <nav className="flex flex-col gap-1 border-t border-[var(--border)] p-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="rounded px-3 py-2 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
