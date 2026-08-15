// 故事元数据服务：章节事迹轴派生视图（发展线）。
// 发展线 = 按 context[0] 背景 → context[1] 场景 → 章节 → 事件 的分层视图，零 AI 成本。
// 0.9.0 起删除关系网（extractRelations / sanitizeRelations / 分块增量等），仅保留发展线派生。
// 把有序章节索引切成“最大连续区间”列表（如 [1,2,3,8,9,10] → [[1,2,3],[8,9,10]]）
function splitRuns(indexes) {
  const runs = [];
  let current = [];
  for (const index of indexes) {
    if (current.length > 0 && index > current[current.length - 1] + 1) {
      runs.push(current);
      current = [];
    }
    current.push(index);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

// 由某个背景标签在“一段连续章节区间”内的数据构建一个时间线组。
// 同一背景跨非连续章节时（家族 1-3 / 北境 4-9 / 家族 10-11）会形成多个同标签组，
// 每个组用唯一 id（label + 区间）区分，避免全书合并成一个大组。
function buildGroupFromRun(label, run, sceneMap) {
  const runSet = new Set(run);
  const rootScene = sceneMap.get('__root__');
  const hasScenes = sceneMap.size > 1 || !rootScene;
  const rootChapters = rootScene
    ? [...rootScene.chapterMap.values()]
        .filter((item) => runSet.has(item.chapterIndex))
        .map((item) => ({ ...item }))
    : [];
  const sceneList = hasScenes
    ? [...sceneMap.entries()]
        .filter(([key]) => key !== '__root__')
        .map(([, scene]) => {
          const indexes = [...scene.chapterMap.keys()].filter((index) => runSet.has(index));
          if (indexes.length === 0) return null;
          return {
            label: scene.label,
            chapterStart: Math.min(...indexes),
            chapterEnd: Math.max(...indexes),
            chapters: indexes.map((index) => ({
              ...scene.chapterMap.get(index),
              events: scene.chapterMap.get(index).events
            }))
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.chapterStart - b.chapterStart)
    : [];
  return {
    id: `${label}#${run[0]}-${run[run.length - 1]}`,
    label,
    chapterStart: run[0],
    chapterEnd: run[run.length - 1],
    scenes: sceneList,
    chapters: rootChapters
  };
}

// 分层发展线（派生视图，零 AI 成本）：重大事件（context[0]）→ 场景（context[1]）→ 章节 → 事件。
// 同一 context[0] 按“连续章节区间”切成多个组（家族 1-3、北境 4-9、家族 10-11 各自独立），
// 组内按起始章排序；无背景事件归入“其他”组，同样按连续区间分段平铺。
export function buildDevelopmentLine(book) {
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

  const groups = [];
  for (const [label, group] of groupMap) {
    const allIndexes = new Set();
    for (const scene of group.sceneMap.values()) {
      for (const index of scene.chapterMap.keys()) allIndexes.add(index);
    }
    for (const run of splitRuns([...allIndexes].sort((a, b) => a - b))) {
      groups.push(buildGroupFromRun(label, run, group.sceneMap));
    }
  }
  if (otherChapters.length > 0) {
    const byIndex = new Map(otherChapters.map((item) => [item.chapterIndex, item]));
    for (const run of splitRuns([...byIndex.keys()].sort((a, b) => a - b))) {
      groups.push({
        id: `其他#${run[0]}-${run[run.length - 1]}`,
        label: '其他',
        chapterStart: run[0],
        chapterEnd: run[run.length - 1],
        scenes: [],
        chapters: run.map((index) => ({ ...byIndex.get(index) }))
      });
    }
  }
  groups.sort((a, b) => a.chapterStart - b.chapterStart || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { groups };
}

// 人物索引（0.9.0 方案 A，派生视图零 AI）：人物 → 出现过的章节数组 + 各章事件。
// 写正文时按目标章上下文相关人物取“截止位置之前最近事件”注入，保持人物一致性。
export function buildCharacterIndex(book) {
  const index = {};
  (book.chapters || []).forEach((chapter, chapterIndex) => {
    (chapter.events || []).forEach((event) => {
      (event.characters || []).forEach((name) => {
        const key = String(name).trim();
        if (!key) return;
        if (!index[key]) index[key] = { chapters: [], events: {} };
        if (!index[key].chapters.includes(chapterIndex)) index[key].chapters.push(chapterIndex);
        if (!index[key].events[chapterIndex]) index[key].events[chapterIndex] = [];
        const text = String(event.event || '').trim();
        if (text && !index[key].events[chapterIndex].includes(text)) index[key].events[chapterIndex].push(text);
      });
    });
  });
  return index;
}
