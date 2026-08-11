// 故事元数据服务：关系网（当前）+ 未来“时间事迹轴 / 章节事迹轴”派生视图（同模块扩展）。
import { callModel } from '../lib/modelCall.js';

function chapterContext(book) {
  const summaries = book.chapters.map((chapter) => chapter.summary).filter(Boolean);
  if (summaries.length > 0) {
    return summaries.map((summary, index) => `第 ${index + 1} 章摘要：${summary}`).join('\n');
  }
  if (book.storySummary) return book.storySummary;
  return book.chapters.slice(0, 3).map((chapter) => `${chapter.title}\n${chapter.content}`).join('\n\n');
}

export function sanitizeRelations(result) {
  const seen = new Set();
  const nodes = (Array.isArray(result?.nodes) ? result.nodes : [])
    .filter((node) => node && typeof node.id === 'string' && node.id && typeof node.name === 'string')
    .filter((node) => {
      const key = String(node.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((node) => ({
      id: String(node.id),
      name: String(node.name),
      type: node.type === 'faction' ? 'faction' : 'person',
      weight: Number.isFinite(Number(node.weight)) ? Number(node.weight) : 1,
      isMain: Boolean(node.isMain)
    }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(result?.edges) ? result.edges : [])
    .filter((edge) => edge && nodeIds.has(String(edge.from)) && nodeIds.has(String(edge.to)))
    .map((edge) => ({
      from: String(edge.from),
      to: String(edge.to),
      label: String(edge.label || '')
    }));
  return { nodes, edges };
}

// 关系网重新生成：chapterContext(book) 发送全部章节摘要（O(章数)）。
// 长篇小说需改为分块/增量生成（规划中）。
export async function extractRelations(book) {
  const text = chapterContext(book);
  const existing = book.relations?.nodes?.length
    ? JSON.stringify(book.relations)
    : '暂无';
  const result = await callModel(
    () => ({
      system: '你是小说关系网维护助手。根据剧情摘要和现有关系网更新关系，只返回 JSON，不要包含 Markdown。',
      user: `现有关系网：\n${existing}\n\n剧情摘要：\n${text}\n\n返回更新后的完整关系网 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction","weight":5,"isMain":true}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。节点 id 必须唯一，边必须引用已有节点；weight 表示重要度 1-10，主角节点 isMain 为 true。`,
      maxTokens: 4096
    }),
    (result) => Array.isArray(result?.nodes)
  );
  return sanitizeRelations(result);
}

// ── 未来：时间事迹轴 / 章节事迹轴（派生视图，暂未实现）──
// 章节事迹轴 = 按章节顺序输出各章 chapter.events；
// 时间事迹轴 = 对 chapter.events 按事件时间字段（如未来新增）聚合排序。
// 两者都由后端从章节数据确定性派生，不新增 AI 维护负担，后续在此模块扩展。
