import type {
  CellValue,
  CsvStreamExportOptions,
  CsvWriteOptions,
  CsvWriteReport,
} from './types';
import {
  ExcelError,
  asExcelError,
  checkAbort,
  config,
  phase,
  resolveLimits,
} from './errors';
import { abortable } from './engine';
import { createLayout } from './layout';
import { safeValue, getValue } from './export-values';
import { batchSize, chunkBytes, fireCleanup, yieldToHost } from './flow';

/** UTF-8 CSV chunks; never collects the source rows or the complete output. */
export async function* serializeCsvStream<T extends object>(
  options: CsvStreamExportOptions<T>
): AsyncGenerator<Uint8Array> {
  try {
    checkAbort(options.signal);
    config(
      options.execution === undefined || options.execution.mode === 'main',
      'CSV streaming export runs in main mode; it yields between bounded batches'
    );
    const limits = resolveLimits(options.limits);
    const size = chunkBytes(options.csv?.chunkBytes);
    const batch = batchSize(options.batchSize);
    const delimiter = options.csv?.delimiter ?? ',';
    config(
      delimiter.length === 1 && !/["\r\n]/.test(delimiter),
      'Invalid CSV delimiter'
    );
    const newline = options.csv?.newline ?? '\r\n';
    config(newline === '\r\n' || newline === '\n', 'Invalid CSV newline');
    const maxChars = options.csv?.maxRecordChars ?? 1_048_576;
    config(
      Number.isSafeInteger(maxChars) && maxChars > 0,
      'maxRecordChars must be a positive integer'
    );
    phase(options, 'layout');
    const sheet = options.sheet;
    const layout = createLayout({ ...sheet, rows: [] }, limits);
    config(
      !layout.merges.length && !layout.suffix.merges?.length,
      'CSV does not support merged cells'
    );
    config(
      sheet.columns.every(
        c => c.width === undefined && c.numberFormat === undefined
      ),
      'CSV does not support widths or number formats'
    );
    const byId = new Map(sheet.columns.map(c => [c.id, c]));
    let cells = 0,
      bytesWritten = 0;
    const encoder = new TextEncoder();
    const encode = (values: readonly CellValue[]) => {
      cells += layout.width;
      if (cells > limits.maxCells)
        throw new ExcelError('CELL_LIMIT', 'CSV exceeds cell limit');
      let chars = 0;
      const fields = Array.from({ length: layout.width }, (_, i) => {
        const value = safeValue(
          values[i],
          'csv',
          options.csv?.formulaEscape !== false
        );
        let text = value == null ? '' : String(value);
        if (text.length > maxChars)
          throw new ExcelError(
            'CSV_RECORD_LIMIT',
            'CSV record exceeds maxRecordChars'
          );
        if (text.includes(delimiter) || /["\r\n]/.test(text))
          text = `"${text.replace(/"/g, '""')}"`;
        chars += text.length + 1;
        if (chars > maxChars)
          throw new ExcelError(
            'CSV_RECORD_LIMIT',
            'CSV record exceeds maxRecordChars'
          );
        return text;
      });
      return encoder.encode(fields.join(delimiter) + newline);
    };
    const checked = (bytes: Uint8Array) => {
      bytesWritten += bytes.length;
      if (bytesWritten > limits.maxFileSize)
        throw new ExcelError('FILE_SIZE_LIMIT', 'CSV exceeds size limit');
      return bytes;
    };
    if (options.csv?.bom !== false) {
      const bom = encoder.encode('\uFEFF');
      for (let i = 0; i < bom.length; i += size)
        yield checked(bom.subarray(i, i + size));
    }
    let count = 0;
    const rows = async function* (): AsyncGenerator<readonly CellValue[]> {
      for (const row of layout.rows) yield row;
      const iterator =
        (sheet.rows as AsyncIterable<T>)[Symbol.asyncIterator]?.() ??
        (sheet.rows as Iterable<T>)[Symbol.iterator]();
      let done = false;
      try {
        while (true) {
          checkAbort(options.signal);
          const next = await abortable(
            Promise.resolve(iterator.next()),
            options.signal
          );
          if (next.done) {
            done = true;
            break;
          }
          if (++count > limits.maxRows)
            throw new ExcelError('ROW_LIMIT', 'Too many data rows');
          const values: CellValue[] = Array(layout.width).fill(null);
          for (const [position, id] of layout.bindings) {
            try {
              values[position] = safeValue(
                getValue(
                  byId.get(id)!,
                  next.value,
                  count - 1,
                  layout.dataOffset + count
                ),
                'csv',
                false
              );
            } catch (cause) {
              throw new ExcelError(
                'EXPORT_VALUE_FAILED',
                `Unable to export ${id} at row ${layout.dataOffset + count}`,
                { cause }
              );
            }
          }
          yield values;
          if (count % batch === 0) await yieldToHost(options.signal);
        }
      } finally {
        if (!done && iterator.return) fireCleanup(() => iterator.return!());
      }
      for (const row of layout.suffix.rows) yield row;
    };
    phase(options, 'writing');
    for await (const row of rows()) {
      checkAbort(options.signal);
      const bytes = encode(row);
      for (let i = 0; i < bytes.length; i += size) {
        checkAbort(options.signal);
        yield checked(bytes.subarray(i, i + size));
      }
    }
  } catch (cause) {
    throw asExcelError(cause, 'EXPORT_FAILED');
  }
}
/** Await every sink write before requesting another CSV chunk. */
export async function writeCsv<T extends object>(
  options: CsvWriteOptions<T>
): Promise<CsvWriteReport> {
  const writer =
    'getWriter' in options.sink ? options.sink.getWriter() : undefined;
  const sink = writer ?? (options.sink as import('./types').CsvSink);
  let bytesWritten = 0;
  try {
    for await (const chunk of serializeCsvStream(options)) {
      await abortable(Promise.resolve(sink.write(chunk)), options.signal);
      bytesWritten += chunk.length;
    }
    if (sink.close)
      await abortable(Promise.resolve(sink.close()), options.signal);
    checkAbort(options.signal);
    return { bytesWritten };
  } catch (cause) {
    if (sink.abort) fireCleanup(() => sink.abort!(cause));
    throw asExcelError(cause, 'EXPORT_FAILED');
  } finally {
    writer?.releaseLock();
  }
}
