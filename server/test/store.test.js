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
});

test('readJson returns fallback for missing file', () => {
  assert.deepEqual(readJson('missing-file.json', []), []);
});
