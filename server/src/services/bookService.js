import { readBookById, saveBook } from '../lib/store.js';
import { nextChapterId } from '../lib/bookUtils.js';
import { clampOutput, ensureChapterTitle, renumberChapterPrefixes, trimChapterToLimit } from '../lib/chapterUtils.js';
import { callModel, maxTokensForWords } from '../lib/modelCall.js';
import { writingSystem, PARAGRAPH_RULE, chatContextRef, creationContextRef, rewriteContextRef } from '../lib/writingPrompts.js';
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

// 生成后审校（可开关，settings.reviewAfterWrite）：通读刚生成的章节，判断是否通顺、是否符合指令与本章内容（0.8.39 起不再对照全书概况）。
// 开思考、预算按字数放大（可能返回修订后的完整章节）；不通过且含修订时直接应用，由外层统一触发维护。
export async function reviewChapter(book, chapterIndex, { instruction = '', settings = {}, signal } = {}) {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const result = await callModel(
    () => ({
      system: '你是小说质量审校助手。通读刚生成的章节，判断是否通顺、是否符合用户指令与本章内容；若不通过，给出修订后的完整章节。只返回 JSON，不要包含 Markdown。',
      user: `请审校以下章节（约 ${chapterWords} 字）：\n《${target.title}》\n${target.content}\n生成指令：${instruction || '无'}\n\n若内容通顺且符合指令，返回 {"pass":true,"issues":""}；若需要修订，返回 {"pass":false,"issues":"问题要点","revised":{"title":"修订后标题","content":"修订后完整章节正文"}}。修订版必须保留情节主线且为完整章节。`,
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

// 字数达标判断（纯函数）：正文长度是否在目标 80%-120% 区间；目标无效视为达标（交给 trim 兜底）。
export function isWithinTarget(length, targetWords) {
  const target = Number(targetWords);
  if (!Number.isFinite(target) || target <= 0) return true;
  const ratio = Number(length) / target;
  return ratio >= 0.8 && ratio <= 1.2;
}

// 打回重写备注（纯函数）：说明上次生成字数不达标，要求严格按目标范围重写（保留情节骨架、不补写不删主线）。
export function buildRedoRemark(length, targetWords) {
  const target = Math.round(Number(targetWords) || 0);
  const min = Math.round(target * 0.8);
  const max = Math.round(target * 1.2);
  return `上次生成约 ${length} 字，未达到目标范围（需 ${min}-${max} 字）。请严格按该范围重写本章：保留已有情节骨架与完整结尾，不足则充实细节、超出则精简冗余，不要补写、不要删减主线、不要提前收尾。`;
}

// 一次写正文 + 字数检查 + 打回重写（最多 1 次，走“改写”语义保留首轮内容）。
// baseContent 为空 = 新建首轮；非空 = 改写首轮或打回（基于已有内容改写）。
// 打回：字数不在 80%-120% 时基于当前内容再走一次改写，remark 说明原因；打回后仍不达标则接受现状。
async function writeBodyWithLengthControl({
  chapterWords,
  title = '',
  instruction = '',
  remark = '',
  baseContent = '',
  summary = '',
  contextLines = '',
  chatContext = '',
  settings = {},
  signal,
  chapterNo = ''
}) {
  const target = Math.round(Number(chapterWords) || 0);
  const run = async (current, currentTitle, currentInstruction, currentRemark) => {
    const isRewrite = Boolean(current);
    const user = isRewrite
      ? `根据修改意见改写章节，本章约 ${target} 字。${PARAGRAPH_RULE}返回 JSON：{"title":"章节标题","content":"新内容"}。\n原章节：\n${currentTitle}\n${current}\n${summary ? `本章摘要：${summary}\n` : ''}修改意见：${currentInstruction || '请按用户意图润色重写本章'}${currentRemark ? `\n补充说明：${currentRemark}` : ''}${chatContextRef(chatContext)}\n附近章节语境：\n${contextLines}`
      : `创作新章节（插入为第 ${chapterNo} 章），本章约 ${target} 字。${currentRemark ? `\n补充说明：${currentRemark}` : ''}\n章节标题统一为“第X章 + 标题”格式；${PARAGRAPH_RULE}\n返回 JSON：{"title":"章节标题","content":"章节正文"}。\n用户指令：${currentInstruction || '继续创作'}${chatContextRef(chatContext)}\n${contextLines}`;
    const result = await callModel(
      () => ({
        system: writingSystem(isRewrite ? '改写' : '创作'),
        user,
        maxTokens: maxTokensForWords(target),
        thinkingType: settings.thinkingForWriting ? 'enabled' : 'disabled'
      }),
      (r) => r && typeof r.content === 'string' && r.content.trim().length > 0
    );
    return { title: String(result.title || '').trim(), content: String(result.content || '').trim() };
  };

  // 首轮产出（新建或改写）
  const first = await run(baseContent, title, instruction, remark);
  let finalTitle = first.title || title;
  let content = first.content;
  // 打回一次：字数不达标时基于首轮内容再走一次“改写”（保留情节骨架），remark 说明原因
  if (target > 0 && !isWithinTarget(content.length, target)) {
    const mergedRemark = [remark, buildRedoRemark(content.length, target)].filter(Boolean).join('\n');
    try {
      const redo = await run(content, finalTitle, instruction, mergedRemark);
      content = redo.content || content;
      finalTitle = redo.title || finalTitle;
    } catch (err) {
      console.error('[length] 打回重写失败，保留首轮内容:', err.message);
    }
  }
  // 150% 上限截断兜底（仅超长；不足由打回重写处理，打回后仍不足则接受现状）
  return { title: finalTitle, content: target > 0 ? trimChapterToLimit(content, target) : content };
}

// 新建章节（AI 工具/续写兼容入口）：可追加末尾或插入锚点章后。
// 内部一次写正文调用（开思考、大预算，只产 title/content），写后自动维护章节元数据并重排受影响前缀。
export async function createChapter(book, { anchorIndex, title, instruction, remark = '', settings = {}, signal, position = 'after', chatContext = '' } = {}) {
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const insertAt = Number.isInteger(anchorIndex) && anchorIndex >= 0 && anchorIndex < book.chapters.length
    ? (position === 'before' ? anchorIndex : anchorIndex + 1)
    : book.chapters.length;
  const prev = insertAt > 0 ? book.chapters[insertAt - 1] : null;
  const next = insertAt < book.chapters.length ? book.chapters[insertAt] : null;
  const context = creationContextRef(book, prev, next);
  const body = await writeBodyWithLengthControl({
    chapterWords,
    title,
    instruction,
    remark,
    contextLines: context,
    chatContext,
    settings,
    signal,
    chapterNo: insertAt + 1
  });
  const now = new Date().toISOString();
  // 新章标题强制按当前位置编号：去掉 AI 可能携带的任意“第N章”前缀再按位置补齐
  const rawTitle = String(body.title || title || '').trim() || '';
  const cleanedTitle = rawTitle.replace(/^第\s*[0-9零一二两三四五六七八九十百千]+\s*章[\s:：]*/, '');
  const chapter = {
    id: nextChapterId(book),
    title: ensureChapterTitle(insertAt, cleanedTitle),
    content: body.content,
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
export async function rewriteChapter(book, chapterIndex, instruction, settings = {}, chatContext = '', remark = '') {
  const target = book.chapters[chapterIndex];
  if (!target) throw new Error('章节不存在');
  const chapterWords = clampOutput(settings.chapterWords, 1000, 10000, 2000);
  const prev = chapterIndex > 0 ? book.chapters[chapterIndex - 1] : null;
  const next = chapterIndex < book.chapters.length - 1 ? book.chapters[chapterIndex + 1] : null;
  const context = rewriteContextRef(book, prev, next);
  const body = await writeBodyWithLengthControl({
    chapterWords,
    title: target.title,
    instruction,
    remark,
    baseContent: target.content,
    summary: target.summary,
    contextLines: context,
    chatContext,
    settings,
    signal: settings.signal
  });
  // 标题按当前位置规范化（与 createChapter 一致），防止模型返回无“第N章”前缀的标题覆盖后丢失格式
  target.title = ensureChapterTitle(chapterIndex, String(body.title || target.title).trim());
  target.content = body.content;
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
// 删除不调 AI、不触发维护（0.8.39 起无概况/删除记录需清理）；中间删除自动重排受影响前缀。
export async function deleteChapters(book, { index, count } = {}) {
  const total = book.chapters.length;
  const affectedIds = new Set();
  const now = new Date().toISOString();
  if (Number.isInteger(index)) {
    if (index < 0 || index >= total) throw new Error('章节不存在');
    if (total <= 1) throw new Error('至少保留 1 章，删除数量需小于当前章节总数');
    book.chapters.splice(index, 1);
    renumberChapterPrefixes(book, { fromIndex: index, collect: affectedIds });
  } else {
    const error = validateBatchDelete(count, total);
    if (error) throw new Error(error);
    book.chapters.splice(total - count, count);
  }
  book.updatedAt = now;
  return { book, affectedIds: [...affectedIds] };
}

// 整书简介编辑：纯写字段，不主动调用、不触发任何维护。
export function updateOutline(book, outline) {
  book.outline = String(outline || '').trim();
  book.updatedAt = new Date().toISOString();
  return book;
}
