# rsshook

A small React, Vue 3, and framework-agnostic utilities library.

## Installation

```bash
npm install rsshook
# or
yarn add rsshook
# or
pnpm add rsshook
```

Install the peer dependency for the framework you use:

```bash
# React
npm install react react-dom

# Vue 3
npm install vue
```

Some APIs need extra peer dependencies only when you use them:

```bash
# useExcel
npm install xlsx

# React useCheckUpdate, SearchHistory component, ExpandCollapse component, BMap helpers
npm install antd

# createHttpRequest
npm install axios
```

## Import

Recommended: use framework-specific subpath imports so unused optional dependencies
are not required.

```tsx
// React
import useDebounce from 'rsshook/react/useDebounce';
import useIsEmpty from 'rsshook/react/useEmpty';

// Vue 3
import useVueDebounce from 'rsshook/vue/useDebounce';

// Framework-agnostic utilities
import { validateFile, FileTypes } from 'rsshook/file';
```

Grouped entries are also available:

```ts
import { useDebounce } from 'rsshook/react';
import { useDebounce as useVueDebounce } from 'rsshook/vue';
import { isEmpty, validateFile } from 'rsshook/core';
```

Legacy root imports are still supported for React users when your app already
has all peer dependencies installed:

```tsx
import { useDebounce, useIsEmpty } from 'rsshook';
```

## Hooks

| Hook | React import | Vue import | Description |
| --- | --- | --- | --- |
| `useDebounce` | `rsshook/react/useDebounce` | `rsshook/vue/useDebounce` | Return a debounced value after a delay. |
| `useEmpty` / `useIsEmpty` | `rsshook/react/useEmpty` | `rsshook/vue/useEmpty` | Check whether a value is empty. |
| `useOnlineStatus` | `rsshook/react/useOnlineStatus` | `rsshook/vue/useOnlineStatus` | Track browser online/offline status. |
| `useSearchHistory` | `rsshook/react/useSearchHistory` | `rsshook/vue/useSearchHistory` | Store and manage search keywords in `localStorage`. |
| `useExpandCollapse` | `rsshook/react/useExpandCollapse` | `rsshook/vue/useExpandCollapse` | Collapse long text and toggle expansion. |
| `useKeyboard` | `rsshook/react/useKeyboard` | `rsshook/vue/useKeyboard` | Bind a keyboard shortcut such as `ctrl+s`. |
| `useBrowserInfo` | `rsshook/react/useBrowserInfo` | `rsshook/vue/useBrowserInfo` | Read browser and device information from `userAgent`. |
| `useMobileStyle` | `rsshook/react/useMobileStyle` | `rsshook/vue/useMobileStyle` | Return mobile viewport style values for mobile devices. |
| `useExcel` | `rsshook/react/useExcel` | `rsshook/vue/useExcel` | Import/export Excel files. Requires `xlsx`. |
| `useConcurrencyPool` | `rsshook/react/useConcurrencyPool` | `rsshook/vue/useConcurrencyPool` | Run async tasks with a simple concurrency limit. |
| `useConcurrencyPoolPro` | `rsshook/react/useConcurrencyPoolPro` | `rsshook/vue/useConcurrencyPoolPro` | Run async tasks with pause, resume, cancel, retry and timeout. |
| `useCheckUpdate` | `rsshook/react/useCheckUpdate` | `rsshook/vue/useCheckUpdate` | Check whether the deployed page version changed. |

## Vue 3 Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue';
import useDebounce from 'rsshook/vue/useDebounce';
import useOnlineStatus from 'rsshook/vue/useOnlineStatus';
import useSearchHistory from 'rsshook/vue/useSearchHistory';

const keyword = ref('');
const debouncedKeyword = useDebounce(keyword, 300);
const isOnline = useOnlineStatus();

const {
  searchHistory,
  setSearchValue,
  removeSearchValue,
  handleClearHistory,
} = useSearchHistory(8, 7);
</script>

