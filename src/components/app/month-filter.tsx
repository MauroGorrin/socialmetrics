/** GET-form month filter for the report list. Presentational — no client JS. */
export function MonthFilter({
  basePath,
  months,
  active,
}: {
  basePath: string;
  months: string[];
  active: string;
}) {
  if (months.length === 0) return null;

  return (
    <form method="get" action={basePath} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
        Filtrar por mes
        <select
          name="month"
          defaultValue={active}
          className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]"
        >
          <option value="">Todos los meses</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {month}
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
  );
}
