import type { CellValue, ExportColumn } from './types';
import { config } from './errors';
function formulaLike(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32 || /\s/.test(character)) continue;
    return '=+-@'.includes(character);
  }
  return false;
}

export function safeValue(
  value: unknown,
  format: string,
  escapeCsv: boolean
): CellValue {
  if (value == null) return null;
  if (value instanceof Date) {
    config(Number.isFinite(value.getTime()), 'Invalid Date cannot be exported');
    // Treat Date as a UTC instant; avoid browser-local timezone changes in the engine.
    return value.toISOString();
  }
  config(
    ['string', 'number', 'boolean'].includes(typeof value),
    'Export values must be strings, finite numbers, booleans, Dates or null'
  );
  config(
    typeof value !== 'number' || Number.isFinite(value),
    'Non-finite numbers cannot be exported'
  );
  if (
    format === 'csv' &&
    escapeCsv &&
    typeof value === 'string' &&
    formulaLike(value)
  )
    return `'${value}`;
  return value as CellValue;
}
export function getValue<T extends object>(
  column: ExportColumn<T>,
  row: T,
  index: number,
  rowNumber: number
): unknown {
  if (column.value) return column.value(row, { index, rowNumber });
  const value = row[column.field!];
  // The mapped public type ties each formatter to its field; dispatch once internally.
  return column.format
    ? (column.format as (v: unknown, row: T) => CellValue)(value, row)
    : value;
}
