import type {
  BatchParseOptions,
  CsvInput,
  ExcelInput,
  ImportBatchesOptions,
  ImportReport,
  ParseOptions,
  ParseResult,
} from './types';
import type { RawSource, ReadConfig } from './raw-types';
import {
  ExcelError,
  asExcelError,
  checkAbort,
  config,
  phase,
  resolveLimits,
} from './errors';
import { abortable } from './engine';
import { batchSize, yieldToHost } from './flow';
import { createProcessor, validateSchema } from './processor';
import { openExcelSource } from './raw';
import { openCsvSource } from './csv-read';
import { openWorkerSource } from './worker-client';
import { headerPlan } from './header-plan';

function readConfig<T extends object>(options: ParseOptions<T>): ReadConfig {
  const header = options.header;
  config(
    header && ['named', 'path', 'position'].includes(header.mode),
    'Invalid import header mode'
  );
  const result: ReadConfig = {
    sheet: options.sheet,
    csv: options.csv,
    limits: resolveLimits(options.limits),
    header:
      header.mode === 'named'
        ? { mode: 'named', row: header.row }
        : header.mode === 'path'
          ? { mode: 'path', rows: header.rows }
          : { mode: 'position', dataStartRow: header.dataStartRow },
    dataStartRow: options.dataStartRow,
    dataEndRow: options.dataEndRow,
  };
  headerPlan(result);
  if (options.csv?.delimiter !== undefined)
    config(
      options.csv.delimiter.length === 1 &&
        !/["\r\n]/.test(options.csv.delimiter),
      'CSV delimiter must be one non-quote, non-newline character'
    );
  if (options.csv?.codepage !== undefined)
    config(
      Number.isSafeInteger(options.csv.codepage) && options.csv.codepage > 0,
      'CSV codepage must be a positive integer'
    );
  return result;
}
export async function* parseExcelBatches<T extends object>(
  input: CsvInput,
  options: BatchParseOptions<T>
): AsyncGenerator<ParseResult<T>> {
  let source: RawSource | undefined;
  try {
    checkAbort(options.signal);
    validateSchema(options);
    const size = batchSize(options.batchSize);
    const configOptions = readConfig(options);
    const format = options.format ?? 'excel';
    config(
      format === 'excel' || format === 'csv',
      'Invalid batch import format'
    );
    phase(options, 'reading');
    if (options.execution?.mode === 'worker')
      source = await openWorkerSource(
        input,
        configOptions,
        format,
        options.execution,
        options.signal
      );
    else {
      config(
        options.execution === undefined || options.execution.mode === 'main',
        'Invalid execution mode'
      );
      if (format === 'excel')
        config(
          typeof (input as ReadableStream<Uint8Array>).getReader !== 'function',
          'Excel workbook decoding requires Blob, ArrayBuffer or Uint8Array'
        );
      source =
        format === 'csv'
          ? await openCsvSource(input, configOptions, options.signal)
          : await openExcelSource(
              input as ExcelInput,
              configOptions,
              options.signal
            );
    }
    phase(options, 'matching');
    const processor = createProcessor(source.meta, options);
    while (true) {
      const batch = await abortable(source.next(size), options.signal);
      const result = processor.process(batch);
      checkAbort(options.signal);
      yield result;
      if (batch.done || batch.end >= processor.end) break;
      await yieldToHost(options.signal);
    }
  } catch (error) {
    throw asExcelError(error, 'IMPORT_FAILED');
  } finally {
    await source?.close();
  }
}
export function parseCsvBatches<T extends object>(
  input: CsvInput,
  options: Omit<BatchParseOptions<T>, 'format'>
): AsyncGenerator<ParseResult<T>> {
  return parseExcelBatches(input, { ...options, format: 'csv' });
}
export async function importBatches<T extends object>(
  input: CsvInput,
  options: ImportBatchesOptions<T>
): Promise<ImportReport> {
  config(typeof options.onBatch === 'function', 'onBatch callback is required');
  let report: ImportReport | undefined;
  for await (const batch of parseExcelBatches(input, options)) {
    if (!report)
      report = {
        sheet: batch.sheet,
        summary: {
          scannedRows: 0,
          validRows: 0,
          invalidRows: 0,
          skippedRows: 0,
        },
        warningCount: 0,
      };
    for (const key of Object.keys(report.summary) as Array<
      keyof ImportReport['summary']
    >)
      report.summary[key] += batch.summary[key];
    report.warningCount += batch.warnings.length;
    try {
      await abortable(Promise.resolve(options.onBatch(batch)), options.signal);
    } catch (cause) {
      if (cause instanceof ExcelError && cause.code === 'CANCELLED')
        throw cause;
      throw new ExcelError('CALLBACK_FAILED', 'onBatch callback failed', {
        cause,
      });
    }
    checkAbort(options.signal);
  }
  return report!;
}
/** Collecting interface retained for compatibility; use importBatches to avoid accumulation. */
export async function parseExcel<T extends object>(
  input: ExcelInput,
  options: ParseOptions<T>
): Promise<ParseResult<T>> {
  let result: ParseResult<T> | undefined;
  for await (const batch of parseExcelBatches(input, options)) {
    if (!result)
      result = {
        sheet: batch.sheet,
        validRows: [],
        invalidRows: [],
        warnings: [],
        summary: {
          scannedRows: 0,
          validRows: 0,
          invalidRows: 0,
          skippedRows: 0,
        },
      };
    for (const row of batch.validRows) result.validRows.push(row);
    for (const row of batch.invalidRows) result.invalidRows.push(row);
    for (const warning of batch.warnings) result.warnings.push(warning);
    for (const key of Object.keys(result.summary) as Array<
      keyof ParseResult<T>['summary']
    >)
      result.summary[key] += batch.summary[key];
  }
  return result!;
}