<template>
  <input v-model="keyword" @keyup.enter="setSearchValue(keyword)" />
  <p>{{ isOnline ? 'Online' : 'Offline' }}</p>
  <p>Debounced: {{ debouncedKeyword }}</p>

  <button
    v-for="record in searchHistory"
    :key="record.value"
    @click="removeSearchValue(record.value)"
  >
    {{ record.value }}
  </button>

  <button @click="handleClearHistory">Clear</button>
</template>
```

Vue values are returned as `ref` / `computed` values.

## Core Utilities

`rsshook/core` contains utilities that do not depend on React or Vue. The same
core functions are also re-exported from `rsshook`, `rsshook/react`, and
`rsshook/vue`.

```ts
import {
  appendExcelErrorColumn,
  copyRichText,
  copyTableToClipboard,
  createRequestDedupe,
  diffObject,
  downloadBlob,
  extractNumbers,
  filterTreeByPermission,
  findPathInTree,
  flattenTree,
  normalizeExcelRows,
  parseQuery,
  pickChangedFields,
  splitTextSmart,
  syncSearchFormWithUrl,
  useRequestQueue,
  useRetry,
} from 'rsshook/core';
```

Framework users can import core utilities from their framework entry:

```ts
import { normalizeExcelRows, parseQuery } from 'rsshook/react';
import { normalizeExcelRows, parseQuery } from 'rsshook/vue';
```

### normalizeExcelRows

Maps imported Excel header names to stable field names. It trims string values,
removes empty rows, and keeps the original Excel row number by default.

```ts
import { normalizeExcelRows } from 'rsshook/core';

const rows = normalizeExcelRows(
  [
    {
      姓名: ' 张三 ',
      手机号: ' 13800000000 ',
      订单号: ' SO001 ',
    },
  ],
  {
    姓名: 'name',
    手机号: 'phone',
    订单号: 'orderNo',
  }
);
```

Common options:

- `trim`: trim string cells. Default is `true`.
- `removeEmptyRows`: remove rows whose mapped values are empty. Default is `true`.
- `keepUnmappedFields`: keep fields not found in `headerMap`. Default is `false`.
- `keepRowNumber`: add original Excel row number. Default is `true`.
- `rowNumberKey`: row number field name. Default is `__rowNumber`.
- `startRowNumber`: first data row number. Default is `2`.

### appendExcelErrorColumn

Adds an error reason column to imported Excel rows. This is useful when exporting
failed import rows back to users.

```ts
import { appendExcelErrorColumn } from 'rsshook/core';

const result = appendExcelErrorColumn(
  [
    { name: '张三', phone: '13800000000', __rowNumber: 2 },
    { name: '李四', phone: '', __rowNumber: 3 },
  ],
  [
    {
      rowNumber: 3,
      messages: ['手机号不能为空', '手机号格式错误'],
    },
  ]
);
```

Options:

- `errorColumnName`: appended column name. Default is `错误原因`.
- `joiner`: separator for multiple errors. Default is `；`.
- `rowNumberKey`: internal row number key. Default is `__rowNumber`.
- `removeRowNumber`: remove internal row number from output. Default is `true`.

### flattenTree

Flattens a tree into a depth-first list without mutating the source tree.

```ts
import { flattenTree } from 'rsshook/core';

const list = flattenTree(menuTree, {
  childrenKey: 'children',
  keepChildren: false,
  withMeta: true,
});
```

Options:

- `childrenKey`: child node key. Default is `children`.
- `keepChildren`: keep the original children field. Default is `false`.
- `withMeta`: add `__level`, `__parent`, and `__path`. Default is `false`.

### findPathInTree

Finds the full path from root to the first node matched by a predicate.

```ts
import { findPathInTree } from 'rsshook/core';

