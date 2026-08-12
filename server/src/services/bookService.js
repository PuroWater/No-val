import { readBookById, saveBook } from '../lib/store.js';
import { nextChapterId } from '../lib/bookUtils.js';
import { clampOutput, ensureChapterTitle, renumberChapterPrefixes } from '../lib/chapterUtils.js';
import { callModel, maxTokensForWords } from '../lib/modelCall.js';
import { maintainChapterMeta } from './maintenanceService.js';

export const MAX_BATCH_DELETE = 50;

// 批量删除末尾章节的校验（纯函数）：count 需为 1-MAX_BATCH_DELETE 的整数，且至少保留 1 章。
export function validateBatchDelete(count, chapterCount) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_DELETE) {
    return `删除章节数需为 1-${MAX_BATCH_DELETE} 的整数`;
  }
  if (count >= chapterCount) {
    return '至少保留 1 章，删除数量需小于当前章节总数';
  }
  return '';
}

export function updateBook(userId, bookId, apply) {
  const book = readBookById(bookId);
  if (!book || book.userId !== userId) throw new Error('书籍不存在');
  apply(book);
  saveBook(book);
  return book;
}

// 兼容旧接口的续写入口：内部按输出规模逐章走 createChapter（写正文 → 自动维护），失败回滚。
export async function continueBook(book, instruction, settings = {}) {
  const chaptersPerOutput = clampOutput(settings.chaptersPerOutput, 1, 5, 1);
  const startCount = book.chapters.length;
  try {
    for (let i = 0; i < chaptersPerOutput; i += 1) {
      await createChapter(book, { instruction, settings, signal: settings.signal });
    }
  } catch (err) {
    book.chapters = book.chapters.slice(0, startCount);
    throw err;
  }
  book.updatedAt = new Date().toISOString();
  return book;
}

// 生成后审校（可开关，settings.reviewAfterWrite）：通读刚生成的章节，判断是否通顺、是否符合指令与全书概况。
// 开思考、预算按字数放大（可能返回修订后的完整章节）；不通过且含修订时直接应用，由外层统一触发维护。
export async function reviewChapter(book, chapterIndex, { instruction = '', settings = {}, signal } = {}) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const result = await callModel(
    () => ({
      system: '你是小说质量审校助手。通读刚生成的章节，判断是否通顺、是否符合用户指令与全书概况；若不通过，给出修订后的完整章节。只返回 JSON，不要包含 Markdown。',
      user: `请审校以下章节（约 ${chapterWords} 字）：\n《${target.title}》\n${target.content}\n生成指令：${instruction || '无'}\n全书概况：${book.storySummary || '暂无'}\n\n若内容通顺且符合指令，返回 {"pass":true,"issues":""}；若需要修订，返回 {"pass":false,"issues":"问题要点","revised":{"title":"修订后标题","content":"修订后完整章节正文"}}。修订版必须保留情节主线且为完整章节。`,
      maxTokens: maxTokensForWords(chapterWords),
      thinkingType: 'disabled'
    }),
    (r) => r && typeof r.pass === 'boolean'
  );
  if (result.pass) return { pass: true, issues: '' };
  const revised = result.revised && typeof result.revised.content === 'string' && result.revised.content.trim()
    ? {
        title: String(result.revised.title || target.title).trim(),
        content: String(result.revised.content).trim()
      }
    : null;
  if (revised) {
    target.title = revised.title;
    target.content = revised.content;
  }
  return { pass: false, issues: String(result.issues || ''), revised };
}

