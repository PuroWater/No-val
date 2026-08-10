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

  async function handleDeleteSelected() {
    if (!selectedBookId || selectedBookId === NEW_SESSION) return;
    const book = books.find((item) => item.id === selectedBookId);
    if (!book) return;
    if (!window.confirm(`确定删除“${book.title}”吗？可在设置回收站中恢复。`)) return;
    try {
      await api(`/books/${selectedBookId}`, { method: 'DELETE' });
      await loadBooks();
      setSelectedBookId('');
      localStorage.removeItem(STORAGE_KEY);
      setSideBookId('');
    } catch (err) {
      setError(err.message);
    }
  }

  const drafts = books.filter((book) => book.status === 'draft');
  const readyBooks = books.filter((book) => book.status === 'ready');

  return (
    <section className="workspace">
      <div className="workspace-top">
        <h2>创作工作台</h2>
        <div className="workspace-actions">
          <button className="primary" onClick={startNew}>＋ 新创作</button>
          {selectedBookId && selectedBookId !== NEW_SESSION && (
            <button className="danger" onClick={handleDeleteSelected}>删除当前</button>
          )}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="workspace-body">
        <aside className="book-directory">
          <button
            className={`directory-item new ${selectedBookId === NEW_SESSION ? 'active' : ''}`}
            onClick={startNew}
          >
            ＋ 新创作
          </button>
          {drafts.length > 0 && (
            <div className="directory-group">
              <span>构思中</span>
              {drafts.map((book) => (
                <button
                  key={book.id}
                  className={`directory-item ${selectedBookId === book.id ? 'active' : ''}`}
                  onClick={() => chooseBook(book.id)}
                >
                  {book.title}
                </button>
              ))}
            </div>
          )}
          {readyBooks.length > 0 && (
            <div className="directory-group">
              <span>已生成图书</span>
              {readyBooks.map((book) => (
                <button
                  key={book.id}
                  className={`directory-item ${selectedBookId === book.id ? 'active' : ''}`}
                  onClick={() => chooseBook(book.id)}
                >
                  {book.title}
                </button>
              ))}
            </div>
          )}
          {books.length === 0 && <p className="muted">还没有图书，点击“＋ 新创作”开始。</p>}
        </aside>
        <div className="workspace-main">
          {!selectedBookId && (
            <div className="workspace-empty">
              <p className="muted">从左侧选择一本图书，或点击“＋ 新创作”。</p>
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
        </div>
      </div>
    </section>
  );
}
