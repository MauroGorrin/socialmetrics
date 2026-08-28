import { notFound, redirect } from 'next/navigation';
import { AuditLogTable } from '@/components/app/audit-log-table';
import { getCurrentUser } from '@/lib/auth';
import { auditActions, listAuditLogs } from '@/server/queries/audits';
import { getAccessibleOrg } from '@/server/queries/orgs';

const timeFmt = new Intl.DateTimeFormat('es', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function summarise(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
    .slice(0, 160);
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { action?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/settings/audit`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  if (access.role === 'manager') {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Auditoría</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Solo los administradores pueden ver el registro de auditoría.
        </p>
      </section>
    );
  }

  const activeAction = typeof searchParams.action === 'string' ? searchParams.action : '';
  const [entries, actions] = await Promise.all([
    listAuditLogs(access.org.id, { action: activeAction || undefined }),
    auditActions(access.org.id),
  ]);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Auditoría</h1>

      <AuditLogTable
        basePath={`/${params.orgSlug}/settings/audit`}
        actions={actions}
        activeAction={activeAction}
        rows={entries.map((entry) => ({
          id: entry.id,
          action: entry.action,
          actor: entry.actorName ? `${entry.actorName} (${entry.actorEmail})` : entry.actorEmail,
          target: entry.targetId,
          when: timeFmt.format(entry.createdAt),
          detail: summarise(entry.metadata),
        }))}
      />
    </section>
  );
}
