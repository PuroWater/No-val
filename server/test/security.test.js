import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/security.js';

test('password hash verifies correct password', async () => {
  const hash = await hashPassword('123456');
  assert.equal(await verifyPassword('123456', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});
