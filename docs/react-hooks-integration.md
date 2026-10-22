# React 通用 Hooks：第一批落地与接入

本批 API 从 rsshook 3.1.0 提供；Excel Worker 与流式能力从 rsshook-excel 0.2.0 提供。两个业务项目本轮未修改。

## 入口和兼容性

```ts
import {
  useAsyncTask,
  usePolling,
  useDebounceFn,
  useRowSelection,
  useBatchTask,
  useSearchHistory,
  useCheckUpdate,
} from 'rsshook/react/hooks';
```

这个入口只需要 React，不加载 AntD、Axios、SheetJS、Vue。兼容 React 18/19；不使用 React 19 专有的 useEffectEvent。保留原有入口；原来的根入口和 `rsshook/react` 仍包含依赖 UI 的旧 API。

独立入口 `rsshook/react/useUpdateCheck` 和新 hooks 集合导出的 `useCheckUpdate` 是无 UI 版本，需要注入 `getVersion(signal)`。原 `rsshook/react/useCheckUpdate` 保留旧的 AntD 通知行为，不能直接把两种参数混用。

| API              | 行为                                                     | 项目保留的职责                   |
| ---------------- | -------------------------------------------------------- | -------------------------------- |
| useAsyncTask     | 最新请求优先；exhaust 拒绝重复执行；取消、重置和卸载清理 | 请求、响应转换、提示文案         |
| usePolling       | 一次完成后再计时；隐藏暂停；聚焦刷新                     | 刷新间隔、业务条件、响应提交     |
| useDebounceFn    | 稳定 run/cancel/flush、最新回调                          | 查询参数与异常处理               |
| useRowSelection  | 跨页保留 key/记录；刷新记录；原子校验数量上限            | 业务标识、禁用项、权限、上限提示 |
| useBatchTask     | 有界并发、异步数据源、消费者背压、进度、取消             | 校验、幂等性、接口调用、结果展示 |
| useSearchHistory | 按 key 隔离、存储迁移、同窗口与跨窗口同步                | 用户/页面命名空间                |

## modern-management-app

Dashboard 中重复的 active + AbortController + state 可以由 useAsyncTask 接管。下面的 loadDashboard 表示项目原有 service 的适配函数，继续使用现有接口和响应转换，不新增后端契约：

```tsx
function useDashboardData<P, T>(
  params: P,
  loadDashboard: (params: P, signal: AbortSignal) => Promise<T>,
  reportError: (error: unknown) => void
) {
  const task = useAsyncTask(loadDashboard);
  const { run, cancel } = task;
  React.useEffect(() => {
    void run(params).catch(error => {
      if (error?.name !== 'AbortError') reportError(error);
    });
    return cancel;
  }, [params, run, cancel, reportError]);
  return task;
}
```

params 和 reportError 由调用页保持稳定；只读取 task.data 渲染，不在旧请求的 then 中另外写业务状态。Axios service 将 signal 放进请求 config。已有 useAsync、usePolling 可逐页迁移，无须一次替换全部页面。

Battery 导入现有并发数为 3，可以复用任务调度；VIN/序列号匹配、去重、接口和行校验仍使用项目现有逻辑：

```tsx
const validation = useBatchTask(
  (row: ImportRow, { signal }) => validateExistingRow(row, signal),
  { concurrency: 3, collectResults: true, retainFailed: true }
);
// 按用户操作调用；处理 AbortError，其他错误展示项目自己的提示。
const report = await validation.run(parsedRows);
// report.results 按原始输入 index 排序；逐项区分 fulfilled/rejected。
// validation.cancel()；validation.retryFailed()。
```

ImportRow、validateExistingRow 是接入点占位名，需对应现有业务类型/函数。retainFailed 默认关闭；打开会保存失败输入，重试时使用最新 worker，并从 0 重新编号。业务修改类请求默认不自动重试，确认接口幂等后再配置 task.retry/shouldRetry。

