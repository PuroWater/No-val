export function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeBook(book) {
  if (!book) return book;
  if (!Array.isArray(book.chapters)) book.chapters = [];
  book.chapters = book.chapters.map((chapter) => ({ summary: '', ...chapter }));
  if (!Array.isArray(book.chat)) book.chat = [];
  if (!book.status) book.status = book.chapters.length > 0 ? 'ready' : 'draft';
  if (!book.draft) book.draft = { concept: '', summary: '' };
  if (!book.relations) book.relations = { nodes: [], edges: [] };
  if (!book.deletedAt) book.deletedAt = null;
  if (!book.storySummary) book.storySummary = '';
  if (!book.rewrite) book.rewrite = { step: 'none', chapterIndex: -1 };
  return book;
}
