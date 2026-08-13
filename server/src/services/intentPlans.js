// 意图 → 任务单：路由产出结构化 intent 后，编排器据此生成“工具白名单 + 步骤 + 完成条件”。
// 设计原则：提示词定“做什么”（本文件的任务单文本），状态机定“做到没有”（termination），
// 校验定“做对没有”（工具返回标准 ToolResult 的 effect）。
// 新增意图 = 在 INTENTS 与 buildPlan 各加一项；新增工具 = 参数 schema + 标准 ToolResult。
import { OUTPUT_LIMITS } from '../lib/outputScale.js';

export const INTENTS = [
  'navigate',
  'read',
  'create_append',
  'create_insert',
  'rewrite',
  'delete',
  'batch_edit',
  'meta',
  'outline',
  'target_words',
  'context_edit'
];

function clampChapters(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(OUTPUT_LIMITS.maxChapters, n);
}

// 任务单结构：
// groups       —— 允许的能力组（执行器据此过滤工具）
// termination  —— 完成条件：counted(计数达标) / single(主工具成功) / signal(卡片信号) / none(模型回复即结束)
// text         —— 注入执行器 system 的步骤说明
export function buildPlan(intent, { output = null, target = null, settings = {} } = {}) {
  switch (intent) {
    case 'navigate':
      return {
        groups: ['navigate'],
        termination: { kind: 'signal' },
        text: Number.isInteger(target?.chapter)
          ? `调用 open_book_widget 展示书籍卡片并定位到第 ${target.chapter} 章（chapter=${target.chapter}）；展示完成后直接回复用户确认即可，不要再调用其他工具。`
          : '调用 open_book_widget 展示书籍卡片（chapter 可传数字序号定位）；展示完成后直接回复用户确认即可，不要再调用其他工具。'
      };
    case 'read':
      return {
        groups: ['read', 'navigate'],
        termination: { kind: 'none' },
        text: '用 read_book 读取用户需要的书籍信息或章节内容，再根据真实数据回答；不要凭对话历史或猜测作答。'
      };
    case 'create_append': {
      const count = clampChapters(output?.chapters, settings.chaptersPerOutput || 1);
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'counted', target: count },
        text: `逐章调用 edit_book(mode=new) 新建 ${count} 章（每章一次调用，缺省追加末尾；新建满 ${count} 章即完成，不得多建）；全部写完后调用 open_book_widget 展示书籍卡片并总结结果。`
      };
    }
    case 'create_insert': {
      const count = clampChapters(output?.chapters, 1);
      const anchorText = Number.isInteger(target?.chapter)
        ? `第 ${target.chapter} 章${target?.position === 'before' ? '前' : '后'}`
        : '用户指定位置';
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'counted', target: count },
        text: `在${anchorText}逐章调用 edit_book(mode=new) 插入 ${count} 章（chapter 传锚点序号、position 传 before/after；插满 ${count} 章即完成，不得多建）；全部完成后调用 open_book_widget 并总结结果。`
      };
    }
    case 'rewrite': {
      const anchor = Number.isInteger(target?.chapter) ? `第 ${target.chapter} 章` : '目标章';
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'single' },
        text: `调用 edit_book(mode=modify) 改写${anchor}（不确定章节序号时先 read_book(field=chapters) 查目录，chapter 一律传数字序号）；改写完成后调用 open_book_widget 展示书籍卡片并总结结果。`
      };
    }
    case 'delete': {
      const anchor = Number.isInteger(target?.chapter) ? `第 ${target.chapter} 章` : '目标章';
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'single' },
        text: `调用 edit_book(mode=delete) 删除${anchor}（chapter 传数字序号）；删除完成后调用 open_book_widget 展示书籍卡片并总结结果。`
      };
    }
    case 'batch_edit':
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'single' },
        text: '按用户要求调用对应批量工具（batch_fix_chapter_prefixes / batch_replace_text / batch_delete_last_chapters 之一，一次调用即可完成）；执行完成后调用 open_book_widget 并总结结果。'
      };
    case 'meta':
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'single' },
        text: '调用 refresh_chapter_meta 重算目标章（chapter 数字序号）的摘要/事件与全书概况；完成后调用 open_book_widget 并总结结果。'
      };
    case 'outline':
      return {
        groups: ['edit', 'read'],
        termination: { kind: 'single' },
        text: '调用 update_outline 更新整书简介（value 为新的简介文本）；完成后总结结果。'
      };
    case 'target_words':
      return {
        groups: ['edit', 'read'],
        termination: { kind: 'single' },
        text: '调用 update_book_target 调整全书目标字数（value 为阿拉伯数字）；完成后总结结果。'
      };
    case 'context_edit':
      return {
        groups: ['edit', 'read', 'navigate'],
        termination: { kind: 'single' },
        text: '调用 update_events_context 修改指定章节范围的事件背景（start/end 数字、context 背景数组）；完成后调用 open_book_widget 并总结结果。'
      };
    default:
      return {
        groups: ['read', 'navigate'],
        termination: { kind: 'none' },
        text: '根据用户消息用 read_book 获取信息后如实回答。'
      };
  }
}
