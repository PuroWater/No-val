export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function backfillChapterCreation(book) {
  const chapters = book.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return;
  if (chapters.every((chapter) => chapter.createdAt)) return;
  let cursor = 0;
  for (const message of book.chat || []) {
    if (!message || message.kind !== 'book') continue;
    const content = String(message.content || '');
    let added = 0;
    const generated = content.match(/共\s*(\d+)\s*章/);
    if (generated) {
      added = Number(generated[1]);
    } else if (/已续写下一章/.test(content)) {
      added = 1;
    } else {
      const multi = content.match(/已续写\s*(\d+)\s*章/);
      if (multi) added = Number(multi[1]);
    }
    if (!Number.isInteger(added) || added <= 0) continue;
    const created = message.createdAt || book.createdAt;
    for (let i = 0; i < added && cursor < chapters.length; i += 1) {
      if (!chapters[cursor].createdAt) chapters[cursor].createdAt = created;
      cursor += 1;
    }
  }
  const fallback = book.createdAt || new Date().toISOString();
  for (const chapter of chapters) {
    if (chapter.createdAt) continue;
    chapter.createdAt = cursor === 0
      ? fallback
      : chapter.updatedAt || fallback;
  }
}

export function normalizeBook(book) {
  if (!book) return book;
  if (!Array.isArray(book.chapters)) book.chapters = [];
  book.chapters = book.chapters.map((chapter) => ({
    summary: '',
    events: [],
    ...chapter,
    events: Array.isArray(chapter.events)
      ? chapter.events.map((item) => ({
          time: '',
          context: [],
          foreshadow: null,
          foreshadowFor: '',
          ...item,
          context: Array.isArray(item?.context) ? item.context.map(String).slice(0, 3) : []
        }))
      : []
  }));
  if (!Array.isArray(book.chat)) book.chat = [];
  backfillChapterCreation(book);
  if (!book.status) book.status = book.chapters.length > 0 ? 'ready' : 'draft';
  if (!book.draft) book.draft = { concept: '', summary: '', targetWords: 0 };
  book.draft.targetWords = Number(book.draft.targetWords) || 0;
  // 关系网已删除（0.9.0）：旧数据残留加载即清除
  delete book.relations;
  if (!book.deletedAt) book.deletedAt = null;
  // 全书概况已删除（0.8.39）：旧数据残留加载即清除
  delete book.storySummary;
  // 人物设定卡（0.9.0 方案 B）：按章历史快照 [{ name, history: [{ chapter, snapshot }] }]
  if (!Array.isArray(book.characters)) book.characters = [];
  if (!book.targetWords) book.targetWords = 0;
  // 乐观锁版本号：仅快写路径递增；AI 慢写不递增，保持“手动保存覆盖 AI 修改”的语义
  if (!Number.isInteger(book.version) || book.version < 0) book.version = 0;
  // 章节删除记录已随全书概况一并移除（0.8.39）：删除只重排章节，不再维护概况残留
  delete book.pendingDeletes;
  // 写前确认（系统级 interrupt）：待确认的写意图，确认后执行、否则清除
  if (!book.pendingAction) book.pendingAction = null;
  // 跨消息幂等：最近一次成功应用的客户端消息 id（重试令牌）
  if (!book.lastAppliedMessageId) book.lastAppliedMessageId = '';
  return book;
}
