# rsshook-excel

面向浏览器和普通 TypeScript 调用的 Excel 导入导出模块，提供可选 React 18/19 Hook。无 AntD、Axios、Umi 或 React DOM 运行时依赖。已发布版本 `0.1.0`；下文 Worker 与流式 API 属于当前仓库的未发布变更，需本地构建后安装 tgz。

## 安装

```sh
npm install rsshook-excel@0.1.0
# 或 pnpm add rsshook-excel@0.1.0
```

React 应用从 `rsshook-excel/react` 引入 Hook；非 React 用户从主入口引入普通函数。

## 开发与本地接入

仓库构建使用根目录锁定的工具链：

```sh
npm run excel:build
```

独立包开发时先在 `packages/excel` 安装自身依赖，再执行：

```sh
npm ci
npm test
npm run test:package
```

独立包已包含 package-lock.json。包将 SheetJS 固定为官方 CDN 的 `0.20.3` 分发包；安装环境需能够访问该地址。React 为可选 peer dependency，普通函数不要求安装 React。构建工具要求 Node 20.19+ 或 22.12+，开发工具的 Node 要求不作为浏览器应用的运行时要求。

本地接入先构建再打包，在目标项目安装生成的 tgz：

```sh
npm pack --ignore-scripts
# 在目标项目执行，使用真实归档路径
npm install /path/to/rsshook-excel-0.1.0.tgz
```

归档包含 dist 与 README，不包含源码、测试、示例或 node_modules。现有 `rsshook/useExcel` 保持独立，使用者应显式选择新包，不会自动切换旧接口。

## 普通导入

```ts
import { defineExcelSchema, parseExcel } from 'rsshook-excel';

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

const result = await parseExcel(file, {
  schema,
  header: {
    mode: 'named',
    row: 1,
    bindings: {
      code: { title: '商品编号', aliases: ['产品编码', 'Product Code'] },
      quantity: { title: '数量' },
    },
  },
});
console.log(result.validRows, result.invalidRows, result.warnings);
```

输入支持 `File/Blob`、`ArrayBuffer`、`Uint8Array`。读取默认首个工作表，指定 `sheet: { name: '商品' }` 或 `{ index: 0 }` 可选择其他表。普通函数之间互不共享操作状态。

**坐标约定**：行号始终从 1 开始，工作表索引从 0 开始，列使用 `A/B/.../XFD`。返回的 `rowNumber` 为真实工作表行号，跳过空行后也不会改变。

## 三种导入匹配

```ts
// 单行标题，允许列顺序变化
const named = {
  mode: 'named',
  row: 3,
  bindings: { code: { title: '商品编号', aliases: ['产品编码'] } },
};

// 多行标题，区分不同父级下的同名子列
const path = {
  mode: 'path',
  rows: [3, 4],
  bindings: {
    currentAmount: { path: ['本月', '销售额'] },
    previousAmount: { path: ['上月', '销售额'] },
  },
};

// 固定列，允许无表头文件
const position = {
  mode: 'position',
  dataStartRow: 1,
  bindings: { code: 'A', quantity: 'C' },
};
```

绑定中的字段必须属于 Schema。标题匹配默认去首尾空格且区分大小写，可设置 `headerCaseSensitive: false` 或 `normalizeHeader`。多个标题/别名命中同一字段时拒绝，不静默选择。

`requiredHeader` 默认 true，只表示必须存在列；字段 `required` 表示每行必须有值，两者独立。位置绑定不校验标题。Schema 未绑定的字段仍参与默认值与必填检查。

多级表头仅根据真实合并范围补齐父级，不向任意空白单元格扩散。纵向合并的同一个标题只出现一次，不同层级的相同文字仍分别保留。

`unknownColumns` 默认 `ignore`，可设 `warn/error`；按实际存在的列判断。`dataStartRow` 可显式覆盖数据起点，必须位于标题之后；`dataEndRow` 限制终点。默认跳过整行无值的空行，空行不会中止读取。

## 字段转换契约

执行顺序：读取 → 空值/默认值 → 转换 → 字段校验 → 行级校验。转换或字段校验失败的行不执行行级校验。

| 配置                                   | 行为                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `type`                                 | string / number / boolean / date；省略时保留读取值                      |
| `read`                                 | auto / raw / formatted；auto 的文本字段优先显示文本，其他类型优先原始值 |
| `trim`                                 | 默认 true，去除输入字符串首尾空白                                       |
| `defaultValue`                         | null/undefined/空字符串时使用；保留 0、false                            |
| `parse(value, context)`                | 同步自定义转换，替代内置转换；指定 type 时仍检查返回的基本类型          |
| `validate(value, context)`             | 同步字段校验，返回 undefined、消息、issue 或 issue 数组                 |
| `schema.validateRow(row, {rowNumber})` | 字段校验全部成功后执行的同步行级校验                                    |

