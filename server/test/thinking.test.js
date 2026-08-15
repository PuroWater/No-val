import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THINKING_STAGES,
  normalizeThinkingMode,
  normalizeThinkingStages,
  legacyThinkingMode,
  resolveThinking
} from '../src/lib/thinking.js';

test('THINKING_STAGES covers all five stages', () => {
  assert.deepEqual(THINKING_STAGES, ['routing', 'execution', 'writing', 'review', 'maintenance']);
});

test('normalizeThinkingMode accepts on/custom and falls back to off', () => {
  assert.equal(normalizeThinkingMode('on'), 'on');
  assert.equal(normalizeThinkingMode('custom'), 'custom');
  assert.equal(normalizeThinkingMode('off'), 'off');
  assert.equal(normalizeThinkingMode(undefined), 'off');
  assert.equal(normalizeThinkingMode('enabled'), 'off');
});

test('normalizeThinkingStages keeps only known boolean stages', () => {
  const stages = normalizeThinkingStages({ routing: true, writing: false, unknown: true, review: 1 });
  assert.deepEqual(stages, {
    routing: true, execution: false, writing: false, review: false, maintenance: false
  });
  assert.deepEqual(normalizeThinkingStages(undefined), {
    routing: false, execution: false, writing: false, review: false, maintenance: false
  });
});

test('legacyThinkingMode migrates old boolean fields to on/off', () => {
  assert.equal(legacyThinkingMode({ thinkingEnabled: true }), 'on');
  assert.equal(legacyThinkingMode({ thinkingForWriting: true }), 'on');
  assert.equal(legacyThinkingMode({ thinkingEnabled: false }), 'off');
  assert.equal(legacyThinkingMode({}), 'off');
});

test('resolveThinking follows global mode for off/on', () => {
  assert.equal(resolveThinking({ thinkingMode: 'off', thinkingStages: { routing: true } }, 'routing'), false);
  assert.equal(resolveThinking({ thinkingMode: 'on', thinkingStages: { routing: false } }, 'routing'), true);
});

test('resolveThinking uses per-stage value only in custom mode', () => {
  const settings = {
    thinkingMode: 'custom',
    thinkingStages: { routing: true, execution: false, writing: true, review: false, maintenance: false }
  };
  assert.equal(resolveThinking(settings, 'routing'), true);
  assert.equal(resolveThinking(settings, 'execution'), false);
  assert.equal(resolveThinking(settings, 'writing'), true);
  assert.equal(resolveThinking(settings, 'review'), false);
  assert.equal(resolveThinking(settings, 'maintenance'), false);
  assert.equal(resolveThinking(settings, 'missing'), false);
});

test('resolveThinking guards missing settings', () => {
  assert.equal(resolveThinking(undefined, 'routing'), false);
  assert.equal(resolveThinking(null, 'routing'), false);
  assert.equal(resolveThinking({}, 'routing'), false);
});
