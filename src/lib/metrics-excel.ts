import 'server-only';

import ExcelJS from 'exceljs';
import { keysForProfile, METRIC_LABELS, type MetricKey, type ReportProfile } from '@/lib/metrics';

/**
 * The bulk-load Excel path: one client, one row per month, base metrics only
 * (never a ratio — CTR/CPL/ROAS/engagement rate stay computed, same rule as
 * the on-screen grid). {@link buildMetricsTemplateWorkbook} generates the
 * download; {@link parseMetricsWorkbook} reads it back and validates every
 * cell before anything is written to the database.
 */

const SHEET_NAME = 'Métricas';
const INSTRUCTIONS =
  'No modifiques la columna "Mes" ni los encabezados. Dejá una celda vacía si no tenés el dato — no cargues 0. Un mes sin ninguna celda cargada se omite al guardar, no borra lo que ya había.';
const MUTED_ARGB = 'FF64748B';
const SURFACE_ARGB = 'FFF8FAFC';
const MONTH_RE = /^\d{4}-\d{2}$/;
export const MAX_TEMPLATE_ROWS = 60;

function headerLabels(profile: ReportProfile): string[] {
  return ['Mes', ...keysForProfile(profile).map((key) => METRIC_LABELS[key])];
}

/** Build the downloadable `.xlsx` for one client: instructions, header, one row per month. */
export async function buildMetricsTemplateWorkbook(input: {
  profile: ReportProfile;
  /** `YYYY-MM`, oldest first. */
  months: string[];
  /** Existing values per month, used to pre-fill rather than starting blank. */
  existing: Record<string, Partial<Record<MetricKey, number>>>;
}): Promise<ExcelJS.Buffer> {
  const keys = keysForProfile(input.profile);
  const labels = headerLabels(input.profile);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Reportes App';
  const sheet = workbook.addWorksheet(SHEET_NAME);

  sheet.mergeCells(1, 1, 1, labels.length);
  const instructionsCell = sheet.getCell(1, 1);
  instructionsCell.value = INSTRUCTIONS;
  instructionsCell.font = { italic: true, color: { argb: MUTED_ARGB } };
  instructionsCell.alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(1).height = 30;

  const headerRow = sheet.getRow(2);
  headerRow.values = labels;
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURFACE_ARGB } };
  });

  sheet.getColumn(1).width = 12;
  for (let i = 0; i < keys.length; i++) sheet.getColumn(i + 2).width = 20;
  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  input.months.forEach((month, index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = month;
    row.getCell(1).font = { bold: true };
    const values = input.existing[month] ?? {};
    keys.forEach((key, keyIndex) => {
      const value = values[key];
      if (value != null) row.getCell(keyIndex + 2).value = Math.round(value * 100) / 100;
    });
  });

  return workbook.xlsx.writeBuffer();
}

export type ParsedMonthRow = {
  periodMonth: string;
  values: Partial<Record<MetricKey, number>>;
  errors: string[];
};

export type ParseResult =
  | { ok: true; rows: ParsedMonthRow[] }
  | { ok: false; error: string };

/** A cell's raw value normalized to a number, or `null` if it can't be read as one. */
function parseNumericCell(raw: ExcelJS.CellValue): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'object' && 'result' in raw) {
    // A formula cell — trust its computed result only if that result is a number.
    return typeof raw.result === 'number' ? raw.result : null;
  }
  const text = String(raw).trim();
  if (text === '') return null;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  // Ambiguous thousands/decimal mix (e.g. "1,234.56" vs "1.234,56") — reject
  // rather than guess the locale.
  if (hasComma && hasDot) return null;
  const normalized = hasComma ? text.replace(',', '.') : text;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Read an uploaded workbook back into per-month rows, validating the header
 * against the exact template for `profile` and every cell's value. Never
 * touches the database — the caller decides what to do with the result.
 */
export async function parseMetricsWorkbook(
  buffer: Buffer,
  profile: ReportProfile,
): Promise<ParseResult> {
  const keys = keysForProfile(profile);
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own `Buffer` type doesn't structurally match Node's — a
    // typings quirk, not a real runtime concern (it just reads bytes).
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, error: 'No pudimos leer el archivo. ¿Es un .xlsx válido?' };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, error: 'El archivo no tiene ninguna hoja.' };

  const expected = headerLabels(profile);
  const headerRow = sheet.getRow(2);
  for (let i = 0; i < expected.length; i++) {
    const cellText = String(headerRow.getCell(i + 1).value ?? '').trim();
    if (cellText !== expected[i]) {
      return {
        ok: false,
        error:
          'La estructura del archivo no coincide con la plantilla esperada. Descargala de nuevo e intentá otra vez.',
      };
    }
  }

  const rows: ParsedMonthRow[] = [];
  const seen = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // instructions + header
    if (rows.length >= MAX_TEMPLATE_ROWS) return;

    const monthCell = row.getCell(1).value;
    const periodMonth = String(monthCell ?? '').trim();
    if (!periodMonth) return; // fully blank row — not a month, skip silently

    const errors: string[] = [];
    if (!MONTH_RE.test(periodMonth)) {
      errors.push(`Fila ${rowNumber}: "${periodMonth}" no es un mes válido (formato AAAA-MM).`);
    } else if (seen.has(periodMonth)) {
      errors.push(`Fila ${rowNumber}: el mes ${periodMonth} está repetido en el archivo.`);
    }
    seen.add(periodMonth);

    const values: Partial<Record<MetricKey, number>> = {};
    keys.forEach((key, keyIndex) => {
      const raw = row.getCell(keyIndex + 2).value;
      if (raw == null || raw === '') return;
      const num = parseNumericCell(raw);
      if (num === null || num < 0) {
        errors.push(`Fila ${rowNumber}, ${METRIC_LABELS[key]}: "${raw}" no es un número válido.`);
        return;
      }
      values[key] = num;
    });

    rows.push({ periodMonth, values, errors });
  });

  if (rows.length === 0) {
    return { ok: false, error: 'No encontramos ninguna fila con datos en el archivo.' };
  }

  return { ok: true, rows };
}
