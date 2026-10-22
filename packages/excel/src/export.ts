import type { WorkBook, WorkSheet } from 'xlsx';
import type {
  CellValue,
  ExportSheet,
  SerializeOptions,
  SerializedExcel,
} from './types';
import {
  ExcelError,
  asExcelError,
  checkAbort,
  config,
  phase,
  resolveLimits,
} from './errors';
import { loadEngine, abortable, columnName, ensureCodepages } from './engine';
import { createLayout, regionMerges } from './layout';
import { workerSession } from './worker-client';
import { batchSize, yieldToHost } from './flow';

import { safeValue, getValue } from './export-values';
export { getValue } from './export-values';
export async function serializeExcel<T extends object>(
  options: SerializeOptions<T>
): Promise<SerializedExcel> {
  let session: ReturnType<typeof workerSession> | undefined;
  try {
    checkAbort(options.signal);
    config(
      options.execution === undefined ||
        ['main', 'worker'].includes(options.execution.mode),
      'Invalid execution mode'
    );
    if (options.execution?.mode === 'worker')
      session = workerSession(options.execution, options.signal);
    const limits = resolveLimits(options.limits);
    const size = batchSize(options.batchSize);
    const format = options.format ?? 'xlsx';
    config(
      ['xlsx', 'xls', 'csv'].includes(format),
      'Unsupported output format'
    );
    config(options.sheets.length > 0, 'At least one sheet is required');
    if (options.sheets.length > limits.maxSheets)
      throw new ExcelError('SHEET_LIMIT', 'Too many sheets');
    if (format === 'csv')
      config(options.sheets.length === 1, 'CSV supports exactly one sheet');
    if (format === 'csv' && options.csv?.delimiter !== undefined)
      config(
        options.csv.delimiter.length === 1 &&
          !/["\r\n]/.test(options.csv.delimiter),
        'Invalid CSV delimiter'
      );
    if (session) await session.request('book');
    const names = new Set<string>();
    phase(options, 'layout');
    const prepared: Array<{
      name: string;
      rows: CellValue[][];
      layout: ReturnType<typeof createLayout<T>>;
      source: ExportSheet<T>;
    }> = [];
    let totalCells = 0;
    for (const sheet of options.sheets) {
      config(
        typeof sheet.name === 'string' &&
          sheet.name.trim().length > 0 &&
          sheet.name.length <= 31 &&
          !/[\\/?*[\]:]/.test(sheet.name) &&
          !/^'|'$/.test(sheet.name),
        `Invalid sheet name: ${sheet.name}`
      );
      const nameKey = sheet.name.toLowerCase();
      config(!names.has(nameKey), `Duplicate sheet name: ${sheet.name}`);
      names.add(nameKey);
      if (sheet.rows.length > limits.maxRows)
        throw new ExcelError('ROW_LIMIT', 'Too many data rows');
      const layout = createLayout(sheet, limits);
      const rowCount =
        layout.dataOffset + sheet.rows.length + layout.suffix.rows.length;
      if (
        layout.width > limits.maxColumns ||
        layout.width > (format === 'xls' ? 256 : 16_384)
      )
        throw new ExcelError('COLUMN_LIMIT', 'Too many columns');
      if (rowCount > (format === 'xls' ? 65_536 : 1_048_576))
        throw new ExcelError('ROW_LIMIT', 'Output exceeds format row limit');
      totalCells += rowCount * layout.width;
      if (totalCells > limits.maxCells)
        throw new ExcelError('CELL_LIMIT', 'Output exceeds cell limit');
      if (format === 'csv') {
        config(
          layout.merges.length === 0 && !layout.suffix.merges?.length,
          'CSV does not support merged cells'
        );
        config(
          sheet.columns.every(
            column =>
              column.width === undefined && column.numberFormat === undefined
          ),
          'CSV does not support column widths or number formats'
        );
      }
      const byId = new Map(sheet.columns.map(column => [column.id, column]));
      let rows = [...layout.rows];
      const sanitize = (rows: CellValue[][]) =>
        rows.map(row =>
          Array.from({ length: layout.width }, (_, i) =>
            safeValue(row[i], format, options.csv?.formulaEscape !== false)
          )
        );
      if (session) {
        await session.request('sheet', sheet.name);
        await session.request('rows', sanitize(rows));
        rows = [];
      }
      for (let index = 0; index < sheet.rows.length; index++) {
        const row = sheet.rows[index];
        checkAbort(options.signal);
        const values: CellValue[] = Array(layout.width).fill(null);
        for (const [position, id] of layout.bindings) {
          try {
            values[position] = safeValue(
              getValue(
                byId.get(id)!,
                row,
                index,
                layout.dataOffset + index + 1
              ),
              format,
              options.csv?.formulaEscape !== false
            );
          } catch (cause) {
            throw new ExcelError(
              'EXPORT_VALUE_FAILED',
              `Unable to export ${id} at row ${layout.dataOffset + index + 1}`,
              {
                cause,
                issues: [
                  {
                    code: 'EXPORT_VALUE_FAILED',
                    message: asExcelError(cause).message,
                    rowNumber: layout.dataOffset + index + 1,
                    column: columnName(position),
                    field: id,
                  },
                ],
              }
            );
          }
        }
        rows.push(values);
        if (session && rows.length >= size) {
          await session.request('rows', sanitize(rows));
          rows = [];
        }
        if (index % size === size - 1) await yieldToHost(options.signal);
      }
      const suffixOffset = layout.dataOffset + sheet.rows.length;
      layout.merges.push(
        ...regionMerges(layout.suffix, layout.width, suffixOffset)
      );
      for (const row of layout.suffix.rows) rows.push([...row]);
      // Protect literal titles/notes as well as data when exporting CSV.
      const sanitized = rows.map(row =>
        Array.from({ length: layout.width }, (_, index) =>
          safeValue(row[index], format, options.csv?.formulaEscape !== false)
        )
      );
      if (session) {
        if (sanitized.length) await session.request('rows', sanitized);
        await session.request('style', {
          merges: layout.merges,
          columns: Array.from({ length: layout.width }, (_, i) => {
            const id = layout.bindings.get(i);
            return { width: sheet.columns.find(c => c.id === id)?.width };
          }),
          formats: [...layout.bindings].flatMap(([i, id]) => {
            const c = byId.get(id)!;
            return c.numberFormat ? [[i, c.numberFormat]] : [];
          }),
          start: layout.dataOffset,
          count: sheet.rows.length,
        });
        continue;
      }
      prepared.push({
        name: sheet.name,
        rows: sanitized,
        layout,
        source: sheet,
      });
    }
    if (session) {
      phase(options, 'writing');
      const bytes = await session.request<Uint8Array>('write', {
        format,
        csv: options.csv,
      });
      checkAbort(options.signal);
      if (bytes.byteLength > limits.maxFileSize)
        throw new ExcelError(
          'FILE_SIZE_LIMIT',
          'Generated file exceeds size limit'
        );
      return {
        bytes,
        format,
        extension: format,
        mimeType:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : format === 'xls'
              ? 'application/vnd.ms-excel'
              : 'text/csv;charset=utf-8',
      };
    }
    const XLSX = await abortable(loadEngine(), options.signal);
    if (format === 'xls')
      await abortable(ensureCodepages(XLSX), options.signal);
    checkAbort(options.signal);
    const workbook: WorkBook = XLSX.utils.book_new();
    for (const entry of prepared) {
      const worksheet: WorkSheet = XLSX.utils.aoa_to_sheet(entry.rows);
      worksheet['!merges'] = entry.layout.merges;
      worksheet['!cols'] = Array.from(
        { length: entry.layout.width },
        () => ({})
      );
      for (const [position, id] of entry.layout.bindings) {
        const column = entry.source.columns.find(c => c.id === id)!;
        if (column.width !== undefined)
          worksheet['!cols'][position] = { wch: column.width };
        if (column.numberFormat)
          for (let i = 0; i < entry.source.rows.length; i++) {
            const cell =
              worksheet[
                `${columnName(position)}${entry.layout.dataOffset + i + 1}`
              ];
            if (cell) cell.z = column.numberFormat;
          }
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, entry.name);
    }
    phase(options, 'writing');
    let bytes: Uint8Array;
    if (format === 'csv') {
      const delimiter = options.csv?.delimiter ?? ',';
      config(
        delimiter.length === 1 && !/["\r\n]/.test(delimiter),
        'CSV delimiter must be one non-quote, non-newline character'
      );
      const text = XLSX.utils.sheet_to_csv(
        workbook.Sheets[workbook.SheetNames[0]],
        { FS: delimiter }
      );
      bytes = new TextEncoder().encode(
        `${options.csv?.bom === false ? '' : '\uFEFF'}${text}`
      );
    } else {
      bytes = new Uint8Array(
        XLSX.write(workbook, {
          type: 'array',
          bookType: format === 'xls' ? 'biff8' : 'xlsx',
          compression: true,
        })
      );
    }
    checkAbort(options.signal);
    if (bytes.byteLength > limits.maxFileSize)
      throw new ExcelError(
        'FILE_SIZE_LIMIT',
        'Generated file exceeds size limit'
      );
    return {
      bytes,
      format,
      extension: format,
      mimeType:
        format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : format === 'xls'
            ? 'application/vnd.ms-excel'
            : 'text/csv;charset=utf-8',
    };
  } catch (error) {
    throw asExcelError(error, 'EXPORT_FAILED');
  } finally {
    session?.close();
  }
}
