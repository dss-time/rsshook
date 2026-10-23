# 通用 Hooks 第二批改进（3.2.0）

从 rsshook 3.2.0 提供。本轮保留已发布入口，不更改两个业务项目，也不新增运行时依赖。

## 已有 API

- `usePolling(callback, { timeout: 10000 })`：超时以 `TimeoutError` 写入 error 并通知 onError，向本次请求发送 abort，然后按原 interval 继续调度。默认 timeout 为 0，保持原行为。卸载或配置变化也取消当前等待。超时不能强制停止忽略 signal 的 I/O，不保证这种 I/O 的物理并发。
- `useKeyboard(combo, callback, options)`：新增 enabled、target、allowInEditable、allowRepeat、preventDefault。保留两参数调用：默认监听 window，允许编辑区域和重复按键、阻止匹配快捷键的默认行为；新增配置可关闭这些行为。输入法组合输入不触发快捷键。target 为 null 时不监听；回调变化不重新绑定监听器。
- `useRowSelection`：新增 isSelected(key)、toggle(row)、remove(keys)，全部复用 update 的数量限制与记录维护；isSelected 使用 Set 查询。筛选变化是否 clear 仍由业务决定。
- `useSearchHistory`：maxRecords 必须是非负安全整数，maxDays 必须是非负有限数。存储切换后旧回调不再修改新空间。同步事件仅刷新相关空间，onStorageError 抛错不破坏本地状态。
- `WebSocketManager.trySendMessage()`：新增方法返回 boolean，false 表示当前连接不可发送，true 只表示本地 socket 接受，不代表服务端确认。旧 sendMessage 保留 void 返回类型和原调用方式；底层 send 自身异常继续抛出。消息监听器异常不阻断其他监听器，close 释放监听器和 socket 引用。

## useMediaQuery

```tsx
import { useMediaQuery } from 'rsshook/react/hooks';

const narrow = useMediaQuery('(max-width: 767px)');
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', {
  defaultMatches: false,
});
```

支持独立入口 `rsshook/react/useMediaQuery`。defaultMatches 是 SSR/hydration 初始快照，也是 matchMedia 不可用时的回退值；客户端订阅后读取真实媒体查询结果。使用原生 change 事件，兼容旧 addListener/removeListener。每个实例只保留一个活动订阅，切换 query 和卸载都会清理。

不硬编码断点、不监听 resize，也不替换旧 useMobileStyle 的 UA 行为。需要多个断点时在项目中组合调用，无需单独维护另一套 useResponsive 实现。

## useUrlState

```tsx
import { useUrlState, type UrlStateSchema } from 'rsshook/react/hooks';

interface Filters {
  keyword: string;
  page: number;
  tags: string[];
}
// 放在组件外或保持稳定，避免每次渲染重复解析。
const fields: UrlStateSchema<Filters> = {
  keyword: { defaultValue: '', parse: v => v[0], serialize: v => [v] },
  page: {
    defaultValue: 1,
    parse: values => {
      const n = Number(values[0]);
      if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid page');
      return n;
    },
    serialize: n => [String(n)],
  },
  tags: { key: 'tag', defaultValue: [], parse: v => v, serialize: v => v },
};

// adapter 由路由层提供，契约见下文。
const { state, setState, reset } = useUrlState(fields, adapter, {
  replace: true,
  serverSearch: '',
});
setState({ keyword: 'example', page: 1 });
setState(current => ({ page: current.page + 1 }), { replace: false });
reset();
```

支持独立入口 `rsshook/react/useUrlState`。只处理 schema 声明的字段，保留无关参数；重复参数由 parse 收到完整字符串数组。缺失字段或 parse 抛错使用 defaultValue。serialize 抛错时不写 URL。空数组或 patch 中的 undefined 删除对应字段；reset 只删除声明字段。默认值和 state 应视为只读数据。无效输入是否返回默认值由 parse 校验决定，不会自动推断日期、数字或业务枚举。

