# Changelog

## 0.2.0 — 2026-10-22

- 增加可注入工厂的专属 Worker 执行、按需批次传输、超时和终止取消；提供独立 Worker 资源入口。
- 增加 parseExcelBatches / parseCsvBatches / importBatches，支持等待消费方、累计统计及操作级限制。
- 增加增量 CSV 解码/解析、serializeCsvStream / writeCsv，支持异步行来源、写入背压和资源释放。
- React Hook 新增批次导入及流式写入，共用已有状态、取消和生命周期机制。
- XLSX/XLS 在 Worker 内仍需完整工作簿；CSV 流式写入使用主线程增量处理。

## 0.1.0 — 2026-10-22

- 首次发布独立 Excel 导入导出模块，支持普通 TypeScript 函数和 React 18/19 Hook。
- 支持简单、分组和矩阵表头，合并单元格、计算列、多工作表、模板和错误明细导出。
- 支持标题、别名、多级路径和固定列导入，真实源行号、字段转换和结构化校验结果。
- 支持取消、重置、StrictMode、资源限制及 CSV 公式文本保护。
- 提供 ESM/CJS、格式独立的声明文件、示例和持续集成配置。
- 验证 TypeScript 4.8/4.9/6 的 ESM、CommonJS 与传统 Node 解析入口。

同步 SheetJS 运算暂不能中途打断；首版不提供 Worker、复杂样式或公式计算。两个业务宿主的真实页面迁移需要单独验收。
