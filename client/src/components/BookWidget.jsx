import { Link } from 'react-router-dom';

export default function BookWidget({ book, onOpen, active = false, chapter = 1 }) {
  return (
    <div className="book-widget">
      <div className="book-widget-cover">书</div>
      <div className="book-widget-info">
        <strong>{book.title}</strong>
        <span>{book.status === 'ready' ? `${book.chapters.length} 章` : '创作中'}</span>
      </div>
      <button
        className={`side-toggle${active ? ' active' : ''}`}
        onClick={() => onOpen(book.id, chapter)}
      >
        并列查看
      </button>
      <Link to={`/books/${book.id}`} className="link-button">详情</Link>
    </div>
  );
}
