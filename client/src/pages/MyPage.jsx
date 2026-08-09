import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import BookList from '../components/BookList.jsx';

export default function MyPage() {
  const [books, setBooks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/books').then((data) => setBooks(data.books)).catch((err) => setError(err.message));
  }, []);

  async function handleDelete(book) {
    if (!window.confirm(`确定删除《${book.title}》吗？可在设置回收站中恢复。`)) return;
    try {
      await api(`/books/${book.id}`, { method: 'DELETE' });
      setBooks((list) => list.filter((item) => item.id !== book.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>我的</h2>
        <Link to="/settings" className="link-button">设置</Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      <BookList books={books.filter((book) => book.status !== 'draft')} onDelete={handleDelete} />
    </section>
  );
}
