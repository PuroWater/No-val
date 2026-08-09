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

  return (
    <section className="page">
      <div className="page-head">
        <h2>我的</h2>
        <Link to="/settings" className="link-button">设置</Link>
      </div>
      {error && <p className="form-error">{error}</p>}
      <BookList books={books.filter((book) => book.status !== 'draft')} />
    </section>
  );
}