const path = findPathInTree(menuTree, node => node.id === 12);
```

It returns `[]` when no node matches. `childrenKey` defaults to `children`.

### filterTreeByPermission

Filters a menu tree or permission tree by user permissions.

```ts
import { filterTreeByPermission } from 'rsshook/core';

const visibleMenu = filterTreeByPermission(menuTree, ['system:user:list'], {
  permissionKey: 'permission',
  keepParentIfChildrenVisible: true,
});
```

Options:

- `permissionKey`: permission field. Default is `permission`.
- `childrenKey`: child node key. Default is `children`.
- `allowNoPermission`: keep nodes without permission. Default is `true`.
- `keepParentIfChildrenVisible`: keep parents with visible children. Default is `true`.
- `removeEmptyChildren`: delete empty children after filtering.
- `checkPermission`: custom permission matcher.

### extractNumbers

Extracts money, percent, and plain number values from text. Money and percent
matches are processed first, so their numeric parts are not duplicated as plain
numbers.

```ts
import { extractNumbers } from 'rsshook/core';

const result = extractNumbers('价格为 ¥1,299.00，折扣 15%，同比 -3.5%');
```

Result items include:

- `raw`: matched source text.
- `value`: parsed number.
- `type`: `money`, `percent`, or `number`.
- `index`: match start index.
- `currency`: currency symbol for money values.

Options allow disabling `money`, `percent`, or `number`, and customizing
currency symbols.

### splitTextSmart

Splits text by common separators used in forms and pasted data.

```ts
import { splitTextSmart } from 'rsshook/core';

const result = splitTextSmart('a,b，c\nd e；f、g');
// ['a', 'b', 'c', 'd', 'e', 'f', 'g']
```

Default separators include English comma, Chinese comma, newline, space, tab,
English semicolon, Chinese semicolon, and Chinese enumeration comma. Options:

- `trim`: trim each item. Default is `true`.
- `filterEmpty`: remove empty items. Default is `true`.
- `unique`: remove duplicates while preserving order.
- `extraSeparators`: additional safely escaped separators.

### copyTableToClipboard

Copies a two-dimensional array as an Excel-friendly table string. It uses tab
between columns and newline between rows by default.

```ts
import { copyTableToClipboard } from 'rsshook/core';

await copyTableToClipboard([
  ['姓名', '年龄'],
  ['张三', 20],
  ['李四', 21],
]);
```

It returns `false` in SSR or when clipboard access fails. `null` and
`undefined` become empty cells, and tabs/newlines inside cells are replaced with
spaces to avoid Excel column shifts.

### copyRichText

Copies both `text/html` and `text/plain` when `ClipboardItem` is supported, and
falls back to plain text copy otherwise.

```ts
import { copyRichText } from 'rsshook/core';

await copyRichText({
  text: '加粗文本',
  html: '<strong>加粗文本</strong>',
});
```

It catches permission errors and returns `Promise<boolean>`.

### parseQuery

Parses a query string with or without a leading `?`, without depending on `qs`.

```ts
import { parseQuery } from 'rsshook/core';

const result = parseQuery('?ids=1,2,3&keyword=abc&page=1', {
  arrayFormat: 'comma',
  parseNumber: true,
});
```

Options:

- `arrayFormat`: `comma`, `repeat`, or `bracket`.
- `parseNumber`: parse numeric strings.
- `parseBoolean`: parse `true` and `false`.
- `skipEmpty`: skip empty values.
- `defaults`: default values merged before parsed values.

### syncSearchFormWithUrl

Creates router-agnostic helpers for syncing table search form values with URL
query strings.

```ts
import { syncSearchFormWithUrl } from 'rsshook/core';

const sync = syncSearchFormWithUrl({
  fields: ['keyword', 'status', 'page', 'pageSize'],
  arrayFormat: 'comma',
  removeEmpty: true,
  parseNumber: true,
});

