import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ChatPanel from '../components/ChatPanel.jsx';
import BookSidePanel from '../components/BookSidePanel.jsx';

const STORAGE_KEY = 'novel_selected_book';

export default function WorkspacePage() {
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [sideBookId, setSideBookId] = useState('');
  const [error, setError] = useState('');

  async function loadBooks() {
    const data = await api('/books');
    setBooks(data.books);
    return data.books;
  }

  useEffect(() => {
    loadBooks()
      .then((list) => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && list.some((item) => item.id === stored)) {
          setSelectedBookId(stored);
        } else if (list.length > 0) {
          setSelectedBookId(list[list.length - 1].id);
          localStorage.setItem(STORAGE_KEY, list[list.length - 1].id);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  function chooseBook(id) {
    setSelectedBookId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setSideBookId('');
  }

  async function createNew() {
    try {
      const data = await api('/chat/sessions', { method: 'POST', body: '{}' });
      await loadBooks();
      chooseBook(data.book.id);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleSelect(value) {
    if (value === 'new') createNew();
    else chooseBook(value);
  }

  return (
    <section className="workspace">
      <div className="workspace-top">
        <h2>创作工作台</h2>
        <select value={selectedBookId} onChange={(e) => handleSelect(e.target.value)}>
          <option value="">选择书籍或开始新创作</option>
          <option value="new">＋ 新创作</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.status === 'draft' ? `${book.title}（创作中）` : book.title}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!selectedBookId && (
        <div className="workspace-empty">
          <p className="muted">从一本新书开始，或选择历史图书继续创作。</p>
          <button className="primary" onClick={createNew}>开始创作</button>
        </div>
      )}
      {selectedBookId && (
        <div className={sideBookId ? 'workspace-split' : 'workspace-chat'}>
          <ChatPanel bookId={selectedBookId} onOpenBook={setSideBookId} />
          {sideBookId && <BookSidePanel bookId={sideBookId} onClose={() => setSideBookId('')} />}
        </div>
      )}
    </section>
  );
}
