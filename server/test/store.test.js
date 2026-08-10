import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from '../src/lib/store.js';

test('writeJson then readJson round-trips data', () => {
  const file = path.join(os.tmpdir(), `store-${Date.now()}.json`);
  writeJson(file, { ok: true });
  assert.deepEqual(readJson(file, []), { ok: true });
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.bak`, { force: true });
  fs.rmSync(`${file}.tmp`, { force: true });
});

test('writeJson keeps a .bak of the previous content', () => {
  const file = path.join(os.tmpdir(), `store-bak-${Date.now()}.json`);
  writeJson(file, { version: 1 });
  writeJson(file, { version: 2 });
  assert.deepEqual(readJson(file, []), { version: 2 });
  assert.deepEqual(readJson(`${file}.bak`, []), { version: 1 });
  fs.rmSync(file, { force: true });
  fs.rmSync(`${file}.bak`, { force: true });
  fs.rmSync(`${file}.tmp`, { force: true });
});

test('readJson returns fallback for missing file', () => {
  assert.deepEqual(readJson('missing-file.json', []), []);
});
