import { useState } from 'react';
import {
  createExcelErrorSheet,
  createExcelTemplate,
  defineExcelColumns,
  defineExcelSchema,
} from 'rsshook-excel';
import type { ExportHeader, ExportSheet, ParseResult } from 'rsshook-excel';
import { downloadExcel } from 'rsshook-excel/browser';
import { useExcel } from 'rsshook-excel/react';

interface Product {
  code: string;
  quantity: number;
}
const schema = defineExcelSchema<Product>({
  fields: {
    code: { type: 'string', required: true },
    quantity: {
      type: 'number',
      required: true,
      validate: value => (value >= 0 ? undefined : '数量不能小于 0'),
    },
  },
});
const columns = defineExcelColumns<Product>([
  { id: 'code', field: 'code', title: '商品编号', width: 24 },
  { id: 'quantity', field: 'quantity', title: '数量', width: 12 },
  { id: 'index', title: '序号', value: (_row, context) => context.index + 1 },
]);
const headers: Record<string, ExportHeader> = {
  simple: { mode: 'simple', titles: { code: '产品编码' } },
  grouped: {
    mode: 'grouped',
    groups: [
      { column: 'index' },
      {
        title: '商品信息',
        children: [{ column: 'code' }, { column: 'quantity' }],
      },
    ],
  },
  custom: {
    mode: 'custom',
    rows: [
      ['自定义入库报表', null, null],
      ['序号', '产品编码', '入库数量'],
    ],
    merges: ['A1:C1'],
    bindings: { A: 'index', B: 'code', C: 'quantity' },
  },
};

/** Plain browser controls; no UI library, HTTP client or application aliases. */
export function ReactExcelExample() {
  const [mode, setMode] = useState('simple');
  const [result, setResult] = useState<ParseResult<Product> | null>(null);
  const [error, setError] = useState('');
  const excel = useExcel({ schema });
  const makeSheet = (rows: readonly Product[]): ExportSheet<Product> => ({
    name: '商品',
    rows,
    columns,
    header: headers[mode],
  });
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <section>
      <select value={mode} onChange={event => setMode(event.target.value)}>
        <option value="simple">简单表头</option>
        <option value="grouped">分组表头</option>
        <option value="custom">自定义表头</option>
      </select>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void run(async () => {
            const headerRow = mode === 'simple' ? 1 : 2;
            const parsed = await excel.parse(file, {
              header: {
                mode: 'named',
                row: headerRow,
                bindings: {
                  code: { title: '商品编号', aliases: ['产品编码'] },
                  quantity: { title: '数量', aliases: ['入库数量'] },
                },
              },
            });
            setResult(parsed);
          });
        }}
      />
      <button
        disabled={excel.exportState.status === 'running'}
        onClick={() =>
          void run(() =>
            excel.download({
              fileName: '商品.xlsx',
              sheets: [makeSheet([{ code: '000123', quantity: 0 }])],
            })
          )
        }
      >
        下载样例
      </button>
      <button
        onClick={() =>
          void run(() =>
            excel.download({
              fileName: '导入模板.xlsx',
              sheets: [createExcelTemplate(makeSheet([]))],
            })
          )
        }
      >
        下载模板
      </button>
      <button
        disabled={!result?.invalidRows.length}
        onClick={() =>
          void run(() =>
            downloadExcel({
              fileName: '错误明细.xlsx',
              sheets: [createExcelErrorSheet(result!)],
            })
          )
        }
      >
        下载错误明细
      </button>
      <button onClick={() => excel.cancel()}>取消</button>
      <button
        onClick={() => {
          excel.reset();
          setResult(null);
          setError('');
        }}
      >
        重置
      </button>
      <p>
        解析：{excel.parseState.status}；导出：{excel.exportState.status}
      </p>
      {error && <p role="alert">{error}</p>}
      <pre>{result ? JSON.stringify(result, null, 2) : '请选择文件'}</pre>
    </section>
  );
}
