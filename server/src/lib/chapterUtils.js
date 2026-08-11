export function fuzzyScore(title, query) {
  const t = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.includes(q) || q.includes(t)) return 90;
  const setT = new Set(t.split(''));
  const setQ = new Set(q.split(''));
  let overlap = 0;
  for (const ch of setQ) {
    if (setT.has(ch)) overlap += 1;
  }
  return Math.round((overlap / setQ.size) * 60);
}

export function chineseNumberToInt(text) {
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  for (const ch of String(text)) {
    if (ch in digits) {
      current = digits[ch];
    } else if (ch in units) {
      if (current === 0) current = 1;
      total += current * units[ch];
      current = 0;
    }
  }
  return total + current;
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

export function searchChapters(book, text) {
  const value = String(text || '').trim();
  if (!value) return [];
  const chapterMatch = value.match(/(?:第)?\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
  let chapterNumber = 0;
  if (chapterMatch) {
    const raw = chapterMatch[1];
    chapterNumber = /^\d+$/.test(raw) ? Number(raw) : chineseNumberToInt(raw);
  }
  if (!chapterNumber) {
    const numberMatch = value.match(/\d+/);
    if (numberMatch) chapterNumber = Number(numberMatch[0]);
  }
  if (chapterNumber > 0 && book.chapters[chapterNumber - 1]) {
    const index = chapterNumber - 1;
    return [{ index, title: book.chapters[index].title, score: 100 }];
  }
  return book.chapters
    .map((chapter, index) => ({ index, title: chapter.title, score: fuzzyScore(chapter.title, value) }))
    .filter((item) => item.score >= 40)
    .sort((a, b) => b.score - a.score || a.index - b.index);
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
