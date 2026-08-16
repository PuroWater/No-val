// 章节元数据统一维护内核：章节 summary/event 的新建、更新、清理全部收敛于此（0.8.39 起不再维护全书概况）。
// 输入始终与“变更量”成正比（变更章 + 前后章摘要 + 现有事件），不携带全书 events 列表，长书安全。
// 维护调用关闭思考模式（thinking=disabled）以换取速度。
import { callModel } from '../lib/modelCall.js';
import { resolveThinking } from '../lib/thinking.js';
import { normalizeCharacterSnapshot } from '../lib/bookUtils.js';

function eventId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function cleanEvents(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      id: eventId(),
      event: String(item?.event || '').trim(),
      characters: Array.isArray(item?.characters) ? item.characters.map(String) : [],
      context: Array.isArray(item?.context)
        ? item.context.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 2)
        : []
    }))
    .filter((item) => item.event);
}

// 人物设定卡快照归一化（0.9.6）：结构化快照 { identity, bag, goal, recent }，
// 旧版字符串快照自动迁移；只保留有名字且有实质内容的项（近况/背包/身份/目标任一非空）。
export function normalizeCharacterUpdates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      name: String(item?.name || '').trim(),
      snapshot: normalizeCharacterSnapshot(item?.snapshot)
    }))
    .filter((item) => item.name && (item.snapshot.recent || item.snapshot.identity || item.snapshot.goal || item.snapshot.bag.length > 0));
}

