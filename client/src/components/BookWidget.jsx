import { Link } from 'react-router-dom';

export default function BookWidget({ book, onOpen }) {
  return (
    <div className="book-widget">
      <div className="book-widget-cover">书</div>
      <div className="book-widget-info">
        <strong>{book.title}</strong>
        <span>{book.status === 'ready' ? `${book.chapters.length} 章` : '创作中'}</span>
      </div>
      <button className="primary" onClick={() => onOpen(book.id)}>打开并列窗口</button>
      <Link to={`/books/${book.id}`} className="link-button">详情</Link>
    </div>
  );
}
