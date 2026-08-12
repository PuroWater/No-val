import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ChapterEditor from './ChapterEditor.jsx';
import RelationGraph from './RelationGraph.jsx';
import ConfirmModal from './ConfirmModal.jsx';

export default function BookSidePanel({ bookId, onClose, onBack, openChapter, refreshSignal }) {
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterQuery, setChapterQuery] = useState('');
  const [error, setError] = useState('');
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationsError, setRelationsError] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(() => new Set());
  const [addingChapter, setAddingChapter] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteChapterTarget, setDeleteChapterTarget] = useState(null);
  const [deleteChapterError, setDeleteChapterError] = useState('');
  const directoryRef = useRef(null);
  const addInputRef = useRef(null);

  function intToChinese(number) {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const n = Math.max(1, Math.floor(number));
    if (n < 10) return digits[n];
    if (n < 20) return n === 10 ? '十' : `十${digits[n - 10]}`;
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      return `${digits[tens]}十${ones ? digits[ones] : ''}`;
    }
    return `${digits[Math.floor(n / 100)]}百`;
  }

  function nextChapterPrefix(bookRef) {
    const chapters = bookRef?.chapters || [];
    const last = chapters[chapters.length - 1];
    if (!last) return '';
    const match = String(last.title).match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
    if (!match) return '';
    const chinese = /[零一二两三四五六七八九十百千]/.test(match[1]);
    return chinese ? `第${intToChinese(chapters.length + 1)}章 ` : `第${chapters.length + 1}章 `;
  }

  function startAddChapter() {
    setNewTitle(nextChapterPrefix(book));
    setAddingChapter(true);
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  // 提取章节名部分：去掉“第n章”前缀（含冒号/空格），只剩“第n章”时返回空。
  function chapterNamePart(raw) {
    const match = raw.match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章[\s:：]*/);
    return match ? raw.slice(match[0].length).trim() : raw.trim();
  }

  async function commitAddChapter() {
    const raw = newTitle.trim();
    setAddingChapter(false);
    setNewTitle('');
    if (!book || !raw) return;
    // 只输入了自动生成的“第n章”前缀、没有实际章节名时不新建。
    if (!chapterNamePart(raw)) return;
    try {
      const data = await api(`/books/${book.id}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ title: raw })
      });
      setBook(data.book);
      setChapterIndex(data.book.chapters.length - 1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirmDeleteChapter() {
    if (!deleteChapterTarget || !book) return;
    setDeleteChapterError('');
    // 先本地移除条目并定位到第一章，避免等待接口导致卡顿或整页空白
    setBook((prev) => (
      prev
        ? { ...prev, chapters: prev.chapters.filter((item) => item.id !== deleteChapterTarget.id) }
        : prev
    ));
    setChapterIndex(0);
    setDeleteChapterTarget(null);
    try {
      const data = await api(`/books/${book.id}/chapters/${deleteChapterTarget.id}`, { method: 'DELETE' });
      setBook(data.book);
      setChapterIndex(0);
    } catch (err) {
      setDeleteChapterError(err.message);
      // 删除失败回滚：重新拉取最新书籍状态，避免乐观移除后界面与后端不一致
      api(`/books/${book.id}`).then((data) => setBook(data.book)).catch(() => {});
    }
  }

  useEffect(() => {
    api(`/books/${bookId}`).then((data) => setBook(data.book)).catch((err) => setError(err.message));
  }, [bookId, refreshSignal]);

  useEffect(() => {
    if (book && Number.isInteger(openChapter) && openChapter >= 1 && openChapter <= book.chapters.length) {
      setChapterIndex(openChapter - 1);
    }
  }, [book, openChapter]);

  useEffect(() => {
    if (tab !== 'timeline') return;
    setTimelineLoading(true);
    setTimelineError('');
    api(`/books/${bookId}/timeline`)
      .then((data) => {
        setTimeline(data.timeline);
        setTimelineOpen(new Set(data.timeline.map((item) => item.chapterIndex)));
      })
      .catch((err) => setTimelineError(err.message))
      .finally(() => setTimelineLoading(false));
  }, [tab, bookId, book?.chapters?.length]);

  useEffect(() => {
    if (!book) return undefined;
    const timer = setTimeout(() => {
      directoryRef.current?.querySelector('.directory-item.active')?.scrollIntoView({ block: 'nearest' });
    }, 0);
    return () => clearTimeout(timer);
  }, [book, openChapter, chapterIndex]);

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

  function toggleTimelineChapter(index) {
    setTimelineOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (error) return <aside className="book-side-panel"><p className="form-error">{error}</p></aside>;
  if (!book) return <aside className="book-side-panel"><p className="muted">加载中…</p></aside>;

  const chapter = book.chapters[chapterIndex];
  const chapterQueryText = chapterQuery.trim().toLowerCase();
  const filteredChapters = book.chapters.filter((item, index) => (
    !chapterQueryText
    || item.title.toLowerCase().includes(chapterQueryText)
    || String(index + 1).includes(chapterQueryText)
  ));

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
        <div className="side-panel-title-row">
          <h3>{book.title}</h3>
          {(onClose || onBack) && (
            <button className="close-button" onClick={onBack || onClose}>
              {onBack ? '返回' : '关闭'}
            </button>
          )}
        </div>
        <p className="muted">{book.outline}</p>
      </div>
      <div className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>内容</button>
        <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关系网</button>
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>时间线</button>
      </div>
      {tab === 'content' ? (
        <div className="book-content">
          <aside className="chapter-directory" ref={directoryRef}>
            <input
              className="directory-search"
              placeholder="搜索章节…"
              value={chapterQuery}
              onChange={(e) => setChapterQuery(e.target.value)}
            />
            {filteredChapters.map((item, index) => (
              <button
                key={item.id}
                className={`directory-item ${chapterIndex === book.chapters.indexOf(item) ? 'active' : ''}`}
                onClick={() => setChapterIndex(book.chapters.indexOf(item))}
              >
                <span className="directory-label">{item.title}</span>
                {book.chapters.length > 1 && (
                  <span
                    className="directory-delete"
                    onClick={(e) => { e.stopPropagation(); setDeleteChapterTarget(item); }}
                  >
                    删除
                  </span>
                )}
              </button>
            ))}
            {book.chapters.length <= 1 && <p className="muted">仅剩 1 章不可删除，删除整书请到「我的」页面。</p>}
            {addingChapter ? (
              <input
                ref={addInputRef}
                className="directory-add-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitAddChapter(); }}
                onBlur={commitAddChapter}
                placeholder="章节名"
              />
            ) : (
              <button className="directory-add-chapter" onClick={startAddChapter}>
                点击添加新章节
              </button>
            )}
            {filteredChapters.length === 0 && <p className="muted">没有匹配的章节</p>}
            {deleteChapterError && <p className="form-error">{deleteChapterError}</p>}
          </aside>
          <div className="chapter-editor-area">
            {chapter ? (
              <ChapterEditor key={chapter.id} chapter={chapter} onSave={saveChapter} onCommit={commitSummary} />
            ) : (
              <p className="muted">这本书还在构思中，生成后可以在这里编辑。</p>
            )}
          </div>
        </div>
      ) : tab === 'relations' ? (
        <div className="relation-tab">
          {relationsLoading && <p className="muted">正在生成关系网…</p>}
          {relationsError && <p className="form-error">{relationsError}</p>}
          <RelationGraph relations={book.relations} />
          {!relationsLoading && (
            <button className="primary" onClick={regenerateRelations}>重新生成关系网</button>
          )}
        </div>
      ) : (
        <div className="relation-tab">
          {timelineLoading && <p className="muted">正在加载时间线…</p>}
          {timelineError && <p className="form-error">{timelineError}</p>}
          {!timelineLoading && timeline && (
            timeline.length === 0 ? (
              <p className="muted">这本书还在构思中，生成章节后这里会按章节展示事件。</p>
            ) : (
              <ol className="timeline-list">
                {timeline.map((item) => {
                  const open = timelineOpen.has(item.chapterIndex);
                  const title = item.chapterTitle || `第${item.chapterIndex + 1}章`;
                  return (
                    <li key={item.chapterId || item.chapterIndex} className="timeline-chapter">
                      <button className="timeline-chapter-head" onClick={() => toggleTimelineChapter(item.chapterIndex)}>
                        <span className="timeline-chapter-title">{title}</span>
                        <span className="timeline-chapter-count">{item.events.length} 个事件</span>
                      </button>
                      {open && (
                        <div className="timeline-events">
                          {item.events.length === 0 ? (
                            <p className="muted timeline-empty">本章暂无事件</p>
                          ) : (
                            item.events.map((event, eventIndex) => (
                              <article key={event.id || `${item.chapterIndex}-${eventIndex}`} className="timeline-event">
                                <p className="timeline-event-text">{event.event}</p>
                                {Array.isArray(event.characters) && event.characters.length > 0 && (
                                  <p className="timeline-event-characters">
                                    {event.characters.map((character, characterIndex) => (
                                      <span key={characterIndex} className="timeline-character">{character}</span>
                                    ))}
                                  </p>
                                )}
                              </article>
                            ))
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )
          )}
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteChapterTarget)}
        title="删除章节"
        message={`删除《${deleteChapterTarget?.title || ''}》不会进入回收站且不可恢复；中间删除会造成剧情断层，概况与事件中的残留不会立即清理，需在后续改写衔接后自动修复，或让 AI 调用 refresh_chapter_meta 立即刷新。确定删除吗？`}
        confirmText="删除"
        onConfirm={confirmDeleteChapter}
        onCancel={() => setDeleteChapterTarget(null)}
      />
    </aside>
  );
}
