import { notFound, redirect } from 'next/navigation';
import { saveMonthlyMetricsAction } from '@/app/[orgSlug]/metrics/actions';
import { MonthlyMetricForm } from '@/components/app/monthly-metric-form';
import { getCurrentUser } from '@/lib/auth';
import { currentMonth, monthLabel } from '@/lib/metrics';
import { listClients } from '@/server/queries/clients';
import { monthlyMetricValues } from '@/server/queries/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';

const NOTICES: Record<string, string> = {
  saved: 'Métricas del mes guardadas.',
  'error:invalid': 'Revisa los números ingresados.',
  'error:client': 'Ese cliente ya no existe.',
  'error:forbidden': 'No tienes permiso para cargar métricas en esta organización.',
};

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';

export default async function MetricsEntryPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { client?: string; month?: string; saved?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/metrics`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const clients = await listClients(access.org.id);
  const month =
    typeof searchParams.month === 'string' && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : currentMonth();
  const activeClient =
    clients.find((c) => c.id === searchParams.client) ?? clients[0] ?? null;

  const initial = activeClient
    ? await monthlyMetricValues(access.org.id, activeClient.id, month)
    : {};

  const noticeKey = searchParams.saved
    ? 'saved'
    : searchParams.error
      ? `error:${searchParams.error}`
      : null;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Cargar métricas</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Un total por métrica, por cliente y por mes. Los reportes se arman con esto.
        </p>
      </div>

      {notice ? (
        <p
          role={searchParams.error ? 'alert' : undefined}
          className={`rounded border border-[var(--border)] p-3 text-sm ${
            searchParams.error
              ? 'text-[var(--destructive)]'
              : 'bg-[var(--surface)] text-[var(--fg)]'
          }`}
        >
          {notice}
        </p>
      ) : null}

      {clients.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
          Agrega un cliente antes de cargar métricas.
        </p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
              Cliente
              <select name="client" defaultValue={activeClient?.id} className={CONTROL}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
              Mes
              <input type="month" name="month" defaultValue={month} className={CONTROL} />
            </label>
            <button
              type="submit"
              className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
            >
              Ver
            </button>
          </form>

          {activeClient ? (
            <MonthlyMetricForm
              orgSlug={params.orgSlug}
              clientId={activeClient.id}
              clientName={activeClient.name}
              periodMonth={month}
              monthLabel={monthLabel(month)}
              initial={initial}
              action={saveMonthlyMetricsAction}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
