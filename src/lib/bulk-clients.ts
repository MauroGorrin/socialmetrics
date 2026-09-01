import { PROFILE_LABELS, REPORT_PROFILES } from '@/lib/client-profile';
import type { ReportProfile } from '@/lib/metrics';

/**
 * Parser for the "add several clients" textarea: one client per line, either
 * `Nombre` or `Nombre, tipo` where `tipo` is a report profile key (`ads`,
 * `organic`, `mixed`) or its Spanish label (`Ads`, `Orgánico`, `Ambos`).
 * Pure and side-effect free so the dialog and a unit test share one source of
 * truth; the server action calls this before touching the database.
 */

export const MAX_BULK_CLIENTS = 50;

export type BulkClientRow = { name: string; reportProfile: ReportProfile };

export type BulkParseResult = {
  rows: BulkClientRow[];
  /** Human-readable notes: skipped duplicates, ignored malformed lines, the cap. */
  errors: string[];
};

const PROFILE_BY_LABEL = new Map<string, ReportProfile>(
  REPORT_PROFILES.flatMap((key) => [
    [key, key],
    [PROFILE_LABELS[key].toLowerCase(), key],
  ]),
);

function resolveProfile(token: string): ReportProfile | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return 'ads';
  return PROFILE_BY_LABEL.get(normalized) ?? null;
}

export function parseBulkClients(raw: string): BulkParseResult {
  const errors: string[] = [];
  const rows: BulkClientRow[] = [];
  const seen = new Set<string>();

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (rows.length >= MAX_BULK_CLIENTS) {
      errors.push(`Solo se procesan los primeros ${MAX_BULK_CLIENTS} clientes por vez.`);
      break;
    }

    const comma = line.lastIndexOf(',');
    const rawName = (comma === -1 ? line : line.slice(0, comma)).trim();
    const rawProfile = comma === -1 ? '' : line.slice(comma + 1).trim();

    if (!rawName) {
      errors.push(`Línea ignorada (sin nombre): "${line}"`);
      continue;
    }
    if (rawName.length > 120) {
      errors.push(`"${rawName.slice(0, 24)}…": el nombre supera 120 caracteres.`);
      continue;
    }

    const profile = resolveProfile(rawProfile);
    if (profile === null) {
      errors.push(`"${rawName}": tipo "${rawProfile}" no reconocido (usá ads, orgánico o ambos).`);
      continue;
    }

    const key = rawName.toLowerCase();
    if (seen.has(key)) {
      errors.push(`"${rawName}": duplicado en la lista, se omite.`);
      continue;
    }
    seen.add(key);
    rows.push({ name: rawName, reportProfile: profile });
  }

  return { rows, errors };
}
