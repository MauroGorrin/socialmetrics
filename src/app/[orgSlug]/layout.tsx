import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { getCurrentUser } from '@/lib/auth';
import { signOutAction } from '@/server/mutations/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';

/**
 * Shell for every tenant route (`/[orgSlug]/…`): resolves and authorizes the
 * org once, then renders the sidebar + topbar around the page. A slug the user
 * cannot access 404s here — nested pages still re-check, this is the first gate.
 */

const svg = 'h-4 w-4';
const NAV_ICONS: Record<string, ReactNode> = {
  Panel: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Clientes: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Métricas: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="10" />
    </svg>
  ),
  Reportes: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Ajustes: (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { orgSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/dashboard`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const base = `/${params.orgSlug}`;
  const nav = [
    { href: `${base}/dashboard`, label: 'Panel', icon: NAV_ICONS.Panel },
    { href: `${base}/clients`, label: 'Clientes', icon: NAV_ICONS.Clientes },
    { href: `${base}/metrics`, label: 'Métricas', icon: NAV_ICONS.Métricas },
    { href: `${base}/reports`, label: 'Reportes', icon: NAV_ICONS.Reportes },
    { href: `${base}/settings`, label: 'Ajustes', icon: NAV_ICONS.Ajustes },
  ];

  const name = (user.user_metadata?.name as string | undefined)?.trim() || user.email || '';
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const orgInitial = access.org.name.trim()[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex min-h-[100dvh] bg-[var(--background)]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-1)] md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-[var(--border)] px-4">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-100)] text-xs font-bold text-[var(--brand-700)]"
          >
            {orgInitial}
          </span>
          <span className="truncate text-sm font-semibold text-[var(--fg)]">{access.org.name}</span>
        </div>
        <SidebarNav items={nav} className="flex flex-col gap-1 p-3" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
          <span className="truncate text-sm font-medium text-[var(--fg)] md:hidden">
            {access.org.name}
          </span>
          <div className="hidden items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface-1)] py-1 pr-3 pl-1 md:flex">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-full)] bg-[var(--brand-100)] text-[11px] font-semibold text-[var(--brand-700)]"
            >
              {initials}
            </span>
            <span className="truncate text-xs font-medium text-[var(--text-secondary)]">{name}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:text-[var(--fg)]"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <SidebarNav
          items={nav}
          className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-1)] px-2 py-2 md:hidden"
        />

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
