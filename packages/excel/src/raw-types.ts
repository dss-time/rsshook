import type { CellObject, Range } from 'xlsx';
import type { ExcelLimits, ParseOptions } from './types';
export interface RawRow {
  index: number;
  cells: Array<[number, CellObject]>;
}
export interface RawMeta {
  sheet: { name: string; index: number };
  columns: number[];
  headerRows: RawRow[];
  maxRow?: number;
  merges: Range[];
  date1904: boolean;
}
export interface RawBatch {
  start: number;
  end: number;
  rows: RawRow[];
  done: boolean;
}
export interface RawSource {
  meta: RawMeta;
  next: (size: number) => Promise<RawBatch>;
  close: () => void | Promise<void>;
}
export interface ReadConfig {
  sheet?: ParseOptions<object>['sheet'];
  csv?: ParseOptions<object>['csv'];
  limits: Required<ExcelLimits>;
  header:
    | { mode: 'named'; row: number }
    | { mode: 'path'; rows: readonly number[] }
    | { mode: 'position'; dataStartRow: number };
  dataStartRow?: number;
  dataEndRow?: number;
}
