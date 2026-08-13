import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/services/intentPlans.js';

test('buildPlan rewrite whitelist excludes background editing tools', () => {
  const plan = buildPlan('rewrite', { target: { chapter: 14 } });
  assert.ok(plan.tools.includes('edit_book'));
  assert.ok(!plan.tools.includes('update_events_context'));
  assert.ok(!plan.tools.includes('batch_replace_text'));
  assert.deepEqual(plan.tools, ['edit_book', 'read_book', 'open_book_widget']);
  assert.ok(plan.text.includes('instruction'));
  assert.ok(plan.text.includes('不要只传“请改写”这类空泛指令'));
  assert.ok(plan.text.includes('禁止范围读取'));
});

test('buildPlan exposes only intent-relevant tools', () => {
  assert.deepEqual(buildPlan('navigate').tools, ['open_book_widget']);
  assert.deepEqual(buildPlan('outline').tools, ['update_outline']);
  assert.deepEqual(buildPlan('target_words').tools, ['update_book_target']);
  assert.ok(buildPlan('context_edit').tools.includes('update_events_context'));
  assert.ok(!buildPlan('context_edit').tools.includes('edit_book'));
  assert.ok(buildPlan('batch_edit').tools.includes('batch_replace_text'));
  assert.ok(buildPlan('meta').tools.includes('refresh_chapter_meta'));
});
