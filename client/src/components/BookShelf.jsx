import { useStack } from './OverlayStack.jsx';

function ShelfBooks({ books }) {
  const { open } = useStack();
  if (books.length === 0) return <p className="muted">还没有创作的书，去“创作”开始吧。</p>;
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

export default function BookShelf({ books }) {
  return (
    <div className="shelf-split">
      <section className="shelf-region">
        <h3 className="shelf-region-title">创作</h3>
        <ShelfBooks books={books} />
      </section>
      <section className="shelf-region">
        <h3 className="shelf-region-title">收藏</h3>
        <p className="muted">收藏功能暂未开放，后续可收藏书城的书。</p>
      </section>
    </div>
  );
}
