import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import {
  parseExcel,
  serializeExcel,
  defineExcelSchema,
  createExcelTemplate,
  createExcelErrorSheet,
  ExcelError,
} from '../dist/index.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
if (typeof XLSX.set_cptable === 'function')
  XLSX.set_cptable(await import('xlsx/dist/cpexcel.full.mjs'));
const schema = defineExcelSchema({
  fields: {
    code: { type: 'string', required: true },
    quantity: { type: 'number', required: true },
    enabled: { type: 'boolean' },
  },
});
const columns = [
  { id: 'code', field: 'code', title: '编号' },
  { id: 'quantity', field: 'quantity', title: '数量' },
  { id: 'enabled', field: 'enabled', title: '启用' },
];
const header = {
  mode: 'named',
  row: 1,
  bindings: {
    code: { title: '编号' },
    quantity: { title: '数量' },
    enabled: { title: '启用', requiredHeader: false },
  },
};
const sheet = (rows = [], overrides = {}) => ({
  name: 'Products',
  rows,
  columns,
  ...overrides,
});
function fixture(rows, mutate) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  mutate?.(worksheet, workbook);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Input');
  return new Uint8Array(
    XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  );
}
const options = overrides => ({ schema, header, ...overrides });
const fails = code => error =>
  error instanceof ExcelError && error.code === code;

