import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueBookWrite } from '../src/lib/writeQueue.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('enqueueBookWrite serializes tasks for the same book', async () => {
  const order = [];
  await Promise.all([
    enqueueBookWrite('b1', async () => { await delay(30); order.push('first'); }),
    enqueueBookWrite('b1', async () => { await delay(10); order.push('second'); })
  ]);
  assert.deepEqual(order, ['first', 'second']);
});

test('enqueueBookWrite continues after a failed task', async () => {
  const order = [];
  await Promise.allSettled([
    enqueueBookWrite('b1', async () => { order.push('fail-start'); throw new Error('boom'); }),
    enqueueBookWrite('b1', async () => { order.push('after'); })
  ]);
  assert.deepEqual(order, ['fail-start', 'after']);
});

test('enqueueBookWrite runs different books in parallel', async () => {
  const t0 = Date.now();
  await Promise.all([
    enqueueBookWrite('b1', async () => { await delay(60); }),
    enqueueBookWrite('b2', async () => { await delay(60); })
  ]);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 110, `elapsed=${elapsed} should be near single task duration`);
});
