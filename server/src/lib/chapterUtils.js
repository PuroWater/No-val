// 输出规模收敛：非有限值回退 fallback，越界夹取到 [min, max]。
export function clampOutput(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function chineseNumberToInt(text) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let current = 0;
  for (const ch of String(text)) {
    if (ch in digits) {
      current = digits[ch];
    } else if (ch in units) {
      const unit = units[ch];
      const value = current === 0 ? 1 : current;
      current = 0;
      if (unit === 10000) {
        // “万”用当前节（或单位前的数字）整体放大：二十万=20*10000
        total += (section > 0 ? section : value) * unit;
        section = 0;
      } else {
        section += value * unit;
      }
    }
  }
  return total + section + current;
}

// 章节数字提取：阿拉伯数字直接转，汉字数字走 chineseNumberToInt。
function chapterDigit(raw) {
  const t = String(raw || '').trim();
  return /^\d+$/.test(t) ? Number(t) : chineseNumberToInt(t);
}

// 章节/数字指代确定性转阿拉伯数字：“第一章/第1章/1/二十万” → 1 / 1 / 1 / 200000。
// 无法转换返回 null（交由 schema 校验拒绝），不猜测。
export function parseChapterNumber(text) {
  const t = String(text || '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  const chapter = t.match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章$/);
  if (chapter) return chapterDigit(chapter[1]);
  if (/^[零一二两三四五六七八九十百千万]+$/.test(t)) return chineseNumberToInt(t);
  return null;
}

// 章节指代文本归一化为 read 工具要求的数字/范围格式：“第一章”→"1"，“第3到8章”→"3-8"。
// 用于 xChapterRef 字符串参数（如 read_book.target），消除对模型自律转换的依赖。
export function normalizeChapterTarget(text) {
  const t = String(text || '').trim();
  if (/^\d+(\s*[-~—]\s*\d+)?$/.test(t)) return t.replace(/\s+/g, '');
  const single = t.match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章$/);
  if (single) return String(chineseNumberToInt(single[1]));
  const range = t.match(/^第?\s*([0-9零一二两三四五六七八九十百千]+)\s*章?\s*(?:到|至|~|—|-)\s*第?\s*([0-9零一二两三四五六七八九十百千]+)\s*章?$/);
  if (range) {
    const from = chapterDigit(range[1]);
    const to = chapterDigit(range[2]);
    return `${Math.min(from, to)}-${Math.max(from, to)}`;
  }
  return t;
}

export function intToChinese(number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const n = Math.max(1, Math.floor(number));
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? '十' : `十${digits[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ''}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${digits[hundreds]}百${rest ? (rest < 10 ? `零${digits[rest]}` : intToChinese(rest)) : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${digits[thousands]}千${rest ? (rest < 100 ? `零${intToChinese(rest)}` : intToChinese(rest)) : ''}`;
}

export function ensureChapterTitle(index, title) {
  const text = String(title || '').trim();
  if (/^第\s*(\d+|[零一二两三四五六七八九十百千]+)\s*章/.test(text)) return text;
  return `第${index + 1}章 ${text}`.trim();
}

export function isLastChapter(book, chapterId) {
  const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
  const last = chapters[chapters.length - 1];
  return Boolean(last && last.id === chapterId);
}

export function fixChapterPrefixes(book, format, changeLog = new Set()) {
  let count = 0;
  book.chapters.forEach((chapter, index) => {
    const original = chapter.title;
    let title = ensureChapterTitle(index, original);
    const prefix = format === 'chinese' ? `第${intToChinese(index + 1)}章` : `第${index + 1}章`;
    title = title.replace(/^第\s*[0-9零一二两三四五六七八九十百千]+\s*章/, prefix);
    if (title !== original) {
      chapter.title = title;
      chapter.updatedAt = new Date().toISOString();
      changeLog.add(chapter.id);
      count += 1;
    }
  });
  return count;
}

// 从受影响位置起重排标准前缀：仅处理符合“第X章”格式的章节（跳过非标准标题），
// 用于插入/删除中间章后自动同步章节编号；fromIndex 之后的章节逐个校准。
// collect 传入 Set 时收集被改动章节 id，供上层 changeLog 写回（避免重排结果丢失）。
export function renumberChapterPrefixes(book, { fromIndex = 0, collect } = {}) {
  const chapters = Array.isArray(book?.chapters) ? book.chapters : [];
  let count = 0;
  for (let index = Math.max(0, Number(fromIndex) || 0); index < chapters.length; index += 1) {
    const chapter = chapters[index];
    const original = String(chapter?.title || '').trim();
    if (!original) continue;
    const matched = original.match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
    if (!matched) continue;
    const rest = original.slice(matched[0].length);
    const nextTitle = `第${index + 1}章${rest}`.trim();
    if (nextTitle !== original) {
      chapter.title = nextTitle;
      if (collect && typeof collect.add === 'function') collect.add(chapter.id);
      count += 1;
    }
  }
  return count;
}

export function replaceTextInBook(book, from, to, changeLog = new Set()) {
  const source = String(from || '');
  const target = String(to ?? '');
  if (!source) return 0;
  let count = 0;
  const replaceIn = (value) => {
    if (typeof value !== 'string' || !value.includes(source)) return value;
    count += value.split(source).length - 1;
    return value.split(source).join(target);
  };
  for (const field of ['title', 'outline', 'storySummary']) {
    book[field] = replaceIn(book[field]);
  }
  if (book.draft) {
    for (const field of ['concept', 'summary']) {
      book.draft[field] = replaceIn(book.draft[field]);
    }
  }
  book.chapters.forEach((chapter) => {
    let changed = false;
    for (const field of ['title', 'content', 'summary']) {
      const value = replaceIn(chapter[field]);
      if (value !== chapter[field]) {
        chapter[field] = value;
        changed = true;
      }
    }
    if (Array.isArray(chapter.events)) {
      for (const item of chapter.events) {
        const event = replaceIn(item.event);
        if (event !== item.event) {
          item.event = event;
          changed = true;
        }
        if (Array.isArray(item.characters)) {
          const characters = item.characters.map((name) => replaceIn(String(name)));
          if (characters.some((name, index) => name !== item.characters[index])) {
            item.characters = characters;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      chapter.updatedAt = new Date().toISOString();
      changeLog.add(chapter.id);
    }
  });
  return count;
}
