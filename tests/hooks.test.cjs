require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('../packages/excel/node_modules/jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const dom = new JSDOM('<html><body></body></html>', {
  url: 'https://example.test',
});
for (const key of ['window', 'document', 'HTMLElement', 'Node'])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function mount(hook) {
  let result;
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  function Probe() {
    result = hook();
    return null;
  }
  await act(async () =>
    root.render(
      React.createElement(React.StrictMode, null, React.createElement(Probe))
    )
  );
  return {
    get value() {
      return result;
    },
    async rerender() {
      await act(async () =>
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(Probe)
          )
        )
      );
    },
    async unmount() {
      await act(async () => root.unmount());
      node.remove();
    },
  };
}
const { useAsyncTask } = require('../src/react/useAsyncTask.ts');
test('async task latest wins and cancel settles even non-cooperative tasks', async () => {
  let done;
  const app = await mount(() =>
    useAsyncTask(async (value, signal) =>
      value === 1 ? new Promise(r => (done = r)) : value
    )
  );
  try {
    let old;
    await act(async () => {
      old = app.value.run(1).catch(e => e);
    });
    await act(async () => {
      assert.equal(await app.value.run(2), 2);
    });
    assert.equal((await old).name, 'AbortError');
    done(1);
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(app.value.data, 2);
    let cancelled;
    await act(async () => {
      cancelled = app.value.run(1).catch(e => e);
    });
    await act(async () => app.value.cancel());
    assert.equal((await cancelled).name, 'AbortError');
    assert.equal(app.value.status, 'cancelled');
  } finally {
    await app.unmount();
  }
});
test('cross-page selection refreshes records and enforces atomic limits', async () => {
  const { useRowSelection } = require('../src/react/useRowSelection.ts');
  const app = await mount(() =>
    useRowSelection({ getKey: r => r.id, maxCount: 2 })
  );
  try {
    await act(async () => app.value.update([1], [{ id: 1, name: 'old' }]));
    await act(async () =>
      app.value.update([1, 2], [{ id: 2, name: 'second' }])
    );
    assert.equal(app.value.selectedRows.length, 2);
    await act(async () => app.value.refresh([{ id: 1, name: 'new' }]));
    assert.equal(app.value.selectedRows[0].name, 'new');
    assert.throws(() => app.value.update([1, 2, 3], [{ id: 3 }]), RangeError);
    assert.equal(app.value.selectedKeys.length, 2);
    await act(async () => app.value.clear());
    assert.deepEqual(app.value.selectedKeys, []);
  } finally {
    await app.unmount();
  }
});
test('debounce uses newest callback and supports flush/cancel', async () => {
  const { useDebounceFn } = require('../src/react/useDebounceFn.ts');
  const values = [];
  const app = await mount(() => useDebounceFn(value => values.push(value), 10));
  try {
    await act(async () => {
      app.value.run(1);
      app.value.run(2);
      app.value.flush();
    });
    assert.deepEqual(values, [2]);
    await act(async () => {
      app.value.run(3);
      app.value.cancel();
      await new Promise(r => setTimeout(r, 20));
    });
    assert.deepEqual(values, [2]);
  } finally {
    await app.unmount();
  }
});
test('polling never overlaps and aborts on unmount', async () => {
  const { usePolling } = require('../src/react/usePolling.ts');
  let calls = 0,
    signal,
    release;
  const app = await mount(() =>
    usePolling(
      s => {
        calls++;
        signal = s;
        return new Promise(r => (release = r));
      },
      { interval: 10, pauseWhenHidden: false }
    )
  );
  try {
    const count = calls;
    await act(async () => {
      app.value.refresh();
      window.dispatchEvent(new window.Event('focus'));
      await new Promise(r => setTimeout(r, 25));
    });
    assert.equal(calls, count);
    await act(async () => {
      release();
      await new Promise(r => setTimeout(r, 20));
    });
    assert.equal(calls, count + 1);
  } finally {
    await app.unmount();
    assert(signal.aborted);
    release();
  }
});
test('batch processing preserves order, counts failures, and waits for consumers', async () => {
  const { useBatchTask } = require('../src/react/useBatchTask.ts');
  let active = 0,
    max = 0;
  const app = await mount(() =>
    useBatchTask(
      async n => {
        active++;
        max = Math.max(max, active);
        await new Promise(r => setTimeout(r, 2));
        active--;
        if (n === 2) throw Error('bad');
        return n * 2;
      },
      { concurrency: 2 }
    )
  );
  try {
    let report;
    await act(async () => {
      report = await app.value.run([1, 2, 3, 4]);
    });
    assert.equal(report.succeeded, 3);
    assert.equal(report.failed, 1);
    assert.deepEqual(
      report.results.map(r => r.index),
      [0, 1, 2, 3]
    );
    assert(max <= 2);
  } finally {
    await app.unmount();
  }
});
test('batch cancellation settles and stops producer with pending tasks', async () => {
  const { useBatchTask } = require('../src/react/useBatchTask.ts');
  let produced = 0;
  const signals = [];
  async function* input() {
    for (let i = 0; i < 100; i++) {
      produced++;
      yield i;
    }
  }
  const app = await mount(() =>
    useBatchTask(
      (n, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      },
      { concurrency: 2, collectResults: false }
    )
  );
  try {
    let promise;
    await act(async () => {
      promise = app.value.run(input()).catch(e => e);
    });
    assert.equal(produced, 2);
    await act(async () => app.value.cancel());
    assert.equal((await promise).name, 'AbortError');
    assert(signals.every(s => s.aborted));
  } finally {
    await app.unmount();
  }
});
test('batch retry only repeats retained failures', async () => {
  const { useBatchTask } = require('../src/react/useBatchTask.ts');
  let fail = true;
  const calls = [];
  const app = await mount(() =>
    useBatchTask(
      n => {
        calls.push(n);
        if (n === 2 && fail) throw Error('bad');
        return n;
      },
      { retainFailed: true }
    )
  );
  try {
    await act(async () => app.value.run([1, 2, 3]));
    fail = false;
    await act(async () => app.value.retryFailed());
    assert.deepEqual(calls, [1, 2, 3, 2]);
  } finally {
    await app.unmount();
  }
});
test('search histories isolate keys, migrate old values and sync same-window instances', async () => {
  const useHistory = require('../src/hooks/useSearchHistory.tsx').default;
  const first = await mount(() => useHistory({ storageKey: 'a' }));
  const second = await mount(() => useHistory({ storageKey: 'a' }));
  const other = await mount(() => useHistory({ storageKey: 'b' }));
  try {
    await act(async () => first.value.setSearchValue('VIN'));
    assert.equal(second.value.searchHistory[0].value, 'VIN');
    assert.deepEqual(other.value.searchHistory, []);
    await act(async () => second.value.handleClearHistory());
    assert.deepEqual(first.value.searchHistory, []);
  } finally {
    await first.unmount();
    await second.unmount();
    await other.unmount();
  }
});
test('headless update detector notifies once and accepts version', async () => {
  const { useCheckUpdate } = require('../src/react/useUpdateCheck.ts');
  let version = '1';
  const notices = [];
  const app = await mount(() =>
    useCheckUpdate({
      getVersion: async () => version,
      onUpdate: v => notices.push(v),
    })
  );
  try {
    version = '2';
    await act(async () => app.value.checkUpdate());
    assert.equal(app.value.hasUpdate, true);
    await act(async () => app.value.checkUpdate());
    assert.deepEqual(notices, ['2']);
    await act(async () => app.value.accept());
    assert.equal(app.value.hasUpdate, false);
  } finally {
    await app.unmount();
  }
});
test('async task reset isolates late resolution and saved callbacks reject after unmount', async () => {
  let resolve;
  const app = await mount(() =>
    useAsyncTask(() => new Promise(r => (resolve = r)))
  );
  let promise;
  await act(async () => {
    promise = app.value.run().catch(e => e);
  });
  await act(async () => app.value.reset());
  assert.equal((await promise).name, 'AbortError');
  await act(async () => resolve('late'));
  assert.equal(app.value.status, 'idle');
  assert.equal(app.value.data, undefined);
  const run = app.value.run;
  await app.unmount();
  await assert.rejects(run(), { name: 'AbortError' });
});
test('batch cancellation closes pending producer and consumer failures stop reading', async () => {
  const { useBatchTask } = require('../src/react/useBatchTask.ts');
  let returned = false;
  const input = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise(() => {}),
        return() {
          returned = true;
          return Promise.resolve({ done: true });
        },
      };
    },
  };
  const app = await mount(() =>
    useBatchTask(n => n, {
      concurrency: 1,
      onResult() {
        throw Error('sink');
      },
    })
  );
  try {
    let pending;
    await act(async () => {
      pending = app.value.run(input).catch(e => e);
    });
    await act(async () => app.value.cancel());
    assert.equal((await pending).name, 'AbortError');
    assert(returned);
    let produced = 0;
    function* rows() {
      for (let i = 0; i < 10; i++) {
        produced++;
        yield i;
      }
    }
    await act(async () => {
      await assert.rejects(app.value.run(rows()), /sink/);
    });
    assert.equal(produced, 1);
  } finally {
    await app.unmount();
  }
});
test('pool hook survives StrictMode and suppresses stale tasks on unmount', async () => {
  const {
    useConcurrencyPool,
  } = require('../src/hooks/useConcurrencyPoolPro.tsx');
  const app = await mount(() => useConcurrencyPool(1));
  let signal, pending;
  await act(async () => {
    pending = app.value
      .add(s => {
        signal = s;
        return new Promise(() => {});
      })
      .catch(e => e);
  });
  const add = app.value.add;
  await app.unmount();
  assert.equal((await pending).name, 'AbortError');
  assert(signal.aborted);
  await assert.rejects(
    add(() => 1),
    /unmounted/
  );
});
test('batch consumer backpressure bounds production without collecting results', async () => {
  const { useBatchTask } = require('../src/react/useBatchTask.ts');
  let produced = 0,
    release;
  const gate = new Promise(r => (release = r));
  function* rows() {
    for (let i = 0; i < 4; i++) {
      produced++;
      yield i;
    }
  }
  const app = await mount(() =>
    useBatchTask(n => n, {
      concurrency: 2,
      collectResults: false,
      onResult: () => gate,
    })
  );
  try {
    let pending;
    await act(async () => {
      pending = app.value.run(rows());
    });
    assert.equal(produced, 2);
    let report;
    await act(async () => {
      release();
      report = await pending;
    });
    assert.equal(report.total, 4);
    assert.deepEqual(report.results, []);
  } finally {
    await app.unmount();
  }
});
test('search history retains in-memory edits when persistent storage fails', async () => {
  const useHistory = require('../src/hooks/useSearchHistory.tsx').default;
  const storage = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('denied');
    },
    removeItem() {
      throw Error('denied');
    },
  };
  const app = await mount(() => useHistory({ storageKey: 'denied', storage }));
  try {
    await act(async () => {
      app.value.setSearchValue('first');
      app.value.setSearchValue('second');
    });
    assert.deepEqual(
      app.value.searchHistory.map(r => r.value),
      ['second', 'first']
    );
  } finally {
    await app.unmount();
  }
});
test('polling timeout aborts stalled request and allows a subsequent refresh', async () => {
  const { usePolling } = require('../src/react/usePolling.ts');
  let signal,
    calls = 0;
  const app = await mount(() =>
    usePolling(
      s => {
        signal = s;
        return ++calls === 1 ? new Promise(() => {}) : Promise.resolve();
      },
      { timeout: 10, interval: 10000, pauseWhenHidden: false }
    )
  );
  try {
    await act(async () => {
      await new Promise(r => setTimeout(r, 25));
    });
    assert.equal(app.value.error.name, 'TimeoutError');
    assert(signal.aborted);
    assert.equal(app.value.running, false);
    await act(async () => app.value.refresh());
    assert.equal(calls, 2);
    assert.equal(app.value.error, undefined);
  } finally {
    await app.unmount();
  }
});
test('keyboard options filter editable, composing and repeated events and respect scope', async () => {
  const useKeyboard = require('../src/hooks/useKeyboard.tsx').default;
  let calls = 0;
  const scope = document.createElement('div'),
    input = document.createElement('input');
  scope.append(input);
  document.body.append(scope);
  const app = await mount(() =>
    useKeyboard('ctrl+k', () => calls++, {
      target: scope,
      allowInEditable: false,
      allowRepeat: false,
      preventDefault: false,
    })
  );
  const fire = (target, extra = {}) => {
    const e = new window.KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...extra,
    });
    target.dispatchEvent(e);
    return e;
  };
  try {
    fire(input);
    fire(scope, { isComposing: true });
    fire(scope, { repeat: true });
    fire(window);
    assert.equal(calls, 0);
    assert.equal(fire(scope).defaultPrevented, false);
    assert.equal(calls, 1);
  } finally {
    await app.unmount();
    scope.remove();
  }
});
test('selection helpers preserve limits and records', async () => {
  const { useRowSelection } = require('../src/react/useRowSelection.ts');
  const app = await mount(() =>
    useRowSelection({ getKey: r => r.id, maxCount: 1 })
  );
  try {
    await act(async () => app.value.toggle({ id: 1 }));
    assert(app.value.isSelected(1));
    assert.throws(() => app.value.toggle({ id: 2 }), RangeError);
    await act(async () => app.value.remove([1]));
    assert.deepEqual(app.value.selectedKeys, []);
  } finally {
    await app.unmount();
  }
});
test('history validates limits and isolates key changes from saved mutations', async () => {
  const useHistory = require('../src/hooks/useSearchHistory.tsx').default;
  let key = 'switch-a';
  const app = await mount(() => useHistory({ storageKey: key }));
  try {
    await act(async () => app.value.setSearchValue('old'));
    const saved = app.value.setSearchValue;
    key = 'switch-b';
    await app.rerender();
    assert.deepEqual(app.value.searchHistory, []);
    await act(async () => saved('late'));
    assert.deepEqual(app.value.searchHistory, []);
    await act(async () => app.value.setSearchValue('new'));
    assert.deepEqual(
      app.value.searchHistory.map(r => r.value),
      ['new']
    );
  } finally {
    await app.unmount();
  }
  const { renderToString } = require('react-dom/server');
  assert.throws(
    () =>
      renderToString(
        React.createElement(() => {
          useHistory({ maxRecords: -1 });
          return null;
        })
      ),
    RangeError
  );
});
test('media query subscribes once, reacts to changes, switches query and cleans up', async () => {
  const { useMediaQuery } = require('../src/react/useMediaQuery.ts');
  const original = window.matchMedia;
  const queries = new Map();
  window.matchMedia = query => {
    if (!queries.has(query)) {
      const listeners = new Set();
      queries.set(query, {
        matches: false,
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
        listeners,
      });
    }
    return queries.get(query);
  };
  let query = '(min-width: 800px)';
  const app = await mount(() => useMediaQuery(query, { defaultMatches: true }));
  try {
    const first = queries.get(query);
    assert.equal(first.listeners.size, 1);
    assert.equal(app.value, false);
    await act(async () => {
      first.matches = true;
      first.listeners.forEach(fn => fn());
    });
    assert.equal(app.value, true);
    query = '(prefers-reduced-motion: reduce)';
    await app.rerender();
    assert.equal(first.listeners.size, 0);
    assert.equal(app.value, false);
    const { renderToString } = require('react-dom/server');
    assert.equal(
      renderToString(
        React.createElement(() =>
          String(useMediaQuery(query, { defaultMatches: true }))
        )
      ),
      'true'
    );
  } finally {
    await app.unmount();
    assert([...queries.values()].every(q => q.listeners.size === 0));
    window.matchMedia = original;
  }
});
test('URL state preserves unrelated params, supports typed codecs and history navigation', async () => {
  const { useUrlState } = require('../src/react/useUrlState.ts');
  let search = '?keep=yes&page=2&tag=a&tag=b';
  const listeners = new Set(),
    writes = [];
  const adapter = {
    getSearch: () => search,
    subscribe: fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setSearch: (next, options) => {
      search = next;
      writes.push(options);
      listeners.forEach(fn => fn());
    },
  };
  const schema = {
    page: {
      defaultValue: 1,
      parse: values => {
        const n = Number(values[0]);
        if (!Number.isInteger(n) || n < 1) throw Error('invalid');
        return n;
      },
      serialize: n => [String(n)],
    },
    tags: { key: 'tag', defaultValue: [], parse: v => v, serialize: v => v },
  };
  const app = await mount(() => useUrlState(schema, adapter));
  try {
    assert.deepEqual(app.value.state, { page: 2, tags: ['a', 'b'] });
    await act(async () => {
      app.value.setState(s => ({ page: s.page + 1 }));
      app.value.setState(s => ({ page: s.page + 1 }));
    });
    assert.equal(app.value.state.page, 4);
    assert.equal(new URLSearchParams(search).get('keep'), 'yes');
    assert(writes.every(o => o.replace === true));
    await act(async () => {
      search = '?keep=yes&page=invalid';
      listeners.forEach(fn => fn());
    });
    assert.equal(app.value.state.page, 1);
    await act(async () => app.value.reset({ replace: false }));
    assert.equal(search, '?keep=yes');
    assert.equal(writes.at(-1).replace, false);
  } finally {
    await app.unmount();
    assert.equal(listeners.size, 0);
  }
});
test('media query supports older matchMedia listeners', async () => {
  const { useMediaQuery } = require('../src/react/useMediaQuery.ts');
  const original = window.matchMedia;
  const listeners = new Set();
  const media = {
    matches: true,
    addListener: fn => listeners.add(fn),
    removeListener: fn => listeners.delete(fn),
  };
  window.matchMedia = () => media;
  const app = await mount(() => useMediaQuery('print'));
  try {
    assert.equal(app.value, true);
    assert.equal(listeners.size, 1);
  } finally {
    await app.unmount();
    window.matchMedia = original;
    assert.equal(listeners.size, 0);
  }
});
test('URL state avoids redundant writes and leaves URL unchanged on serialization failure', async () => {
  const { useUrlState } = require('../src/react/useUrlState.ts');
  let search = '?page=1',
    writes = 0;
  const adapter = {
    getSearch: () => search,
    subscribe: () => () => {},
    setSearch: s => {
      writes++;
      search = s;
    },
  };
  const schema = {
    page: {
      defaultValue: 1,
      parse: v => Number(v[0]),
      serialize: n => {
        if (n < 1) throw Error('invalid');
        return [String(n)];
      },
    },
  };
  const app = await mount(() => useUrlState(schema, adapter));
  try {
    app.value.setState({ page: 1 });
    assert.equal(writes, 0);
    assert.throws(() => app.value.setState({ page: 0 }), /invalid/);
    assert.equal(search, '?page=1');
    search = '?page=1&x=a%20b';
    app.value.setState({});
    assert.equal(writes, 0);
  } finally {
    await app.unmount();
  }
});
test('keyboard keeps legacy defaults and reads current callbacks without listener churn', async () => {
  const useKeyboard = require('../src/hooks/useKeyboard.tsx').default;
  let value = 1;
  const calls = [];
  const app = await mount(() => {
    const current = value;
    useKeyboard('ctrl+k', () => calls.push(current));
  });
  const input = document.createElement('input');
  document.body.append(input);
  try {
    value = 2;
    await app.rerender();
    const event = new window.KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    assert.deepEqual(calls, [2]);
    assert.equal(event.defaultPrevented, true);
  } finally {
    await app.unmount();
    input.remove();
  }
});
test('history migration and observer errors cannot corrupt usable local state', async () => {
  const useHistory = require('../src/hooks/useSearchHistory.tsx').default;
  window.localStorage.setItem('migration', JSON.stringify(['old']));
  const migrated = await mount(() =>
    useHistory({
      storageKey: 'migration',
      migrate: values =>
        values.map(value => ({ value, time: new Date().toISOString() })),
    })
  );
  try {
    assert.equal(migrated.value.searchHistory[0].value, 'old');
  } finally {
    await migrated.unmount();
  }
  const storage = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('denied');
    },
    removeItem() {
      throw Error('denied');
    },
  };
  const app = await mount(() =>
    useHistory({
      storage,
      onStorageError() {
        throw Error('observer');
      },
    })
  );
  try {
    await act(async () => app.value.setSearchValue('retained'));
    assert.equal(app.value.searchHistory[0].value, 'retained');
  } finally {
    await app.unmount();
  }
});
