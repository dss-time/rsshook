/** Public coordinates use Excel's 1-based rows and A/B/... columns. */
export type CellValue = string | number | boolean | Date | null;
export type FieldKey<T> = Extract<keyof T, string>;
export type ColumnName = string;
export interface ExcelIssue {
  code: string;
  message: string;
  rowNumber?: number;
  column?: string;
  field?: string;
}
export interface CellContext {
  rowNumber: number;
  column: string;
  field: string;
  raw: unknown;
  formatted: string;
}
export type ValidationResult = void | string | ExcelIssue | ExcelIssue[];
type FieldType<V> = unknown extends V
  ? 'string' | 'number' | 'boolean' | 'date'
  : V extends Date
    ? 'date'
    : V extends string
      ? 'string' | 'date'
      : V extends number
        ? 'number'
        : V extends boolean
          ? 'boolean'
          : never;
export interface FieldRule<V> {
  type?: FieldType<V>;
  required?: boolean;
  trim?: boolean;
  read?: 'auto' | 'raw' | 'formatted';
  defaultValue?: V;
  /** Replaces built-in conversion. Must return the field's runtime type. */
  parse?: (value: unknown, context: CellContext) => V;
  validate?: (value: V, context: CellContext) => ValidationResult;
  /** Required for date fields. date-string is calendar-only; Date uses UTC. */
  dateOutput?: unknown extends V
    ? 'date-string' | 'Date'
    : NonNullable<V> extends Date
      ? 'Date'
      : NonNullable<V> extends string
        ? 'date-string'
        : never;
  /** Explicit numeric boolean conversion; only 0 and 1 are accepted. */
  booleanNumbers?: boolean;
}
export interface ExcelSchema<T extends object> {
  fields: {
    [K in keyof T]-?: FieldRule<T[K]> &
      (undefined extends T[K]
        ? object
        : { required: true } | { defaultValue: T[K] });
  };
  validateRow?: (row: T, context: { rowNumber: number }) => ValidationResult;
}
export interface HeaderBinding {
  title: string;
  aliases?: readonly string[];
  requiredHeader?: boolean;
}
export type ImportHeader<T extends object> =
  | {
      mode: 'named';
      row: number;
      bindings: Partial<Record<FieldKey<T>, HeaderBinding>>;
    }
  | {
      mode: 'path';
      rows: readonly number[];
      bindings: Partial<
        Record<
          FieldKey<T>,
          { path: readonly string[]; requiredHeader?: boolean }
        >
      >;
    }
  | {
      mode: 'position';
      dataStartRow: number;
      bindings: Partial<Record<FieldKey<T>, ColumnName>>;
    };
export interface ExcelLimits {
  maxFileSize?: number;
  maxRows?: number;
  maxColumns?: number;
  maxCells?: number;
  maxSheets?: number;
  maxIssues?: number;
}
export type OperationPhase =
  | 'reading'
  | 'matching'
  | 'validating'
  | 'layout'
  | 'writing'
  | 'downloading';
export interface OperationOptions {
  signal?: AbortSignal;
  onPhase?: (phase: OperationPhase) => void;
}
export interface ParseOptions<T extends object> extends OperationOptions {
  schema: ExcelSchema<T>;
  header: ImportHeader<T>;
  sheet?: { name: string; index?: never } | { index: number; name?: never };
  dataStartRow?: number;
  dataEndRow?: number;
  unknownColumns?: 'ignore' | 'warn' | 'error';
  headerCaseSensitive?: boolean;
  normalizeHeader?: (value: string) => string;
  skipEmptyRows?: boolean;
  limits?: ExcelLimits;
  csv?: { delimiter?: string; codepage?: number };
}
export interface ParseResult<T extends object> {
  sheet: { name: string; index: number };
  validRows: Array<{ rowNumber: number; data: T }>;
  invalidRows: Array<{
    rowNumber: number;
    raw: Record<string, unknown>;
    partialData: Partial<T>;
    issues: ExcelIssue[];
  }>;
  warnings: ExcelIssue[];
  summary: {
    scannedRows: number;
    validRows: number;
    invalidRows: number;
    skippedRows: number;
  };
}
export type ExcelInput = Blob | ArrayBuffer | Uint8Array;
export interface ExportContext {
  index: number;
  rowNumber: number;
}
interface ExportColumnBase {
  id: string;
  title: string;
  width?: number;
  /** Excel number format, e.g. 0.00 or yyyy-mm-dd. */
  numberFormat?: string;
}
export type ExportColumn<T extends object> = ExportColumnBase &
  (
    | {
        [K in FieldKey<T>]: {
          field: K;
          value?: never;
          format?: (value: T[K], row: T) => CellValue;
        };
      }[FieldKey<T>]
    | {
        field?: never;
        value: (row: T, context: ExportContext) => CellValue;
        format?: never;
      }
  );
export type HeaderGroup =
  | { column: string; title?: never; children?: never }
  | { title: string; children: readonly HeaderGroup[]; column?: never };
export interface SheetRegion {
  rows: readonly (readonly CellValue[])[];
  merges?: readonly string[];
}
export type ExportHeader =
  | { mode: 'simple'; titles?: Record<string, string> }
  | { mode: 'grouped'; groups: readonly HeaderGroup[] }
  | ({ mode: 'custom'; bindings: Record<ColumnName, string> } & SheetRegion);
export interface ExportSheet<T extends object> {
  name: string;
  rows: readonly T[];
  columns: readonly ExportColumn<T>[];
  header?: ExportHeader;
  beforeTable?: SheetRegion;
  afterTable?: SheetRegion;
}
export interface SerializeOptions<T extends object> extends OperationOptions {
  sheets: readonly ExportSheet<T>[];
  format?: 'xlsx' | 'xls' | 'csv';
  limits?: ExcelLimits;
  csv?: { delimiter?: string; bom?: boolean; formulaEscape?: boolean };
}
export interface SerializedExcel {
  bytes: Uint8Array;
  format: 'xlsx' | 'xls' | 'csv';
  mimeType: string;
  extension: string;
}
export interface DownloadOptions<T extends object> extends SerializeOptions<T> {
  fileName: string;
}
export type OperationState =
  | { status: 'idle' }
  | { status: 'running'; phase: OperationPhase }
  | { status: 'success' }
  | { status: 'error'; error: import('./errors').ExcelError }
  | { status: 'cancelled' };
export interface UseExcelOptions<T extends object> {
  schema: ExcelSchema<T>;
  importDefaults?: Omit<ParseOptions<T>, 'schema'>;
  exportDefaults?: Omit<SerializeOptions<T>, 'sheets'>;
}
