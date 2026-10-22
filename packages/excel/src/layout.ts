import type { Range } from 'xlsx';
import type {
  CellValue,
  ExportSheet,
  HeaderGroup,
  SheetRegion,
  ExcelLimits,
} from './types';
import { config, ExcelError } from './errors';
import { columnIndex, columnName } from './engine';

export interface Layout {
  rows: CellValue[][];
  merges: Range[];
  bindings: Map<number, string>;
  dataOffset: number;
  suffix: SheetRegion;
  width: number;
}
function address(value: string): { r: number; c: number } {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/i.exec(value);
  config(match, `Invalid cell address: ${value}`);
  const row = Number(match[2]);
  config(row <= 1_048_576, `Row exceeds Excel limit: ${value}`);
  return { r: row - 1, c: columnIndex(match[1]) };
}
export function regionMerges(
  region: SheetRegion,
  width: number,
  offset = 0
): Range[] {
  const result: Range[] = [];
  const occupied = new Set<number>();
  for (const text of region.merges ?? []) {
    const parts = text.split(':');
    config(parts.length === 2, `Invalid merge range: ${text}`);
    const s = address(parts[0]);
    const e = address(parts[1]);
    config(
      s.r <= e.r && s.c <= e.c && (s.r !== e.r || s.c !== e.c),
      `Invalid merge range: ${text}`
    );
    config(
      e.r < region.rows.length && e.c < width,
      `Merge exceeds region: ${text}`
    );
    for (let r = s.r; r <= e.r; r++)
      for (let c = s.c; c <= e.c; c++) {
        const position = r * width + c;
        config(!occupied.has(position), `Overlapping merge: ${text}`);
        occupied.add(position);
        const value = region.rows[r]?.[c];
        config(
          (r === s.r && c === s.c) || value == null || value === '',
          `Merge would discard content at ${columnName(c)}${r + 1}`
        );
      }
    result.push({ s: { ...s, r: s.r + offset }, e: { ...e, r: e.r + offset } });
  }
  return result;
}
export function createLayout<T extends object>(
  sheet: ExportSheet<T>,
  limits: Required<ExcelLimits>
): Layout {
  config(sheet.columns.length > 0, 'At least one export column is required');
  if (sheet.columns.length > limits.maxColumns)
    throw new ExcelError('COLUMN_LIMIT', 'Too many export columns');
  const columns = new Map(sheet.columns.map(column => [column.id, column]));
  config(
    columns.size === sheet.columns.length,
    'Export column ids must be unique'
  );
  for (const column of sheet.columns) {
    config(
      typeof column.id === 'string' &&
        column.id.length > 0 &&
        typeof column.title === 'string',
      'Column id and title must be strings'
    );
    config(
      ('field' in column &&
        typeof column.field === 'string' &&
        column.value === undefined) ||
        (typeof column.value === 'function' && column.field === undefined),
      `Column ${column.id} requires exactly one of field/value`
    );
    if (column.width !== undefined)
      config(
        Number.isFinite(column.width) &&
          column.width > 0 &&
          column.width <= 255,
        `Invalid width: ${column.id}`
      );
  }
  const header = sheet.header ?? { mode: 'simple' as const };
  let region: SheetRegion;
  const bindings = new Map<number, string>();
  if (header.mode === 'simple') {
    for (const id of Object.keys(header.titles ?? {}))
      config(columns.has(id), `Unknown title column: ${id}`);
    region = {
      rows: [
        sheet.columns.map((column, index) => {
          bindings.set(index, column.id);
          return header.titles &&
            Object.prototype.hasOwnProperty.call(header.titles, column.id)
            ? header.titles[column.id]
            : column.title;
        }),
      ],
    };
  } else if (header.mode === 'custom') {
    config(header.rows.length > 0, 'Custom header requires at least one row');
    region = header;
    for (const [name, id] of Object.entries(header.bindings)) {
      const index = columnIndex(name);
      config(!bindings.has(index), `Duplicate column binding: ${name}`);
      bindings.set(index, id);
    }
  } else {
    config(
      header.mode === 'grouped' && header.groups.length > 0,
      'Invalid or empty grouped header'
    );
    const seen = new Set<HeaderGroup>();
    const depth = (nodes: readonly HeaderGroup[], level = 1): number => {
      config(level <= 32, 'Header nesting exceeds 32 levels');
      return Math.max(
        ...nodes.map(node => {
          config(
            !seen.has(node),
            'Header groups must not contain cycles or reused nodes'
          );
          seen.add(node);
          if (node.column !== undefined) {
            config(
              columns.has(node.column),
              `Unknown export column: ${node.column}`
            );
            return level;
          }
          config(
            typeof node.title === 'string' && node.children.length > 0,
            'Header groups require a title and children'
          );
          return depth(node.children, level + 1);
        })
      );
    };
    const levels = depth(header.groups);
    const rows: CellValue[][] = Array.from({ length: levels }, () => []);
    const merges: string[] = [];
    let column = 0;
    const visit = (nodes: readonly HeaderGroup[], row: number): void => {
      for (const node of nodes) {
        const start = column;
        if (node.column !== undefined) {
          rows[row][column] = columns.get(node.column)!.title;
          bindings.set(column, node.column);
          if (row < levels - 1)
            merges.push(
              `${columnName(column)}${row + 1}:${columnName(column)}${levels}`
            );
          column++;
        } else {
          rows[row][column] = node.title;
          visit(node.children, row + 1);
          if (column - start > 1)
            merges.push(
              `${columnName(start)}${row + 1}:${columnName(column - 1)}${row + 1}`
            );
        }
      }
    };
    visit(header.groups, 0);
    region = { rows, merges };
  }
  const used = new Set<string>();
  for (const id of bindings.values()) {
    config(columns.has(id), `Unknown export column: ${id}`);
    config(!used.has(id), `Column bound more than once: ${id}`);
    used.add(id);
  }
  config(
    used.size === columns.size,
    'Every export column must be included in the header layout'
  );
  const before = sheet.beforeTable ?? { rows: [] };
  const suffix = sheet.afterTable ?? { rows: [] };
  const allRows = [...before.rows, ...region.rows, ...suffix.rows];
  let width = 1;
  for (const index of bindings.keys()) width = Math.max(width, index + 1);
  for (const row of allRows) width = Math.max(width, row.length);
  if (width > limits.maxColumns)
    throw new ExcelError('COLUMN_LIMIT', 'Header exceeds column limit');
  if (allRows.length * width > limits.maxCells)
    throw new ExcelError('CELL_LIMIT', 'Header regions exceed cell limit');
  const merges = [
    ...regionMerges(before, width),
    ...regionMerges(region, width, before.rows.length),
  ];
  const rows = [...before.rows, ...region.rows].map(row =>
    Array.from({ length: width }, (_, index) => row[index] ?? null)
  );
  return { rows, merges, bindings, dataOffset: rows.length, suffix, width };
}
