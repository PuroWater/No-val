import { Link } from 'react-router-dom';

export default function BookList({ books }) {
  if (books.length === 0) return <p className="muted">还没有创作过的书，去“创作”开始吧。</p>;
  return (
    <div className="book-grid">
      {books.map((book) => (
        <Link key={book.id} className="book-card" to={`/books/${book.id}`}>
          <strong>{book.title}</strong>
          <span>{book.chapterCount} 章</span>
          <span className="muted">更新于 {new Date(book.updatedAt).toLocaleString()}</span>
        </Link>
      ))}
    </div>
  );
}
