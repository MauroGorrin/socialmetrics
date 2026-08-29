'use client';

export type PostRow = {
  url: string;
  format: string | null;
  reach: number | null;
  interactions: number | null;
};

const MAX_POSTS = 5;

const FORMAT_OPTIONS = [
  { value: '', label: '—' },
  { value: 'reel', label: 'Reel' },
  { value: 'carousel', label: 'Carrusel' },
  { value: 'image', label: 'Imagen' },
  { value: 'story', label: 'Historia' },
  { value: 'video', label: 'Video' },
];

const FIELD =
  'w-full rounded border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

/**
 * Up to five best-posts rows for an organic / mixed client. Uncontrolled — the
 * page reloads on save, so `initial` is always fresh. Empty rows (no URL) are
 * ignored server-side; the report shows the top three by interactions.
 */
export function TopPostsFields({ initial }: { initial: PostRow[] }) {
  const rows = Array.from({ length: MAX_POSTS }, (_, i) => initial[i] ?? null);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-[var(--fg)]">Mejores publicaciones del mes</legend>
      <p className="text-xs text-[var(--fg-muted)]">
        Hasta 5. El reporte muestra las 3 con más interacciones.
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list, position is the identity
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_6rem_6rem]">
            <input
              name={`post_${i}_url`}
              type="url"
              inputMode="url"
              placeholder={`URL de la publicación ${i + 1}`}
              defaultValue={row?.url ?? ''}
              className={FIELD}
            />
            <select name={`post_${i}_format`} defaultValue={row?.format ?? ''} className={FIELD}>
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              name={`post_${i}_reach`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Alcance"
              defaultValue={row?.reach ?? ''}
              className={FIELD}
            />
            <input
              name={`post_${i}_interactions`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Interac."
              defaultValue={row?.interactions ?? ''}
              className={FIELD}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
