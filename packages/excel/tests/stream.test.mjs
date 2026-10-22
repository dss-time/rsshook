import test from 'node:test';
import assert from 'node:assert/strict';
import * as excel from '../dist/index.mjs';
const options = {
  schema: { fields: { code: { type: 'string', required: true } } },
  header: { mode: 'named', row: 1, bindings: { code: { title: 'Code' } } },
};
test('stream CSV preserves quoted newlines and escaped quotes across byte chunks', async () => {
  const bytes = new TextEncoder().encode('\uFEFFCode\r\n"a\r\nb"\r\n"a""b"');
  const result = [];
  for await (const batch of excel.parseCsvBatches(bytes, {
    ...options,
    batchSize: 1,
    csv: { chunkBytes: 1 },
  }))
    result.push(...batch.validRows);
  assert.deepEqual(
    result.map(row => row.data.code),
    ['a\r\nb', 'a"b']
  );
  assert.deepEqual(
    result.map(row => row.rowNumber),
    [2, 3]
  );
});
const bytes = text => new TextEncoder().encode(text);
const collect = async iterator => {
  const result = [];
  for await (const value of iterator) result.push(value);
  return result;
};
const streamSheet = rows => ({
  name: 'Data',
  columns: [{ id: 'code', field: 'code', title: 'Code' }],
  rows,
});
test('CSV roundtrip streams UTF8, quoting, empty fields and formula protection', async () => {
  const chunks = await collect(
    excel.serializeCsvStream({
      sheet: streamSheet([
        { code: '中😀,"\n' },
        { code: '=SUM(A1)' },
        { code: '' },
      ]),
      csv: { chunkBytes: 1 },
    })
  );
  assert(chunks.every(c => c.length <= 3)); // BOM is one independent chunk.
  const result = await collect(
    excel.parseCsvBatches(Buffer.concat(chunks), {
      ...options,
      csv: { chunkBytes: 1 },
      skipEmptyRows: false,
    })
  );
  assert.deepEqual(
    result.flatMap(b => b.validRows.map(r => r.data.code)),
    ['中😀,"', "'=SUM(A1)"]
  );
  assert.equal(result.flatMap(b => b.invalidRows).length, 1);
});
test('CSV rejects malformed records, UTF8, and limits across batches', async () => {
  for (const text of ['Code\n"unfinished', 'Code\n"closed"x', 'Code\nx"y'])
    await assert.rejects(collect(excel.parseCsvBatches(bytes(text), options)), {
      code: 'CSV_SYNTAX',
    });
  await assert.rejects(
    collect(
      excel.parseCsvBatches(
        new Uint8Array([67, 111, 100, 101, 10, 255]),
        options
      )
    ),
    { code: 'CSV_READ_FAILED' }
  );
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\na\nb'), {
        ...options,
        batchSize: 1,
        limits: { maxRows: 1 },
      })
    ),
    { code: 'ROW_LIMIT' }
  );
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\nabcd'), {
        ...options,
        csv: { maxRecordChars: 3 },
      })
    ),
    { code: 'CSV_RECORD_LIMIT' }
  );
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\na,b'), {
        ...options,
        limits: { maxColumns: 1 },
      })
    ),
    { code: 'COLUMN_LIMIT' }
  );
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\na\nb'), {
        ...options,
        limits: { maxCells: 2 },
      })
    ),
    { code: 'CELL_LIMIT' }
  );
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\n\n\n'), {
        ...options,
        skipEmptyRows: false,
        batchSize: 1,
        limits: { maxIssues: 1 },
      })
    ),
    { code: 'ISSUE_LIMIT' }
  );
});
test('CSV input honors consumer backpressure and closes on early break', async () => {
  let pulls = 0,
    cancelled = 0;
  const source = new ReadableStream(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(bytes(pulls === 1 ? 'Code\n' : `v${pulls}\n`));
      },
      cancel() {
        cancelled++;
      },
    },
    { highWaterMark: 0 }
  );
  const iterator = excel.parseCsvBatches(source, { ...options, batchSize: 1 });
  const first = await iterator.next();
  assert.equal(first.value.validRows.length, 1);
  const before = pulls;
  await new Promise(r => setTimeout(r, 20));
  assert.equal(pulls, before);
  await iterator.return();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(cancelled, 1);
  assert.equal(source.locked, false);
});
test('cancelling a pending CSV read releases the reader promptly', async () => {
  let cancelled = 0;
  const source = new ReadableStream({
    cancel() {
      cancelled++;
    },
  });
  const controller = new AbortController();
  const promise = collect(
    excel.parseCsvBatches(source, { ...options, signal: controller.signal })
  );
  controller.abort();
  await assert.rejects(promise, { code: 'CANCELLED' });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(cancelled, 1);
  assert.equal(source.locked, false);
});
test('CSV Blob input uses slices and importBatches only returns totals', async () => {
  const blob = new Blob(['Code\na\nb\n']);
  blob.arrayBuffer = () => {
    throw Error('whole-file read');
  };
  const batches = [];
  const report = await excel.importBatches(blob, {
    ...options,
    format: 'csv',
    batchSize: 1,
    onBatch: async b => {
      batches.push(b);
    },
  });
  assert.equal(report.summary.validRows, 2);
  assert.equal('validRows' in report, false);
  assert(batches.every(b => b.validRows.length <= 1));
  await assert.rejects(
    excel.importBatches(bytes('Code\na'), {
      ...options,
      format: 'csv',
      onBatch() {
        throw Error('callback');
      },
    }),
    { code: 'CALLBACK_FAILED' }
  );
});
test('streamed writer awaits sink and closes or aborts it with producer cleanup', async () => {
  let produced = 0,
    closed = false,
    release;
  const gate = new Promise(r => (release = r));
  async function* rows() {
    for (let i = 0; i < 3; i++) {
      produced++;
      yield { code: String(i) };
    }
  }
  let writes = 0;
  const promise = excel.writeCsv({
    sheet: streamSheet(rows()),
    sink: {
      async write() {
        if (++writes === 1) await gate;
      },
      close() {
        closed = true;
      },
    },
  });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(produced, 0);
  release();
  const report = await promise;
  assert.equal(produced, 3);
  assert.equal(closed, true);
  assert(report.bytesWritten > 0);
  let returned = false,
    aborted = false;
  async function* failingRows() {
    try {
      yield { code: 'a' };
      yield { code: 'b' };
    } finally {
      returned = true;
    }
  }
  await assert.rejects(
    excel.writeCsv({
      sheet: streamSheet(failingRows()),
      csv: { bom: false },
      sink: {
        write(chunk) {
          if (new TextDecoder().decode(chunk) === 'a\r\n')
            throw Error('disk full');
        },
        abort() {
          aborted = true;
        },
      },
    })
  );
  await new Promise(r => setTimeout(r, 0));
  assert(returned);
  assert(aborted);
});
test('cancel pending sink write aborts sink and never consumes rows', async () => {
  let aborts = 0,
    produced = 0;
  const controller = new AbortController();
  async function* rows() {
    produced++;
    yield { code: 'x' };
  }
  const pending = excel.writeCsv({
    sheet: streamSheet(rows()),
    signal: controller.signal,
    sink: {
      write() {
        return new Promise(() => {});
      },
      abort() {
        aborts++;
      },
    },
  });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(aborts, 1);
  assert.equal(produced, 0);
});
test('stream export rejects merged headers and output limits', async () => {
  await assert.rejects(
    collect(
      excel.serializeCsvStream({
        sheet: streamSheet([{ code: 'xxxx' }]),
        limits: { maxFileSize: 3 },
      })
    ),
    { code: 'FILE_SIZE_LIMIT' }
  );
  await assert.rejects(
    collect(
      excel.serializeCsvStream({
        sheet: streamSheet([{ code: 'a' }, { code: 'b' }]),
        limits: { maxRows: 1 },
      })
    ),
    { code: 'ROW_LIMIT' }
  );
});

