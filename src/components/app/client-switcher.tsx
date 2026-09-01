'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PLATFORM_LABELS } from '@/lib/client-profile';

type Client = { id: string; name: string; platform: string };

const initial = (name: string) => name.trim()[0]?.toUpperCase() ?? '?';

/**
 * The dashboard's client selector: an avatar pill (initial + platform) that
 * opens a dropdown of every client plus "Todos los clientes". Sets `?client=`
 * (or removes it) and preserves every other query param. Keyboard: the trigger
 * is a native button (Enter/Space open); Escape closes.
 */
export function ClientSwitcher({ clients, active }: { clients: Client[]; active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = clients.find((c) => c.id === active) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('client', id);
    else next.delete('client');
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  }

  const label = current ? current.name : 'Todos los clientes';
  const sub = current
    ? (PLATFORM_LABELS[current.platform] ?? current.platform)
    : `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2.5 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface)] py-1.5 pr-3 pl-1.5 text-left transition-colors duration-150 hover:border-[var(--border-hover)]"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-100)] text-sm font-bold text-[var(--brand-700)]"
        >
          {current ? initial(current.name) : 'T'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--fg)]">{label}</span>
          <span className="block truncate text-[11px] text-[var(--text-tertiary)]">{sub}</span>
        </span>
        <svg
          className="ml-1 h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-72 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          <button
            type="button"
            role="option"
            aria-selected={!current}
            onClick={() => choose(null)}
            className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm ${
              current
                ? 'text-[var(--text-secondary)] hover:bg-[var(--surface-1)]'
                : 'bg-[var(--surface-1)] font-medium text-[var(--fg)]'
            }`}
          >
            Todos los clientes
          </button>
          {clients.map((c) => {
            const on = c.id === active;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => choose(c.id)}
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left ${
                  on ? 'bg-[var(--surface-1)]' : 'hover:bg-[var(--surface-1)]'
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-100)] text-xs font-bold text-[var(--brand-700)]"
                >
                  {initial(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--fg)]">{c.name}</span>
                  <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
                    {PLATFORM_LABELS[c.platform] ?? c.platform}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
