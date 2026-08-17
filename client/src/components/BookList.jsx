import { useStack } from './OverlayStack.jsx';

export default function BookList({ books, onDelete }) {
  const { open } = useStack();
  if (books.length === 0) return <p className="muted">还没有创作过的书，去“创作”开始吧。</p>;
  return (
    <div className="book-grid">
      {books.map((book) => (
        <div key={book.id} className="book-card">
          <button className="book-card-link" onClick={() => open({ bookId: book.id, chapter: 1 })}>
            <span className="book-card-cover">
              {book.cover ? <img src={book.cover} alt={book.title} /> : (book.title?.[0] || '书')}
            </span>
            <span className="book-card-meta">
              <strong>{book.title}</strong>
              <span>{book.chapterCount} 章</span>
              <span className="muted">更新于 {new Date(book.updatedAt).toLocaleString()}</span>
            </span>
          </button>
          {onDelete && (
            <button className="book-delete" title="删除" onClick={() => onDelete(book)}>删除</button>
          )}
        </div>
      ))}
    </div>
  );
}
