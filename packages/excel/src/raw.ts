import type { CellObject, WorkBook } from 'xlsx';
import type { ExcelInput } from './types';
import type { RawRow, RawSource, ReadConfig } from './raw-types';
import type { SheetJs } from './engine';
import { ExcelError, checkAbort, config } from './errors';
import { abortable, readInput, loadEngine, ensureCodepages } from './engine';
import { headerPlan } from './header-plan';

export function decodeSheet(
  bytes: Uint8Array,
  options: ReadConfig,
  XLSX: SheetJs
): RawSource {
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: 'array',
      raw: true,
      cellDates: false,
      cellNF: true,
      cellText: true,
      ...(options.csv?.delimiter ? { FS: options.csv.delimiter } : {}),
      ...(options.csv?.codepage ? { codepage: options.csv.codepage } : {}),
    });
  } catch (cause) {
    throw new ExcelError('PARSE_FAILED', 'Unable to decode workbook', {
      cause,
    });
  }
  if (workbook.SheetNames.length > options.limits.maxSheets)
    throw new ExcelError('SHEET_LIMIT', 'Too many worksheets');
  const selected = options.sheet;
  const index =
    selected && 'name' in selected
      ? workbook.SheetNames.indexOf(selected.name!)
      : (selected?.index ?? 0);
  config(Number.isInteger(index), 'Sheet index must be an integer');
  const name = workbook.SheetNames[index];
  const sheet = workbook.Sheets[name];
  if (!sheet)
    throw new ExcelError(
      'SHEET_NOT_FOUND',
      'Requested worksheet does not exist'
    );
  const rows = new Map<number, RawRow>();
  const columns = new Set<number>();
  let maxRow = -1;
  let count = 0;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!') || !/^[A-Z]{1,3}[1-9]\d*$/.test(key)) continue;
    if (++count > options.limits.maxCells)
      throw new ExcelError('CELL_LIMIT', 'Worksheet exceeds cell limit');
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r >= 1_048_576 || c >= 16_384)
      throw new ExcelError('RANGE_LIMIT', 'Invalid worksheet coordinates');
    if (c >= options.limits.maxColumns)
      throw new ExcelError('COLUMN_LIMIT', 'Worksheet exceeds column limit');
    const cell = sheet[key] as CellObject;
    let row = rows.get(r);
    if (!row) {
      row = { index: r, cells: [] };
      rows.set(r, row);
    }
    row.cells.push([c, { t: cell.t, v: cell.v, w: cell.w, f: cell.f }]);
    columns.add(c);
    maxRow = Math.max(maxRow, r);
  }
  const merges = sheet['!merges'] ?? [];
  if (merges.length > options.limits.maxCells)
    throw new ExcelError('CELL_LIMIT', 'Too many merge ranges');
  for (const range of merges)
    config(
      [range.s.r, range.s.c, range.e.r, range.e.c].every(
        Number.isSafeInteger
      ) &&
        range.s.r >= 0 &&
        range.s.c >= 0 &&
        range.e.r >= range.s.r &&
        range.e.c >= range.s.c &&
        range.e.r < 1_048_576 &&
        range.e.c < 16_384,
      'Invalid worksheet merge range'
    );
  const plan = headerPlan(options);
  const headerIndices = new Set(plan.rows);
  for (const range of merges)
    if (plan.rows.some(r => r >= range.s.r && r <= range.e.r))
      headerIndices.add(range.s.r);
  let cursor = plan.start;
  const end = Math.min(maxRow, plan.end);
  return {
    meta: {
      sheet: { name, index },
      columns: [...columns].sort((a, b) => a - b),
      headerRows: [...headerIndices].flatMap(index =>
        rows.has(index) ? [rows.get(index)!] : []
      ),
      maxRow,
      merges,
      date1904: !!workbook.Workbook?.WBProps?.date1904,
    },
    async next(size) {
      const start = cursor;
      const last = Math.min(end, start + size - 1);
      const result: RawRow[] = [];
      for (; cursor <= last; cursor++) {
        const row = rows.get(cursor);
        if (row) result.push(row);
      }
      return { start, end: last, rows: result, done: cursor > end };
    },
    close() {
      rows.clear();
    },
  };
}
export async function openExcelSource(
  input: ExcelInput,
  options: ReadConfig,
  signal?: AbortSignal
): Promise<RawSource> {
  const bytes = await readInput(input, options.limits.maxFileSize, signal);
  const XLSX = await abortable(loadEngine(), signal);
  if ((bytes[0] === 0xd0 && bytes[1] === 0xcf) || options.csv?.codepage)
    await abortable(ensureCodepages(XLSX), signal);
  checkAbort(signal);
  return decodeSheet(bytes, options, XLSX);
}
