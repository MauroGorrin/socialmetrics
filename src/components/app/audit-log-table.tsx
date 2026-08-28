export type AuditRow = {
  id: string;
  action: string;
  actor: string;
  target: string | null;
  when: string;
  detail: string;
};

type Props = {
  rows: AuditRow[];
  actions: string[];
  activeAction: string;
  /** `/${orgSlug}/settings/audit` */
  basePath: string;
};

/** Audit log viewer: an action-type filter (GET form) and a table. */
export function AuditLogTable({ rows, actions, activeAction, basePath }: Props) {
  return (
    <div className="space-y-3">
      <form method="get" action={basePath} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Filtrar por acción
          <select
            name="action"
            defaultValue={activeAction}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="">Todas las acciones</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded border border-[var(--border)] px-3 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
        >
          Filtrar
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
          No hay actividad registrada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Acción</th>
                <th className="px-4 py-2 font-medium">Usuario</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <tr key={row.id} data-action={row.action}>
                  <td className="whitespace-nowrap px-4 py-2 text-[var(--fg-muted)]">{row.when}</td>
                  <td className="px-4 py-2 font-medium text-[var(--fg)]">{row.action}</td>
                  <td className="px-4 py-2 text-[var(--fg)]">{row.actor}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-[var(--fg-muted)]" title={row.detail}>
                    {row.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
