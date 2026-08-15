// 构思生成服务：构思定稿后走“新建章流程”逐章生成（与已生成图书的新建章共用 createChapter），
// 每章内部统一做字数收敛/补写/审校 + maintainChapterMeta 自动维护 summary/events（0.8.39 起不再维护全书概况）。
// 仅“书名/简介”为构思通道专用的一次产出；不进入已生成工具体系（edit_book 等只面向 status=ready 的图书）。
import { clampOutput } from '../lib/chapterUtils.js';
import { callModel } from '../lib/modelCall.js';
import { createChapter } from './bookService.js';

// 构思确认后定稿：先一次调用产出书名/简介，再逐章走 createChapter（≤5 章）。
export async function finalizeDraftBook(book, settings = {}) {
  const concept = book.draft.summary || book.draft.concept;
  const chaptersPerOutput = clampOutput(settings.chaptersPerOutput, 1, 5, 3);
  const metaResult = await callModel(
    () => ({
      system: '你是小说构思定稿助手。只返回 JSON，不要包含 Markdown。',
      user: `根据以下构思确定小说书名与简介：\n构思：${concept || '（无）'}\n返回 JSON：{"title":"书名（简洁有力）","outline":"60-120 字简介，不剧透结尾"}。`,
      maxTokens: 16384,
      thinkingType: settings.thinkingEnabled ? 'enabled' : 'disabled'
    }),
    (r) => r && typeof r.title === 'string' && String(r.title).trim() && typeof r.outline === 'string',
    1,
    settings.signal
  );
  const now = new Date().toISOString();
  book.title = String(metaResult.title || '').trim() || '未命名小说';
  book.outline = String(metaResult.outline || '').trim();
  book.targetWords = book.draft.targetWords || book.targetWords || 0;
  // 逐章走新建章流程：createChapter 内部自动处理字数收敛/补写/审校与 summary/events 维护
  for (let index = 0; index < chaptersPerOutput; index += 1) {
    await createChapter(book, {
      instruction: concept ? `根据以下构思继续创作：${concept}` : '继续创作',
      settings,
      signal: settings.signal,
      chatContext: settings.chatContext
    });
  }
  book.status = 'ready';
  book.updatedAt = now;
  return book;
}
