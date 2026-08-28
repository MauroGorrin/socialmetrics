import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { generateReportAction } from '@/app/[orgSlug]/reports/actions';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { listReports } from '@/server/queries/reports';

const ERRORS: Record<string, string> = {
  period: 'Elegí un mes válido.',
  failed: 'No pudimos generar el reporte. Probá de nuevo.',
  forbidden: 'Necesitás rol de administrador para generar reportes.',
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/reports`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const reports = await listReports(access.org.id);
  const canGenerate = access.role === 'owner' || access.role === 'admin';
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Reportes</h1>

      {error ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {canGenerate ? (
        <form
          action={generateReportAction}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Mes
            <input
              name="periodMonth"
              type="month"
              required
              defaultValue={currentMonth()}
              className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Generar reporte
          </button>
        </form>
      ) : null}

      {reports.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
          Todavía no generaste reportes.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/${params.orgSlug}/reports/${report.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[var(--surface)]"
              >
                <span className="font-medium text-[var(--fg)]">{report.periodMonth}</span>
                <span className="text-sm text-[var(--fg-muted)]">
                  {report.status === 'generated' || report.status === 'sent'
                    ? 'Generado'
                    : 'Borrador'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
