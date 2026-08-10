import { ensureChapterTitle, searchChapters, fixChapterPrefixes } from '../lib/chapterUtils.js';
import { rewriteChapter, continueBook } from './bookService.js';

export const READY_TOOL_GROUPS = [
  { name: 'read', summary: '查询书籍信息、章节目录或指定章节内容', tools: ['read_book'] },
  { name: 'edit', summary: '修改章节标题/简介/章节内容，或批量修复章节标题前缀', tools: ['edit_book', 'fix_chapter_prefixes'] },
  { name: 'write', summary: '续写小说下一批章节', tools: ['continue_book'] },
  { name: 'navigate', summary: '打开并列查看/详情，展示书籍卡片', tools: ['open_book_widget'] }
];

const EDIT_FIELDS = {
  title: {
    needsChapter: true,
    apply: (book, { index, value }, deps) => {
      const nextTitle = ensureChapterTitle(index, value);
      const chapter = book.chapters[index];
      if (chapter.title !== nextTitle) {
        chapter.title = nextTitle;
        chapter.updatedAt = new Date().toISOString();
        deps.changeLog.add(chapter.id);
      }
      return { followUp: true, data: `第 ${index + 1} 章标题已更新为《${chapter.title}》。` };
    }
  },
  outline: {
    needsChapter: false,
    apply: (book, { value }) => {
      book.outline = String(value || '').trim();
      return { content: '已更新书籍简介。', kind: 'text' };
    }
  },
  content: {
    needsChapter: true,
    apply: async (book, { index, value }, deps) => {
      const rewrittenId = book.chapters[index]?.id;
      await rewriteChapter(book, index, String(value || '').trim(), { ...deps.settings, signal: deps.signal });
      if (rewrittenId) deps.changeLog.add(rewrittenId);
      return {
        content: `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》，可打开并列窗口查看。`,
        kind: 'book',
        extra: { bookId: book.id, chapter: index + 1 }
      };
    }
  }
};

function continueMessage(book, count) {
  const added = book.chapters.slice(-count);
  if (count <= 1) {
    return `已续写下一章《${added[0]?.title || '本章'}》，可打开并列窗口查看。`;
  }
  const titles = added.map((chapter) => chapter.title).join('》《');
  return `已续写 ${count} 章：《${titles}》，可打开并列窗口查看。`;
}

