import { useStack } from './OverlayStack.jsx';

export default function BookShelf({ books }) {
  const { open } = useStack();
  if (books.length === 0) return <p className="muted">书架空空如也，去“创作”写一本吧。</p>;
  return (
    <div className="shelf-grid">
      {books.map((book) => (
        <button key={book.id} className="shelf-book" onClick={() => open({ bookId: book.id, chapter: 1 })}>
          <span className="shelf-book-cover">
            {book.cover ? <img src={book.cover} alt={book.title} /> : <span className="shelf-book-fallback">{book.title?.[0] || '书'}</span>}
          </span>
          <span className="shelf-book-title">{book.title}</span>
        </button>
      ))}
    </div>
  );
}
