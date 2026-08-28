import { notFound, redirect } from 'next/navigation';
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
} from '@/app/[orgSlug]/settings/members/actions';
import { InviteDialog } from '@/components/app/invite-dialog';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { listMembers } from '@/server/queries/memberships';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  manager: 'Gestor',
};

const NOTICES: Record<string, string> = {
  'ok:role': 'Rol actualizado.',
  'ok:removed': 'Miembro eliminado.',
  'error:forbidden': 'No tenés permiso para esta acción.',
  'error:missing': 'Ese miembro ya no existe.',
  'error:role': 'No se pudo cambiar el rol.',
  'error:remove': 'No se pudo eliminar al miembro.',
};

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { ok?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/settings/members`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const members = await listMembers(access.org.id);
  const canInvite = access.role === 'owner' || access.role === 'admin';
  const canManage = access.role === 'owner';

  const noticeKey = searchParams.ok
    ? `ok:${searchParams.ok}`
    : searchParams.error
      ? `error:${searchParams.error}`
      : null;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Miembros</h1>
        {canInvite ? <InviteDialog orgSlug={params.orgSlug} action={inviteMemberAction} /> : null}
      </div>

      {notice ? (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
          {notice}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--fg-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {members.map((member) => (
              <tr key={member.membershipId}>
                <td className="px-4 py-2 text-[var(--fg)]">{member.email}</td>
                <td className="px-4 py-2 text-[var(--fg)]">
                  {canManage && !member.isOwner ? (
                    <form action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="orgSlug" value={params.orgSlug} />
                      <input type="hidden" name="membershipId" value={member.membershipId} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--fg)]"
                      >
                        <option value="manager">Gestor</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg)] hover:opacity-70"
                      >
                        Guardar
                      </button>
                    </form>
                  ) : (
                    (ROLE_LABELS[member.role] ?? member.role)
                  )}
                </td>
                <td className="px-4 py-2 text-[var(--fg-muted)]">
                  {member.status === 'active' ? 'Activo' : 'Pendiente'}
                </td>
                <td className="px-4 py-2 text-right">
                  {canManage && !member.isOwner ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="orgSlug" value={params.orgSlug} />
                      <input type="hidden" name="membershipId" value={member.membershipId} />
                      <button
                        type="submit"
                        className="rounded border border-[var(--destructive)] px-2 py-1 text-xs text-[var(--destructive)] hover:opacity-70"
                      >
                        Quitar
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
