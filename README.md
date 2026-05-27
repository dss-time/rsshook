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

`rsshook/core` contains utilities that do not depend on React or Vue:

```ts
import {
  concurrencyPool,
  getBrowserInfo,
  getMobileStyle,
  isEmpty,
  validateFile,
  FileTypes,
} from 'rsshook/core';
```

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
