'use client';

/**
 * Builds a CSV from data already on the page and triggers a download — no
 * server round-trip, no new endpoint.
 */
export function ExportCsvButton({
  rows,
  filename,
}: {
  rows: Array<Record<string, string | number>>;
  filename: string;
}) {
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const cell = (value: string | number) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => cell(row[h] ?? '')).join(',')),
    ].join('\n');

    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
    >
      Descargar CSV
    </button>
  );
}
