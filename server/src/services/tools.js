import { fixChapterPrefixes, replaceTextInBook } from '../lib/chapterUtils.js';
import { createChapter, deleteChapters, rewriteChapter, updateOutline } from './bookService.js';
import { maintainChapterMeta } from './maintenanceService.js';
import { buildTimeline } from './storyMetaService.js';

export const READY_TOOL_GROUPS = [
  { name: 'read', summary: '查询书籍信息、章节目录或指定章节内容', tools: ['read_book'] },
  { name: 'edit', summary: '新建/改写/删除章节、编辑整书简介与目标字数、修改事件背景，或批量修复章节标题前缀、批量替换文本、批量删除末尾章节、主动维护章节元数据', tools: ['edit_book', 'batch_fix_chapter_prefixes', 'batch_replace_text', 'batch_delete_last_chapters', 'update_outline', 'update_book_target', 'update_events_context', 'refresh_chapter_meta'] },
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
        if (count > 0) changeLog.lastEditedIndex = book.chapters.length - 1;
        return {
          ok: true,
          data: count > 0
            ? `已统一处理 ${count} 个章节标题前缀（${fmt === 'chinese' ? '汉字' : '阿拉伯数字'}标号）。`
            : '章节标题前缀已是目标格式，无需修改。',
          effect: { type: 'text', count, ids: [...changeLog.chapterIds] }
        };
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
        if (count > 0) changeLog.lastEditedIndex = book.chapters.length - 1;
        return {
          ok: true,
          data: count > 0
            ? `已批量替换 ${count} 处（${from} → ${to ?? ''}）。`
            : `未找到可替换的“${from}”。`,
          effect: { type: 'text', count, ids: [...changeLog.chapterIds] }
        };
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
        changeLog.lastEditedIndex = book.chapters.length - 1;
        return {
          ok: true,
          data: `已删除末尾 ${count} 章（不可恢复），当前共 ${book.chapters.length} 章。删除造成的概况残留会在后续改写任意章时自动修复，也可调用 refresh_chapter_meta 立即刷新。`,
          effect: { type: 'chapters', delta: -count, ids: deleted.map((chapter) => chapter.id) }
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
          chapter: { type: 'integer', minimum: 1, description: '章节序号（从 1 开始）。用户以标题或“第X章”指代时，请先调用 read_book(field=chapters) 获取目录再转换为数字序号；new 模式为插入锚点序号（缺省追加末尾）' },
          position: { type: 'string', enum: ['before', 'after'], description: 'new 模式插入位置：before=锚点章之前 / after=锚点章之后（默认 after）' },
          title: { type: 'string', description: '新章标题（仅 mode=new 可选，缺省由创作调用生成）' },
          instruction: { type: 'string', description: '写作方向（new）或修改意见（modify）' }
        },
        required: []
      },
      handler: async ({ mode = 'modify', chapter, position, title, instruction }, handlerContext = {}) => {
        // 写正文需要“当天+本条”聊天上下文：近期对话 + 本条用户消息
        const chatContext = [handlerContext.history, `用户：${handlerContext.user || ''}`].filter(Boolean).join('\n');
        if (mode === 'delete') {
          if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters.length) {
            return { ok: false, retryable: true, data: '请先调用 read_book(field=chapters) 获取章节目录，删除时 chapter 传数字序号（从 1 开始）。' };
          }
          const index = chapter - 1;
          const removedTitle = book.chapters[index].title;
          const removedId = book.chapters[index].id;
          changeLog.deletedChapterIds.add(removedId);
          const { affectedIds = [] } = await deleteChapters(book, { index });
          affectedIds.forEach((id) => changeLog.chapterIds.add(id));
          changeLog.lastEditedIndex = Math.min(index, book.chapters.length - 1);
          return {
            ok: true,
            data: `已删除第 ${index + 1} 章《${removedTitle}》（不可恢复）。删除造成的剧情断层与概况残留会在后续改写任意章时自动修复，也可调用 refresh_chapter_meta 立即刷新。`,
            effect: { type: 'chapters', delta: -1, ids: [removedId] }
          };
        }
        if (mode === 'new') {
          let anchorIndex;
          if (Number.isInteger(chapter)) {
            if (chapter < 1 || chapter > book.chapters.length) {
              return { ok: false, retryable: true, data: '锚点章节序号超出范围，请先调用 read_book(field=chapters) 确认目录。' };
            }
            anchorIndex = chapter - 1;
          }
          const pos = position === 'before' ? 'before' : 'after';
          const { chapter: created, affectedIds = [] } = await createChapter(book, { anchorIndex, title, instruction, settings, signal, position: pos, chatContext });
          changeLog.chapterIds.add(created.id);
          affectedIds.forEach((id) => changeLog.chapterIds.add(id));
          changeLog.lastEditedIndex = book.chapters.indexOf(created);
          return {
            ok: true,
            data: `已新建第 ${book.chapters.indexOf(created) + 1} 章《${created.title}》，可打开并列窗口查看。`,
            effect: { type: 'chapters', delta: 1, ids: [created.id, ...affectedIds] }
          };
        }
        if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters.length) {
          return { ok: false, retryable: true, data: '请先调用 read_book(field=chapters) 获取章节目录，改写时 chapter 传数字序号（从 1 开始）。' };
        }
        const index = chapter - 1;
        const rewrittenId = book.chapters[index].id;
        await rewriteChapter(book, index, String(instruction || '').trim() || '请按用户意图润色重写本章', { ...settings, signal }, chatContext);
        changeLog.chapterIds.add(rewrittenId);
        changeLog.lastEditedIndex = index;
        return {
          ok: true,
          data: `已修改第 ${index + 1} 章《${book.chapters[index]?.title || '本章'}》。`,
          effect: { type: 'chapters', delta: 0, ids: [rewrittenId] }
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
        return {
          ok: true,
          data: `已更新整书简介：${String(value).trim().slice(0, 60)}${String(value).trim().length > 60 ? '…' : ''}`,
          effect: { type: 'outline' }
        };
      }
    },
    {
      group: 'edit',
      name: 'update_book_target',
      description: '根据用户意图调整全书目标总字数（如用户说“改成20万字”，将 value 转换为阿拉伯数字 200000）。value 为目标字数（阿拉伯数字，0 表示取消目标限制）。不会影响已有章节内容。',
      parameters: {
        type: 'object',
        properties: { value: { type: 'integer', minimum: 0, description: '新的全书目标字数（阿拉伯数字，如 200000；0 表示取消目标限制）' } },
        required: ['value']
      },
      handler: async ({ value }) => {
        const target = Number(value);
        if (!Number.isInteger(target) || target < 0) {
          return { ok: false, retryable: true, data: '目标字数必须是大于等于 0 的阿拉伯数字。' };
        }
        book.targetWords = target;
        book.updatedAt = new Date().toISOString();
        return {
          ok: true,
          data: target > 0 ? `全书目标字数已更新为约 ${target} 字。` : '已取消全书目标字数限制。',
          effect: { type: 'target' }
        };
      }
    },
    {
      group: 'edit',
      name: 'update_events_context',
      description: '主动修改章节事件的大背景（context）：将指定章节范围内所有事件的 context 统一替换为用户指定的背景路径，并即时同步时间线（时间线按 context 分组）。\n详细说明：用户以自然语言描述章节范围与背景（如“把第3到8章的背景改成家族”“第2-5章归入北境矿脉之行”）时，由 AI 分析并转换为数字范围与背景数组传入；start/end 为阿拉伯数字章节号（从 1 开始、end 不小于 start）；context 为背景路径数组（从大到小最多 3 层，如 ["家族","藏书阁"]，空数组 [] 表示清除该范围背景）。本工具只修改 context 字段，不重算 summary/events/foreshadow，不调用维护 AI；修改后前端时间线自动刷新。',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'integer', minimum: 1, description: '起始章节号（阿拉伯数字，从 1 开始）' },
          end: { type: 'integer', minimum: 1, description: '结束章节号（阿拉伯数字，end ≥ start）' },
          context: { type: 'array', items: { type: 'string' }, description: '新的背景路径数组（从大到小最多 3 层，如 ["家族","藏书阁"]；空数组 [] 表示清除背景）' }
        },
        required: ['start', 'end', 'context']
      },
      handler: async ({ start, end, context }) => {
        const s = Number(start);
        const e = Number(end);
        if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s || e > book.chapters.length) {
          return { ok: false, retryable: true, data: `章节范围无效：本书共 ${book.chapters.length} 章，start/end 需为 1-${book.chapters.length} 的阿拉伯数字且 end ≥ start。` };
        }
        const ctx = Array.isArray(context)
          ? context.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 3)
          : [];
        const now = new Date().toISOString();
        for (let i = s - 1; i <= e - 1; i += 1) {
          const chapter = book.chapters[i];
          if (!chapter) continue;
          (chapter.events || []).forEach((item) => { item.context = [...ctx]; });
          chapter.updatedAt = now;
          changeLog.chapterIds.add(chapter.id);
        }
        changeLog.lastEditedIndex = e - 1;
        book.updatedAt = now;
        return {
          ok: true,
          data: `已将第 ${s}-${e} 章的事件背景统一为${ctx.length > 0 ? `：${ctx.join('/')}` : '空（清除背景）'}，时间线已同步。`,
          effect: { type: 'meta', ids: [...changeLog.chapterIds] }
        };
      }
    },
    {
      group: 'edit',
      name: 'refresh_chapter_meta',
      description: '唤起后端对指定章节的一次主动维护：重算该章 summary/events 并更新全书概况（含清理已删除章节残留）。不修改正文；聊天 AI 不能直接改 summary，需通过本工具维护。用户以标题或“第X章”指代章节时，先调用 read_book(field=chapters) 获取目录，chapter 传数字序号（从 1 开始）。',
      parameters: {
        type: 'object',
        properties: { chapter: { type: 'integer', minimum: 1, description: '章节序号（从 1 开始）' } },
        required: ['chapter']
      },
      handler: async ({ chapter }) => {
        if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters.length) {
          return { ok: false, retryable: true, data: '请先调用 read_book(field=chapters) 获取章节目录，chapter 传数字序号（从 1 开始）。' };
        }
        const index = chapter - 1;
        await maintainChapterMeta(book, { chapterIndex: index, mode: 'modify', signal });
        // 必须记入 changeLog，否则 mergeBookState 写回时该章 summary/events/updatedAt 会被丢弃
        changeLog.chapterIds.add(book.chapters[index].id);
        changeLog.lastEditedIndex = index;
        return {
          ok: true,
          data: `已重新维护第 ${index + 1} 章《${book.chapters[index].title}》的摘要、事件与全书概况。`,
          effect: { type: 'meta', ids: [book.chapters[index].id] }
        };
      }
    },
    {
      group: 'read',
      name: 'read_book',
      description: '查询书籍信息（只读，可读除“全部章节全文”与“关系网全量数据”外的所有书籍字段）。field 为 info（书名/简介/章节数/进度/目标字数/构思设定）、meta（完整书籍元数据：状态/目标字数/构思设定与概念/草稿输出规模/关系网概要/时间等）、overview（当前全书概况）、chapters（章节目录，支持 start/count 分页）、chapter（按数字序号或范围读取章节的标题/摘要/事件/正文节选）、timeline（全书分层时间线：重大事件→场景→章节）；用户以数字指代章节（如“第十章”“第5到15章”）时直接传序号/范围，不必先读目录；仅当用户以标题指代且不确定序号时才先读 field=chapters；回答书籍信息前必须先调用本工具读取，不要凭摘要或对话历史猜测；正文过长时用 maxChars 控制节选长度。',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'info | meta | overview | chapters | chapter | timeline' },
          target: { type: 'string', xChapterRef: true, description: '章节序号（纯阿拉伯数字，如 "10"）或范围（纯阿拉伯数字且从小到大，如 "5-15"，不得 "15-5"），field=chapter 时必填；用户以数字指代时直接填，仅标题指代且不确定序号时才先读 chapters' },
          start: { type: 'integer', minimum: 1, description: '目录分页起始章节号（从 1 开始，默认 1），仅 field=chapters 生效' },
          count: { type: 'integer', minimum: 1, maximum: 500, description: '目录分页数量（默认 200、上限 500），仅 field=chapters 生效' },
          scope: { type: 'string', description: 'summary 或 content，field=chapter 时生效' },
          maxChars: { type: 'integer', minimum: 100, maximum: 8000, description: '正文节选最大字数，默认 3000、上限 8000（仅 field=chapter 且 scope=content 时生效）' }
        },
        required: ['field']
      },
      handler: async ({ field, target, start, count, scope, maxChars }) => {
        if (field === 'overview') {
          return {
            ok: true,
            data: book.storySummary
              ? `当前全书概况：\n${book.storySummary}`
              : '当前全书概况：暂无（章节生成、修改或删除末尾章后会自动重建）',
            effect: null
          };
        }
        if (field === 'info') {
          const totalWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
          return {
            ok: true,
            data: [
              `书名：${book.title}`,
              `简介：${book.outline || '无'}`,
              book.draft?.summary ? `构思设定：${book.draft.summary}` : '',
              `章节数：${book.chapters.length}`,
              `当前字数：约 ${totalWords} 字`,
              book.targetWords > 0
                ? `全书目标：约 ${book.targetWords} 字（已完成 ${Math.round((totalWords / book.targetWords) * 100)}%）`
                : ''
            ].filter(Boolean).join('\n'),
            effect: null
          };
        }
        if (field === 'meta') {
          const totalWords = book.chapters.reduce((sum, chapter) => sum + (chapter.content || '').length, 0);
          const relations = book.relations || {};
          return {
            ok: true,
            data: [
              `书名：${book.title}`,
              `简介：${book.outline || '无'}`,
              `状态：${book.status === 'ready' ? '已生成' : '构思中'}`,
              `章节数：${book.chapters.length}`,
              `当前字数：约 ${totalWords} 字`,
              `目标字数：${book.targetWords > 0 ? `约 ${book.targetWords} 字` : '未设置'}`,
              `构思设定：${book.draft?.summary || '无'}`,
              `构思概念：${book.draft?.concept || '无'}`,
              book.draft?.chaptersPerOutput
                ? `草稿输出规模：${book.draft.chaptersPerOutput} 章 × ${book.draft.chapterWords || '?'} 字`
                : '',
              `关系网概要：${(relations.nodes || []).length} 个节点、${(relations.edges || []).length} 条边（${relations.generatedAt ? `生成于 ${new Date(relations.generatedAt).toLocaleString('zh-CN')}、覆盖 ${relations.coveredUpTo || 0} 章` : '尚未生成'}）`,
              `创建时间：${book.createdAt ? new Date(book.createdAt).toLocaleString('zh-CN') : '未知'}`,
              `最近更新：${book.updatedAt ? new Date(book.updatedAt).toLocaleString('zh-CN') : '未知'}`
            ].filter(Boolean).join('\n'),
            effect: null
          };
        }
        if (field === 'chapters') {
          const total = book.chapters.length;
          const from = Math.max(1, Number(start) || 1);
          const size = Math.min(500, Math.max(1, Number(count) || 200));
          const titles = book.chapters
            .slice(from - 1, from - 1 + size)
            .map((chapter, offset) => `${from + offset}. ${chapter.title}`);
          const list = titles.join('\n');
          const more = total > from - 1 + size ? `\n…（全书共 ${total} 章，如需继续请用 start=${from + size} 分页读取）` : '';
          return { ok: true, data: `章节目录（第 ${from}-${Math.min(total, from - 1 + size)} 章 / 共 ${total} 章）：\n${list || '暂无章节'}${more}`, effect: null };
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
          return { ok: true, data: `全书分层时间线：\n${text || '暂无事件'}`, effect: null };
        }
        const targetText = String(target || '').trim();
        const rangeMatch = targetText.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
          const from = Number(rangeMatch[1]);
          const to = Number(rangeMatch[2]);
          if (from < 1 || to > book.chapters.length || from > to) {
            return { ok: false, retryable: true, data: `章节范围无效：本书共 ${book.chapters.length} 章，请确认范围（如 "5-15"）。` };
          }
          const chapters = book.chapters.slice(from - 1, to);
          const lines = chapters.map((item, offset) => {
            const ctx = Array.isArray(item.events) && item.events.length > 0
              ? `事件：${item.events.map((e) => e.event).join('；')}`
              : '';
            return `第 ${from + offset} 章《${item.title}》\n摘要：${item.summary || '无'}${ctx ? `\n${ctx}` : ''}`;
          });
          return { ok: true, data: `第 ${from}-${to} 章：\n${lines.join('\n\n')}`, effect: null };
        }
        const num = Number(targetText);
        if (!/^\d+$/.test(targetText) || !Number.isInteger(num) || num < 1 || num > book.chapters.length) {
          if (/^\d+$/.test(targetText) && Number(targetText) > book.chapters.length) {
            return { ok: false, retryable: true, data: `本书目前只有 ${book.chapters.length} 章，没有第 ${Number(targetText)} 章。` };
          }
          return { ok: false, retryable: true, data: 'target 请填阿拉伯数字序号（如 "10"）或范围（如 "5-15"）。' };
        }
        const index = num - 1;
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
        return { ok: true, data, effect: null };
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
        ok: true,
        data: Number.isInteger(chapter) && chapter > 0
          ? `书籍卡片已定位到第 ${chapter} 章并展示。`
          : '书籍卡片已展示。',
        effect: { type: 'none' },
        // 未传 chapter 时不默认 1，由协议层按本轮最后一个变更章补齐定位
        card: {
          bookId: book.id,
          ...(Number.isInteger(chapter) && chapter > 0 ? { chapter } : {})
        }
      })
    }
  ];
}
