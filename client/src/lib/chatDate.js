function toValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toValidDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRanges(book = {}) {
  const byDate = new Map();
  const touch = (date) => {
    if (!date) return;
    if (!byDate.has(date)) byDate.set(date, { start: Infinity, end: 0, modified: [] });
  };
  (book.chat || []).forEach((message) => touch(formatDate(message.createdAt)));
  (book.chapters || []).forEach((chapter, index) => {
    const created = formatDate(chapter.createdAt || chapter.updatedAt);
    const updated = formatDate(chapter.updatedAt);
    touch(created);
    touch(updated);
    if (created && updated && updated !== created) byDate.get(updated).modified.push(index + 1);
    if (created) {
      const info = byDate.get(created);
      info.start = Math.min(info.start, index + 1);
      info.end = Math.max(info.end, index + 1);
    }
  });
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, info]) => {
      const lines = [];
      const modified = [...new Set(info.modified)].sort((a, b) => a - b);
      if (modified.length > 0) lines.push(`修改：第${modified.join('、')}章`);
      if (info.end >= info.start) {
        lines.push(info.start === info.end ? `新增：第${info.start}章` : `新增：第${info.start}-${info.end}章`);
      }
      return { date, lines };
    });
}
