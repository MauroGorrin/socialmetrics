'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Item = { href: string; label: string; icon?: ReactNode };

/**
 * Section links with an active-state highlight for the current route. An
 * optional `icon` renders as a leading glyph. The parent supplies the wrapper
 * layout (vertical on desktop, horizontal scroll on mobile) via `className`.
 */
export function SidebarNav({ items, className = '' }: { items: Item[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors duration-150 ease-out ${
              active
                ? 'bg-[var(--surface-2)] font-medium text-[var(--fg)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-1)] hover:text-[var(--fg)]'
            }`}
          >
            {item.icon ? (
              <span aria-hidden className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">
                {item.icon}
              </span>
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