相同查询字符串不会重复导航；参数顺序或编码不同但语义相同的字符串可能被规范化。字段别名不可为空或重复。默认 replace，不额外产生历史记录，可单次覆盖。URL 是唯一数据来源，没有第二份 React 本地状态。

### 路由适配契约

```ts
interface UrlStateAdapter {
  getSearch(): string;
  subscribe(notify: () => void): () => void;
  setSearch(search: string, options: { replace: boolean }): void;
}
```

- getSearch 返回查询字符串（可带 ?），不包含 pathname/hash。
- subscribe 在路由变化、前进后退时通知；返回清理函数。
- setSearch 必须让 getSearch 同步反映新值并通知订阅者，保证同一事件中的连续函数式更新不会丢失。必须保留路由 pathname、hash，以及需要保留的 history state。
- SSR 通过 serverSearch 传入请求查询；getSearch/subscribe 不在服务端执行。
- 不应每次渲染重新创建适配器。应用持有适配器生命周期，避免多个页面各自建立永久路由监听。

对于具有同步 location 和 listen/push/replace 的 history（例如相应 Umi history），可使用下面的结构：

```ts
const adapter = {
  getSearch: () => history.location.search,
  subscribe: (notify: () => void) => history.listen(() => notify()),
  setSearch: (search: string, { replace }: { replace: boolean }) => {
    const { pathname, hash, state } = history.location;
    history[replace ? 'replace' : 'push']({ pathname, search, hash }, state);
  },
};
```

React Router 的数据路由应通过它自己的 router.subscribe/navigate 做适配；异步导航需要适配层维护待提交快照，并在导航失败或被阻止时恢复真实 location。不能直接将异步 navigate 当作满足同步契约的 setSearch，也不能绕过 Router 调用原生 history 来冒充路由集成。本轮验证通用适配契约，未进行两个业务项目的路由页面联调。

## 兼容与体积检查

- 保留旧导出与子路径；新入口不依赖 AntD、Axios、Vue、SheetJS 或特定路由。
- 重试取消等待复用已有 abortableTask。URL 编码/合并提取为内部公共实现，旧工具和新 Hook 共享，不重复维护。
- 使用 `npm run test:hooks`、`npm run build`、`npm run test:hooks:package` 验证行为和发布包。
- `node scripts/check-hooks-size.mjs` 测量 tree-shaking 后单个 Hook 的 ESM 体积，React 外置；设置 BASELINE_DIST 可对比旧构建。数值是当前构建工具的测量结果，不是所有消费项目的最终体积。

## 本轮验证记录

- React 18 和 React 19 下各 36 项行为测试通过，覆盖 StrictMode、SSR、超时恢复、取消、存储隔离、URL 往返与清理。
- TypeScript 4.8.4 / 4.9.5 / 6.0.3 的 ESM、CJS、传统 Node 类型解析检查通过。
- 生产构建、React-only 隔离消费者和新独立子路径检查通过；定向 ESLint 无错误，保留 UseRetryOptions 既有未使用泛型警告。
- 完成旧接口、依赖边界和资源清理路径复查。未在两个业务项目中执行页面联调，也未新增性能基准来宣称所有场景均无回退。

体积测量使用本仓库 Vite、ES2020、ESM tree-shaking，React 外置；以下为 gzip 字节，与提交 5a0334d 的构建比较：

| 单独引入        | 基线 | 当前 |
| --------------- | ---: | ---: |
| useAsyncTask    |  979 |  942 |
| usePolling      |  905 | 1218 |
| useRowSelection |  652 |  724 |
| useMediaQuery   |    — |  318 |

新 useUrlState 在提取共享 URL 写入逻辑后，测量从 1728 字节降至约 1.3 KB。新增能力并非零成本；上述数字不是两个业务项目最终产物的大小。没有新增运行时依赖，类型与文档不会进入浏览器执行代码。
