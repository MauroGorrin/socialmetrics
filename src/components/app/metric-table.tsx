import Link from 'next/link';

export type MetricTableRow = {
  id: string;
  clientName: string;
  metricLabel: string;
  value: string;
  period: string;
};

type Props = {
  rows: MetricTableRow[];
  page: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  clients: { id: string; name: string }[];
  activeClientId: string;
  /** `/${orgSlug}/dashboard` */
  basePath: string;
};

function pageHref(basePath: string, clientId: string, page: number): string {
  const params = new URLSearchParams();
  if (clientId) params.set('client', clientId);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Metric table with a client filter (GET form) and prev/next pagination. */
export function MetricTable({
  rows,
  page,
  pageCount,
  hasPrev,
  hasNext,
  clients,
  activeClientId,
  basePath,
}: Props) {
  return (
    <div className="space-y-3">
      <form method="get" action={basePath} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Filtrar por cliente
          <select
            name="client"
            defaultValue={activeClientId}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]"
          >
            <option value="">Todos los clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
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
          No hay métricas para este filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--fg-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Métrica</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-[var(--fg)]">{row.clientName}</td>
                  <td className="px-4 py-2 text-[var(--fg)]">{row.metricLabel}</td>
                  <td className="px-4 py-2 text-[var(--fg)]">{row.value}</td>
                  <td className="px-4 py-2 text-[var(--fg-muted)]">{row.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between text-sm">
        <span className="text-[var(--fg-muted)]">
          Página {page} de {pageCount}
        </span>
        <span className="flex gap-2">
          {hasPrev ? (
            <Link
              href={pageHref(basePath, activeClientId, page - 1)}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:opacity-70"
            >
              Anterior
            </Link>
          ) : null}
          {hasNext ? (
            <Link
              href={pageHref(basePath, activeClientId, page + 1)}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-[var(--fg)] hover:opacity-70"
            >
              Siguiente
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