const initialValues = sync.getInitialValues(window.location.search);
const queryString = sync.stringify({
  keyword: 'iphone',
  status: '1',
  page: 1,
  pageSize: 20,
});
```

Returned methods:

- `getInitialValues(search)`: parse search into form initial values.
- `stringify(values)`: return a query string without the leading `?`.
- `mergeToUrl(url, values)`: merge values into an existing URL.

### diffObject

Compares two values and returns changed paths. It supports nested objects,
arrays, `Date`, `NaN`, `ignoreKeys`, and custom comparison.

```ts
import { diffObject } from 'rsshook/core';

const diff = diffObject(
  { name: '张三', age: 20 },
  { name: '李四', age: 20 }
);
```

The result is keyed by `path.join('.')`, for example `users.0.name`.

### pickChangedFields

Builds an edit payload containing only changed fields. It is based on
`diffObject`.

```ts
import { pickChangedFields } from 'rsshook/core';

const payload = pickChangedFields(
  {
    username: '张三',
    phone: '13800000000',
    age: 20,
  },
  {
    username: '张三',
    phone: '13900000000',
    age: 20,
  }
);
```

Options:

- `mode: 'top-level'`: return changed top-level fields. This is the default.
- `mode: 'deep-patch'`: return a deep patch object.
- `ignoreKeys`: ignore selected path segments.
- `compare`: custom equality comparator.

### useRetry

Retries an async task. Despite its name, this is a core async utility, not a
React hook.

```ts
import { useRetry } from 'rsshook/core';

const result = await useRetry(() => fetchData(), {
  retries: 3,
  delay: 1000,
  backoff: true,
});
```

Options:

- `retries`: retry count after first failure. Default is `3`.
- `delay`: delay before retry. Default is `0`.
- `backoff`: use exponential backoff.
- `signal`: abort retrying with `AbortSignal`.
- `shouldRetry`: decide whether an error should retry.
- `onRetry`: callback before each retry.

### createRequestDedupe

Reuses the same promise for requests with the same key.

```ts
import { createRequestDedupe } from 'rsshook/core';

const dedupe = createRequestDedupe({ ttl: 1000 });

const user1 = dedupe.run('user-1', () => fetchUser(1));
const user2 = dedupe.run('user-1', () => fetchUser(1));
```

`user1` and `user2` reuse the same promise. Methods:

- `run(key, request)`: run or reuse a request.
- `clear(key)`: clear one cached key.
- `clearAll()`: clear all cached keys.
- `getCacheKeys()`: inspect current cache keys.

### useRequestQueue

Runs async tasks with a framework-agnostic priority queue and concurrency limit.

```ts
import { useRequestQueue } from 'rsshook/core';

const queue = useRequestQueue({
  concurrency: 3,
  onIdle: () => console.log('all done'),
});

queue.add(() => uploadFile(file1));
queue.add(() => uploadFile(file4), { priority: 10 });
```

Methods:

- `add(task, options)`: enqueue a task and return that task's promise.
- `pause()`: stop starting new tasks.
- `resume()`: resume scheduling.
- `clear()`: clear waiting tasks without interrupting running tasks.
- `pendingCount()`: waiting task count.
- `runningCount()`: running task count.

### downloadBlob

Downloads `Blob`, `File`, URL string, object, or array data in the browser.

```ts
import { downloadBlob } from 'rsshook/core';

await downloadBlob(blob, '订单列表.xlsx');

await downloadBlob(blob, undefined, {
  contentDisposition: response.headers['content-disposition'],
  onBlobJsonError: json => {
    console.error('导出失败', json);
  },
});
```

Object and array data are converted to JSON blobs. If a response Blob has
`application/json` in its MIME type, `downloadBlob` tries to parse it and calls
`onBlobJsonError`, then returns `false`.

## DOM Hooks And Composables

Only DOM state that depends on framework lifecycle is implemented separately for
React and Vue. Core does not export these DOM hooks.

### React DOM Hooks

```tsx
import {
  useElementSizeStable,
  useScrollBoundary,
  useStickyState,
} from 'rsshook/react';
```

#### useScrollBoundary

Detects whether an element or window is scrolled to top, bottom, left, or right.

```tsx
import { useRef } from 'react';
import { useScrollBoundary } from 'rsshook/react';

