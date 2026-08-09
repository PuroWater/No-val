import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ChatPanel from '../components/ChatPanel.jsx';
import BookSidePanel from '../components/BookSidePanel.jsx';

const STORAGE_KEY = 'novel_selected_book';
const NEW_SESSION = '__new__';

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
        if (stored === NEW_SESSION) {
          setSelectedBookId(NEW_SESSION);
        } else if (stored && list.some((item) => item.id === stored)) {
          setSelectedBookId(stored);
        } else if (list.length > 0) {
          const last = list[list.length - 1];
          setSelectedBookId(last.id);
          localStorage.setItem(STORAGE_KEY, last.id);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  function startNew() {
    setSelectedBookId(NEW_SESSION);
    localStorage.setItem(STORAGE_KEY, NEW_SESSION);
    setSideBookId('');
  }

  function chooseBook(id) {
    setSelectedBookId(id);
    localStorage.setItem(STORAGE_KEY, id);
    setSideBookId('');
  }

  function handleSessionCreated(book) {
    loadBooks()
      .then(() => chooseBook(book.id))
      .catch((err) => setError(err.message));
  }

  return (
    <section className="workspace">
      <div className="workspace-top">
        <h2>创作工作台</h2>
        <div className="workspace-actions">
          <button className="primary" onClick={startNew}>＋ 新创作</button>
          <select
            value={selectedBookId === NEW_SESSION ? '' : selectedBookId}
            onChange={(e) => {
              if (e.target.value) chooseBook(e.target.value);
            }}
          >
            <option value="">选择历史图书</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.status === 'draft' ? `${book.title}（创作中）` : book.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!selectedBookId && (
        <div className="workspace-empty">
          <p className="muted">从一本新书开始，或选择历史图书继续创作。</p>
          <button className="primary" onClick={startNew}>开始创作</button>
        </div>
      )}
      {selectedBookId === NEW_SESSION && (
        <ChatPanel bookId="" onSessionCreated={handleSessionCreated} />
      )}
      {selectedBookId && selectedBookId !== NEW_SESSION && (
        <div className={sideBookId ? 'workspace-split' : 'workspace-chat'}>
          <ChatPanel bookId={selectedBookId} onOpenBook={setSideBookId} />
          {sideBookId && <BookSidePanel bookId={sideBookId} onClose={() => setSideBookId('')} />}
        </div>
      )}
    </section>
  );
}