`context` 包含 rowNumber、column、field、raw、formatted。用户回调抛出异常时，操作以 `CALLBACK_FAILED` 拒绝并保留 cause；可预期的数据问题应从 validate 返回。不要返回 Promise，网络业务校验应在解析后执行。

TypeScript 中非可选字段必须配置 `required: true` 或 `defaultValue`；允许缺失的字段在 T 中声明为可选，避免 validRows 中缺失字段却被断言为必有值。字段 type 同时受对应的 TypeScript 字段类型约束。

数字使用明确的十进制/指数格式，不隐式接受千分位、货币或布尔值。布尔默认接受 true/false 和对应字符串（不区分大小写），`booleanNumbers: true` 额外接受 0/1。

日期字段必须指定 `dateOutput: 'date-string' | 'Date'`。支持 Excel 1900/1904 序列和严格 YYYY-MM-DD；Date 输出按 UTC 构造，拒绝 Excel 虚构的 1900-02-29。非标准日期使用自定义 parse。导出 Date 转为 ISO UTC 文本，避免按浏览器本地时区偏移；导出原生 Excel 日期数值请显式提供序列值与 numberFormat。

文本编号优先保留显示前导零；CSV 关闭自动数值推断。Excel 已经丢失的前导零或数字精度无法恢复，检测到不安全整数时产生警告。公式只读取缓存结果并警告其可能过期，无缓存结果或 Excel 错误单元格记为行错误，不计算公式。

## 三种导出表头

```ts
import { defineExcelColumns, serializeExcel } from 'rsshook-excel';
import { downloadExcel } from 'rsshook-excel/browser';

const columns = defineExcelColumns<Product>([
  { id: 'code', field: 'code', title: '商品编号', width: 24 },
  { id: 'quantity', field: 'quantity', title: '数量', numberFormat: '0.00' },
  { id: 'index', title: '序号', value: (_row, ctx) => ctx.index + 1 },
]);

await downloadExcel({
  fileName: '商品.xlsx',
  sheets: [{ name: '商品', rows: products, columns }],
});
```

`id` 标识输出列，`field` 从业务数据取值；`value(row, context)` 用于计算列或嵌套数据，二者互斥。field 列可使用类型安全的 `format(value, row)`。同一字段允许对应不同 id，独立展示或格式化。

省略 header 时按 columns 顺序使用 title。自定义标题：

```ts
header: { mode: 'simple', titles: { code: '产品编码' } }
```

分组表头自动计算横向、纵向合并，叶子顺序决定输出列顺序：

```ts
header: {
  mode: 'grouped',
  groups: [
    { column: 'index' },
    { title: '商品信息', children: [{ column: 'code' }, { column: 'quantity' }] },
  ],
}
```

完全自定义布局，显示文字与字段独立：

```ts
header: {
  mode: 'custom',
  rows: [
    ['商品入库报表', null, null],
    ['序号', '产品编码', '入库数量'],
  ],
  merges: ['A1:C1'],
  bindings: { A: 'index', B: 'code', C: 'quantity' },
}
```

每个输出列必须恰好绑定一次，未绑定的位置可留白。合并范围限于所在区域，越界、重叠或覆盖非空内容时拒绝。导入和导出的表头最大深度均为 32。配置不依赖任何页面表格的 columns 类型。

每张工作表支持一个数据表，以及可选 `beforeTable`、`afterTable`：

```ts
beforeTable: { rows: [['月度报表', null, null], []], merges: ['A1:C1'] },
afterTable: { rows: [[], ['备注', null, null]], merges: ['A2:C2'] },
```

各区域的合并坐标相对于该区域，从 A1 开始；内部计算整表位置。rows/columns 等输入均不会被修改。

不同数据类型的多工作表，使用 `defineExcelSheet` 分别检查各表类型，再组合：

```ts
import { defineExcelSheet } from 'rsshook-excel';
const a = defineExcelSheet({ name: '商品', rows: products, columns });
const b = defineExcelSheet({
  name: '状态',
  rows: [{ enabled: true }],
  columns: [{ id: 'enabled', field: 'enabled', title: '启用' }],
});
await downloadExcel({ fileName: '报表.xlsx', sheets: [a, b] });
```

普通函数 `serializeExcel` 返回 `{ bytes, format, extension, mimeType }`，可用于自定义存储、响应和文件输出。服务器环境不触发浏览器下载。

## 模板与错误明细

