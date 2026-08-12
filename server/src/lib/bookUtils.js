export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nextChapterId(book) {
  return `c_${book.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function parseTargetWords(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).replace(/[，,、\s]/g, '');
  const numberPart = Number(text.match(/(\d+(?:\.\d+)?)/)?.[1]);
  if (/百万/.test(text)) return 1000000;
  if (/五十万/.test(text)) return 500000;
  if (/二十万/.test(text)) return 200000;
  if (/十万/.test(text)) return 100000;
  if (/千字?/.test(text)) return Math.round((numberPart || 1) * 1000);
  if (/万字?/.test(text)) return Math.round((numberPart || 1) * 10000);
  const plain = Number(text);
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : 0;
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
    events: Array.isArray(chapter.events) ? chapter.events : []
  }));
  if (!Array.isArray(book.chat)) book.chat = [];
  if (Array.isArray(book.timeline)) {
    for (const item of book.timeline) {
      const chapter = book.chapters[Number(item.chapterIndex)];
      if (chapter && item && typeof item.event === 'string' && item.event.trim()) {
        chapter.events.push({
          id: item.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          event: item.event.trim(),
          characters: Array.isArray(item.characters) ? item.characters.map(String) : []
        });
      }
    }
    delete book.timeline;
  }
  backfillChapterCreation(book);
  if (!book.status) book.status = book.chapters.length > 0 ? 'ready' : 'draft';
  if (!book.draft) book.draft = { concept: '', summary: '', targetWords: 0 };
  book.draft.targetWords = Number(book.draft.targetWords) || 0;
  if (!book.relations) book.relations = { nodes: [], edges: [] };
  if (!Array.isArray(book.relations.nodes)) book.relations.nodes = [];
  if (!Array.isArray(book.relations.edges)) book.relations.edges = [];
  // 关系网生成标记：generatedAt 最近生成时间、coveredUpTo 已覆盖章节数、mode 最近一次生成模式。
  book.relations.generatedAt = book.relations.generatedAt || null;
  book.relations.coveredUpTo = Number.isFinite(Number(book.relations.coveredUpTo)) && Number(book.relations.coveredUpTo) >= 0
    ? Math.floor(Number(book.relations.coveredUpTo))
    : 0;
  book.relations.mode = book.relations.mode || '';
  if (!book.deletedAt) book.deletedAt = null;
  if (!book.storySummary) book.storySummary = '';
  if (!book.targetWords) book.targetWords = 0;
  // 删除记录：删除章节后暂存（不立即维护概况），由下一次 maintainChapterMeta 消费清理。
  if (!Array.isArray(book.pendingDeletes)) book.pendingDeletes = [];
  return book;
}
