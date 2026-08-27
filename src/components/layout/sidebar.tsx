import Link from 'next/link';

/** Primary navigation. Docked at `md` and up; below that it is hidden and the
 *  Topbar exposes the same links through a disclosure menu. */
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Panel' },
  { href: '/clients', label: 'Clientes' },
  { href: '/reports', label: 'Reportes' },
  { href: '/settings', label: 'Ajustes' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
      <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
        <span className="text-base font-bold text-[var(--fg)]">Reportes</span>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded px-3 py-2 text-sm text-[var(--fg-muted)] transition-colors duration-150 ease-out hover:bg-[var(--background)] hover:text-[var(--fg)]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
