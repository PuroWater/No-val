import { useEffect, useState } from 'react';
import { api } from '../api.js';
import BookList from '../components/BookList.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default function MyPage() {
  const [books, setBooks] = useState([]);
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

  return (
    <section className="page">
      {error && <p className="form-error">{error}</p>}
      <BookList books={books.filter((book) => book.status !== 'draft')} onDelete={setDeleteTarget} />
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
