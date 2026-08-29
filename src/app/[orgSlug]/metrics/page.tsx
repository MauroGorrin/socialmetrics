import { notFound, redirect } from 'next/navigation';
import {
  commitMetricsExcelAction,
  previewMetricsExcelAction,
  saveMonthlyMetricsAction,
} from '@/app/[orgSlug]/metrics/actions';
import { MetricsExcelUpload } from '@/components/app/metrics-excel-upload';
import { MonthlyMetricForm } from '@/components/app/monthly-metric-form';
import type { PostRow } from '@/components/app/top-posts-fields';
import { getCurrentUser } from '@/lib/auth';
import { PROFILE_LABELS } from '@/lib/client-profile';
import { currentMonth, keysForProfile, monthLabel, type ReportProfile } from '@/lib/metrics';
import { listClients } from '@/server/queries/clients';
import { monthlyMetricValues, monthlyPosts } from '@/server/queries/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';

const NOTICES: Record<string, string> = {
  saved: 'Métricas del mes guardadas.',
  'error:invalid': 'Revisa los números ingresados.',
  'error:client': 'Ese cliente ya no existe.',
  'error:forbidden': 'No tienes permiso para cargar métricas en esta organización.',
};

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';
const BTN =
  'rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';

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

  const canBulkUpload = access.role === 'owner' || access.role === 'admin';
  const clients = await listClients(access.org.id);
  const month =
    typeof searchParams.month === 'string' && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : currentMonth();
  const activeClient =
    clients.find((c) => c.id === searchParams.client) ?? clients[0] ?? null;

  const [initial, posts] = activeClient
    ? await Promise.all([
        monthlyMetricValues(access.org.id, activeClient.id, month),
        monthlyPosts(access.org.id, activeClient.id, month),
      ])
    : [{}, []];
  const activeProfile = (activeClient?.reportProfile as ReportProfile) ?? 'ads';
  const initialPosts: PostRow[] = posts.map((post) => ({
    url: post.url,
    format: post.format,
    reach: post.reach == null ? null : Number(post.reach),
    interactions: post.interactions == null ? null : Number(post.interactions),
  }));

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
            <button type="submit" className={BTN}>
              Ver
            </button>
          </form>

          {activeClient ? (
            <MonthlyMetricForm
              orgSlug={params.orgSlug}
              clientId={activeClient.id}
              clientName={`${activeClient.name} · ${PROFILE_LABELS[activeProfile]}`}
              periodMonth={month}
              monthLabel={monthLabel(month)}
              profile={activeProfile}
              initial={initial}
              initialPosts={initialPosts}
              action={saveMonthlyMetricsAction}
            />
          ) : null}

          {activeClient && canBulkUpload ? (
            <div className="space-y-4 border-t border-[var(--border)] pt-6">
              <div>
                <h2 className="text-lg font-semibold text-[var(--fg)]">Carga en bloque</h2>
                <p className="text-sm text-[var(--fg-muted)]">
                  Para cargar varios meses de una — un histórico, o un cliente que ya lleva sus números
                  en una planilla.
                </p>
              </div>

              <form
                method="get"
                action={`/api/orgs/${params.orgSlug}/metrics/template`}
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="client" value={activeClient.id} />
                <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                  Meses a incluir
                  <select name="months" defaultValue="12" className={CONTROL}>
                    <option value="6">6 meses</option>
                    <option value="12">12 meses</option>
                    <option value="24">24 meses</option>
                  </select>
                </label>
                <button type="submit" className={BTN}>
                  Descargar plantilla
                </button>
              </form>

              <MetricsExcelUpload
                orgSlug={params.orgSlug}
                clientId={activeClient.id}
                metricKeys={keysForProfile(activeProfile)}
                preview={previewMetricsExcelAction}
                commit={commitMetricsExcelAction}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
