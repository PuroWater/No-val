import { useStack } from './OverlayStack.jsx';

export default function BookWidget({ book, onOpen, chapter = 1 }) {
  const { open } = useStack();
  return (
    <div className="book-widget">
      <div className="book-widget-cover">{book.cover ? <img src={book.cover} alt={book.title} /> : (book.title?.[0] || "书")}</div>
      <div className="book-widget-info">
        <strong>{book.title}</strong>
        <span>{book.status === 'ready' ? `第 ${Math.max(1, Number(chapter) || 1)} 章` : '创作中'}</span>
      </div>
      <div className="book-widget-actions">
        <button
          className="side-toggle"
          onClick={() => onOpen(book.id, chapter)}
        >
          并列查看
        </button>
        <button className="link-button" onClick={() => open({ bookId: book.id, chapter })}>详情</button>
      </div>
    </div>
  );
}
