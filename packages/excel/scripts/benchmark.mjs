import { performance } from 'node:perf_hooks';
import { parseExcel, serializeExcel } from '../dist/index.mjs';
const schema = {
  fields: {
    code: { type: 'string' },
    quantity: { type: 'number' },
    enabled: { type: 'boolean' },
  },
};
const columns = [
  { id: 'code', field: 'code', title: 'Code' },
  { id: 'quantity', field: 'quantity', title: 'Quantity' },
  { id: 'enabled', field: 'enabled', title: 'Enabled' },
];
const header = {
  mode: 'named',
  row: 1,
  bindings: {
    code: { title: 'Code' },
    quantity: { title: 'Quantity' },
    enabled: { title: 'Enabled' },
  },
};
// Warm the lazy engine before measuring. Results are local observations only.
await serializeExcel({ sheets: [{ name: 'Warmup', columns, rows: [] }] });
for (const count of [1000, 10000, 20000]) {
  const rows = Array.from({ length: count }, (_, index) => ({
    code: String(index).padStart(8, '0'),
    quantity: index,
    enabled: false,
  }));
  const start = performance.now();
  const file = await serializeExcel({
    sheets: [{ name: 'Data', columns, rows }],
  });
  const serialized = performance.now();
  const result = await parseExcel(file.bytes, { schema, header });
  if (result.validRows.length !== count)
    throw new Error('Benchmark data mismatch');
  console.log(
    JSON.stringify({
      rows: count,
      columns: 3,
      bytes: file.bytes.byteLength,
      exportMs: Math.round(serialized - start),
      parseMs: Math.round(performance.now() - serialized),
      heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    })
  );
}
