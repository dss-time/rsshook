import {
  defineExcelSchema,
  defineExcelColumns,
  serializeExcel,
  parseExcel,
} from 'rsshook-excel';
import { useExcel } from 'rsshook-excel/react';
import { downloadExcel } from 'rsshook-excel/browser';
interface Product {
  code: string;
  quantity: number;
}
const schema = defineExcelSchema<Product>({
  fields: {
    code: {
      type: 'string',
      required: true,
      parse: value => String(value),
      validate: value => (value.length ? undefined : 'Empty'),
    },
    quantity: {
      type: 'number',
      required: true,
      validate: value => (value >= 0 ? undefined : 'Negative'),
    },
  },
});
const columns = defineExcelColumns<Product>([
  {
    id: 'code',
    field: 'code',
    title: '编号',
    format: value => value.toUpperCase(),
  },
  {
    id: 'quantity',
    field: 'quantity',
    title: '数量',
    format: value => value.toFixed(2),
  },
  { id: 'index', title: '序号', value: (_row, ctx) => ctx.index + 1 },
]);
const header = {
  mode: 'named' as const,
  row: 1,
  bindings: { code: { title: '编号' }, quantity: { title: '数量' } },
};
const rows: Product[] = [{ code: '001', quantity: 0 }];
void serializeExcel({ sheets: [{ name: 'Products', rows, columns }] });
void parseExcel(new Uint8Array([1]), { schema, header });
void downloadExcel({
  fileName: 'Products.xlsx',
  sheets: [{ name: 'Products', rows, columns }],
});
export function useProducts() {
  return useExcel({ schema, importDefaults: { header } });
}
// @ts-expect-error nonexistent field must be rejected
defineExcelColumns<Product>([{ id: 'bad', field: 'missing', title: 'Bad' }]);
// @ts-expect-error field formatter must receive its own type
const bad: import('rsshook-excel').ExportColumn<Product> = {
  id: 'code',
  field: 'code',
  title: 'Bad',
  format: (value: number) => value,
};
void bad;
const products = import('rsshook-excel').then(({ defineExcelSheet }) => {
  const sheetA = defineExcelSheet({ name: 'Products', rows, columns });
  const sheetB = defineExcelSheet({
    name: 'Other',
    rows: [{ enabled: true }],
    columns: [
      {
        id: 'enabled',
        field: 'enabled',
        title: 'Enabled',
        format: value => (value ? 'Yes' : 'No'),
      },
    ],
  });
  return serializeExcel({ sheets: [sheetA, sheetB] });
});
void products;

// Non-optional output fields cannot silently disappear.
// @ts-expect-error non-optional fields require required:true or a default
const missingPresence: import('rsshook-excel').ExcelSchema<Product>['fields']['code'] =
  { type: 'string' };
type CodeFieldType = NonNullable<
  import('rsshook-excel').ExcelSchema<Product>['fields']['code']['type']
>;
// @ts-expect-error numeric conversion cannot declare a string output field
const wrongType: CodeFieldType = 'number';
void missingPresence;
void wrongType;
defineExcelSchema<{ note?: string }>({ fields: { note: { type: 'string' } } });
defineExcelSchema<{ quantity: number }>({
  fields: { quantity: { type: 'number', defaultValue: 0 } },
});

// New streaming and Worker APIs retain row typing in older TypeScript consumers.
import {
  importBatches,
  parseCsvBatches,
  writeCsv,
  serializeCsvStream,
} from 'rsshook-excel';
const execution: import('rsshook-excel').ExcelExecution = {
  mode: 'worker',
  workerFactory: () => new Worker('/excel-worker.mjs', { type: 'module' }),
};
void importBatches(new Blob(), {
  schema,
  header,
  execution,
  batchSize: 500,
  onBatch: async batch => {
    batch.validRows.forEach(row => row.data.quantity.toFixed(2));
  },
});
void parseCsvBatches(new ReadableStream<Uint8Array>(), { schema, header });
void writeCsv<Product>({
  sheet: {
    name: 'Data',
    columns,
    rows: (async function* () {
      yield* rows;
    })(),
  },
  sink: new WritableStream<Uint8Array>(),
});
void serializeCsvStream<Product>({
  sheet: { name: 'Data', columns, rows },
  csv: { newline: '\r\n', chunkBytes: 1024 },
});
