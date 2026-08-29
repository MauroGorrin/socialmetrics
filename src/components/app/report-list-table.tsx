import Link from 'next/link';

export type ReportListRow = {
  id: string;
  periodMonth: string;
  clientId: string | null;
  clientName: string;
  profileLabel: string;
  createdAt: string;
  status: string;
  hasPdf: boolean;
};

type Props = {
  orgSlug: string;
  rows: ReportListRow[];
  canGenerate: boolean;
  /** `generateReportAction`, passed by the page (drafts re-generate in place). */
  generateAction: (formData: FormData) => Promise<void>;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  generated: 'Generado',
  sent: 'Enviado',
  shared: 'Compartido',
};

/** Report history table: month, created date, status, and per-row actions. */
export function ReportListTable({ orgSlug, rows, canGenerate, generateAction }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
        No hay reportes para este filtro.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] text-[var(--fg-muted)]">
          <tr>
            <th className="px-4 py-2 font-medium">Mes</th>
            <th className="px-4 py-2 font-medium">Cliente</th>
            <th className="px-4 py-2 font-medium">Tipo</th>
            <th className="px-4 py-2 font-medium">Creado</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2 font-medium text-[var(--fg)]">{row.periodMonth}</td>
              <td className="px-4 py-2 text-[var(--fg)]">{row.clientName}</td>
              <td className="px-4 py-2 text-[var(--fg-muted)]">{row.profileLabel}</td>
              <td className="px-4 py-2 text-[var(--fg-muted)]">{row.createdAt.slice(0, 10)}</td>
              <td className="px-4 py-2 text-[var(--fg-muted)]">
                {STATUS_LABEL[row.status] ?? row.status}
              </td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-2">
                  <Link
                    href={`/${orgSlug}/reports/${row.id}`}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg)] hover:opacity-70"
                  >
                    Ver
                  </Link>
                  {row.hasPdf ? (
                    <a
                      href={`/api/reports/${row.id}/download`}
                      className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg)] hover:opacity-70"
                    >
                      Descargar
                    </a>
                  ) : canGenerate ? (
                    <form action={generateAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="periodMonth" value={row.periodMonth} />
                      {row.clientId ? (
                        <input type="hidden" name="clientId" value={row.clientId} />
                      ) : null}
                      <button
                        type="submit"
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--fg)] hover:opacity-70"
                      >
                        Generar
                      </button>
                    </form>
                  ) : (
                    <span className="px-2 py-1 text-xs text-[var(--fg-muted)]">Sin PDF</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
