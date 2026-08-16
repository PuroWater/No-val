export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 背包归一化（0.9.6）：条目 { name, status }，按重要性顺序截断，超出的合并为"杂物"。
// maxItems 为硬上限（含"杂物"聚合条目）。
export function normalizeBag(raw, maxItems = 30) {
  const list = (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const name = String(item?.name || '').trim();
      const status = String(item?.status || '').trim();
      return { name, status, ...(item?.junk ? { junk: true } : {}) };
    })
    .filter((item) => item.name);
  const seen = new Set();
  const unique = [];
  for (const item of list) {
    const key = item.name + '\u0000' + item.status;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const cap = Math.max(1, Number(maxItems) || 30);
  if (unique.length <= cap) return unique;
  const kept = unique.slice(0, cap - 1);
  const overflow = unique.slice(cap - 1).map((item) => item.name).join('、');
  kept.push({ name: '杂物', status: overflow, junk: true });
  return kept;
}

// 角色快照归一化（0.9.6）：旧版字符串快照 → 结构化 { identity, bag, goal, recent }。
export function normalizeCharacterSnapshot(raw) {
  if (typeof raw === 'string') {
    return { identity: '', bag: [], goal: '', recent: String(raw).trim() };
  }
  if (!raw || typeof raw !== 'object') return { identity: '', bag: [], goal: '', recent: '' };
  return {
    identity: String(raw.identity || '').trim(),
    bag: normalizeBag(raw.bag),
    goal: String(raw.goal || '').trim(),
    recent: String(raw.recent || '').trim()
  };
}

// 角色卡归一化：{ name, history: [{ chapter, snapshot }] }，逐张快照结构化。
export function normalizeCharacters(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((card) => ({
      name: String(card?.name || '').trim(),
      history: (() => {
        if (!Array.isArray(card?.history)) return [];
        const byChapter = new Map();
        for (const item of card.history) {
          const chapter = Number(item?.chapter);
          if (!Number.isInteger(chapter)) continue;
          // 同章多次维护保留最后一次（旧重复自动清理）
          byChapter.set(chapter, normalizeCharacterSnapshot(item?.snapshot));
        }
        return [...byChapter.entries()].sort((a, b) => a[0] - b[0]).map(([chapter, snapshot]) => ({ chapter, snapshot }));
      })()
    }))
    .filter((card) => card.name);
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
      ? chapter.events.map((item) => {
          // 0.9.5 事件瘦身：剔除 time/foreshadow/foreshadowFor（旧数据残留加载即清除）
          const clean = { ...item };
          delete clean.time;
          delete clean.foreshadow;
          delete clean.foreshadowFor;
          return {
            context: [],
            ...clean,
            context: Array.isArray(clean?.context) ? clean.context.map(String).slice(0, 3) : []
          };
        })
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
  // 人物设定卡（0.9.6）：按章结构化快照 [{ name, history: [{ chapter, snapshot: { identity, bag, goal, recent } }] }]，旧字符串快照自动迁移
  book.characters = normalizeCharacters(book.characters);
  // 0.9.7 排序：sortOrder 缺省用创建时间（旧书按创建序，新书排在各自分组末尾）
  if (!Number.isFinite(book.sortOrder)) {
    book.sortOrder = new Date(book.createdAt || book.updatedAt || Date.now()).getTime();
  }
  if (!book.targetWords) book.targetWords = 0;
  // 乐观锁版本号：仅快写路径递增；AI 慢写不递增，保持“手动保存覆盖 AI 修改”的语义
  if (!Number.isInteger(book.version) || book.version < 0) book.version = 0;
  // 章节删除记录已随全书概况一并移除（0.8.39）：删除只重排章节，不再维护概况残留
  delete book.pendingDeletes;
  // 写前确认（系统级 interrupt）：待确认的写意图，确认后执行、否则清除
  if (!book.pendingAction) book.pendingAction = null;
  // 跨消息幂等：最近一次成功应用的客户端消息 id（重试令牌）
  if (!book.lastAppliedMessageId) book.lastAppliedMessageId = '';
  // 文笔风格（0.9.8）：书级预设 id，默认 default；只影响之后写作
  if (!book.writingStyle) book.writingStyle = 'default';
  // 封面（0.9.8）：本地上传封面的静态路径，无则 null
  book.cover = typeof book.cover === 'string' && book.cover ? book.cover : null;
  return book;
}
