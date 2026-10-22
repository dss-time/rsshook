const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { useExcel } = require('../dist/react.cjs');
const { serializeExcel } = require('../dist/index.cjs');
const { downloadExcel, saveExcelFile } = require('../dist/browser.cjs');
const { act } = React;
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test',
});
for (const key of ['window', 'document', 'HTMLElement', 'Node'])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const downloads = [];
const revoked = [];
URL.createObjectURL = () => 'blob:excel-test';
URL.revokeObjectURL = url => revoked.push(url);
dom.window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ name: this.download, href: this.href });
};
const schema = { fields: { code: { type: 'string', required: true } } };
const header = { mode: 'named', row: 1, bindings: { code: { title: '编号' } } };
const sheets = [
  {
    name: 'Products',
    columns: [{ id: 'code', field: 'code', title: '编号' }],
    rows: [{ code: '001' }],
  },
];
async function mount(initial = { schema, importDefaults: { header } }) {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  let current;
  let config = initial;
  function Probe() {
    current = useExcel(config);
    return null;
  }
  const render = () =>
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe))
    );
  await act(async () => {
    render();
  });
  return {
    get api() {
      return current;
    },
    async rerender(next) {
      config = next;
      await act(async () => {
        render();
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      element.remove();
    },
  };
}
function pendingFile() {
  const blob = new Blob(['pending']);
  blob.arrayBuffer = () => new Promise(() => {});
  return blob;
}
const rejection = promise =>
  promise.then(
    () => {
      throw new Error('Expected rejection');
    },
    error => error
  );

test('StrictMode replay permits parsing and stable methods use latest options', async () => {
  const file = await serializeExcel({ sheets });
  const hook = await mount();
  const parse = hook.api.parse;
  let result;
  await act(async () => {
    result = await parse(file.bytes);
  });
  assert.equal(result.validRows[0].data.code, '001');
  assert.equal(hook.api.parseState.status, 'success');
  await hook.rerender({
    schema: {
      fields: { code: { type: 'string', parse: value => `${value}!` } },
    },
    importDefaults: { header },
  });
  assert.equal(hook.api.parse, parse);
  await act(async () => {
    result = await parse(file.bytes);
  });
  assert.equal(result.validRows[0].data.code, '001!');
  await hook.unmount();
});
test('new parse rejects stale promise and commits only latest result', async () => {
  const hook = await mount();
  const file = await serializeExcel({ sheets });
  let old;
  await act(async () => {
    old = rejection(hook.api.parse(pendingFile()));
  });
  assert.equal(hook.api.parseState.status, 'running');
  await act(async () => {
    await hook.api.parse(file.bytes);
  });
  assert.equal((await old).code, 'CANCELLED');
  assert.equal(hook.api.parseState.status, 'success');
  await hook.unmount();
});
test('cancel settles I/O promptly and reset retains idle state', async () => {
  const hook = await mount();
  let result;
  await act(async () => {
    result = rejection(hook.api.parse(pendingFile()));
  });
  await act(async () => {
    hook.api.cancel('parse');
    await result;
  });
  assert.equal((await result).code, 'CANCELLED');
  assert.equal(hook.api.parseState.status, 'cancelled');
  await act(async () => {
    result = rejection(hook.api.parse(pendingFile()));
  });
  await act(async () => {
    hook.api.reset();
    await result;
  });
  assert.equal(hook.api.parseState.status, 'idle');
  await hook.unmount();
});
test('unmount settles pending operations and saved callbacks cannot restart work', async () => {
  const hook = await mount();
  const parse = hook.api.parse;
  let result;
  await act(async () => {
    result = rejection(parse(pendingFile()));
  });
  await hook.unmount();
  assert.equal((await result).code, 'CANCELLED');
  assert.equal((await rejection(parse(pendingFile()))).code, 'CANCELLED');
});
test('parse failure is recoverable and missing header reports configuration error', async () => {
  const hook = await mount({ schema });
  await act(async () => {
    assert.equal(
      (await rejection(hook.api.parse(new Uint8Array([1])))).code,
      'INVALID_CONFIG'
    );
  });
  assert.equal(hook.api.parseState.status, 'error');
  const file = await serializeExcel({ sheets });
  await act(async () => {
    await hook.api.parse(file.bytes, { header });
  });
  assert.equal(hook.api.parseState.status, 'success');
  await hook.unmount();
});
test('downloads normalize extension, reject busy calls and keep parse state independent', async () => {
  downloads.length = 0;
  const hook = await mount();
  let first, second;
  await act(async () => {
    first = hook.api.download({ fileName: 'report.XLSX', sheets });
    second = rejection(
      hook.api.download({ fileName: 'duplicate.xlsx', sheets })
    );
    await first;
  });
  assert.equal((await second).code, 'BUSY');
  assert.equal(hook.api.parseState.status, 'idle');
  assert.equal(hook.api.exportState.status, 'success');
  assert.deepEqual(
    downloads.map(item => item.name),
    ['report.xlsx']
  );
  assert.equal(document.querySelectorAll('a').length, 0);
  await hook.unmount();
});
test('cancellation from phase callback prevents the browser download', async () => {
  downloads.length = 0;
  const controller = new AbortController();
  await assert.rejects(
    downloadExcel({
      fileName: 'no.xlsx',
      sheets,
      signal: controller.signal,
      onPhase: phase => {
        if (phase === 'downloading') controller.abort();
      },
    }),
    error => error.code === 'CANCELLED'
  );
  assert.equal(downloads.length, 0);
});
test('save releases object URLs and rejects invalid names', async () => {
  const file = await serializeExcel({ sheets });
  assert.throws(
    () => saveExcelFile(file, '../bad'),
    error => error.code === 'INVALID_CONFIG'
  );
  saveExcelFile(file, 'report.csv');
  assert.equal(downloads.at(-1).name, 'report.xlsx');
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.ok(revoked.length > 0);
});

test('StrictMode effect replay cancels the old parse and completes the new one', async () => {
  const file = await serializeExcel({ sheets });
  const results = [];
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  function Probe() {
    const excel = useExcel({ schema, importDefaults: { header } });
    React.useEffect(() => {
      results.push(
        excel.parse(file.bytes).then(
          result => result.validRows[0].data.code,
          error => error.code
        )
      );
    }, [excel.parse]);
    return null;
  }
  await act(async () => {
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe))
    );
  });
  assert.deepEqual(await Promise.all(results), ['CANCELLED', '001']);
  await act(async () => root.unmount());
  element.remove();
});
test('cancelling export before its asynchronous stage prevents download', async () => {
  const hook = await mount();
  downloads.length = 0;
  let result;
  await act(async () => {
    result = rejection(hook.api.download({ fileName: 'cancel.xlsx', sheets }));
    hook.api.cancel('export');
  });
  assert.equal((await result).code, 'CANCELLED');
  assert.equal(downloads.length, 0);
  await hook.unmount();
});
