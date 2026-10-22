require('./register.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskQueue } = require('../src/core/request/taskQueue.ts');
test('queue recovers from sync failure, enforces concurrency and cancels running tasks', async () => {
  const queue = createTaskQueue({ concurrency: 1 });
  await assert.rejects(
    queue.add(() => {
      throw Error('sync');
    })
  );
  let signal;
  const running = queue.add(
    s => {
      signal = s;
      return new Promise(() => {});
    },
    { id: 'running' }
  );
  const rejected = assert.rejects(running, { name: 'AbortError' });
  await Promise.resolve();
  queue.cancel('running');
  await rejected;
  assert(signal.aborted);
  assert.equal(await queue.add(() => 42), 42);
  assert.equal(queue.getSnapshot().activeCount, 0);
});
test('timeout aborts each attempt and retries with a fresh signal', async () => {
  const queue = createTaskQueue({ concurrency: 1 });
  const signals = [];
  await assert.rejects(
    queue.add(
      s => {
        signals.push(s);
        return new Promise(() => {});
      },
      { timeout: 5, retry: 1 }
    ),
    { name: 'TimeoutError' }
  );
  assert.equal(signals.length, 2);
  assert(signals.every(s => s.aborted));
  assert.notEqual(signals[0], signals[1]);
  assert.equal(await queue.add(() => 7), 7);
});
test('pause, duplicate id, external abort, limits and cancelAll are deterministic', async () => {
  assert.throws(() => createTaskQueue({ concurrency: NaN }), RangeError);
  const queue = createTaskQueue({ concurrency: 2 });
  queue.pause();
  const controller = new AbortController();
  const a = queue.add(() => 1, { id: 'a', signal: controller.signal });
  const rejected = assert.rejects(a, { name: 'AbortError' });
  await assert.rejects(
    queue.add(() => 2, { id: 'a' }),
    /Duplicate/
  );
  controller.abort();
  await rejected;
  const b = queue.add(() => 2);
  const c = queue.add(() => 3);
  queue.resume();
  assert.deepEqual(await Promise.all([b, c]), [2, 3]);
  assert.equal(queue.getSnapshot().completed, 3);
  await assert.rejects(
    queue.add(() => 1, { retry: -1 }),
    RangeError
  );
});
test('request queue survives observer exceptions and dedupe ignores obsolete completion', async () => {
  const {
    createRequestQueue,
  } = require('../src/core/request/useRequestQueue.ts');
  const queue = createRequestQueue({
    concurrency: 1,
    onSuccess() {
      throw Error('observer');
    },
  });
  assert.equal(await queue.add(async () => 1), 1);
  assert.equal(await queue.add(async () => 2), 2);
  const {
    createRequestDedupe,
  } = require('../src/core/request/createRequestDedupe.ts');
  const cache = createRequestDedupe();
  let firstDone, secondDone;
  const first = cache.run('x', () => new Promise(r => (firstDone = r)));
  await Promise.resolve();
  cache.clear('x');
  const second = cache.run('x', () => new Promise(r => (secondDone = r)));
  await Promise.resolve();
  firstDone(1);
  await first;
  assert.equal(
    cache.run('x', () => Promise.resolve(3)),
    second
  );
  secondDone(2);
  assert.equal(await second, 2);
});
test('priority, delayed retries and clearQueue keep running task alive', async () => {
  const queue = createTaskQueue({ concurrency: 1 });
  queue.pause();
  const order = [];
  const a = queue.add(() => order.push('a'), { priority: 1 });
  const b = queue.add(() => order.push('b'), { priority: 2 });
  queue.resume();
  await Promise.all([a, b]);
  assert.deepEqual(order, ['b', 'a']);
  let resolve;
  const running = queue.add(() => new Promise(r => (resolve = r)));
  const pending = queue.add(() => 9);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  queue.clearQueue();
  await rejected;
  await Promise.resolve();
  resolve(3);
  assert.equal(await running, 3);
});
test('retry cancellation settles pending operation without starting more attempts', async () => {
  const { retryAsync } = require('../src/core/request/useRetry.ts');
  const controller = new AbortController();
  let calls = 0;
  const pending = retryAsync(
    async () => {
      calls++;
      return new Promise(() => {});
    },
    { signal: controller.signal }
  );
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('WebSocket explicit close never schedules reconnect', async () => {
  const previous = global.WebSocket;
  let connections = 0;
  global.WebSocket = class {
    constructor() {
      connections++;
    }
    close() {
      this.onclose?.();
    }
  };
  try {
    const { WebSocketManager } = require('../src/utils/webSocket/webSocket.ts');
    const manager = new WebSocketManager('ws://example', 1);
    manager.close();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(connections, 1);
  } finally {
    global.WebSocket = previous;
  }
});
test('legacy request queue clear retains error contract and success precedes idle', async () => {
  const {
    createRequestQueue,
  } = require('../src/core/request/useRequestQueue.ts');
  const events = [];
  const queue = createRequestQueue({
    onSuccess: () => events.push('success'),
    onIdle: () => events.push('idle'),
    onError: () => events.push('error'),
  });
  queue.pause();
  const removed = queue.add(async () => 1).catch(e => e);
  queue.clear();
  assert.equal((await removed).name, 'RequestQueueClearError');
  assert(!events.includes('error'));
  events.length = 0;
  queue.resume();
  await queue.add(async () => 1);
  await Promise.resolve();
  assert.deepEqual(events, ['success', 'idle']);
});