```ts
import { createExcelTemplate, createExcelErrorSheet } from 'rsshook-excel';
await downloadExcel({
  fileName: '模板.xlsx',
  sheets: [createExcelTemplate(sheet)],
});
await downloadExcel({
  fileName: '错误.xlsx',
  sheets: [createExcelErrorSheet(result)],
});
```

模板保持原表布局并清空数据，不修改源对象。错误表使用稳定格式：原始行号、源列字母与原始值、错误原因；不承诺复原原文件样式。

## React Hook

```ts
import { useExcel } from 'rsshook-excel/react';
const excel = useExcel<Product>({
  schema,
  importDefaults: { header },
  exportDefaults: { format: 'xlsx', limits: { maxRows: 10000 } },
});
const result = await excel.parse(file, { sheet: { index: 0 } });
await excel.download({ fileName: '商品.xlsx', sheets: [sheet] });
excel.cancel('parse'); // parse / export / all，默认 all
excel.reset();
```

返回 parse、download、cancel、reset、parseState、exportState。结果通过 Promise 返回，Hook 不长期保存完整工作簿或结果副本。

状态为 idle / running（含 phase）/ success / error（含 ExcelError）/ cancelled。解析与导出状态独立；连续解析采用最后一次生效，旧 Promise 以 CANCELLED 拒绝。导出运行中再次调用返回 BUSY。reset 取消操作并回到 idle，卸载后不提交状态或启动下载。

配置优先级：每次调用覆盖 Hook 默认值；limits 和 csv 做一层合并，header/sheets/schema 不做隐式深度合并。Hook 方法引用稳定并使用最近一次 render 的配置，操作开始后使用该次配置。

信号取消可立即结束异步文件读取等待；主线程模式的同步 SheetJS 运算只能在前后检查取消。Worker 模式取消会终止专属 Worker，可中断其中的解码和编码。阶段通知是 reading/matching/validating/layout/writing/downloading，不伪造进度百分比。下载 success 表示已触发浏览器下载，不代表用户已经保存文件。

完整原生控件 React 示例见 `examples/ReactExample.tsx`；无框架示例见 `examples/vanilla.ts`。

## 格式与资源限制

| 格式         | 说明                                                         |
| ------------ | ------------------------------------------------------------ |
| xlsx（默认） | 多工作表、合并表头、列宽、数字格式                           |
| xls          | BIFF8 导出；65536 行、256 列的格式限制；旧字符表按需延迟加载 |
| csv          | 一张表；不支持合并、列宽或数字格式，传入不支持的配置时拒绝   |

CSV 默认 UTF-8 + BOM，支持单字符 delimiter；`bom: false` 关闭 BOM。导出默认转义以 =/+/-/@ 开始的危险字符串（包括前置空白），`formulaEscape: false` 可显式关闭。解析非 UTF-8 CSV 可指定 codepage，如 936。xlsx/xls 字符串按文本写入，不因以 = 开头而自动创建公式。

默认限制：文件 10 MiB、每表数据范围 20000 行、256 列、1000000 单元格、20 工作表、1000 条 issue（含 warning）。可通过 limits 调整为正安全整数。数值为初始保守默认值，不是经过全平台验证的性能承诺。导出单元格数量按整本工作簿的排布累计；导入按所选工作表实际单元格计数。

解析不展开 !ref，并在布局扩展前检查列数与单元格上限。SheetJS 解压和解码仍需先加载文件，解析后限制无法完全防御压缩炸弹。Worker 和 CSV 流式 API 见下文；仍不提供流式 XLSX、公式计算、复杂样式或工作簿编辑功能。

## 错误与验收

`ExcelError` 包含 code、message、issues、cause。文件损坏、配置错误、工作表或必需表头缺失、歧义、资源超限会 reject；字段转换与数据校验问题进入 invalidRows。结果包含 validRows、invalidRows、warnings、sheet、summary，业务自行决定是否允许部分提交。

主要错误码：INVALID_CONFIG、EMPTY_FILE、FILE_READ_FAILED、PARSE_FAILED、SHEET_NOT_FOUND、MISSING_HEADER、AMBIGUOUS_HEADER、UNKNOWN_COLUMN、FILE_SIZE_LIMIT、ROW_LIMIT、COLUMN_LIMIT、CELL_LIMIT、SHEET_LIMIT、ISSUE_LIMIT、CALLBACK_FAILED、CANCELLED、BUSY、BROWSER_REQUIRED、ENGINE_UNAVAILABLE。

`npm test` 包含真实文件行为、React StrictMode、取消及下载测试，以及公开声明和示例类型检查。`npm run test:package` 校验真正的 tgz 内容、导出入口并在隔离目录执行行为测试。

