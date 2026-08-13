// 标准工具结果（ToolResult）校验：{ ok, data, retryable?, effect?, card? } —— 见 SUMMARY「工具开发规范」。
export function validateOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    return { ok: false, errors: ['工具结果必须是对象'] };
  }
  const errors = [];
  if (typeof outcome.ok !== 'boolean') errors.push('ok 必须是布尔值');
  if (typeof outcome.data !== 'string') errors.push('data 必须是字符串');
  if (outcome.retryable != null && typeof outcome.retryable !== 'boolean') errors.push('retryable 必须是布尔值');
  if (outcome.effect != null) {
    if (typeof outcome.effect !== 'object' || Array.isArray(outcome.effect)) errors.push('effect 必须是对象');
    else if (typeof outcome.effect.type !== 'string') errors.push('effect.type 必须是字符串');
  }
  if (outcome.card != null) {
    if (typeof outcome.card !== 'object' || Array.isArray(outcome.card) || typeof outcome.card.bookId !== 'string') {
      errors.push('card 必须是 {bookId, chapter?}');
    }
  }
  return { ok: errors.length === 0, errors };
}
