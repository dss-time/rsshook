import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import * as excel from '../dist/index.mjs';
const url = new URL('../dist/worker.mjs', import.meta.url).href;
function factory(track = {}) {
  const worker = new Worker(
    `const {parentPort}=require('node:worker_threads');globalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);const ready=import(${JSON.stringify(url)});parentPort.on('message',async data=>{await ready;globalThis.onmessage({data});});`,
    { eval: true }
  );
  const listeners = new Map();
  return {
    postMessage: (m, t) => {
      track.requests ??= [];
      track.requests.push(m.type);
      worker.postMessage(m, t);
    },
    terminate: () => {
      track.terminated = true;
      return worker.terminate();
    },
    addEventListener(type, fn) {
      const wrap = type === 'message' ? data => fn({ data }) : fn;
      listeners.set(fn, wrap);
      worker.on(type, wrap);
    },
    removeEventListener(type, fn) {
      worker.off(type, listeners.get(fn) ?? fn);
    },
  };
}
const options = {
  schema: { fields: { code: { type: 'string', required: true } } },
  header: { mode: 'named', row: 1, bindings: { code: { title: 'Code' } } },
};
const sheet = {
  name: 'Data',
  columns: [{ id: 'code', field: 'code', title: 'Code' }],
  rows: [{ code: '001' }, { code: '002' }],
};
test('real Worker XLSX import pulls batches and preserves caller buffers and callbacks', async () => {
  const track = {};
  const file = await excel.serializeExcel({ sheets: [sheet] });
  const batch = [];
  let conversions = 0;
  const report = await excel.importBatches(file.bytes, {
    ...options,
    schema: {
      fields: {
        code: {
          type: 'string',
          required: true,
          parse: v => {
            conversions++;
            return v;
          },
        },
      },
    },
    batchSize: 1,
    execution: { mode: 'worker', workerFactory: () => factory(track) },
    onBatch: b => batch.push(b),
  });
  assert.equal(report.summary.validRows, 2);
  assert.equal(conversions, 2);
  assert(file.bytes.length > 0);
  assert(track.terminated);
  assert.equal(track.requests.filter(r => r === 'pull').length, 2);
  assert.deepEqual(
    batch.map(b => b.validRows[0].data.code),
    ['001', '002']
  );
});
test('real Worker export batches scalar values and matches main XLSX formatting', async () => {
  let callbacks = 0;
  const track = {};
  const data = await excel.serializeExcel({
    sheets: [
      {
        ...sheet,
        columns: [
          {
            id: 'code',
            title: 'Code',
            value: r => {
              callbacks++;
              return r.code;
            },
            numberFormat: '@',
            width: 20,
          },
        ],
        rows: Array.from({ length: 2100 }, (_, i) => ({
          code: String(i).padStart(4, '0'),
        })),
      },
    ],
    execution: { mode: 'worker', workerFactory: () => factory(track) },
  });
  assert.equal(callbacks, 2100);
  assert(track.terminated);
  assert(track.requests.filter(r => r === 'rows').length >= 4);
  const parsed = await excel.parseExcel(data.bytes, options);
  assert.equal(parsed.validRows.length, 2100);
  assert.equal(parsed.validRows[2099].data.code, '2099');
});
test('real Worker supports streaming CSV file decoding and stops after early break', async () => {
  const track = {};
  const generator = excel.parseCsvBatches(new Blob(['Code\n中\na\nb']), {
    ...options,
    batchSize: 1,
    csv: { chunkBytes: 1 },
    execution: { mode: 'worker', workerFactory: () => factory(track) },
  });
  const first = await generator.next();
  assert.equal(first.value.validRows[0].data.code, '中');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(track.requests.filter(r => r === 'pull').length, 1);
  await generator.return();
  assert(track.terminated);
});
test('Worker abort terminates pending operation and structured parser errors survive', async () => {
  const controller = new AbortController(),
    track = {};
  const pending = excel.parseExcel(new Uint8Array([1, 2, 3]), {
    ...options,
    signal: controller.signal,
    execution: { mode: 'worker', workerFactory: () => factory(track) },
  });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert(track.terminated);
  await assert.rejects(
    excel.parseExcel(new Uint8Array([80, 75, 3, 4]), {
      ...options,
      execution: { mode: 'worker', workerFactory: () => factory() },
    }),
    { code: 'PARSE_FAILED' }
  );
});
test('Worker crash, transfer errors, unavailable factory and timeout settle and terminate', async () => {
  await assert.rejects(
    excel.parseExcel(new Uint8Array([1]), {
      ...options,
      execution: {
        mode: 'worker',
        workerFactory() {
          throw Error('CSP');
        },
      },
    }),
    { code: 'WORKER_UNAVAILABLE' }
  );
  for (const failure of [
    'WORKER_FAILED',
    'WORKER_TIMEOUT',
    'WORKER_TRANSFER_FAILED',
  ]) {
    let terminated = false;
    const handlers = {};
    const fake = {
      addEventListener: (k, f) => (handlers[k] = f),
      removeEventListener() {},
      terminate() {
        terminated = true;
      },
      postMessage() {
        if (failure === 'WORKER_FAILED') queueMicrotask(() => handlers.error());
        if (failure === 'WORKER_TRANSFER_FAILED') throw Error('clone');
      },
    };
    await assert.rejects(
      excel.parseExcel(new Uint8Array([1]), {
        ...options,
        execution: { mode: 'worker', timeoutMs: 10, workerFactory: () => fake },
      }),
      { code: failure }
    );
    assert(terminated);
  }
});

