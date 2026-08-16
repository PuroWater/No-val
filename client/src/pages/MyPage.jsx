import { useEffect, useState } from 'react';
import { api } from '../api.js';
import BookList from '../components/BookList.jsx';
import BookShelf from '../components/BookShelf.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default function MyPage() {
  const [books, setBooks] = useState([]);
  const [tab, setTab] = useState('works');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    api('/books').then((data) => setBooks(data.books)).catch((err) => setError(err.message));
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/books/${deleteTarget.id}`, { method: 'DELETE', body: JSON.stringify({ version: deleteTarget.version }) });
      setBooks((list) => list.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  }

  const readyBooks = books.filter((book) => book.status !== 'draft');

  return (
    <section className="page">
      {error && <p className="form-error">{error}</p>}
      <div className="my-tabs">
        <button className={tab === 'works' ? 'active' : ''} onClick={() => setTab('works')}>作品</button>
        <button className={tab === 'shelf' ? 'active' : ''} onClick={() => setTab('shelf')}>书架</button>
      </div>
      {tab === 'shelf' ? (
        <BookShelf books={readyBooks} />
      ) : (
        <BookList books={readyBooks} onDelete={setDeleteTarget} />
      )}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="删除确认"
        message={`确定删除《${deleteTarget?.title || ''}》吗？可在设置回收站中恢复。`}
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
