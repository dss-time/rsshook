export * from './types';
export { ExcelError, DEFAULT_LIMITS } from './errors';
export {
  parseExcel,
  parseExcelBatches,
  parseCsvBatches,
  importBatches,
} from './import';
export { serializeExcel } from './export';
import { getValue } from './export';
import type {
  ExcelSchema,
  ExportColumn,
  ExportSheet,
  ParseResult,
} from './types';

/** Contextually types field converters and validators; no runtime engine load. */
export function defineExcelSchema<T extends object>(
  schema: ExcelSchema<T>
): ExcelSchema<T> {
  return schema;
}
export function defineExcelColumns<T extends object>(
  columns: readonly ExportColumn<T>[]
): readonly ExportColumn<T>[] {
  return columns;
}
/** Build a template using the same layout; does not mutate the source sheet. */
export function createExcelTemplate<T extends object>(
  sheet: ExportSheet<T>
): ExportSheet<T> {
  return { ...sheet, rows: [] };
}
/** Stable error report, independent of source workbook formatting. */
export function createExcelErrorSheet<T extends object>(
  result: ParseResult<T>,
  name = 'Errors'
): ExportSheet<Record<string, unknown>> {
  const columns = [
    ...new Set(result.invalidRows.flatMap(row => Object.keys(row.raw))),
  ];
  return {
    name,
    columns: [
      { id: 'rowNumber', field: 'rowNumber', title: 'Row' },
      ...columns.map(column => ({
        id: `source:${column}`,
        field: `source:${column}`,
        title: column,
      })),
      { id: 'errors', field: 'errors', title: 'Errors' },
    ],
    rows: result.invalidRows.map(row =>
      Object.fromEntries([
        ['rowNumber', row.rowNumber],
        ...columns.map(column => [`source:${column}`, row.raw[column] ?? null]),
        [
          'errors',
          row.issues
            .map(
              issue => `${issue.field ?? issue.column ?? ''}: ${issue.message}`
            )
            .join('; '),
        ],
      ])
    ),
  };
}

/** Type-check each sheet independently, then combine different row types. */
export function defineExcelSheet<T extends object>(
  sheet: ExportSheet<T>
): ExportSheet<object> {
  return {
    ...sheet,
    columns: sheet.columns.map(column => ({
      id: column.id,
      title: column.title,
      width: column.width,
      numberFormat: column.numberFormat,
      value: (row: object, context: { index: number; rowNumber: number }) =>
        getValue(
          column,
          row as T,
          context.index,
          context.rowNumber
        ) as import('./types').CellValue,
    })),
  };
}
export { serializeCsvStream, writeCsv } from './csv-write';
