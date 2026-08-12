// 构思生成服务：与已生成图书编辑分离的独立通道。
// 负责构思定稿后一次性初始化整本书（≤5 章 + summary + 首轮 events/概况），
// 不进入已生成工具体系（edit_book 等只面向 status=ready 的图书）。
import { nextChapterId } from '../lib/bookUtils.js';
import { ensureChapterTitle, clampOutput } from '../lib/chapterUtils.js';
import { callModel, maxTokensForWords } from '../lib/modelCall.js';
import { initializeBookMeta } from './maintenanceService.js';

function buildStorySummary(chapters) {
  const summaries = chapters.map((chapter) => chapter.summary).filter(Boolean);
  return summaries.length > 0 ? summaries.join('\n') : '';
}

// 按输出规模逐章生成正文：模型直接产出 title/content/summary，
// 首章同时产出书名与简介；调用预算按每章字数放大（上限 32768）。
export async function generateBookContent(concept, options = {}) {
  const chaptersPerOutput = clampOutput(options.chaptersPerOutput, 1, 5, 3);
  const chapterWords = clampOutput(options.chapterWords, 1000, 10000, 2000);
  const targetWords = Number(options.targetWords) || 0;
  const chapters = [];
  let title = '';
  let outline = '';
  for (let index = 0; index < chaptersPerOutput; index += 1) {
    const written = (index + 1) * chapterWords;
    const ratioText = targetWords > 0
      ? `本次已输出约 ${written} 字，占全书目标 ${targetWords} 字的 ${Math.round((written / targetWords) * 100)}%。请按此比例安排剧情发展，不要一口气写完整个故事。`
      : '请按本次输出规模安排剧情发展。';
    const result = await callModel(
      () => ({
        system: '你是小说创作助手。始终只返回 JSON，不要包含 Markdown。',
        user: index === 0
          ? `根据构思创作小说的第 1 章，本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为「第X章+标题」格式（如「第一章 少年」）；正文按情节自然分段，段落之间用空行分隔。\n返回 JSON：{"title":"书名","outline":"简介","chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。构思：${concept}`
          : `继续创作第 ${index + 1} 章，本章约 ${chapterWords} 字。${ratioText}\n章节标题统一为「第X章+标题」格式（如「第${index + 1}章 标题」）；正文按情节自然分段，段落之间用空行分隔。\n书名：${title}\n简介：${outline}\n上一章摘要：${chapters[index - 1]?.summary || '暂无'}\n返回 JSON：{"chapter":{"title":"章节标题","content":"章节正文","summary":"本章 80-150 字剧情摘要"}}。`,
        maxTokens: maxTokensForWords(chapterWords),
        thinkingType: options.thinkingForWriting ? 'enabled' : 'disabled'
      }),
      (result) => result.chapter && result.chapter.content,
      1,
      options.signal
    );
    if (index === 0) {
      title = String(result.title || '').trim();
      outline = String(result.outline || '').trim();
    }
    chapters.push({
      title: ensureChapterTitle(index, result.chapter.title),
      content: String(result.chapter.content).trim(),
      summary: String(result.chapter.summary || '').trim()
    });
  }
  if (chapters.length === 0) throw new Error('模型未返回完整小说结构');
  return {
    title: title || '未命名小说',
    outline,
    chapters
  };
}

// 构思确认后定稿：一次性初始化整本书（≤5 章 + summary + 首轮 events/概况）。
export async function finalizeDraftBook(book, settings = {}) {
  const content = await generateBookContent(book.draft.summary || book.draft.concept, {
    ...settings,
    targetWords: book.draft.targetWords || book.targetWords || 0
  });
  const now = new Date().toISOString();
  book.title = content.title;
  book.outline = content.outline;
  book.chapters = content.chapters.map((chapter, index) => ({
    id: nextChapterId(book),
    title: ensureChapterTitle(index, chapter.title),
    content: String(chapter.content || '').trim(),
    summary: String(chapter.summary || '').trim(),
    createdAt: now,
    updatedAt: now
  }));
  book.storySummary = buildStorySummary(book.chapters);
  // 首轮 events 与概况走一次性初始化内核（构思生成独立通道专用）
  await initializeBookMeta(book, settings.signal)
    .catch((err) => console.error('[maintenance] 新书概况初始化失败:', err.message));
  book.status = 'ready';
  book.targetWords = book.draft.targetWords || book.targetWords || 0;
  book.updatedAt = now;
  return book;
}
