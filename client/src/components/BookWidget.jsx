import { useStack } from './OverlayStack.jsx';

export default function BookWidget({ book, onOpen, active = false, chapter = 1 }) {
  const { open } = useStack();
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
      <button className="link-button" onClick={() => open({ bookId: book.id, chapter })}>详情</button>
    </div>
  );
}
