// 书级写操作队列：同一本书的慢写操作（聊天、摘要维护、章节删除）串行执行，
// 避免“基于旧快照的整书写回覆盖新内容”类竞态；用户手动编辑保存等快写旁路不排队。
// 不同书并行（各自独立的队列尾巴）；前一个任务失败不阻塞后续任务；内存态，单进程部署适用。
const tails = new Map();

export function enqueueBookWrite(bookId, task) {
  const key = String(bookId);
  const prev = tails.get(key) || Promise.resolve();
  const run = prev.then(() => task(), () => task());
  const tracked = run.finally(() => {
    if (tails.get(key) === tracked) tails.delete(key);
  });
  tails.set(key, tracked);
  return tracked;
}
