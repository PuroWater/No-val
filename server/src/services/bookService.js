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
      thinkingType: 'enabled'
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

// 正文长度兜底：目标字数不足 85% 时，带章节结尾续写补齐（最多 2 轮），避免“写不满”；
// 补写失败降级为保留已写内容，不阻断生成。
async function ensureChapterLength(book, chapterIndex, targetWords, settings = {}, signal, chatContext = '') {
  const chapter = book.chapters[chapterIndex];
  if (!chapter) return;
  const target = Math.round(Number(targetWords) * 0.85);
  if (!Number.isFinite(target) || target <= 0) return;
  // 有下一章时把其开头作为衔接参考（与 rewriteChapter 逻辑一致），无则不传
  const next = chapterIndex < book.chapters.length - 1 ? book.chapters[chapterIndex + 1] : null;
  const nextText = next
    ? `下一章开头（衔接参考，补写内容应自然过渡到此处，不要重复）：\n${String(next.content || '').slice(0, 400)}`
    : '';
  let content = String(chapter.content || '');
  for (let round = 0; round < 2 && content.length < target; round += 1) {
    const remaining = Math.max(500, Math.round(Number(targetWords)) - content.length);
    try {
      const result = await callModel(
        () => ({
          system: '你是小说续写助手。只返回 JSON，不要包含 Markdown。',
          user: [
            `全书概况：${book.storySummary || '暂无'}`,
            `章节标题：《${chapter.title}》`,
            chatContext ? `近期创作对话（当天+本条，供理解构思与写作方向）：\n${String(chatContext).slice(-1500)}` : '',
            `本章已写约 ${content.length} 字，目标约 ${targetWords} 字，请直接衔接章节结尾继续书写约 ${remaining} 字的情节。`,
            `要求：保持人物、设定与情节连贯，不要重复已有内容，不要提前收尾；本章总长控制在约 ${targetWords} 字，不要大幅超出。`,
            '正文按情节自然分段，段落之间用空行分隔。',
            nextText,
            `本章已写全文（衔接与上下文依据）：\n${content}`,
            '返回 JSON：{"content":"续写正文"}。'
          ].filter(Boolean).join('\n'),
          maxTokens: maxTokensForWords(remaining),
          thinkingType: settings.thinkingForWriting ? 'enabled' : 'disabled'
        }),
        (r) => r && typeof r.content === 'string' && r.content.trim().length > 0
      );
      content = `${content}${String(result.content).trim()}`;
      // 总长上限：目标 105% 内保留，超出则按完整句截断（避免补过头）
      const cap = Math.round(Number(targetWords) * 1.05);
      if (content.length > cap) {
        const slice = content.slice(0, cap);
        const cut = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'), slice.lastIndexOf('\n'));
        content = cut > cap * 0.8 ? slice.slice(0, cut + 1) : slice;
      }
      chapter.content = content;
    } catch (err) {
      console.error('[length] 章节补写失败，保留已写内容:', err.message);
      break;
    }
  }
}

// 新建章节（AI 工具/续写兼容入口）：可追加末尾或插入锚点章后。
// 内部一次写正文调用（开思考、大预算，只产 title/content），写后自动维护章节元数据并重排受影响前缀。
export async function createChapter(book, { anchorIndex, title, instruction, settings = {}, signal, position = 'after', chatContext = '' } = {}) {
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const insertAt = Number.isInteger(anchorIndex) && anchorIndex >= 0 && anchorIndex < book.chapters.length
    ? (position === 'before' ? anchorIndex : anchorIndex + 1)
    : book.chapters.length;
  const prev = insertAt > 0 ? book.chapters[insertAt - 1] : null;
  const next = insertAt < book.chapters.length ? book.chapters[insertAt] : null;
  const targetWords = Number(book.targetWords) || 0;
  const writtenWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
  const ratioText = targetWords > 0
    ? `全书目标约 ${targetWords} 字，当前已写约 ${writtenWords} 字（约 ${Math.round((writtenWords / targetWords) * 100)}%）。${writtenWords >= targetWords ? '全书已达到目标字数：除非用户明确要求继续，本章应收束故事、作为完结收尾，不要再展开新主线。' : '请按剩余篇幅推进剧情：未接近全书尾声时不得提前大结局，也不要拖沓。'}`
    : '请稳步推进剧情，不要在单章内仓促完结大事件。';
  const context = [
    `全书概况：${book.storySummary || '暂无'}`,
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    `现有关系网：${JSON.stringify(book.relations || { nodes: [], edges: [] })}`
  ].filter(Boolean).join('\n');
  const chatRef = chatContext
    ? `\n近期创作对话（当天+本条，供理解构思与写作方向，只做参考不要复述）：\n${String(chatContext).slice(-2000)}`
    : '';
  const result = await callModel(
    () => ({
      system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
      user: `创作新章节（插入为第 ${insertAt + 1} 章），本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为“第X章 + 标题”格式；正文按情节自然分段，段落之间用空行分隔。\n返回 JSON：{"title":"章节标题","content":"章节正文"}。\n用户指令：${instruction || '继续创作'}${chatRef}\n${context}`,
      maxTokens: maxTokensForWords(chapterWords),
      thinkingType: settings.thinkingForWriting ? 'enabled' : 'disabled'
    }),
    (result) => result && typeof result.content === 'string' && result.content.trim().length > 0
  );
  const now = new Date().toISOString();
  // 新章标题强制按当前位置编号：去掉 AI 可能携带的任意“第N章”前缀再按位置补齐
  const rawTitle = String(result.title || title || '').trim() || '';
  const cleanedTitle = rawTitle.replace(/^第\s*[0-9零一二两三四五六七八九十百千]+\s*章[\s:：]*/, '');
  const chapter = {
    id: nextChapterId(book),
    title: ensureChapterTitle(insertAt, cleanedTitle),
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
  await ensureChapterLength(book, insertAt, chapterWords, settings, signal, chatContext);
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
export async function rewriteChapter(book, chapterIndex, instruction, settings = {}, chatContext = '') {
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
  const chatRef = chatContext
    ? `\n近期创作对话（当天+本条，供理解修改意图，只做参考不要复述）：\n${String(chatContext).slice(-2000)}`
    : '';
  const result = await callModel(
    () => ({
      system: '你是小说改写助手。始终只返回 JSON，不要包含 Markdown。',
      user: `根据修改意见改写章节，本章约 ${chapterWords} 字。正文按情节自然分段，段落之间用空行分隔。返回 JSON：{"title":"章节标题","content":"新内容"}。\n原章节：\n${target.title}\n${target.content}\n修改意见：${instruction}${chatRef}\n全书概况：${book.storySummary || '暂无'}\n附近章节语境：\n${context}`,
      maxTokens: maxTokensForWords(chapterWords),
      thinkingType: settings.thinkingForWriting ? 'enabled' : 'disabled'
    }),
    (result) => result && typeof result.content === 'string' && result.content.trim().length > 0
  );
  target.title = String(result.title || target.title).trim();
  target.content = String(result.content).trim();
  await ensureChapterLength(book, chapterIndex, chapterWords, settings, settings.signal, chatContext);
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
