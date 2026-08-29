import { notFound, redirect } from 'next/navigation';
import { generateReportAction } from '@/app/[orgSlug]/reports/actions';
import { MonthFilter } from '@/components/app/month-filter';
import { ReportListTable } from '@/components/app/report-list-table';
import { getCurrentUser } from '@/lib/auth';
import { PROFILE_LABELS } from '@/lib/client-profile';
import type { ReportProfile } from '@/lib/metrics';
import { listClients } from '@/server/queries/clients';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { listReports, reportMonths } from '@/server/queries/reports';

const ERRORS: Record<string, string> = {
  period: 'Elige un mes válido.',
  failed: 'No pudimos generar el reporte. Vuelve a intentar.',
  forbidden: 'Necesitas rol de administrador para generar reportes.',
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { error?: string; month?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/reports`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const activeMonth = typeof searchParams.month === 'string' ? searchParams.month : '';
  const [reports, months, clients] = await Promise.all([
    listReports(access.org.id, { month: activeMonth || undefined }),
    reportMonths(access.org.id),
    listClients(access.org.id),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const canGenerate = access.role === 'owner' || access.role === 'admin';
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;
  const basePath = `/${params.orgSlug}/reports`;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Reportes</h1>

      {error ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {canGenerate && clients.length > 0 ? (
        <form
          action={generateReportAction}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Cliente
            <select
              name="clientId"
              required
              className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
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
            Generar
          </button>
        </form>
      ) : null}

      <MonthFilter basePath={basePath} months={months} active={activeMonth} />

      <ReportListTable
        orgSlug={params.orgSlug}
        canGenerate={canGenerate}
        generateAction={generateReportAction}
        rows={reports.map((report) => ({
          id: report.id,
          periodMonth: report.periodMonth,
          clientId: report.clientId,
          clientName: report.clientId
            ? (clientName.get(report.clientId) ?? 'Cliente eliminado')
            : 'Todos',
          profileLabel: PROFILE_LABELS[(report.profile as ReportProfile) ?? 'ads'],
          createdAt: report.createdAt.toISOString(),
          status: report.status,
          hasPdf: Boolean(report.pdfUrl),
        }))}
      />
    </section>
  );
}