function Panel() {
  const ref = useRef<HTMLDivElement | null>(null);
  const boundary = useScrollBoundary(ref, { threshold: 2 });

  return <div ref={ref}>{boundary.isBottom ? 'Bottom' : 'Scrolling'}</div>;
}
```

Use `{ target: 'window' }` to observe the page scroll instead of an element.

#### useStickyState

Detects whether a sticky element has reached its sticky top position.

```tsx
import { useRef } from 'react';
import { useStickyState } from 'rsshook/react';

function Header() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { isSticky } = useStickyState(ref, { top: 0 });

  return <div ref={ref}>{isSticky ? 'Sticky' : 'Normal'}</div>;
}
```

It uses `IntersectionObserver` when available and falls back to scroll
calculation.

#### useElementSizeStable

Observes element size changes with a debounced update.

```tsx
import { useRef } from 'react';
import { useElementSizeStable } from 'rsshook/react';

function Box() {
  const ref = useRef<HTMLDivElement | null>(null);
  const size = useElementSizeStable(ref, {
    debounce: 100,
    immediate: true,
  });

  return <div ref={ref}>{size.width} x {size.height}</div>;
}
```

It uses `ResizeObserver` when available and falls back to `window.resize`.

### Vue DOM Composables

```ts
import {
  useElementSizeStable,
  useScrollBoundary,
  useStickyState,
} from 'rsshook/vue';
```

#### useScrollBoundary

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useScrollBoundary } from 'rsshook/vue';

const elRef = ref<HTMLElement | null>(null);
const boundary = useScrollBoundary(elRef, { threshold: 2 });
</script>

<template>
  <div ref="elRef">
    {{ boundary.isBottom.value ? 'Bottom' : 'Scrolling' }}
  </div>
</template>
```

Use `{ target: 'window' }` to observe the page scroll.

#### useStickyState

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useStickyState } from 'rsshook/vue';

const elRef = ref<HTMLElement | null>(null);
const { isSticky } = useStickyState(elRef, { top: 0 });
</script>
```

It returns refs and uses `IntersectionObserver` with a scroll fallback.

#### useElementSizeStable

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useElementSizeStable } from 'rsshook/vue';

const elRef = ref<HTMLElement | null>(null);
const size = useElementSizeStable(elRef, {
  debounce: 100,
  immediate: true,
});
</script>
```

`size.width` and `size.height` are Vue refs. The composable uses
`ResizeObserver` with a `window.resize` fallback.

## useDebounce

```tsx
import { useState } from 'react';
import useDebounce from 'rsshook/react/useDebounce';

function SearchBox() {
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);

  return (
    <input
      value={keyword}
      onChange={event => setKeyword(event.target.value)}
      placeholder="Search"
    />
  );
}
```

`debouncedKeyword` updates 300ms after `keyword` stops changing.

## useEmpty / useIsEmpty

```tsx
import useIsEmpty from 'rsshook/react/useEmpty';

function Example() {
  const isEmpty = useIsEmpty([]);

  return <span>{isEmpty ? 'Empty' : 'Not empty'}</span>;
}
```

Empty values include `null`, `undefined`, blank strings, empty arrays, empty
objects, empty `Map` / `Set`, and invalid `Date`.

Root entry aliases:

```tsx
import { useEmpty, useIsEmpty } from 'rsshook';
```

## useOnlineStatus

```tsx
import useOnlineStatus from 'rsshook/react/useOnlineStatus';

function NetworkState() {
  const isOnline = useOnlineStatus();

  return <span>{isOnline ? 'Online' : 'Offline'}</span>;
}
```

It listens to the browser `online` and `offline` events.

## useSearchHistory

