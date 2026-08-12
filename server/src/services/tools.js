import { searchChapters, fixChapterPrefixes, replaceTextInBook, chineseNumberToInt } from '../lib/chapterUtils.js';
import { createChapter, deleteChapters, rewriteChapter, updateOutline } from './bookService.js';
import { maintainChapterMeta } from './maintenanceService.js';
import { buildTimeline } from './storyMetaService.js';

export const READY_TOOL_GROUPS = [
  { name: 'read', summary: '查询书籍信息、章节目录或指定章节内容', tools: ['read_book'] },
  { name: 'edit', summary: '新建/改写/删除章节、编辑整书简介，或批量修复章节标题前缀、批量替换文本、批量删除末尾章节、主动维护章节元数据', tools: ['edit_book', 'batch_fix_chapter_prefixes', 'batch_replace_text', 'batch_delete_last_chapters', 'update_outline', 'refresh_chapter_meta'] },
  { name: 'navigate', summary: '打开并列查看/详情，展示书籍卡片', tools: ['open_book_widget'] }
];

export function defineReadyTools(book, settings, signal, changeLog) {
  return [
    {
      group: 'edit',
      name: 'batch_fix_chapter_prefixes',
      description: '批量格式化/修复全部章节标题的“第X章”前缀与序号，一次性处理，无需逐章调用。format 为 arabic（阿拉伯数字，如 第1章）或 chinese（汉字，如 第一章），省略时默认 arabic；不规范或缺失的前缀会被后端正则统一规范。',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['arabic', 'chinese'], description: 'arabic=第1章 / chinese=第一章（默认 arabic）' }
        },
        required: []
      },
      handler: async ({ format }) => {
        const fmt = format === 'chinese' ? 'chinese' : 'arabic';
        const count = fixChapterPrefixes(book, fmt, changeLog.chapterIds);
        return count > 0
          ? { content: `已统一处理 ${count} 个章节标题前缀（${fmt === 'chinese' ? '汉字' : '阿拉伯数字'}标号）。`, kind: 'text' }
          : { content: '章节标题前缀已是目标格式，无需修改。', kind: 'text' };
      }
    },
    {
      group: 'edit',
      name: 'batch_replace_text',
      description: '批量替换全书章节文本中的词句（如人物名、地名），一次处理全部章节。from 为被替换的原文，to 为替换后的文本（可为空字符串表示删除）。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', minLength: 1, description: '被替换的原文' },
          to: { type: 'string', description: '替换后的文本' }
        },
        required: ['from']
      },
      handler: async ({ from, to }) => {
        const count = replaceTextInBook(book, from, to, changeLog.chapterIds);
        return count > 0
          ? { content: `已批量替换 ${count} 处（${from} → ${to ?? ''}）。`, kind: 'text' }
          : { content: `未找到可替换的“${from}”。`, kind: 'text' };
      }
    },
    {
      group: 'edit',
      name: 'batch_delete_last_chapters',
      description: '批量删除末尾章节（不可恢复，不会进入回收站）：从最后一章开始向前删除 count 章，至少保留 1 章。删除不维护书中已断层的内容，概况残留需在后续改写任意章时自动清除，或调用 refresh_chapter_meta 立即刷新。请确认用户明确要求删除后再调用。',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', description: '要删除的末尾章节数量（1-50）' }
        },
        required: ['count']
      },
      handler: async ({ count }) => {
        const deleted = book.chapters.slice(-count);
        deleted.forEach((chapter) => changeLog.deletedChapterIds.add(chapter.id));
        await deleteChapters(book, { count });
        return {
          content: `已删除末尾 ${count} 章（不可恢复），当前共 ${book.chapters.length} 章。删除造成的概况残留会在后续改写任意章时自动修复，也可让我调用 refresh_chapter_meta 立即刷新。`,
          kind: 'text'
        };
      }
    },
    {
      group: 'edit',
      name: 'edit_book',
      description: '新建/改写/删除章节（正文由后端创作调用生成，不经过工具参数）。mode 为 new（新建：缺省追加末尾，chapter 指定时插入该章之后）/ modify（按 instruction 改写指定章）/ delete（删除指定章，不可恢复、不进入回收站；删除会造成剧情断层，概况残留不会立即清理，需在改写后自动修复，或调用 refresh_chapter_meta 立即刷新，请谨慎使用）。instruction 为写作方向或修改意见；title 仅 new 时可选预置标题。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['new', 'modify', 'delete'], description: 'new=新建 / modify=改写 / delete=删除（默认 modify）' },
          chapter: { type: 'string', description: '章节号或标题；modify/delete 指定目标，new 时作为插入锚点（缺省追加末尾）' },
          title: { type: 'string', description: '新章标题（仅 mode=new 可选，缺省由创作调用生成）' },
          instruction: { type: 'string', description: '写作方向（new）或修改意见（modify）' }
        },
        required: []
      },
      handler: async ({ mode = 'modify', chapter, title, instruction }, context) => {
        if (mode === 'delete') {
          const requestText = String(chapter || '').trim() || context.user || '';
          const matches = requestText ? searchChapters(book, requestText) : [];
          if (matches.length === 0) {
            return { content: '没有找到要删除的章节，请提供章节号或标题。', kind: 'text' };
          }
          if (matches.length > 1) {
            const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
            return { content: `找到多个相似章节，请确认要删除哪一章：\n${list}`, kind: 'question' };
          }
          const index = matches[0].index;
          const removedTitle = book.chapters[index].title;
          changeLog.deletedChapterIds.add(book.chapters[index].id);
          const { affectedIds = [] } = await deleteChapters(book, { index });
          affectedIds.forEach((id) => changeLog.chapterIds.add(id));
          return {
            content: `已删除第 ${index + 1} 章《${removedTitle}》（不可恢复）。删除造成的剧情断层与概况残留会在后续改写任意章时自动修复，也可让我调用 refresh_chapter_meta 立即刷新。`,
            kind: 'text'
          };
        }
        if (mode === 'new') {
          let anchorIndex;
          let position = 'after';
          const anchorText = String(chapter || '').trim();
          if (anchorText) {
            const anchorMatches = searchChapters(book, anchorText);
            if (anchorMatches.length === 0) {
              return {
                content: '没有找到要插入新章的锚点章节。请在下方书籍中打开并列查看或详情确认章节，然后回复章节号或章节名。',
                kind: 'book',
                extra: { bookId: book.id }
              };
            }
            if (anchorMatches.length > 1) {
              const list = anchorMatches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
              return { content: `找到多个相似章节，请选择插入位置：\n${list}`, kind: 'question' };
            }
            anchorIndex = anchorMatches[0].index;
            if (/(前|之前|前面)/.test(anchorText) && !/(后|之后|后面)/.test(anchorText)) position = 'before';
          }
          const { chapter: created, affectedIds = [] } = await createChapter(book, { anchorIndex, title, instruction, settings, signal, position });
          changeLog.chapterIds.add(created.id);
          affectedIds.forEach((id) => changeLog.chapterIds.add(id));
          changeLog.writtenCount = (changeLog.writtenCount || 0) + 1;
          return { followUp: true, data: `已新建第 ${book.chapters.indexOf(created) + 1} 章《${created.title}》，可打开并列窗口查看。` };
        }
        const requestText = String(chapter || '').trim() || context.user || '';
        if (!requestText) {
          return { content: '请提供要改写的章节号或标题，例如“第二章”。', kind: 'text' };
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
        const index = matches[0].index;
        const rewrittenId = book.chapters[index].id;
        await rewriteChapter(book, index, String(instruction || '').trim() || '请按用户意图润色重写本章', { ...settings, signal });
        changeLog.chapterIds.add(rewrittenId);
        return {
          content: `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》，可打开并列窗口查看。`,
          kind: 'book',
          extra: { bookId: book.id, chapter: index + 1 }
        };
      }
    },
    {
      group: 'edit',
      name: 'update_outline',
      description: '编辑整书简介（outline）。纯写字段，不主动调用、不触发任何维护。',
      parameters: {
        type: 'object',
        properties: { value: { type: 'string', minLength: 1, description: '新的整书简介' } },
        required: ['value']
      },
      handler: async ({ value }) => {
        updateOutline(book, value);
        return { content: '已更新整书简介。', kind: 'text' };
      }
    },
    {
      group: 'edit',
      name: 'refresh_chapter_meta',
      description: '唤起后端对指定章节的一次主动维护：重算该章 summary/events 并更新全书概况（含清理已删除章节残留）。不修改正文；聊天 AI 不能直接改 summary，需通过本工具维护。',
      parameters: {
        type: 'object',
        properties: { chapter: { type: 'string', description: '章节号或标题，如 "第二章"' } },
        required: ['chapter']
      },
      handler: async ({ chapter }, context) => {
        const requestText = String(chapter || '').trim() || context.user || '';
        const matches = requestText ? searchChapters(book, requestText) : [];
        if (matches.length === 0) return { content: '没有找到对应章节，请提供章节号或标题。', kind: 'text' };
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节：\n${list}\n请回复具体章节号。`, kind: 'text' };
        }
        const index = matches[0].index;
        await maintainChapterMeta(book, { chapterIndex: index, mode: 'modify', signal });
        return { content: `已重新维护第 ${index + 1} 章《${book.chapters[index].title}》的摘要、事件与全书概况。`, kind: 'text' };
      }
    },
    {
      group: 'read',
      name: 'read_book',
      description: '查询书籍信息、全书概况、章节内容或分层时间线。field 为 info（书名/简介/章节数/进度/目标字数）、chapters（章节目录）、chapter（指定章节内容与事件）、overview（当前全书概况）、timeline（全书分层时间线：重大事件→场景→章节）；查询具体章节时必须先调用本工具读取后再回答，不要凭摘要猜测；正文过长时用 maxChars 控制节选长度。',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'info | chapters | chapter | overview | timeline' },
          target: { type: 'string', description: '章节号或标题，field=chapter 时必填' },
          scope: { type: 'string', description: 'summary 或 content，field=chapter 时生效' },
          maxChars: { type: 'integer', minimum: 100, maximum: 8000, description: '正文节选最大字数，默认 3000、上限 8000（仅 field=chapter 且 scope=content 时生效）' }
        },
        required: ['field']
      },
      handler: async ({ field, target, scope, maxChars }, context) => {
        if (field === 'overview') {
          return {
            followUp: true,
            data: book.storySummary
              ? `当前全书概况：\n${book.storySummary}`
              : '当前全书概况：暂无（章节生成、修改或删除末尾章后会自动重建）'
          };
        }
        if (field === 'info') {
          const totalWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
          return {
            followUp: true,
            data: [
              `书名：${book.title}`,
              `简介：${book.outline || '无'}`,
              book.draft?.summary ? `构思设定：${book.draft.summary}` : '',
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
        if (field === 'timeline') {
          const timeline = buildTimeline(book);
          const text = (timeline.groups || [])
            .map((group) => {
              const range = `第 ${group.chapterStart + 1}-${group.chapterEnd + 1} 章`;
              const scenes = group.scenes.length > 0
                ? group.scenes.map((scene) => `  - ${scene.label}（第 ${scene.chapterStart + 1}-${scene.chapterEnd + 1} 章）：${scene.chapters.map((c) => `第${c.chapterIndex + 1}章`).join('、')}`).join('\n')
                : '';
              const chapters = group.chapters.length > 0
                ? `  - 章节：${group.chapters.map((c) => `第${c.chapterIndex + 1}章`).join('、')}`
                : '';
              return `- ${group.label}（${range}）\n${scenes || chapters}`;
            })
            .join('\n');
          return { followUp: true, data: `全书分层时间线：\n${text || '暂无事件'}` };
        }
        const matches = searchChapters(book, String(target || '').trim() || context.user || '');
        if (matches.length === 0) {
          const chapterMatch = String(target || '').trim().match(/第\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
          if (chapterMatch) {
            const raw = chapterMatch[1];
            const number = /^\d+$/.test(raw) ? Number(raw) : chineseNumberToInt(raw);
            if (number > 0 && book.chapters.length > 0 && number > book.chapters.length) {
              return { content: `本书目前只有 ${book.chapters.length} 章，没有第 ${number} 章。请确认章节号后再试。`, kind: 'text' };
            }
          }
          return { content: '没有找到对应章节，请确认章节号或标题。', kind: 'text' };
        }
        if (matches.length > 1) {
          const list = matches.slice(0, 5).map((item, order) => `${order + 1}. ${item.title}`).join('\n');
          return { content: `找到多个相似章节：\n${list}\n请回复具体章节号。`, kind: 'text' };
        }
        const index = matches[0].index;
        const chapter = book.chapters[index];
        const useContent = String(scope || '') === 'content';
        const limit = Math.min(Math.max(Number(maxChars) || 3000, 100), 8000);
        const excerpt = useContent && chapter.content ? chapter.content.slice(0, limit) : '';
        const data = [
          `第 ${index + 1} 章《${chapter.title}》`,
          `摘要：${chapter.summary || '无'}`,
          excerpt ? `正文节选（${excerpt.length} 字）：\n${excerpt}` : '',
          Array.isArray(chapter.events) && chapter.events.length > 0
            ? `事件：\n${chapter.events.map((item, eventIndex) => {
                const ctx = Array.isArray(item.context) && item.context.length > 0 ? `（${item.context.join('/')}）` : '';
                const fw = item.foreshadow ? `[伏笔：${item.foreshadow === 'setup' ? '铺设' : '回收'}]` : '';
                return `${eventIndex + 1}. ${item.event}${ctx}${fw}${item.time ? `（${item.time}）` : ''}`;
              }).join('\n')}`
            : ''
        ].filter(Boolean).join('\n');
        return { followUp: true, data };
      }
    },
    {
      group: 'navigate',
      name: 'open_book_widget',
      description: '当用户需要查看书籍、选择章节、改写目标不明确，或章节新建/改写/删除操作完成后适合展示书籍卡片时调用；chapter 为打开并列窗口后定位的章节号（从 1 开始，默认 1）。',
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
