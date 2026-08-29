'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatMetric, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

type Row = { periodMonth: string; values: Partial<Record<MetricKey, number>>; errors: string[] };
type UploadResult = { ok: true; data: Row[] } | { ok: false; error: string };

const BTN =
  'rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70 disabled:pointer-events-none disabled:opacity-40';
const PRIMARY_BTN =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-40';

/**
 * The two-step bulk-load flow: pick a `.xlsx`, preview what it would write
 * (with row-level errors, nothing saved yet), then confirm. Confirming
 * re-sends the same file rather than the previewed numbers — the server
 * never trusts figures echoed back by the client, only the file itself.
 */
export function MetricsExcelUpload({
  orgSlug,
  clientId,
  metricKeys,
  preview,
  commit,
}: {
  orgSlug: string;
  clientId: string;
  metricKeys: MetricKey[];
  preview: (formData: FormData) => Promise<UploadResult>;
  commit: (formData: FormData) => Promise<UploadResult>;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function run(action: (formData: FormData) => Promise<UploadResult>) {
    if (!file) return null;
    setPending(true);
    const formData = new FormData();
    formData.set('orgSlug', orgSlug);
    formData.set('clientId', clientId);
    formData.set('file', file);
    const outcome = await action(formData);
    setResult(outcome);
    setPending(false);
    return outcome;
  }

  function reset() {
    setFile(null);
    setResult(null);
    setSaved(false);
  }

  const cleanCount = result?.ok
    ? result.data.filter((row) => Object.keys(row.values).length > 0).length
    : 0;
  const hasErrors = result?.ok ? result.data.some((row) => row.errors.length > 0) : false;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h3 className="font-semibold text-[var(--fg)]">Cargar por Excel</h3>
        <p className="text-sm text-[var(--fg-muted)]">
          Subí la plantilla completa. Vas a poder revisar los meses antes de guardar nada.
        </p>
      </div>

      {saved ? (
        <div className="space-y-3">
          <p className="rounded border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--fg)]">
            Métricas guardadas.
          </p>
          <button type="button" onClick={reset} className={BTN}>
            Cargar otro archivo
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(preview);
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="text-sm text-[var(--fg)]"
            />
            <button type="submit" disabled={!file || pending} className={BTN}>
              {pending ? 'Leyendo…' : 'Previsualizar'}
            </button>
          </form>

          {result && !result.ok ? (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {result.error}
            </p>
          ) : null}

          {result?.ok ? (
            <div className="space-y-3">
              <div className="max-h-72 overflow-auto rounded border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--surface)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[var(--fg-muted)]">Mes</th>
                      {metricKeys.map((key) => (
                        <th key={key} className="px-3 py-2 text-right text-[var(--fg-muted)]">
                          {METRIC_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row) => (
                      <tr
                        key={row.periodMonth}
                        className={row.errors.length > 0 ? 'bg-[var(--destructive)]/10' : ''}
                      >
                        <td className="px-3 py-2 font-medium text-[var(--fg)]">{row.periodMonth}</td>
                        {metricKeys.map((key) => (
                          <td key={key} className="px-3 py-2 text-right text-[var(--fg)]">
                            {row.values[key] != null ? formatMetric(key, row.values[key] as number) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasErrors ? (
                <ul className="space-y-1 text-sm text-[var(--destructive)]">
                  {result.data
                    .flatMap((row) => row.errors)
                    .map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--fg-muted)]">
                  Se van a guardar {cleanCount} mes{cleanCount === 1 ? '' : 'es'}. Los meses vacíos no se
                  tocan.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={hasErrors || pending || cleanCount === 0}
                  onClick={async () => {
                    const outcome = await run(commit);
                    if (outcome?.ok) {
                      setSaved(true);
                      router.refresh();
                    }
                  }}
                  className={PRIMARY_BTN}
                >
                  {pending ? 'Guardando…' : 'Confirmar y guardar'}
                </button>
                <button type="button" onClick={reset} className={BTN}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
