import type { ReactNode } from 'react';

/**
 * Shell for the pre-tenant routes — the onboarding wizard and the organization
 * picker. Deliberately chrome-free: there is no org context here yet, so a
 * sidebar of org-scoped links (`/clients`, `/reports`, …) would only lead to
 * 404s. Once the user is inside an org, `[orgSlug]/layout.tsx` provides the
 * real app shell.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-10">
      {children}
    </div>
  );
}
