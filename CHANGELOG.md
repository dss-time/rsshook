# Changelog

## 3.1.0 — 2026-10-22

- 新增 UI 独立入口 `rsshook/react/hooks`，提供异步任务、轮询、防抖回调、跨页选择、批处理和无 UI 版本检测。
- 统一任务队列，修复取消、重试、超时、同步异常和请求去重竞态；保留旧工厂别名及清空队列异常契约。
- 搜索历史支持存储隔离、迁移、同步及存储失败后的内存回退。
- 修复 WebSocket 主动关闭后重连、旧 Excel 解析异常不拒绝 Promise 和 AntD 通知版本判断。
- 补齐传统 Node 类型解析映射；验证 React 18/19 与 TypeScript 4.8/4.9/6。
- 旧 useExcel 标记弃用，推荐独立 rsshook-excel 包。底层 I/O 必须配合 AbortSignal 才能实际中止。