test('Worker accepts Node Buffer views without detaching the backing slab', async () => {
  const input = Buffer.from('Code\n001\n');
  const result = [];
  for await (const b of excel.parseCsvBatches(input, {
    ...options,
    execution: { mode: 'worker', workerFactory: () => factory() },
  }))
    result.push(...b.validRows);
  assert.equal(result[0].data.code, '001');
  assert.equal(input.toString(), 'Code\n001\n');
});
test('Worker export preserves custom merges, suffix rows, multi-sheet and legacy formats', async () => {
  for (const format of ['xlsx', 'xls', 'csv']) {
    const execution = { mode: 'worker', workerFactory: () => factory() };
    const data = await excel.serializeExcel({
      format,
      sheets: [
        {
          ...sheet,
          beforeTable: { rows: [['note']] },
          afterTable: { rows: [['end']] },
        },
      ],
      execution,
      batchSize: 1,
    });
    const parsed = await excel.parseExcel(data.bytes, {
      ...options,
      header: { ...options.header, row: 2 },
      dataEndRow: 4,
    });
    assert.deepEqual(
      parsed.validRows.map(r => r.data.code),
      ['001', '002']
    );
  }
  const custom = {
    ...sheet,
    columns: [
      ...sheet.columns,
      { id: 'other', title: 'Other', value: () => 1 },
    ],
    header: {
      mode: 'custom',
      rows: [
        ['Group', null],
        ['Code', 'Other'],
      ],
      merges: ['A1:B1'],
      bindings: { A: 'code', B: 'other' },
    },
  };
  const out = await excel.serializeExcel({
    sheets: [custom, { ...sheet, name: 'Second' }],
    execution: { mode: 'worker', workerFactory: () => factory() },
  });
  const parsed = await excel.parseExcel(out.bytes, {
    ...options,
    header: {
      mode: 'path',
      rows: [1, 2],
      bindings: { code: { path: ['Group', 'Code'] } },
    },
  });
  assert.equal(parsed.validRows[0].data.code, '001');
  const second = await excel.parseExcel(out.bytes, {
    ...options,
    sheet: { name: 'Second' },
  });
  assert.equal(second.validRows.length, 2);
});
test('Worker cancellation settles while final workbook encoding is in flight', async () => {
  const controller = new AbortController(),
    track = {};
  const workerFactory = () => {
    const worker = factory(track),
      post = worker.postMessage;
    worker.postMessage = (message, transfer) => {
      post(message, transfer);
      if (message.type === 'write') setTimeout(() => controller.abort(), 0);
    };
    return worker;
  };
  await assert.rejects(
    excel.serializeExcel({
      sheets: [
        {
          ...sheet,
          rows: Array.from({ length: 5000 }, (_, i) => ({ code: String(i) })),
        },
      ],
      signal: controller.signal,
      execution: { mode: 'worker', workerFactory },
    }),
    { code: 'CANCELLED' }
  );
  assert(track.requests.includes('write'));
  assert(track.terminated);
});
