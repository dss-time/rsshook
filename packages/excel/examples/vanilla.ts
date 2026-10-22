import { defineExcelSchema, parseExcel } from 'rsshook-excel';
import { downloadExcel } from 'rsshook-excel/browser';

/** Mount a framework-free demo and return its cleanup function. */
export function mountExcelExample(container: HTMLElement): () => void {
  const controller = new AbortController();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  const button = document.createElement('button');
  button.textContent = '下载商品样例';
  const output = document.createElement('pre');
  container.append(input, button, output);
  const schema = defineExcelSchema<{ code: string; quantity: number }>({
    fields: {
      code: { type: 'string', required: true },
      quantity: { type: 'number', required: true },
    },
  });
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      void parseExcel(file, {
        schema,
        signal: controller.signal,
        header: {
          mode: 'named',
          row: 1,
          bindings: {
            code: { title: '商品编号' },
            quantity: { title: '数量' },
          },
        },
      }).then(
        result => {
          if (!controller.signal.aborted)
            output.textContent = JSON.stringify(result, null, 2);
        },
        error => {
          if (!controller.signal.aborted) output.textContent = error.message;
        }
      );
    },
    { signal: controller.signal }
  );
  button.addEventListener(
    'click',
    () => {
      button.disabled = true;
      void downloadExcel({
        fileName: '商品.xlsx',
        signal: controller.signal,
        sheets: [
          {
            name: '商品',
            columns: [
              { id: 'code', field: 'code', title: '商品编号' },
              { id: 'quantity', field: 'quantity', title: '数量' },
            ],
            rows: [{ code: '000123', quantity: 0 }],
          },
        ],
      })
        .catch(error => {
          if (!controller.signal.aborted) output.textContent = error.message;
        })
        .finally(() => {
          button.disabled = false;
        });
    },
    { signal: controller.signal }
  );
  return () => {
    controller.abort();
    input.remove();
    button.remove();
    output.remove();
  };
}