// 已有角色背包参考（0.9.6）：取"本章现有事件 + 前后章事件"涉及的角色，注入其最新一张快照的背包，
// 供维护 AI 携带到新快照——未变化条目原样保留，防"前期获得后期查无音讯"。
function buildOldCharacterRef(book, index, prev, next) {
  const names = new Set();
  const collect = (chapter) => (chapter?.events || []).forEach((ev) => (ev.characters || []).forEach((n) => names.add(String(n).trim())));
  collect(book.chapters?.[index]);
  collect(prev);
  collect(next);
  if (names.size === 0) return '';
  const lines = [];
  (book.characters || []).forEach((card) => {
    if (!names.has(card.name)) return;
    const history = (card.history || []).filter((item) => Number(item.chapter) < index);
    const latest = history[history.length - 1];
    if (!latest || !latest.snapshot) return;
    const s = latest.snapshot;
    const bagText = (s.bag || []).map((b) => (b.status ? `${b.name}（${b.status}）` : b.name)).join('、');
    lines.push(`${card.name}：${bagText || '（无背包）'}`);
  });
  return lines.length > 0 ? `已有角色背包参考（本章未变化的条目请原样保留进新快照）：\n${lines.join('\n')}` : '';
}
// 事件确定性归一化（维护内核通用规则，非单工具补丁）：
// 1) 每章最多 3 个事件（prompt 要求按重要性排序，这里做硬上限）；
// 2) 一章只允许一个主要背景 context[0]：取出现最多的为统一背景，其余事件归入，
//    保留各自 context[1]（场景可不同，大背景唯一）；context 只保留两层（大背景+场景）。
export function normalizeChapterEvents(raw) {
  const events = cleanEvents(raw).slice(0, 3);
  if (events.length === 0) return events;
  const counts = new Map();
  for (const item of events) {
    const label = Array.isArray(item.context) && item.context[0] ? item.context[0] : '';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let dominant = '';
  let max = -1;
  for (const [label, n] of counts) {
    if (n > max) {
      dominant = label;
      max = n;
    }
  }
  return events.map((item) => ({
    ...item,
    context: dominant
      ? [dominant, ...(Array.isArray(item.context) ? item.context.slice(1, 2) : [])]
      : []
  }));
}

function chapterEventsText(chapter) {
  const items = Array.isArray(chapter?.events) ? chapter.events.slice(0, 5) : [];
  if (items.length === 0) return '';
  return items
    .map((item) => {
      const ctx = Array.isArray(item.context) && item.context.length > 0 ? `（${item.context.join('/')}）` : '';
      return `${item.event}${ctx}`;
    })
    .join('；');
}

// 单章维护：一次关思考调用产出 新 summary + events，原子写入（0.8.39 起不再维护全书概况）。
// mode: 'new'（新建章）| 'modify'（改写章）。
export async function maintainChapterMeta(book, { chapterIndex, mode = 'modify', signal, settings = {} } = {}) {
  const index = Number(chapterIndex);
  const chapter = book.chapters[index];
  if (!chapter) throw new Error('章节不存在');
  const prev = index > 0 ? book.chapters[index - 1] : null;
  const next = index < book.chapters.length - 1 ? book.chapters[index + 1] : null;
  const content = String(chapter.content || '').trim();
  if (!content) {
    // 空章不产出无意义摘要/事件：直接落“该章暂无内容”，不走 AI。
    chapter.summary = '该章暂无内容';
    chapter.events = [];
    chapter.updatedAt = new Date().toISOString();
    book.updatedAt = chapter.updatedAt;
    return book;
  }
  const existingEvents = Array.isArray(chapter.events) && chapter.events.length > 0
    ? `该章现有事件：${chapter.events.map((item) => item.event).join('；')}\n`
    : '';
  const prevEvents = prev ? chapterEventsText(prev) : '';
  const nextEvents = next ? chapterEventsText(next) : '';
  const oldCharacterRef = buildOldCharacterRef(book, index, prev, next);
  const user = [
    `目标章节：第 ${index + 1} 章《${chapter.title}》（${mode === 'new' ? '新建' : '改写'}）`,
    prev ? `上一章摘要：${prev.summary || `${prev.title}\n${prev.content.slice(0, 500)}`}` : '',
    next ? `下一章摘要：${next.summary || `${next.title}\n${next.content.slice(0, 500)}`}` : '',
    prevEvents ? `上一章事件：${prevEvents}` : '',
    nextEvents ? `下一章事件：${nextEvents}` : '',
    `章节正文：\n${content.slice(0, 12000)}`,
    existingEvents,
    oldCharacterRef ? `\n${oldCharacterRef}` : '',
    '返回 JSON：{"summary":"本章 80-150 字剧情摘要","events":[{"event":"事件","characters":["人物"],"context":["大背景","场景"]}],"characters":[{"name":"角色名","snapshot":{"identity":"身份/基础（正文明确才写具体值，未明确用模糊总结如实力高强/财力雄厚，约20字，禁止编造）","bag":[{"name":"物品/功法/系统/宝物/资产名","status":"状态/层数/说明（约20字）"}],"goal":"当前目标（约30字）","recent":"本章近况（50字以内）"}}]}。事件规则（分三步）：1) context[0] 为本章主线背景/阶段，一章只允许一个，参考前后章保持一致（如从家族过渡到北境、本章主要是北境则写"北境"）；2) 只选本章正文中最重要的最多 3 个事件（按重要性排序、删除琐碎细节）；3) 每条事件配 context[1] 场景：场景是事件实际发生地点/推进节点，不必地理上属于背景；地点离开大背景地理范围时优先用「大背景/地点」拼合模板（如"家族/藏书阁""家族/矿洞"），在大背景内直接写地点；场景同时体现剧情推进，大背景下场景最多 3 个。其余规则：events 必须能在本章正文中找到依据、不得凭空编造；每条 event 正文 50-100 字；context 只允许两层（大背景+场景）并延续前后章背景；每条事件 context 至少 1 层、不得为空。角色规则：只列本章出现且值得建档的重要角色（主角/重要配角/反派；无关的局部喽啰如无名小妖、路人不要列）；snapshot 为结构化对象：identity 身份/基础（正文明确才写具体值，未明确用模糊总结如"实力高强/财力雄厚/深不可测"，约20字，禁止编造具体功法名/数字/身份细节）、bag 背包条目（name+status，功法·层数/宝物/资产/系统/一次性物品等，题材无关）、goal 当前目标（约30字）、recent 本章近况（50字以内）；背包规则：参考"已有角色背包参考"，输出本章该角色的**完整背包**（保留未变化条目 + 应用本章增/改/删），条目按重要性从高到低排列（核心能力/功法/系统/与当前主线直接相关的物品排最前，次要、装饰性、杂项排最后——主角的逆鳞印记这类核心设定应靠前，不得排到末尾），删除/丢弃/一次性使用必须有正文依据，正文未体现的变化不得臆想；**已消耗/已使用的一次性物品（丹药已吞服、道具已用尽等，状态含"已吞服/已使用/已消耗/已耗尽"）直接从背包移除，不要保留"已吞服"这样的残留条目——背包只放当前仍持有的东西；仍在手中的物品（功法/宝物/资产/系统等）才保留并更新状态**；仅当该角色状态有实质变化（实力突破、身份改变、获得/失去重要物品、重大事件、与主角关系改变）时才给出 snapshot，只是出场对话则不要输出该角色。'
  ].filter(Boolean).join('\n');
  const result = await callModel(
    () => ({
      system: '你是章节元数据维护助手。事件必须来自本章正文内容，不得凭空编造；背景 context 延续前后章事件，同一大事件跨多章时按阶段/地点细化 context（如“秘境探险→藏宝室”），避免整段只有一个粗背景；只返回 JSON，不要包含 Markdown。',
      user,
      temperature: 0.4,
      maxTokens: 16384,
      thinkingType: resolveThinking(settings, 'maintenance') ? 'enabled' : 'disabled'
    }),
    (r) => r && typeof r.summary === 'string' && r.summary.trim()
  );
  chapter.summary = String(result.summary).trim();
  chapter.events = normalizeChapterEvents(result.events);
  // 0.9.0 方案 B：人物设定卡增量维护（只处理本章有重大变化的角色，按章追加历史快照）
  const characterUpdates = normalizeCharacterUpdates(result.characters);
  if (characterUpdates.length > 0) {
    if (!Array.isArray(book.characters)) book.characters = [];
    for (const update of characterUpdates) {
      const existing = book.characters.find((item) => item.name === update.name);
      if (existing) {
        if (!Array.isArray(existing.history)) existing.history = [];
        // 同章已存在快照时替换（重维护不产生重复旧历史）
        const sameChapter = existing.history.findIndex((item) => Number(item.chapter) === index);
        if (sameChapter >= 0) {
          existing.history[sameChapter] = { chapter: index, snapshot: update.snapshot };
        } else {
          existing.history.push({ chapter: index, snapshot: update.snapshot });
        }
      } else {
        book.characters.push({ name: update.name, history: [{ chapter: index, snapshot: update.snapshot }] });
      }
    }
  }
  chapter.updatedAt = new Date().toISOString();
  book.updatedAt = chapter.updatedAt;
  return book;
}

// 新书一次性初始化：输入各章标题+摘要（O(章数)，≤5 章），输出每章 events（0.8.39 起不再生成全书概况）。
// 构思生成独立通道专用，与已生成图书的单章维护内核分离。
export async function initializeBookMeta(book, signal, settings = {}) {
  const chapters = (book.chapters || [])
    .map((chapter, index) => `第 ${index + 1} 章《${chapter.title}》：${chapter.summary || '（无摘要）'}`)
    .join('\n');
  if (!chapters.trim()) return book;
  const result = await callModel(
    () => ({
      system: '你是章节事件初始化助手。只返回 JSON，不要包含 Markdown。',
      user: `根据各章摘要生成每章结构化事件。\n章节：\n${chapters}\n返回 JSON：{"chapters":[{"chapterIndex":0,"events":[{"event":"事件","characters":["人物"],"context":["大背景","场景"]}]}]}。事件规则：事件必须能在对应章节摘要中找到依据；每章只输出最重要的 3 个事件（最多 3 个，按重要性排序）；每条 event 正文 50-100 字（简洁概括事件本身）。背景规则：context[0] 是本章主线背景/阶段（如"家族""北境矿脉之行"），一章只允许一个，参考前后章保持一致；context[1] 是场景：事件实际发生的地点/推进节点，**不必在地理上属于 context[0]**，并体现剧情推进；当事件地点离开大背景地理范围时，**优先用「大背景/地点」拼合模板**（如北境主线章回到家族 → "家族/藏书阁"），地点在大背景内时直接写地点；大背景下场景最多 3 个；context 只允许两层（大背景 + 场景），不要第三层；每条事件都必须给出 context（至少 1 层），不得返回空数组。`,
      temperature: 0.4,
      maxTokens: 16384,
      thinkingType: resolveThinking(settings, 'maintenance') ? 'enabled' : 'disabled'
    }),
    (r) => Array.isArray(r?.chapters)
  );
  const byIndex = new Map(
    (Array.isArray(result.chapters) ? result.chapters : [])
      .map((item) => [Number(item.chapterIndex), normalizeChapterEvents(item.events)])
  );
  book.chapters.forEach((chapter, index) => {
    if (byIndex.has(index)) chapter.events = byIndex.get(index);
  });
  book.updatedAt = new Date().toISOString();
  return book;
}
