/// <reference types="vite/client" />
import ExcelWorker from 'rsshook-excel/worker?worker';
import {
  defineExcelSchema,
  importBatches,
  writeCsv,
  type CsvSink,
} from 'rsshook-excel';

interface RecordRow {
  code: string;
}
const schema = defineExcelSchema<RecordRow>({
  fields: { code: { type: 'string', required: true } },
});
const header = {
  mode: 'named' as const,
  row: 1,
  bindings: { code: { title: '编号' } },
};

/** Vite entry. Consume/persist each batch before fetching the next one. */
export function importLargeFile(
  file: File,
  format: 'excel' | 'csv',
  consume: (rows: RecordRow[]) => Promise<void>,
  signal: AbortSignal
) {
  return importBatches(file, {
    schema,
    header,
    format,
    signal,
    batchSize: 500,
    execution: { mode: 'worker', workerFactory: () => new ExcelWorker() },
    // Example budgets; the caller must choose limits for its devices/business.
    limits: { maxFileSize: 100 * 1024 * 1024, maxRows: 200_000 },
    async onBatch(batch) {
      if (batch.invalidRows.length) throw new Error('文件包含无效数据');
      await consume(batch.validRows.map(row => row.data));
    },
  });
}

/** Supply a file/network sink; never collect the chunks into a Blob here. */
export function exportLargeCsv(
  rows: AsyncIterable<RecordRow>,
  sink: WritableStream<Uint8Array> | CsvSink,
  signal: AbortSignal
) {
  return writeCsv({
    sheet: {
      name: 'Data',
      columns: [{ id: 'code', field: 'code', title: '编号' }],
      rows,
    },
    sink,
    signal,
    csv: { chunkBytes: 64 * 1024 },
    limits: { maxFileSize: 100 * 1024 * 1024, maxRows: 200_000 },
  });
}
