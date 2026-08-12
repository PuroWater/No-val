// 构思阶段工具：与已生成图书工具（tools.js）分文件，保持“构思 / 已生成编辑”边界清晰。
import { parseTargetWords } from '../lib/bookUtils.js';

export function defineDraftTools(book) {
  return [
    {
      name: 'confirm_draft',
      description: '构思信息齐全时，输出整合后的完整构思摘要供用户确认。',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', minLength: 5 },
          targetWords: { type: 'string', description: '全书目标字数，如 100000 或 "10万"' }
        },
        required: ['summary']
      },
      handler: async ({ summary, targetWords }) => {
        book.draft.summary = String(summary || '').trim();
        book.draft.targetWords = parseTargetWords(targetWords);
        return {
          content: `构思已整合：\n${book.draft.summary}\n\n是否需要修改？回复“确认”开始生成，或直接提出修改意见。`,
          kind: 'confirm'
        };
      }
    }
  ];
}