兼容验证脚本支持显式指定本机已安装的工具/依赖，不会安装或联网：

```sh
EXCEL_TYPESCRIPT=/path/to/typescript/bin/tsc npm run test:types
EXCEL_REACT_ROOT=/path/to/react-test-project \
EXCEL_XLSX_PATH=/path/to/node_modules/xlsx npm run test:package
```

库级测试覆盖 React 18/19 和独立打包产物。两个业务宿主的真实页面接入验收仍需在迁移时完成；此包的单独依赖约束不会要求旧项目升级 AntD 或 Axios。

本机 Node 24、SheetJS 0.20.3 的三列样例基准：1000/10000/20000 行导出约 11/69/103 ms，解析约 18/97/153 ms；不同文件内容、运行时与设备会显著改变结果。可运行 `npm run benchmark` 重测，输出 heapUsed 为进程当时用量，并非操作峰值或独立增量。

## 大文件：Worker、批次与 CSV 流式读写（未发布）

### Worker 接入

`parseExcel`、`parseExcelBatches`、`parseCsvBatches`、`importBatches`、`serializeExcel` 和 `downloadExcel` 均接受 `execution`。默认主线程；Worker 模式必须提供工厂，每个操作创建专属 Worker，并在完成、异常、超时或取消时终止它。每次请求的默认超时为 120 秒，可通过 `timeoutMs` 调整。

Vite（新项目可使用此入口）：

```ts
import ExcelWorker from 'rsshook-excel/worker?worker';
const execution = {
  mode: 'worker' as const,
  workerFactory: () => new ExcelWorker(),
};
```

TypeScript 项目需加载 `vite/client` 类型。Umi/Webpack 5 可以使用构建器的 Worker 资源入口：

```ts
const execution = {
  mode: 'worker' as const,
  workerFactory: () =>
    new Worker(new URL('rsshook-excel/worker', import.meta.url), {
      type: 'module',
    }),
};
```

应在宿主的生产构建中确认资源地址；若宿主无法处理此语法，可将包内 `dist/worker.mjs` 作为静态资源部署，由工厂通过实际 URL 创建模块 Worker。资源已内置 SheetJS 和旧字符表，无需运行时从 CDN 下载依赖。工厂适配构建器和 CSP；库不使用 eval/blob Worker，也不在 Worker 不可用时静默回退主线程。

读取文件和 SheetJS 解码在 Worker 内运行；原始单元格按批回传。表头归一化、字段解析、校验及导出的 `value/format` 回调在调用线程执行，函数无需也不会被序列化发送。导出将转换后的标量行分批发到 Worker，再执行最终编码。重型用户回调仍可能占用主线程。输入 ArrayBuffer/Uint8Array 保留调用方所有权，传输前会复制；File/Blob 直接结构化克隆。最终输出字节使用可转移缓冲区返回。

**XLSX/XLS 仍需完整工作簿内存。** Worker 解决页面阻塞和硬取消，批次减少跨线程峰值；`parseExcel` 仍会累计所有校验结果，`serializeExcel/downloadExcel` 仍返回完整文件。真正控制累计结果内存，应使用下面的批次 API；完整 XLSX 内存仍受文件解压后大小影响。

### 批次导入与背压

```ts
import { importBatches } from 'rsshook-excel';
const controller = new AbortController();
const report = await importBatches(file, {
  schema,
  header,
  execution,
  format: 'excel', // CSV 使用 'csv' 才启用增量解析器
  batchSize: 500,
  signal: controller.signal,
  async onBatch(batch) {
    // 先处理无效行；只保留业务需要的数据。
    await consumeRows(batch.validRows, batch.invalidRows);
  },
});
// report: sheet、累计 summary、warningCount，不包含累计行数组
// controller.abort() 可从取消按钮调用
```

`consumeRows` 由业务方实现。库等待 `onBatch` 完成才请求下一批，不预读后续批次；异步回调失败会结束操作并释放资源。批次数量 `batchSize` 默认为 1000，范围 1–10000，导出也可配置该值。回调可以逐批产生业务副作用，后续失败或取消不会回滚已处理批次；需要原子导入时由业务方采用暂存/提交机制。

也可以用 `for await` 消费 `parseExcelBatches(file, options)` 或 `parseCsvBatches(input, options)`；每批均为 `ParseResult<T>`，含本批行、警告和本批 summary，源行号连续保留，issue 上限按整个操作累计。提前 `break` 会释放 Worker/输入 reader；等待读取期间需通过 AbortSignal 取消。空文件拒绝；仅有表头的文件产生零数据统计。

