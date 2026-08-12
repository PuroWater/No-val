// 故事元数据服务：关系网（增量/分块生成）+ 章节事迹轴派生视图。
// 关系网采用“顺序分块增量”统一原语：full = 关系置空后逐块重建，
// incremental = 保留现有关系，只处理 coveredUpTo 之后的章节与覆盖范围内近期变更章节。
import { callModel } from '../lib/modelCall.js';

export const DEFAULT_MAX_BLOCK_CHARS = 3500;
export const DEFAULT_MAX_BLOCK_CHAPTERS = 25;

function chapterSummaries(book) {
  return (book.chapters || [])
    .map((chapter, index) => ({ index, summary: String(chapter.summary || '').trim() }))
    .filter((item) => item.summary);
}

function entriesToText(entries) {
  return entries.map((entry) => `第 ${entry.index + 1} 章摘要：${entry.summary}`).join('\n');
}

// 把待处理章节摘要切成块：每块同时受字符数与章节数上限约束（纯函数，便于测试）。
export function splitIntoBlocks(entries, { maxChars = DEFAULT_MAX_BLOCK_CHARS, maxChapters = DEFAULT_MAX_BLOCK_CHAPTERS } = {}) {
  const blocks = [];
  let current = [];
  let chars = 0;
  for (const entry of entries) {
    const add = `第 ${entry.index + 1} 章摘要：${entry.summary}`.length;
    if (current.length > 0 && (current.length >= maxChapters || chars + add > maxChars)) {
      blocks.push(current);
      current = [];
      chars = 0;
    }
    current.push(entry);
    chars += add;
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

// 覆盖范围内“生成后又有变更”的章节（updatedAt 晚于最近生成时间），用于增量模式的差分参照。
export function changedChaptersSince(book, generatedAt) {
  if (!generatedAt) return [];
  const entries = [];
  (book.chapters || []).forEach((chapter, index) => {
    if (chapter.updatedAt && chapter.updatedAt > generatedAt) {
      const summary = String(chapter.summary || '').trim();
      if (summary) entries.push({ index, summary });
    }
  });
  return entries;
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

function relationsText(relations) {
  const nodes = Array.isArray(relations?.nodes) ? relations.nodes : [];
  return nodes.length > 0 ? JSON.stringify({ nodes: relations.nodes, edges: relations.edges || [] }) : '暂无';
}

// 关系网生成：mode 支持 incremental / full / auto（未传时按标记状态自动选择）。
// 输入按块受控（DEFAULT_MAX_BLOCK_*），长篇小说可用；输出为带生成标记的完整关系网。
export async function extractRelations(book, { mode } = {}) {
  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const current = book.relations || { nodes: [], edges: [] };
  const hasRelations = Array.isArray(current.nodes) && current.nodes.length > 0;
  const effectiveMode = mode || (current.generatedAt && hasRelations ? 'incremental' : 'full');
  const allSummaries = chapterSummaries(book);

  let relations = { nodes: [...(current.nodes || [])], edges: [...(current.edges || [])] };
  let coveredUpTo = Number(current.coveredUpTo) || 0;
  let entries;

  if (effectiveMode === 'incremental') {
    // 删除末尾章后收敛覆盖标记，避免覆盖已不存在的章节。
    coveredUpTo = Math.min(coveredUpTo, chapters.length);
    const tail = allSummaries.filter((entry) => entry.index >= coveredUpTo);
    const changed = changedChaptersSince(book, current.generatedAt).filter((entry) => entry.index < coveredUpTo);
    const byIndex = new Map();
    [...tail, ...changed].forEach((entry) => byIndex.set(entry.index, entry));
    entries = [...byIndex.values()].sort((a, b) => a.index - b.index);
  } else {
    relations = { nodes: [], edges: [] };
    coveredUpTo = 0;
    entries = allSummaries;
  }

  for (const block of splitIntoBlocks(entries)) {
    const result = await callModel(
      () => ({
        system: '你是小说关系网维护助手。根据本批剧情摘要和现有关系网更新关系，只返回 JSON，不要包含 Markdown。',
        user: `现有关系网：\n${relationsText(relations)}\n\n本批剧情摘要：\n${entriesToText(block)}\n\n返回更新后的完整关系网 JSON：{"nodes":[{"id":"n_1","name":"名称","type":"person|faction","weight":5,"isMain":true}],"edges":[{"from":"n_1","to":"n_2","label":"关系"}]}。节点 id 必须唯一且尽量沿用现有 id；边必须引用已有节点；weight 表示重要度 1-10，主角节点 isMain 为 true；已不再出现的角色/势力可保留或删除。`,
        maxTokens: 4096
      }),
      (result) => Array.isArray(result?.nodes)
    );
    relations = sanitizeRelations(result);
    coveredUpTo = Math.max(coveredUpTo, block[block.length - 1].index + 1);
  }

  relations.generatedAt = new Date().toISOString();
  relations.coveredUpTo = Math.min(coveredUpTo, chapters.length);
  relations.mode = effectiveMode;
  book.relations = relations;
  return relations;
}

function sortEventsByTime(events) {
  return [...events].sort((a, b) => {
    const na = Number(String(a.time || '').match(/(\d+)/)?.[1] || 0);
    const nb = Number(String(b.time || '').match(/(\d+)/)?.[1] || 0);
    return na - nb;
  });
}

// 分层时间线（派生视图，零 AI 成本）：重大事件（context[0]）→ 场景（context[1]）→ 章节 → 事件。
// 无背景事件归入“其他”组按章平铺；context 只有一层时组直接落到章节列。
export function buildTimeline(book) {
  const chapters = book.chapters || [];
  const groupMap = new Map();
  const otherChapters = [];

  chapters.forEach((chapter, index) => {
    const chapterTitle = chapter.title || `第${index + 1}章`;
    const events = Array.isArray(chapter.events) ? chapter.events : [];
    const plain = [];
    for (const event of events) {
      const context = Array.isArray(event.context) && event.context.length > 0 ? event.context : [];
      if (context.length === 0) {
        plain.push(event);
        continue;
      }
      const groupLabel = context[0];
      const sceneLabel = context.length > 1 ? context[1] : '';
      if (!groupMap.has(groupLabel)) {
        groupMap.set(groupLabel, { label: groupLabel, sceneMap: new Map() });
      }
      const group = groupMap.get(groupLabel);
      const sceneKey = sceneLabel || '__root__';
      if (!group.sceneMap.has(sceneKey)) {
        group.sceneMap.set(sceneKey, { label: sceneLabel, chapterMap: new Map() });
      }
      const scene = group.sceneMap.get(sceneKey);
      if (!scene.chapterMap.has(index)) {
        scene.chapterMap.set(index, {
          chapterIndex: index,
          chapterId: chapter.id || '',
          chapterTitle,
          events: []
        });
      }
      scene.chapterMap.get(index).events.push(event);
    }
    if (plain.length > 0) {
      otherChapters.push({
        chapterIndex: index,
        chapterId: chapter.id || '',
        chapterTitle,
        events: plain
      });
    }
  });

  const groups = [...groupMap.values()]
    .map((group) => {
      const rootScene = group.sceneMap.get('__root__');
      const hasScenes = group.sceneMap.size > 1 || !rootScene;
      const rootChapters = rootScene
        ? [...rootScene.chapterMap.values()].map((item) => ({
            ...item,
            events: sortEventsByTime(item.events)
          }))
        : [];
      const sceneList = hasScenes
        ? [...group.sceneMap.entries()]
            .filter(([key]) => key !== '__root__')
            .map(([, scene]) => {
              const indexes = [...scene.chapterMap.keys()];
              return {
                label: scene.label,
                chapterStart: Math.min(...indexes),
                chapterEnd: Math.max(...indexes),
                chapters: [...scene.chapterMap.values()].map((item) => ({
                  ...item,
                  events: sortEventsByTime(item.events)
                }))
              };
            })
            .sort((a, b) => a.chapterStart - b.chapterStart)
        : [];
      const allIndexes = hasScenes
        ? [...sceneList.flatMap((scene) => scene.chapters.map((item) => item.chapterIndex)), ...rootChapters.map((item) => item.chapterIndex)]
        : [...rootScene.chapterMap.keys()];
      return {
        label: group.label,
        chapterStart: Math.min(...allIndexes),
        chapterEnd: Math.max(...allIndexes),
        scenes: sceneList,
        chapters: hasScenes ? rootChapters : [...rootScene.chapterMap.values()].map((item) => ({
          ...item,
          events: sortEventsByTime(item.events)
        }))
      };
    })
    .sort((a, b) => a.chapterStart - b.chapterStart);

  const result = { groups };
  if (otherChapters.length > 0) {
    const indexes = otherChapters.map((item) => item.chapterIndex);
    result.groups.push({
      label: '其他',
      chapterStart: Math.min(...indexes),
      chapterEnd: Math.max(...indexes),
      scenes: [],
      chapters: otherChapters.map((item) => ({
        ...item,
        events: sortEventsByTime(item.events)
      }))
    });
  }
  // 其他组（无背景章节）与 context 组统一按起始章排序，保证按章节序展示
  result.groups.sort((a, b) => a.chapterStart - b.chapterStart);
  return result;
}