test('CSV custom multi-row headers and before/after regions reuse path and position binding', async () => {
  const chunks = await collect(
    excel.serializeCsvStream({
      sheet: {
        name: 'Data',
        columns: [{ id: 'code', field: 'code', title: 'Code' }],
        rows: [{ code: '007' }],
        beforeTable: { rows: [['说明']] },
        header: {
          mode: 'custom',
          rows: [['Group'], ['Code']],
          bindings: { A: 'code' },
        },
        afterTable: { rows: [['结束']] },
      },
      csv: { delimiter: ';', bom: false },
    })
  );
  const data = Buffer.concat(chunks);
  const result = await collect(
    excel.parseCsvBatches(data, {
      ...options,
      header: {
        mode: 'path',
        rows: [2, 3],
        bindings: { code: { path: ['Group', 'Code'] } },
      },
      dataEndRow: 4,
    })
  );
  assert.deepEqual(
    result.flatMap(b => b.validRows.map(r => [r.rowNumber, r.data.code])),
    [[4, '007']]
  );
  const positional = await collect(
    excel.parseCsvBatches(data, {
      ...options,
      header: { mode: 'position', dataStartRow: 4, bindings: { code: 'A' } },
      dataEndRow: 4,
    })
  );
  assert.equal(positional[0].validRows[0].data.code, '007');
  const empty = await excel.importBatches(bytes('Code\n'), {
    ...options,
    format: 'csv',
    onBatch() {},
  });
  assert.equal(empty.summary.scannedRows, 0);
});
test('streaming column discovery applies unknown column policy when later rows widen', async () => {
  await assert.rejects(
    collect(
      excel.parseCsvBatches(bytes('Code\na\nb,extra'), {
        ...options,
        batchSize: 1,
        unknownColumns: 'error',
      })
    ),
    { code: 'UNKNOWN_COLUMN' }
  );
  const results = await collect(
    excel.parseCsvBatches(bytes('Code\na\nb,extra\nc,extra'), {
      ...options,
      batchSize: 1,
      unknownColumns: 'warn',
    })
  );
  assert.equal(results.flatMap(b => b.warnings).length, 1);
});
test('streamed writer accepts a real WritableStream and rejects unsupported merged layouts', async () => {
  let closed = false;
  const output = [];
  await excel.writeCsv({
    sheet: streamSheet([{ code: 'x' }]),
    sink: new WritableStream({
      write: chunk => output.push(chunk),
      close() {
        closed = true;
      },
    }),
  });
  assert(closed);
  assert.equal(
    new TextDecoder().decode(Buffer.concat(output)),
    'Code\r\nx\r\n'
  );
  await assert.rejects(
    collect(
      excel.serializeCsvStream({
        sheet: {
          ...streamSheet([]),
          beforeTable: { rows: [['Title', null]], merges: ['A1:B1'] },
          columns: [
            { id: 'code', field: 'code', title: 'Code' },
            { id: 'other', value: () => null, title: 'Other' },
          ],
        },
      })
    ),
    { code: 'INVALID_CONFIG' }
  );
});
test('stream import batch callback backpressure prevents further source pulls', async () => {
  let pulls = 0,
    release,
    entered;
  const ready = new Promise(r => (entered = r)),
    gate = new Promise(r => (release = r));
  const controller = new AbortController();
  const source = new ReadableStream(
    {
      pull(c) {
        pulls++;
        c.enqueue(bytes(pulls === 1 ? 'Code\n' : `v${pulls}\n`));
      },
    },
    { highWaterMark: 0 }
  );
  const pending = excel.importBatches(source, {
    ...options,
    format: 'csv',
    batchSize: 1,
    signal: controller.signal,
    async onBatch() {
      entered();
      await gate;
    },
  });
  await ready;
  const before = pulls;
  await new Promise(r => setTimeout(r, 10));
  assert.equal(pulls, before);
  controller.abort();
  release();
  await assert.rejects(pending, { code: 'CANCELLED' });
});

test('large CSV pipeline keeps producer ahead by at most one consumed batch', async () => {
  const pipeline = new TransformStream();
  let produced = 0,
    consumed = 0,
    maxAhead = 0;
  async function* rows() {
    for (let i = 0; i < 10000; i++) {
      produced++;
      maxAhead = Math.max(maxAhead, produced - consumed);
      yield { code: String(i) };
    }
  }
  const read = excel.importBatches(pipeline.readable, {
    ...options,
    format: 'csv',
    batchSize: 250,
    async onBatch(batch) {
      consumed += batch.validRows.length;
      await Promise.resolve();
    },
  });
  const write = excel.writeCsv({
    sheet: streamSheet(rows()),
    sink: pipeline.writable,
  });
  const [report, output] = await Promise.all([read, write]);
  assert.equal(report.summary.validRows, 10000);
  assert.equal(consumed, 10000);
  assert(output.bytesWritten > 0);
  assert(maxAhead <= 253, `buffered ${maxAhead} rows`);
});
