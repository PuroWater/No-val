import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ChatPanel from '../components/ChatPanel.jsx';
import BookSidePanel from '../components/BookSidePanel.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

const STORAGE_KEY = 'novel_selected_book';
const NEW_SESSION = '__new__';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function WorkspacePage() {
  const [sideRefresh, setSideRefresh] = useState(0);
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [sideBookId, setSideBookId] = useState('');
  const [sideChapter, setSideChapter] = useState(1);
  const [leftWidth, setLeftWidth] = useState(420);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');
  const [bookQuery, setBookQuery] = useState('');

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

  function toggleSide() {
    toggleSideFor(selectedBookId);
  }

  function toggleSideFor(bookId, chapter = 1) {
    if (sideBookId === bookId) {
      setSideBookId('');
      return;
    }
    const container = document.querySelector('.workspace-body');
    const width = container?.clientWidth || window.innerWidth;
    setLeftWidth(Math.max(260, Math.floor(width / 2)));
    setSideChapter(Math.max(1, Number(chapter) || 1));
    setSideBookId(bookId);
  }

  // 卡片“并列查看”按钮：始终打开/定位，不做切换关闭（右上角按钮才是切换）
  function openSideFor(bookId, chapter = 1) {
    const container = document.querySelector('.workspace-body');
    const width = container?.clientWidth || window.innerWidth;
    setLeftWidth(Math.max(260, Math.floor(width / 2)));
    setSideChapter(Math.max(1, Number(chapter) || 1));
    setSideBookId(bookId);
  }

  function notifyBookChanged() {
    setSideRefresh((value) => value + 1);
  }

  function startResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = leftWidth;
    const container = document.querySelector('.workspace-body');
    const containerWidth = container?.clientWidth || window.innerWidth;
    // 左栏最少保留 1/3，右侧聊天区最少保留 1/3，避免拖太右导致聊天框挤压变形。
    const minWidth = Math.max(260, Math.floor(containerWidth / 3));
    const maxWidth = Math.max(minWidth, Math.floor((containerWidth * 2) / 3));
    // 拖动期间禁止选中两侧文本，避免拖拽时出现蓝色选区。
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const onMove = (moveEvent) => {
      setLeftWidth(clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth));
    };
    const onUp = () => {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/books/${deleteTarget.id}`, { method: 'DELETE' });
      await loadBooks();
      if (selectedBookId === deleteTarget.id) {
        setSelectedBookId('');
        localStorage.removeItem(STORAGE_KEY);
        setSideBookId('');
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  }

  const query = bookQuery.trim().toLowerCase();
  const matchesQuery = (book) => !query || book.title.toLowerCase().includes(query);
  const drafts = books.filter((book) => book.status === 'draft').filter(matchesQuery);
  const readyBooks = books.filter((book) => book.status === 'ready').filter(matchesQuery);

  return (
    <section className="workspace">
      {error && <p className="form-error">{error}</p>}
      <div className={`workspace-body${sideBookId ? ' side-open' : ''}`}>
        <aside className="book-directory">
          <input
            className="directory-search"
            placeholder="搜索书名 / 构思…"
            value={bookQuery}
            onChange={(e) => setBookQuery(e.target.value)}
          />
          <button
            className={`directory-item new ${selectedBookId === NEW_SESSION ? 'active' : ''}`}
            onClick={startNew}
          >
            <span className="directory-label">新创作</span>
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
                  <span className="directory-label">{book.title}</span>
                  <span className="directory-delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(book); }}>删除</span>
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
                  <span className="directory-label">{book.title}</span>
                  <span className="directory-delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(book); }}>删除</span>
                </button>
              ))}
            </div>
          )}
          {books.length === 0 && <p className="muted">还没有图书，点击“新创作”开始。</p>}
        </aside>
        <div className="workspace-main">
          {!selectedBookId && (
            <div className="workspace-empty">
              <p className="muted">从左侧选择一本图书，或点击“新创作”。</p>
              <button className="primary" onClick={startNew}>开始创作</button>
            </div>
          )}
          {selectedBookId === NEW_SESSION && (
            <ChatPanel key="__new__" bookId="" onSessionCreated={handleSessionCreated} />
          )}
          {selectedBookId && selectedBookId !== NEW_SESSION && (
            <div
              className={sideBookId ? 'workspace-split' : 'workspace-chat'}
              style={sideBookId ? { gridTemplateColumns: `${leftWidth}px 6px minmax(0, 1fr)` } : undefined}
            >
              {sideBookId ? (
                <>
                  <BookSidePanel bookId={sideBookId} openChapter={sideChapter} refreshSignal={sideRefresh} onClose={toggleSide} />
                  <div className="split-divider" onPointerDown={startResize} />
                  <ChatPanel
                    key={selectedBookId}
                    bookId={selectedBookId}
                    sideOpen={Boolean(sideBookId)}
                    onToggleSide={toggleSide}
                    onOpenBook={openSideFor}
                    onBookChanged={notifyBookChanged}
                  />
                </>
              ) : (
                <ChatPanel
                  key={selectedBookId}
                  bookId={selectedBookId}
                  sideOpen={false}
                  onToggleSide={toggleSide}
                  onOpenBook={openSideFor}
                  onBookChanged={notifyBookChanged}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="删除确认"
        message={`确定删除“${deleteTarget?.title || ''}”吗？可在设置回收站中恢复。`}
        confirmText="删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