export function defineReadyTools(book, settings, signal, changeLog) {
  return [
    {
      group: 'edit',
      name: 'fix_chapter_prefixes',
      description: '批量修复全部章节标题的“第X章”前缀，一次性处理，无需逐章调用。format 只能是 arabic（阿拉伯数字，如 第1章）或 chinese（汉字，如 第一章）。',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['arabic', 'chinese'], description: 'arabic=第1章 / chinese=第一章' }
        },
        required: ['format']
      },
      handler: async ({ format }) => {
        const count = fixChapterPrefixes(book, format, changeLog.chapterIds);
        return count > 0
          ? { content: `已统一处理 ${count} 个章节标题前缀（${format === 'chinese' ? '汉字' : '阿拉伯数字'}标号）。`, kind: 'text' }
          : { content: '章节标题前缀已是目标格式，无需修改。', kind: 'text' };
      }
    },
    {
      group: 'edit',
      name: 'edit_book',
      description: '修改书籍内容。target 为修改目标，只能是 title（章节标题）/ outline（简介）/ content（章节内容）三选一；target 为 content/title 时必须提供 chapter（章节号或标题）；value 为新的标题/简介/内容。修改标题后可继续调用本工具处理其它章节。',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['title', 'outline', 'content'], description: 'title=章节标题 / outline=简介 / content=章节内容' },
          chapter: { type: 'string', description: '章节号或标题，如 "第二章"、"古卷传承"' },
          value: { type: 'string', minLength: 1, description: '新的标题/简介/章节内容' }
        },
        required: ['target', 'value']
      },
      handler: async ({ target, chapter, value }, context) => {
        const field = EDIT_FIELDS[target];
        if (!field) {
          return { content: '未知的修改目标，仅支持 title / outline / content。', kind: 'text' };
        }
        const deps = { changeLog: changeLog.chapterIds, settings, signal };
        if (!field.needsChapter) {
          return field.apply(book, { value }, deps);
        }
        const requestText = String(chapter || '').trim() || context.user || '';
        if (!requestText) {
          return {
            content: '请提供要修改的章节号或标题，例如“第二章”。',
            kind: 'text'
          };
        }
        const matches = searchChapters(book, requestText);
        if (matches.length === 0) {
          return {
            content: '没有找到对应章节。请在下方书籍中打开并列查看或详情确认章节，然后回复章节号或章节名（支持模糊匹配）。',
            kind: 'book',
            extra: { bookId: book.id }
          };
        }
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节，请选择要修改哪一章：\n${list}`, kind: 'question' };
        }
        return field.apply(book, { index: matches[0].index, value }, deps);
      }
    },
    {
      group: 'write',
      name: 'continue_book',
      description: '续写小说下一批章节。instruction 为续写方向（可省略）。',
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string' } },
        required: []
      },
      handler: async ({ instruction }) => {
        const before = book.chapters.length;
        await continueBook(book, String(instruction || '').trim() || '继续写', { ...settings, signal });
        return {
          content: continueMessage(book, book.chapters.length - before),
          kind: 'book',
          extra: { bookId: book.id, chapter: book.chapters.length }
        };
      }
    },
    {
      group: 'read',
      name: 'read_book',
      description: '查询书籍信息或章节内容。field 为 info（书名/简介/章节数/进度/目标字数）、chapters（章节目录）、chapter（指定章节内容）；查询具体章节时必须先调用本工具读取后再回答，不要凭摘要猜测。',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'info | chapters | chapter' },
          target: { type: 'string', description: '章节号或标题，field=chapter 时必填' },
          scope: { type: 'string', description: 'summary 或 content，field=chapter 时生效' }
        },
        required: ['field']
      },
      handler: async ({ field, target, scope }, context) => {
        if (field === 'info') {
          const totalWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
          return {
            followUp: true,
            data: [
              `书名：${book.title}`,
              `简介：${book.outline || '无'}`,
              `章节数：${book.chapters.length}`,
              `当前字数：约 ${totalWords} 字`,
              book.targetWords > 0
                ? `全书目标：约 ${book.targetWords} 字（已完成 ${Math.round((totalWords / book.targetWords) * 100)}%）`
                : ''
            ].filter(Boolean).join('\n')
          };
        }
        if (field === 'chapters') {
          const titles = book.chapters.map((chapter, index) => `${index + 1}. ${chapter.title}`);
          const list = titles.length > 200 ? `${titles.slice(0, 200).join('\n')}\n…（共 ${titles.length} 章）` : titles.join('\n');
          return { followUp: true, data: `章节目录：\n${list || '暂无章节'}` };
        }
        const matches = searchChapters(book, String(target || '').trim() || context.user || '');
        if (matches.length === 0) {
          return { content: '没有找到对应章节，请确认章节号或标题。', kind: 'text' };
        }
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节：\n${list}\n请回复具体章节号。`, kind: 'text' };
        }
        const index = matches[0].index;
        const chapter = book.chapters[index];
        const useContent = String(scope || '') === 'content';
        const excerpt = useContent && chapter.content ? chapter.content.slice(0, 1200) : '';
        const data = [
          `第 ${index + 1} 章《${chapter.title}》`,
          `摘要：${chapter.summary || '无'}`,
          excerpt ? `正文节选（${excerpt.length} 字）：\n${excerpt}` : ''
        ].filter(Boolean).join('\n');
        return { followUp: true, data };
      }
    },
    {
      group: 'navigate',
      name: 'open_book_widget',
      description: '当用户需要查看书籍、选择章节，或改写目标不明确时，展示书籍卡片并提供并列查看/详情入口；chapter 为打开并列窗口后定位的章节号（从 1 开始，默认 1）。',
      parameters: {
        type: 'object',
        properties: { chapter: { type: 'integer', description: '章节号，从 1 开始' } },
        required: []
      },
      handler: async ({ chapter }) => ({
        content: '请在下方书籍中打开并列查看或详情浏览章节，然后回复章节号或章节名（支持模糊匹配）。',
        kind: 'book',
        extra: { bookId: book.id, chapter: Number(chapter) || 1 }
      })
    }
  ];
}