Battery 的 Map 选中记录逻辑可改由 useRowSelection 管理，但先保留现有 rowKey 和所有按钮权限判断。通用 Hook 不决定设备是否可操作。

## legacy-management-app

该项目使用 React 18、Umi、AntD 4 和 Axios 0.27。新入口不依赖它们的 UI 或路由实现，旧 TypeScript 的 node 模块解析通过 typesVersions 获取声明。

SOC 列表的 setInterval 可替换为完成后调度。reloadExistingList 必须返回完整请求 Promise，并透传 signal；在写入页面状态前检查 signal.aborted，防止卸载或参数切换后的旧响应覆盖：

```tsx
const polling = usePolling(signal => reloadExistingList(signal), {
  interval: 30_000,
  enabled: autoRefresh,
  onError: showExistingError,
});
// interval 按原页面配置设置；30 秒仅为例子。
```

远程下拉搜索使用 useDebounceFn(searchExistingOptions, 300)，onSearch 调用其 run。异步查询回调自行 catch；需要最新响应优先时再组合 useAsyncTask。

跨页选择继续使用业务原 rowKey，数量限制由消费端传入：

```tsx
const selection = useRowSelection({
  getKey: (row: ExistingRow) => row.id,
  maxCount: 1000,
});
const rowSelection = {
  preserveSelectedRowKeys: true,
  selectedRowKeys: selection.selectedKeys,
  onChange: (keys: React.Key[], rows: ExistingRow[]) => {
    try {
      selection.update(keys, rows);
    } catch (error) {
      showSelectionLimit(error);
    }
  },
};
// 新页数据加载完成后调用 selection.refresh(pageRows)。
// 提交操作前检查 missingKeys，不能把缺失记录默认为完整数据。
```

将 id 换成实际 rowKey；React 19 的 Key 可能含 bigint，本库仅接受 string/number，接入时按真实键类型约束。不要盲目转换标识。

搜索历史用 `{ storageKey: '应用:用户:页面:查询字段', maxRecords: 8, maxDays: 7 }` 隔离；migrate 接收已解析数据，返回 `{value, time}[]`。旧 `(8, 7)` 调用仍可用。存储失败保留当前实例内存数据，onStorageError 可记录异常；此时不保证跨标签同步，回调不应抛错。

## 大数据与取消边界

- useBatchTask 默认收集结果；大输入设置 collectResults:false，通过 onResult 持续消费。onResult 返回 Promise 时会形成背压；消费者抛错终止整批任务。
- 输入可以是 AsyncIterable，最多维持 concurrency 个尚未完成消费的任务。失败输入缓存也会占内存，处理大文件通常保持 retainFailed:false。
- cancel 会使调用方 Promise 以 AbortError 拒绝，并向底层传递取消信号。任意用户函数不响应 signal 时，本库无法强制终止它的网络、CPU 或外部副作用。轮询配置切换同样需要底层配合取消。
- useBatchTask 是异步调度器，CPU 密集的 Excel 解析应使用独立 `rsshook-excel/react` 的 Worker 能力。旧 useExcel 仅标记弃用并修复异常拒绝，不自动转换旧表头识别逻辑。
- WebSocket 本轮修复主动 close 后重连；设备业务协议继续由项目维护。

## 本仓库验证

```sh
npm ci
npm --prefix packages/excel ci  # Hook 测试复用这里的 jsdom 开发依赖
npm run test:hooks
npm run build
npm run test:hooks:package
# 可使用 HOOK_REACT_ROOT 指向另一份 React/ReactDOM 安装目录
# 可使用 HOOK_TYPESCRIPT 指向旧版 typescript/bin/tsc 做包声明检查
```

打包检查使用临时目录和 npm pack，不发布包；分别验证 ESM/CJS 和传统 node 类型解析。业务端构建、后端联调和页面回归需要接入业务仓库后执行。