test('roundtrip preserves 0, false and textual identifiers', async () => {
  const rows = [{ code: '000123', quantity: 0, enabled: false }];
  const file = await serializeExcel({ sheets: [sheet(rows)] });
  const result = await parseExcel(file.bytes, options());
  assert.deepEqual(result.validRows, [{ rowNumber: 2, data: rows[0] }]);
  assert.equal(file.extension, 'xlsx');
});
test('alias matching tolerates reordered and extra columns', async () => {
  const file = fixture([
    ['其他', '数量', '产品编码'],
    ['x', 2, '001'],
  ]);
  const result = await parseExcel(
    file,
    options({
      header: {
        ...header,
        bindings: {
          code: { title: '编号', aliases: ['产品编码'] },
          quantity: { title: '数量' },
        },
      },
      unknownColumns: 'warn',
    })
  );
  assert.equal(result.validRows[0].data.code, '001');
  assert.equal(result.warnings[0].column, 'A');
});
test('keeps original source row numbers across blank rows', async () => {
  const file = fixture([['编号', '数量'], ['one', 1], [], ['two', 'bad']]);
  const result = await parseExcel(file, options());
  assert.equal(result.validRows[0].rowNumber, 2);
  assert.equal(result.invalidRows[0].rowNumber, 4);
  assert.equal(result.invalidRows[0].issues[0].code, 'CONVERSION_FAILED');
  assert.deepEqual(result.summary, {
    scannedRows: 3,
    validRows: 1,
    invalidRows: 1,
    skippedRows: 1,
  });
});
test('formatted strings preserve Excel display zeros', async () => {
  const file = fixture(
    [
      ['编号', '数量'],
      [123, 0],
    ],
    ws => {
      ws.A2.z = '000000';
    }
  );
  const result = await parseExcel(file, options());
  assert.equal(result.validRows[0].data.code, '000123');
});
test('missing header rejects and optional missing value still validates required data', async () => {
  await assert.rejects(
    parseExcel(fixture([['编号'], ['a']]), options()),
    fails('MISSING_HEADER')
  );
  const result = await parseExcel(
    fixture([['编号'], ['a']]),
    options({
      header: {
        ...header,
        bindings: {
          code: { title: '编号' },
          quantity: { title: '数量', requiredHeader: false },
        },
      },
    })
  );
  assert.equal(result.invalidRows[0].issues[0].code, 'REQUIRED');
});
test('ambiguous header or aliases never silently pick a column', async () => {
  await assert.rejects(
    parseExcel(
      fixture([
        ['编号', '编号', '数量'],
        ['a', 'b', 1],
      ]),
      options()
    ),
    fails('AMBIGUOUS_HEADER')
  );
});
test('unknown columns can reject', async () => {
  await assert.rejects(
    parseExcel(
      fixture([
        ['编号', '数量', 'other'],
        ['a', 1, 'x'],
      ]),
      options({ unknownColumns: 'error' })
    ),
    fails('UNKNOWN_COLUMN')
  );
});
test('position import works without headers and accepts selected columns', async () => {
  const result = await parseExcel(
    fixture([['a', 'ignored', 3]]),
    options({
      header: {
        mode: 'position',
        dataStartRow: 1,
        bindings: { code: 'A', quantity: 'C' },
      },
    })
  );
  assert.deepEqual(result.validRows[0].data, { code: 'a', quantity: 3 });
});
test('grouped headers support unequal tree depths and import by path', async () => {
  const file = await serializeExcel({
    sheets: [
      sheet([{ code: 'a', quantity: 2, enabled: true }], {
        header: {
          mode: 'grouped',
          groups: [
            { column: 'code' },
            {
              title: '运行',
              children: [{ column: 'quantity' }, { column: 'enabled' }],
            },
          ],
        },
      }),
    ],
  });
  const result = await parseExcel(
    file.bytes,
    options({
      header: {
        mode: 'path',
        rows: [1, 2],
        bindings: {
          code: { path: ['编号'] },
          quantity: { path: ['运行', '数量'] },
          enabled: { path: ['运行', '启用'] },
        },
      },
    })
  );
  assert.deepEqual(result.validRows[0].data, {
    code: 'a',
    quantity: 2,
    enabled: true,
  });
  assert.equal(result.validRows[0].rowNumber, 3);
});
test('duplicate leaf titles are disambiguated by parent path', async () => {
  const file = fixture([
    ['本月', '上月'],
    ['金额', '金额'],
    [2, 1],
  ]);
  const result = await parseExcel(file, {
    schema: {
      fields: { current: { type: 'number' }, previous: { type: 'number' } },
    },
    header: {
      mode: 'path',
      rows: [1, 2],
      bindings: {
        current: { path: ['本月', '金额'] },
        previous: { path: ['上月', '金额'] },
      },
    },
  });
  assert.deepEqual(result.validRows[0].data, { current: 2, previous: 1 });
});
test('custom header, before/after regions, merges and calculated columns', async () => {
  const file = await serializeExcel({
    sheets: [
      sheet([{ code: '001', quantity: 3 }], {
        columns: [
          ...columns.slice(0, 2),
          {
            id: 'sequence',
            title: '序号',
            value: (_row, ctx) => ctx.index + 1,
          },
        ],
        beforeTable: { rows: [['Report', null, null], []], merges: ['A1:C1'] },
        header: {
          mode: 'custom',
          rows: [
            ['Custom', null, null],
            ['Count', 'Index', 'Code'],
          ],
          merges: ['A1:C1'],
          bindings: { A: 'quantity', B: 'sequence', C: 'code' },
        },
        afterTable: { rows: [[], ['End', null, null]], merges: ['A2:C2'] },
      }),
    ],
  });
  const ws = XLSX.read(file.bytes).Sheets.Products;
  assert.equal(ws.A5.v, 3);
  assert.equal(ws.B5.v, 1);
  assert.equal(ws.C5.v, '001');
  assert.equal(ws.A7.v, 'End');
  assert.equal(ws['!merges'].length, 3);
  assert.equal(ws['!merges'][2].s.r, 6);
});
test('custom layout does not mutate user arrays', async () => {
  const rows = Object.freeze([Object.freeze(['Code', 'Qty', 'Active'])]);
  await serializeExcel({
    sheets: [
      sheet([], {
        header: {
          mode: 'custom',
          rows,
          bindings: { A: 'code', B: 'quantity', C: 'enabled' },
        },
      }),
    ],
  });
  assert.equal(rows[0][0], 'Code');
});
test('invalid merges reject overlap, loss of content and out-of-region positions', async () => {
  for (const [rows, merges] of [
    [[['A', 'B', null]], ['A1:C1']],
    [[['A', null, null]], ['A1:B1', 'B1:C1']],
    [[['A', null, null]], ['A1:C2']],
  ]) {
    await assert.rejects(
      serializeExcel({
        sheets: [
          sheet([], {
            header: {
              mode: 'custom',
              rows,
              merges,
              bindings: { A: 'code', B: 'quantity', C: 'enabled' },
            },
          }),
        ],
      }),
      fails('INVALID_CONFIG')
    );
  }
});
test('all export columns must appear once in layout', async () => {
  await assert.rejects(
    serializeExcel({
      sheets: [
        sheet([], {
          header: { mode: 'custom', rows: [['A']], bindings: { A: 'code' } },
        }),
      ],
    }),
    fails('INVALID_CONFIG')
  );
  await assert.rejects(
    serializeExcel({
      sheets: [
        sheet([], {
          header: {
            mode: 'grouped',
            groups: [{ column: 'code' }, { column: 'code' }],
          },
        }),
      ],
    }),
    fails('INVALID_CONFIG')
  );
});
test('template has headers and no data, and source is retained', async () => {
  const source = sheet([{ code: 'one', quantity: 1 }]);
  const file = await serializeExcel({ sheets: [createExcelTemplate(source)] });
  const ws = XLSX.read(file.bytes).Sheets.Products;
  assert.equal(ws.A1.v, '编号');
  assert.equal(ws.A2, undefined);
  assert.equal(source.rows.length, 1);
});
test('error report preserves source row/value and issue text', async () => {
  const result = await parseExcel(
    fixture([
      ['编号', '数量'],
      ['a', 'bad'],
    ]),
    options()
  );
  const file = await serializeExcel({
    sheets: [createExcelErrorSheet(result)],
  });
  const rows = XLSX.utils.sheet_to_json(XLSX.read(file.bytes).Sheets.Errors);
  assert.equal(rows[0].Row, 2);
  assert.equal(rows[0].B, 'bad');
  assert.match(rows[0].Errors, /quantity/);
});
test('multiple sheets, selected name/index and duplicate name validation', async () => {
  const file = await serializeExcel({
    sheets: [
      sheet([], { name: 'Empty' }),
      sheet([{ code: 'x', quantity: 1 }], { name: 'Data' }),
    ],
  });
  assert.equal(
    (await parseExcel(file.bytes, options({ sheet: { name: 'Data' } })))
      .validRows.length,
    1
  );
  assert.equal(
    (await parseExcel(file.bytes, options({ sheet: { index: 1 } }))).sheet.name,
    'Data'
  );
  await assert.rejects(
    parseExcel(file.bytes, options({ sheet: { name: 'Missing' } })),
    fails('SHEET_NOT_FOUND')
  );
  await assert.rejects(
    serializeExcel({ sheets: [sheet(), sheet([], { name: 'products' })] }),
    fails('INVALID_CONFIG')
  );
});
test('row/field validators and defaults preserve false/zero', async () => {
  const result = await parseExcel(
    fixture([
      ['编号', '数量', '启用'],
      ['a', -1, false],
      ['b', null, null],
      ['c', 2, true],
    ]),
    options({
      schema: {
        fields: {
          code: { type: 'string' },
          quantity: {
            type: 'number',
            defaultValue: 0,
            validate: n => (n < 0 ? 'Negative' : undefined),
          },
          enabled: { type: 'boolean', defaultValue: false },
        },
        validateRow: row => (row.code === 'c' ? 'Row rejected' : undefined),
      },
    })
  );
  assert.equal(result.invalidRows.length, 2);
  assert.deepEqual(result.validRows[0].data, {
    code: 'b',
    quantity: 0,
    enabled: false,
  });
});
test('callback throws preserve cause and source context', async () => {
  const cause = new Error('business parser failed');
  await assert.rejects(
    parseExcel(
      fixture([
        ['编号', '数量'],
        ['a', 1],
      ]),
      options({
        schema: {
          fields: {
            code: {
              parse() {
                throw cause;
              },
            },
            quantity: { type: 'number' },
            enabled: {},
          },
        },
      })
    ),
    error =>
      error.code === 'CALLBACK_FAILED' &&
      error.cause === cause &&
      error.issues[0].rowNumber === 2
  );
});
test('date serials handle 1900/1904 and reject fictitious leap day', async () => {
  const schema = {
    fields: { date: { type: 'date', dateOutput: 'date-string' } },
  };
  const header = { mode: 'position', dataStartRow: 1, bindings: { date: 'A' } };
  assert.equal(
    (await parseExcel(fixture([[61]]), { schema, header })).validRows[0].data
      .date,
    '1900-03-01'
  );
  assert.equal(
    (await parseExcel(fixture([[60]]), { schema, header })).invalidRows.length,
    1
  );
  const file = fixture([[0]], (_ws, wb) => {
    wb.Workbook = { WBProps: { date1904: true } };
  });
  assert.equal(
    (await parseExcel(file, { schema, header })).validRows[0].data.date,
    '1904-01-01'
  );
});
test('cached formula results warn and error cells invalidate rows', async () => {
  const file = fixture(
    [
      ['编号', '数量'],
      ['a', 2],
      ['b', 0],
    ],
    ws => {
      ws.B2.f = '1+1';
      ws.B3 = { t: 'e', v: 7 };
    }
  );
  const result = await parseExcel(file, options());
  assert.equal(result.warnings[0].code, 'FORMULA_CACHE');
  assert.equal(result.invalidRows[0].issues[0].code, 'CELL_ERROR');
});
test('file/row/cell/issue limits fail explicitly', async () => {
  const file = fixture([
    ['编号', '数量'],
    ['a', 'bad'],
    ['b', 'bad'],
  ]);
  await assert.rejects(
    parseExcel(file, options({ limits: { maxFileSize: 1 } })),
    fails('FILE_SIZE_LIMIT')
  );
  await assert.rejects(
    parseExcel(file, options({ limits: { maxRows: 1 } })),
    fails('ROW_LIMIT')
  );
  await assert.rejects(
    parseExcel(file, options({ limits: { maxCells: 1 } })),
    fails('CELL_LIMIT')
  );
  await assert.rejects(
    parseExcel(file, options({ limits: { maxIssues: 1 } })),
    fails('ISSUE_LIMIT')
  );
  await assert.rejects(
    serializeExcel({
      sheets: [sheet([{ code: 'a' }, { code: 'b' }])],
      limits: { maxRows: 1 },
    }),
    fails('ROW_LIMIT')
  );
});
test('actual cells are scanned without expanding a pathological !ref', async () => {
  // Write sparse worksheet XML with a distant dimension but only 4 real cells.
  const archive = XLSX.CFB.read(
    fixture([
      ['编号', '数量'],
      ['a', 1],
    ]),
    { type: 'array' }
  );
  const entry = XLSX.CFB.find(archive, 'Root Entry/xl/worksheets/sheet1.xml');
  const xml = Buffer.from(entry.content)
    .toString('utf8')
    .replace('ref="A1:B2"', 'ref="A1:XFD1048576"');
  XLSX.CFB.utils.cfb_add(archive, 'xl/worksheets/sheet1.xml', Buffer.from(xml));
  const file = new Uint8Array(
    XLSX.CFB.write(archive, { type: 'array', fileType: 'zip' })
  );
  const start = performance.now();
  const result = await parseExcel(file, options());
  assert.equal(result.validRows.length, 1);
  assert.ok(performance.now() - start < 3000);
});
test('pre-aborted operations and async file cancellation reject promptly', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    parseExcel(new Uint8Array([1]), options({ signal: controller.signal })),
    fails('CANCELLED')
  );
  await assert.rejects(
    serializeExcel({ sheets: [sheet()], signal: controller.signal }),
    fails('CANCELLED')
  );
  const pending = new Blob(['pending']);
  pending.arrayBuffer = () => new Promise(() => {});
  const active = new AbortController();
  const result = parseExcel(pending, options({ signal: active.signal }));
  active.abort();
  await assert.rejects(result, fails('CANCELLED'));
});
test('empty and corrupt ZIP files reject rather than hang', async () => {
  await assert.rejects(
    parseExcel(new Uint8Array(), options()),
    fails('EMPTY_FILE')
  );
  await assert.rejects(
    parseExcel(new Uint8Array([80, 75, 3, 4, 0, 0, 0]), options()),
    fails('PARSE_FAILED')
  );
});
test('CSV supports Unicode, delimiter, BOM and protects formula-like text', async () => {
  const file = await serializeExcel({
    format: 'csv',
    csv: { delimiter: ';' },
    sheets: [sheet([{ code: '=1+1', quantity: 0, enabled: false }])],
  });
  assert.deepEqual([...file.bytes.slice(0, 3)], [239, 187, 191]);
  assert.match(new TextDecoder().decode(file.bytes), /'=1\+1/);
  const result = await parseExcel(
    file.bytes,
    options({ csv: { delimiter: ';', codepage: 65001 } })
  );
  assert.equal(result.validRows[0].data.code, "'=1+1");
  await assert.rejects(
    serializeExcel({
      format: 'csv',
      sheets: [sheet(), sheet([], { name: 'Other' })],
    }),
    fails('INVALID_CONFIG')
  );
  await assert.rejects(
    serializeExcel({
      format: 'csv',
      sheets: [
        sheet([], {
          header: {
            mode: 'grouped',
            groups: [
              {
                title: 'Group',
                children: [
                  { column: 'code' },
                  { column: 'quantity' },
                  { column: 'enabled' },
                ],
              },
            ],
          },
        }),
      ],
    }),
    fails('INVALID_CONFIG')
  );
});
test('legacy XLS output is readable and preserves text identifiers', async () => {
  const file = await serializeExcel({
    format: 'xls',
    sheets: [sheet([{ code: '001', quantity: 0, enabled: false }])],
  });
  const result = await parseExcel(file.bytes, options());
  assert.equal(result.validRows[0].data.code, '001');
});
test('prototype-like field names are ordinary own data properties', async () => {
  const schema = {
    fields: JSON.parse(
      '{"__proto__":{"type":"string"},"constructor":{"type":"string"}}'
    ),
  };
  const header = {
    mode: 'position',
    dataStartRow: 1,
    bindings: JSON.parse('{"__proto__":"A","constructor":"B"}'),
  };
  const result = await parseExcel(fixture([['a', 'b']]), { schema, header });
  assert.equal(
    Object.getPrototypeOf(result.validRows[0].data),
    Object.prototype
  );
  assert.equal(result.validRows[0].data.__proto__, 'a');
});
test('ESM and CJS expose the same public interface without UI dependencies', async () => {
  const cjs = require('../dist/index.cjs');
  assert.equal(typeof cjs.parseExcel, 'function');
  assert.equal(typeof require('../dist/react.cjs').useExcel, 'function');
  assert.equal(typeof require('../dist/browser.cjs').downloadExcel, 'function');
});

test('CSV import preserves textual leading zeros instead of inferring numbers', async () => {
  const bytes = new TextEncoder().encode(
    '\uFEFF编号,数量,启用\n000123,0,false'
  );
  const result = await parseExcel(bytes, options());
  assert.deepEqual(result.validRows[0].data, {
    code: '000123',
    quantity: 0,
    enabled: false,
  });
});
test('custom conversions must respect required and declared runtime types', async () => {
  const file = fixture([
    ['编号', '数量'],
    ['a', 1],
  ]);
  const result = await parseExcel(
    file,
    options({
      schema: {
        fields: {
          code: { type: 'string', required: true, parse: () => '' },
          quantity: { type: 'number', parse: () => 'bad' },
          enabled: {},
        },
      },
    })
  );
  assert.deepEqual(
    result.invalidRows[0].issues.map(issue => issue.code),
    ['REQUIRED', 'CONVERSION_FAILED']
  );
});
test('header expansion is limited before allocating a dense layout', async () => {
  await assert.rejects(
    serializeExcel({
      sheets: [
        sheet([], {
          header: {
            mode: 'custom',
            rows: [['title']],
            bindings: { XFD: 'code', A: 'quantity', B: 'enabled' },
          },
        }),
      ],
    }),
    fails('COLUMN_LIMIT')
  );
});

test('identical labels at different header levels remain distinct in paths', async () => {
  const result = await parseExcel(fixture([['Info'], ['Info'], ['a']]), {
    schema: { fields: { code: { type: 'string' } } },
    header: {
      mode: 'path',
      rows: [1, 2],
      bindings: { code: { path: ['Info', 'Info'] } },
    },
  });
  assert.equal(result.validRows[0].data.code, 'a');
});

test('custom numeric parsers reject NaN and output size limits are enforced', async () => {
  const result = await parseExcel(
    fixture([
      ['编号', '数量'],
      ['a', 1],
    ]),
    options({
      schema: {
        fields: {
          code: { type: 'string' },
          quantity: { type: 'number', parse: () => NaN },
          enabled: { type: 'boolean' },
        },
      },
    })
  );
  assert.equal(result.invalidRows[0].issues[0].code, 'CONVERSION_FAILED');
  await assert.rejects(
    serializeExcel({ sheets: [sheet()], limits: { maxFileSize: 1 } }),
    fails('FILE_SIZE_LIMIT')
  );
});
