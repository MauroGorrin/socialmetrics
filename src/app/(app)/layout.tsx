import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

/** Shell for every authenticated route: docked sidebar + topbar + content. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
