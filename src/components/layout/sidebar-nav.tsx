'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string };

/**
 * Section links with an active-state highlight for the current route. The
 * parent supplies the wrapper layout (vertical on desktop, horizontal scroll
 * on mobile) via `className`.
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
            className={`shrink-0 rounded px-3 py-2 text-sm transition-colors duration-150 ease-out ${
              active
                ? 'bg-[var(--background)] font-medium text-[var(--fg)]'
                : 'text-[var(--fg-muted)] hover:bg-[var(--background)] hover:text-[var(--fg)]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
