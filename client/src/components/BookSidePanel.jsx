import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ChapterEditor from './ChapterEditor.jsx';
import ChapterDirectory from './ChapterDirectory.jsx';
import RelationGraph from './RelationGraph.jsx';
import DevelopmentLineView from './DevelopmentLineView.jsx';
import ConfirmModal from './ConfirmModal.jsx';

export default function BookSidePanel({ bookId, onClose, onBack, openChapter, refreshSignal }) {
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState('');
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [relationsError, setRelationsError] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [timelineTick, setTimelineTick] = useState(0);
  const [orientation, setOrientation] = useState('vertical');
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedScene, setExpandedScene] = useState(null);
  const [developmentLineView, setDevelopmentLineView] = useState({ x: 0, y: 0, scale: 1 });
  const [deleteChapterTarget, setDeleteChapterTarget] = useState(null);
  const [deleteChapterError, setDeleteChapterError] = useState('');
  const [aiEditedToast, setAiEditedToast] = useState(false);
  const prevBookRef = useRef(null);
  const chapterIndexRef = useRef(0);
  const aiToastTimerRef = useRef(null);
  const editingDirtyRef = useRef(false);
  const lastOpenChapterRef = useRef(null);

  async function commitAddChapter(title) {
    if (!book || !title) return;
    try {
      const data = await api(`/books/${book.id}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ title, version: book.version })
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
    let active = true;
    api(`/books/${bookId}`)
      .then((data) => {
        if (!active) return;
        const next = data.book;
        setBook(next);
        const prev = prevBookRef.current;
        if (prev && prev !== next && Array.isArray(next.chapters)) {
          const index = chapterIndexRef.current;
          const prevChapter = prev.chapters?.[index];
          const nextChapter = next.chapters?.[index];
          // 仅在用户正编辑该章且有未保存草稿时提示覆盖风险；只是查看/选中不提示
          if (editingDirtyRef.current && prevChapter && nextChapter && (prevChapter.title !== nextChapter.title || prevChapter.content !== nextChapter.content)) {
            setAiEditedToast(true);
            clearTimeout(aiToastTimerRef.current);
            aiToastTimerRef.current = setTimeout(() => setAiEditedToast(false), 3000);
          }
        }
        prevBookRef.current = next;
      })
      .catch((err) => setError(err.message));
    return () => { active = false; };
  }, [bookId, refreshSignal]);

  useEffect(() => {
    chapterIndexRef.current = chapterIndex;
  }, [chapterIndex]);

  useEffect(() => {
    api('/settings')
      .then((data) => {
        setOrientation(data.settings?.developmentLineOrientation === 'horizontal' ? 'horizontal' : 'vertical');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // 仅在外部指定章节（openChapter）变化时定位；自动刷新导致 book 变化不重置当前查看位置
    if (book && Number.isInteger(openChapter) && openChapter >= 1 && openChapter <= book.chapters.length && lastOpenChapterRef.current !== openChapter) {
      lastOpenChapterRef.current = openChapter;
      setChapterIndex(openChapter - 1);
    }
  }, [book, openChapter]);

  useEffect(() => {
    if (tab !== 'timeline') return;
    setTimelineLoading(true);
    setTimelineError('');
    api(`/books/${bookId}/development-line`)
      .then((data) => {
        setTimeline(data.developmentLine);
      })
      .catch((err) => setTimelineError(err.message))
      .finally(() => setTimelineLoading(false));
    // book.updatedAt 覆盖手动编辑→POST /summary 改 events 但不改章数的陈旧场景；
    // timelineTick 供“刷新发展线”按钮手动重新拉取（派生视图，零 AI 成本）。
  }, [tab, bookId, book?.chapters?.length, book?.updatedAt, refreshSignal, timelineTick]);

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
    try {
      const data = await api(`/books/${book.id}/chapters/${chapter.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...patch, version: book.version })
      });
      setBook(data.book);
    } catch (err) {
      // 乐观锁冲突：提示并刷新最新内容，保留编辑中的草稿供重新保存
      if (/内容已更新/.test(String(err.message))) {
        setError(`${err.message}（已为你刷新最新内容，请确认后重新保存）`);
        api(`/books/${book.id}`).then((data) => setBook(data.book)).catch(() => {});
      }
      throw err;
    }
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
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>发展线</button>
        <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关系网</button>
      </div>
      {tab === 'content' ? (
        <div className="book-content">
                    <ChapterDirectory
            chapters={book.chapters}
            chapterIndex={chapterIndex}
            onSelect={setChapterIndex}
            onDelete={setDeleteChapterTarget}
            onAdd={commitAddChapter}
            deleteError={deleteChapterError}
          />
          <div className="chapter-editor-area">
            {chapter ? (
              <ChapterEditor
                key={chapter.id}
                chapter={chapter}
                onSave={saveChapter}
                onCommit={commitSummary}
                onDirtyChange={(dirty) => { editingDirtyRef.current = dirty; }}
              />
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
          {timelineLoading && <p className="muted">正在加载发展线…</p>}
          {timelineError && <p className="form-error">{timelineError}</p>}
          {!timelineLoading && timeline && (
            <DevelopmentLineView
              timeline={timeline}
              orientation={orientation}
              expandedGroup={expandedGroup}
              expandedScene={expandedScene}
              onToggleGroup={(label) => setExpandedGroup((prev) => (prev === label ? null : label))}
              onToggleScene={(label) => setExpandedScene((prev) => (prev === label ? null : label))}
              onOpenChapter={(index) => {
                setTab('content');
                setChapterIndex(index);
              }}
              view={developmentLineView}
              onViewChange={setDevelopmentLineView}
            />
          )}
          {!timelineLoading && (
            <button className="primary" onClick={() => setTimelineTick((value) => value + 1)}>刷新发展线</button>
          )}
        </div>
      )}
      <ConfirmModal
        open={Boolean(deleteChapterTarget)}
        title="删除章节"
        message={`删除《${deleteChapterTarget?.title || ''}》不会进入回收站且不可恢复；删除中间章会造成章节内容断层，如非必要请改写而非删除中间章；删除尾章不影响已有章节。确定删除吗？`}
        confirmText="删除"
        onConfirm={confirmDeleteChapter}
        onCancel={() => setDeleteChapterTarget(null)}
      />
      {aiEditedToast && (
        <div className="toast-layer">
          <div className="saved-toast">本章已被 AI 修改，保存后将以你的最后状态覆盖 AI 的修改。</div>
        </div>
      )}
    </aside>
  );
}