```tsx
import useSearchHistory from 'rsshook/react/useSearchHistory';

function Search() {
  const {
    searchHistory,
    setSearchValue,
    removeSearchValue,
    handleClearHistory,
  } = useSearchHistory(8, 7);

  return (
    <div>
      <button onClick={() => setSearchValue('react')}>Save keyword</button>
      <button onClick={handleClearHistory}>Clear</button>

      {searchHistory.map(record => (
        <button key={record.value} onClick={() => removeSearchValue(record.value)}>
          {record.value}
        </button>
      ))}
    </div>
  );
}
```

Parameters:

- `maxRecords`: maximum stored keywords. Default is `8`.
- `maxDays`: maximum retention days. Default is `7`.

The hook stores data under `localStorage.searchHistory`.

## useExpandCollapse

```tsx
import { useExpandCollapse } from 'rsshook/react/useExpandCollapse';

function ArticlePreview({ content }: { content: string }) {
  const {
    toggleContent,
    toggleVisibility,
    shouldHideControl,
    isCollapsed,
  } = useExpandCollapse(content, 80);

  return (
    <div>
      {toggleContent}
      {!shouldHideControl && (
        <button onClick={toggleVisibility}>
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      )}
    </div>
  );
}
```

It accepts `ReactNode` content and calculates text length from children.

## useKeyboard

```tsx
import { useCallback } from 'react';
import useKeyboard from 'rsshook/react/useKeyboard';

function Editor() {
  const save = useCallback(() => {
    // save content
  }, []);

  useKeyboard('ctrl+s', save);

  return <textarea />;
}
```

Supported modifier names: `ctrl`, `shift`, `alt`, `meta`.

Examples:

```tsx
useKeyboard('ctrl+s', save);
useKeyboard('meta+k', openCommandMenu);
useKeyboard('ctrl+shift+p', openPalette);
```

## useBrowserInfo

```tsx
import useBrowserInfo from 'rsshook/react/useBrowserInfo';

function BrowserPanel() {
  const info = useBrowserInfo() as {
    browserType?: string;
    browserVersion?: string;
    deviceType?: string;
    isMobileDevice?: boolean;
    isDesktop?: boolean;
  };

  return (
    <pre>{JSON.stringify(info, null, 2)}</pre>
  );
}
```

The initial value is `{}` and is filled after the component mounts.

## useMobileStyle

```tsx
import useMobileStyle from 'rsshook/react/useMobileStyle';

function MobileContainer() {
  const mobileStyle = useMobileStyle();

  return (
    <div
      style={{
        width: mobileStyle.mobileWidth || '100%',
        height: mobileStyle.mobileHeight || 'auto',
      }}
    />
  );
}
```

On detected mobile devices it returns:

```ts
{ mobileWidth: '100vmax', mobileHeight: '100vmin' }
```

On non-mobile devices both values are empty strings.

## useExcel

Requires:

```bash
npm install xlsx
```

```tsx
import { useExcel } from 'rsshook/react/useExcel';

interface UserRow {
  name: string;
  age: number;
}

function ExcelTools() {
  const { exportToExcel, importFromExcel, importAndDisplayExcel } =
    useExcel<UserRow>();

  const exportUsers = () => {
    exportToExcel({
      headers: ['name', 'age'],
      exportData: [
        { name: 'Alice', age: 28 },
        { name: 'Bob', age: 32 },
      ],
      fileName: 'users',
      sheetName: 'Users',
    });
  };

  const importUsers = async (file: File) => {
    const rows = await importFromExcel(file);
    return rows;
  };

  const previewExcel = async (file: File) => {
    const html = await importAndDisplayExcel(file);
    return html;
  };

  return <button onClick={exportUsers}>Export</button>;
}
```

Returned functions:

- `exportToExcel(options)`: export JSON data to `.xlsx`.
- `importFromExcel(file)`: parse the first sheet into JSON rows.
- `importAndDisplayExcel(file)`: convert the first sheet to an HTML table string.

