import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ChapterEditor from './ChapterEditor.jsx';
import RelationGraph from './RelationGraph.jsx';

export default function BookSidePanel({ bookId, onClose }) {
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState('');
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationsError, setRelationsError] = useState('');

  useEffect(() => {
    api(`/books/${bookId}`).then((data) => setBook(data.book)).catch((err) => setError(err.message));
  }, [bookId]);

  async function regenerateRelations() {
    setRelationsLoading(true);
    setRelationsError('');
    try {
      const data = await api(`/books/${book.id}/relations`, { method: 'POST' });
      setBook(data.book);
    } catch (err) {
      setRelationsError(err.message);
    } finally {
      setRelationsLoading(false);
    }
  }

  if (error) return <aside className="book-side-panel"><p className="form-error">{error}</p></aside>;
  if (!book) return <aside className="book-side-panel"><p className="muted">加载中…</p></aside>;

  const chapter = book.chapters[chapterIndex];

  async function saveChapter(patch) {
    const data = await api(`/books/${book.id}/chapters/${chapter.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    setBook(data.book);
  }

  async function commitSummary() {
    if (!chapter) return;
    try {
      const data = await api(`/books/${book.id}/chapters/${chapter.id}/summary`, { method: 'POST' });
      setBook(data.book);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <aside className="book-side-panel">
      <div className="side-panel-head">
        <div>
          <h3>{book.title}</h3>
          <p className="muted">{book.outline}</p>
        </div>
        {onClose && <button className="close-button" onClick={onClose}>关闭</button>}
      </div>
      <div className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>内容</button>
        <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关系网</button>
      </div>
      {tab === 'content' ? (
        <div className="book-content">
          <aside className="chapter-directory">
            {book.chapters.map((item, index) => (
              <button
                key={item.id}
                className={`directory-item ${chapterIndex === index ? 'active' : ''}`}
                onClick={() => setChapterIndex(index)}
              >
                {item.title}
              </button>
            ))}
            {book.chapters.length === 0 && <p className="muted">暂无章节</p>}
          </aside>
          <div className="chapter-editor-area">
            {chapter ? (
              <ChapterEditor key={chapter.id} chapter={chapter} onSave={saveChapter} onCommit={commitSummary} />
            ) : (
              <p className="muted">这本书还在构思中，生成后可以在这里编辑。</p>
            )}
          </div>
        </div>
      ) : (
        <div className="relation-tab">
          {relationsLoading && <p className="muted">正在生成关系网…</p>}
          {relationsError && <p className="form-error">{relationsError}</p>}
          <RelationGraph relations={book.relations} />
          {!relationsLoading && (
            <button className="primary" onClick={regenerateRelations}>重新生成关系网</button>
          )}
        </div>
      )}
    </aside>
  );
}