### CSV 真正流式导入

`parseCsvBatches` 或 `importBatches(..., {format:'csv'})` 不经过 SheetJS：增量 TextDecoder + CSV 状态机，支持跨块的 UTF-8 字符、BOM、CRLF、引号内换行和双引号转义。不会先读取整个 Blob 或拼接完整文本。CSV 的 rowNumber 是逻辑记录序号，带引号字段中的换行不增加记录序号。CSV 工作表固定为 `Sheet1`。

输入支持 Blob/File、ArrayBuffer、Uint8Array；主线程模式额外支持 `ReadableStream<Uint8Array>`（如 `response.body`）。Worker 模式接受前三类文件/缓冲区输入，外部 ReadableStream 应显式选择 `{mode:'main'}`。默认 UTF-8 严格解码；其他编码可配置 `csv.encoding` 为平台 TextDecoder 支持的标签，或使用支持的 `codepage`（65001/936/950/1252/1200/1201）。非法编码或 CSV 语法会拒绝。旧 `parseExcel` 的 CSV 自动识别继续使用原来的 SheetJS 路径，以保留兼容性。

```ts
for await (const batch of parseCsvBatches(response.body!, {
  schema,
  header,
  execution: { mode: 'main' },
  batchSize: 500,
  csv: { chunkBytes: 65536, maxRecordChars: 1048576 },
  signal: controller.signal,
})) {
  await consumeRows(batch.validRows, batch.invalidRows);
}
```

CSV 读取按已发现的列处理；后续记录首次出现新列时，再应用 `unknownColumns` 策略。无需保存全部文件以预扫描列。普通标题、多行路径和固定列绑定均复用现有匹配/校验规则。

### CSV 真正流式导出

```ts
import { writeCsv } from 'rsshook-excel';
await writeCsv({
  sheet: {
    name: 'Data',
    columns: [{ id: 'code', field: 'code', title: '编号' }],
    rows: fetchRowsByPage(), // Iterable 或 AsyncIterable，由业务方实现分页
  },
  sink: writable, // WritableStream<Uint8Array>，例如文件句柄 createWritable()
  signal: controller.signal,
  csv: { bom: true, newline: '\r\n', chunkBytes: 65536 },
});
```

也可提供 `{write: async chunk => ..., close: async () => ..., abort: async reason => ...}` 自定义 sink。每次写入完成后才继续读取源行，失败/取消时调用 abort 并关闭数据迭代器。仅返回 `bytesWritten`，不会收集完整输出。`serializeCsvStream` 直接提供 UTF-8 字节异步生成器，方便接入自有管道。块可能切开一个多字节 UTF-8 字符，接收方应直接按顺序写入字节或使用流式解码。

CSV 流式导出在主线程增量执行并定期让出事件循环；设置 Worker execution 会明确报配置错误。它不构建 SheetJS 工作簿。支持普通/分组/自定义矩阵表头及前后说明区域，但 CSV 无法表达合并、列宽和数字格式，带这些配置会拒绝。默认转义公式文本（包括表头/备注）、输出 BOM 和 CRLF；可显式调整 delimiter/bom/formulaEscape/newline。

读取与写入的 `chunkBytes` 默认 64 KiB，范围 1–1 MiB；单条 CSV 记录默认最多 1048576 字符（`maxRecordChars`），以防超长字段突破内存预算。导入按解码后的记录计，导出按转义后记录计。流式只限制库自己的缓冲；调用方提供的单个巨大输入块、超长原始行、累计结果数组或缓慢且不支持取消的外部回调仍由调用方负责。

要获得有界内存，需使用文件/网络 sink；将所有块收集到数组再创建 Blob 仍会占用整份输出内存。浏览器文件系统 API 的支持与授权由宿主处理，库不会自动弹出文件选择器。

默认资源上限仍是文件 10 MiB / 20000 数据行等原有值；处理更大文件须显式配置 `limits`，并结合目标设备实测。超限或后续失败之前，部分批次/字节可能已经交给消费者。

React `useExcel` 支持顶层 `execution` 默认值，并新增 `importBatches(input, options)` 和 `writeCsv(options)`。顶层默认值可由 importDefaults/exportDefaults、再由单次调用覆盖。批次导入复用 parseState/最新调用生效机制；流式导出复用 exportState/BUSY 规则。`cancel/reset` 和卸载会取消两类操作；CSV 流式导出时可单次覆盖 `execution:{mode:'main'}`。

完整可类型检查的示例：[examples/LargeFiles.ts](./examples/LargeFiles.ts)。两个业务项目的字段映射、业务行数限制、去重、请求并发和 API 调用继续由项目提供。
