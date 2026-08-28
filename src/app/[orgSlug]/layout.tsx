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
    { href: `${base}/dashboard`, label: 'Panel' },
    { href: `${base}/clients`, label: 'Clientes' },
    { href: `${base}/metrics`, label: 'Métricas' },
    { href: `${base}/reports`, label: 'Reportes' },
    { href: `${base}/settings`, label: 'Ajustes' },
  ];

  const name = (user.user_metadata?.name as string | undefined)?.trim() || user.email || '';
  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
        <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
          <span className="truncate text-base font-bold text-[var(--fg)]">{access.org.name}</span>
        </div>
        <SidebarNav items={nav} className="flex flex-col gap-1 p-3" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)] px-4">
          <span className="truncate text-sm font-medium text-[var(--fg)] md:hidden">
            {access.org.name}
          </span>
          <div className="hidden items-center gap-2 md:flex">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] text-xs font-semibold text-[var(--fg)]"
            >
              {initials}
            </span>
            <span className="truncate text-sm text-[var(--fg-muted)]">{name}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 ease-out hover:opacity-70"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>

        <SidebarNav
          items={nav}
          className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 md:hidden"
        />

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