// 新建章节（AI 工具/续写兼容入口）：可追加末尾或插入锚点章后。
// 内部一次写正文调用（开思考、大预算，只产 title/content），写后自动维护章节元数据并重排受影响前缀。
export async function createChapter(book, { anchorIndex, title, instruction, settings = {}, signal } = {}) {
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const insertAt = Number.isInteger(anchorIndex) && anchorIndex >= 0 && anchorIndex < book.chapters.length
    ? anchorIndex + 1
    : book.chapters.length;
  const prev = insertAt > 0 ? book.chapters[insertAt - 1] : null;
  const next = insertAt < book.chapters.length ? book.chapters[insertAt] : null;
  const targetWords = Number(book.targetWords) || 0;
  const writtenWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
  const ratioText = targetWords > 0
    ? `全书目标约 ${targetWords} 字，当前已写约 ${writtenWords} 字（约 ${Math.round((writtenWords / targetWords) * 100)}%）。请按剩余篇幅推进剧情：未接近全书尾声时不得提前大结局，也不要拖沓。`
    : '请稳步推进剧情，不要在单章内仓促完结大事件。';
  const context = [
    `全书概况：${book.storySummary || '暂无'}`,
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
      user: `创作新章节（插入为第 ${insertAt + 1} 章），本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为“第X章 + 标题”格式。\n返回 JSON：{"title":"章节标题","content":"章节正文"}。\n用户指令：${instruction || '继续创作'}\n${context}`,
      maxTokens: maxTokensForWords(chapterWords),
      thinkingType: 'enabled'
    }),
    (result) => result && typeof result.content === 'string' && result.content.trim().length > 0
  );
  const now = new Date().toISOString();
  const chapter = {
    id: nextChapterId(book),
    title: ensureChapterTitle(insertAt, String(result.title || title || '').trim() || ''),
    content: String(result.content).trim(),
    summary: '',
    events: [],
    createdAt: now,
    updatedAt: now
  };
  const affectedIds = new Set();
  book.chapters.splice(insertAt, 0, chapter);
  // 新章自身（AI 可能返回“第一章/第N章”等任意前缀）+ 其后章节统一按当前位置重排，
  // collect 收集受影响章节 id 供上层 changeLog 写回，避免重排结果在写回时丢失。
  renumberChapterPrefixes(book, { fromIndex: insertAt, collect: affectedIds });
  if (settings.reviewAfterWrite) {
    try {
      await reviewChapter(book, insertAt, { instruction, settings, signal });
    } catch (err) {
      console.error('[review] 审校失败，按通过降级:', err.message);
    }
  }
  try {
    await maintainChapterMeta(book, { chapterIndex: insertAt, mode: 'new', signal });
  } catch (err) {
    console.error('[maintenance] 新章元数据维护失败（保留旧值）:', err.message);
  }
  affectedIds.add(chapter.id);
  return { chapter, insertAt, affectedIds: [...affectedIds] };
}

// 改写章节（AI 工具入口）：一次写正文调用（开思考、大预算，只产 title/content），写后自动维护章节元数据。
export async function rewriteChapter(book, chapterIndex, instruction, settings = {}) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const prev = chapterIndex > 0 ? book.chapters[chapterIndex - 1] : null;
  const next = chapterIndex < book.chapters.length - 1 ? book.chapters[chapterIndex + 1] : null;
  const context = [
    `上一章摘要：${prev?.summary || '无'}`,
    prev ? `上一章结尾（节选）：${prev.content.slice(-400)}` : '',
    `下一章摘要：${next?.summary || '无'}`,
    next ? `下一章开头（节选）：${next.content.slice(0, 400)}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是小说改写助手。始终只返回 JSON，不要包含 Markdown。',
      user: `根据修改意见改写章节，本章约 ${chapterWords} 字。返回 JSON：{"title":"章节标题","content":"新内容"}。\n原章节：\n${target.title}\n${target.content}\n修改意见：${instruction}\n全书概况：${book.storySummary || '暂无'}\n附近章节语境：\n${context}`,
      maxTokens: maxTokensForWords(chapterWords),
      thinkingType: 'enabled'
    }),
    (result) => result && typeof result.content === 'string' && result.content.trim().length > 0
  );
  target.title = String(result.title || target.title).trim();
  target.content = String(result.content).trim();
  if (settings.reviewAfterWrite) {
    try {
      await reviewChapter(book, chapterIndex, { instruction, settings, signal: settings.signal });
    } catch (err) {
      console.error('[review] 审校失败，按通过降级:', err.message);
    }
  }
  try {
    await maintainChapterMeta(book, { chapterIndex, mode: 'modify', signal: settings.signal });
  } catch (err) {
    console.error('[maintenance] 改写元数据维护失败（保留旧值）:', err.message);
  }
  return book;
}

// 删除章节（AI 工具/批量共用）：支持按 index 删除任意章，或按 count 删除末尾 N 章。
// 删除不调 AI、不触发概览维护，只记 pendingDeletes，由下一次维护消费清理；中间删除自动重排受影响前缀。
export async function deleteChapters(book, { index, count } = {}) {
  const total = book.chapters.length;
  const pending = Array.isArray(book.pendingDeletes) ? book.pendingDeletes : [];
  const affectedIds = new Set();
  const now = new Date().toISOString();
  if (Number.isInteger(index)) {
    if (index < 0 || index >= total) throw new Error('章节不存在');
    if (total <= 1) throw new Error('至少保留 1 章，删除数量需小于当前章节总数');
    const removed = book.chapters.splice(index, 1)[0];
    pending.push({ index, title: removed?.title || '', deletedAt: now });
    renumberChapterPrefixes(book, { fromIndex: index, collect: affectedIds });
  } else {
    const error = validateBatchDelete(count, total);
    if (error) throw new Error(error);
    const removed = book.chapters.splice(total - count, count);
    removed.forEach((chapter, offset) => {
      pending.push({ index: total - count + offset, title: chapter?.title || '', deletedAt: now });
    });
  }
  book.pendingDeletes = pending;
  book.updatedAt = now;
  return { book, affectedIds: [...affectedIds] };
}

// 整书简介编辑：纯写字段，不主动调用、不触发任何维护。
export function updateOutline(book, outline) {
  book.outline = String(outline || '').trim();
  book.updatedAt = new Date().toISOString();
  return book;
}