## useConcurrencyPool

```tsx
import { useConcurrencyPool } from 'rsshook/react/useConcurrencyPool';

function TaskRunner() {
  const pool = useConcurrencyPool<string>(3);

  const start = () => {
    pool.addTask(async () => {
      const response = await fetch('/api/data');
      return response.text();
    });
  };

  return (
    <div>
      <button onClick={start}>Add task</button>
      <span>
        Active: {pool.activeCount}, queued: {pool.queueLength}, completed:{' '}
        {pool.completed}
      </span>
    </div>
  );
}
```

Returned fields:

- `addTask(fn)`: enqueue a task.
- `activeCount`: running task count.
- `queueLength`: waiting task count.
- `completed`: completed task count.
- `total`: `completed + queueLength + activeCount`.
- `results`: successful task results.
- `isRunning`: whether the pool has active work.

## useConcurrencyPoolPro

```tsx
import { useConcurrencyPool as useConcurrencyPoolPro } from 'rsshook/react/useConcurrencyPoolPro';

function UploadQueue() {
  const pool = useConcurrencyPoolPro(2);

  const upload = (file: File) => {
    pool.add(
      async signal => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          signal,
        });

        return response.json();
      },
      {
        id: file.name,
        retry: 2,
        retryDelay: 500,
        timeout: 10000,
      },
    );
  };

  return (
    <div>
      <button onClick={() => pool.pause()}>Pause</button>
      <button onClick={() => pool.resume()}>Resume</button>
      <button onClick={() => pool.clearQueue()}>Clear waiting tasks</button>
      <span>
        Active: {pool.activeCount}, pending: {pool.pendingCount}
      </span>
    </div>
  );
}
```

Methods:

- `add(fn, options)`: enqueue a task. The task receives an optional `AbortSignal`.
- `pause()`: stop starting new tasks.
- `resume()`: continue starting queued tasks.
- `cancel(id)`: cancel a queued or running task by id.
- `clearQueue()`: cancel waiting tasks only.
- `setConcurrency(n)`: update the concurrency limit.

Task options:

- `id`: task id. Auto-generated when omitted.
- `retry`: retry count after failure.
- `retryDelay`: delay between retries in milliseconds.
- `timeout`: task timeout in milliseconds.

## useCheckUpdate

Requires:

```bash
npm install antd
```

```tsx
import useCheckUpdate from 'rsshook/react/useCheckUpdate';

function App() {
  useCheckUpdate();

  return <main>App content</main>;
}
```

By default, it fetches `window.location.origin` with `cache: 'no-cache'` and
compares `etag` or `last-modified` headers. When the value changes, it shows an
Ant Design notification and reloads after user confirmation.

Custom version provider:

```tsx
useCheckUpdate({
  interval: 5 * 60 * 1000,
  storageKey: 'my-app-version',
  getVersion: async () => {
    const response = await fetch('/version.json', { cache: 'no-cache' });
    const data = await response.json();
    return data.version;
  },
});
```

## File Validation

Use the lightweight subpath entry:

```ts
import { FileTypes, validateFile } from 'rsshook/file';

const result = await validateFile(file, FileTypes.IMAGE);

if (!result.valid) {
  alert(result.message);
}
```

Options:

```ts
await validateFile(file, FileTypes.DOCUMENT, {
  maxSize: 10,
  checkMagicNumber: true,
  checkSize: true,
});
```

Built-in groups:

- `FileTypes.IMAGE`
- `FileTypes.DOCUMENT`
- `FileTypes.OFFICE`
- `FileTypes.ARCHIVE`
- `FileTypes.AUDIO`
- `FileTypes.VIDEO`

## Components

These components require `antd` when they use Ant Design internally.

```tsx
import { ExpandCollapse, SearchHistory } from 'rsshook';
```

## License

MIT

## Support

Email: d1667494390@gmail.com
