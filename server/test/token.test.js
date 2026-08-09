import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../src/lib/token.js';

test('JWT round-trips payload', () => {
  const token = signToken({ sub: 'u_1' }, 'test-secret');
  const payload = verifyToken(token, 'test-secret');
  assert.equal(payload.sub, 'u_1');
});
