import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ChapterEditor from './ChapterEditor.jsx';
import ChapterDirectory from './ChapterDirectory.jsx';
import CharacterCard from './CharacterCard.jsx';
import CharacterRow from './CharacterRow.jsx';
import WorldSettingsPanel from './WorldSettingsPanel.jsx';
import ModelSelect from './ModelSelect.jsx';
import { useHoverTip, HoverTip } from './TooltipKit.jsx';
import DevelopmentLineView from './DevelopmentLineView.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function BookSidePanel({ bookId, onClose, onBack, openChapter, refreshSignal }) {
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState('');
  const [developmentLine, setDevelopmentLine] = useState(null);
  const [developmentLineLoading, setDevelopmentLineLoading] = useState(false);
  const [developmentLineError, setDevelopmentLineError] = useState('');
  const [developmentLineTick, setDevelopmentLineTick] = useState(0);
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
  const coverInputRef = useRef(null);
  const [styles, setStyles] = useState([]);
  const [styleSaving, setStyleSaving] = useState(false);
  const [characterQuery, setCharacterQuery] = useState('');
  const [expandedName, setExpandedName] = useState('');
  const [notice, setNotice] = useState('');
  const noticeTimerRef = useRef(null);
  const { user } = useAuth();
  const { tip: hoverTip, bindHover } = useHoverTip();

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
    api('/styles').then((data) => setStyles(data.styles || [])).catch(() => {});
  }, []);

  useEffect(() => {
    // 仅在外部指定章节（openChapter）变化时定位；自动刷新导致 book 变化不重置当前查看位置
    if (book && Number.isInteger(openChapter) && openChapter >= 1 && openChapter <= book.chapters.length && lastOpenChapterRef.current !== openChapter) {
      lastOpenChapterRef.current = openChapter;
      setChapterIndex(openChapter - 1);
    }
  }, [book, openChapter]);

  useEffect(() => {
    if (tab !== 'developmentLine') return;
    setDevelopmentLineLoading(true);
    setDevelopmentLineError('');
    api(`/books/${bookId}/development-line`)
      .then((data) => {
        setDevelopmentLine(data.developmentLine);
      })
      .catch((err) => setDevelopmentLineError(err.message))
      .finally(() => setDevelopmentLineLoading(false));
    // book.updatedAt 覆盖手动编辑→POST /summary 改 events 但不改章数的陈旧场景；
    // developmentLineTick 供“刷新发展线”按钮手动重新拉取（派生视图，零 AI 成本）。
  }, [tab, bookId, book?.chapters?.length, book?.updatedAt, refreshSignal, developmentLineTick]);

  if (error) return <aside className="book-side-panel"><p className="form-error">{error}</p></aside>;
  if (!book) return <aside className="book-side-panel"><p className="muted">加载中…</p></aside>;

  const chapter = book.chapters[chapterIndex];

  const characterQueryText = characterQuery.trim().toLowerCase();
  const chapterMatch = characterQueryText.match(/^第?\s*(\d+)\s*章?$/);
  const focusChapter = chapterMatch ? Number(chapterMatch[1]) : null;
  const filteredCharacters = (book.characters || []).filter((card) => {
    if (!characterQueryText) return true;
    if (card.name.toLowerCase().includes(characterQueryText)) return true;
    return Number.isInteger(focusChapter) && (card.history || []).some((item) => Number(item.chapter) + 1 === focusChapter);
  });
  const mainCharacters = filteredCharacters.filter((card) => card.role === 'main');
  const supportCharacters = filteredCharacters.filter((card) => card.role !== 'main');

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

  async function saveWritingStyle(writingStyle) {
    if (!book || styleSaving) return;
    setStyleSaving(true);
    try {
      const data = await api(`/books/${book.id}/writing-style`, {
        method: 'PUT',
        body: JSON.stringify({ writingStyle, version: book.version })
      });
      setBook(data.book);
    } catch (err) {
      if (/内容已更新/.test(String(err.message))) {
        setError(`${err.message}（已为你刷新最新内容，请确认后重试）`);
        api(`/books/${book.id}`).then((data) => setBook(data.book)).catch(() => {});
      } else {
        setError(err.message);
      }
    } finally {
      setStyleSaving(false);
    }
  }

  function triggerCoverUpload() {
    coverInputRef.current?.click();
  }

  async function handleCoverChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !book) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('封面图片大小需在 5MB 以内');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = await api(`/books/${book.id}/cover`, {
          method: 'POST',
          body: JSON.stringify({ image: String(reader.result || '') })
        });
        setBook(data.book);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  function showNotice(text) {
    setNotice(text);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2200);
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
      </div>
      <div className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>内容</button>
        <button className={tab === 'developmentLine' ? 'active' : ''} onClick={() => setTab('developmentLine')}>发展线</button>
        <button className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>人物信息</button>
        <button className={tab === 'bookInfo' ? 'active' : ''} onClick={() => setTab('bookInfo')}>书籍信息</button>
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
      ) : tab === 'characters' ? (
        <div className="relation-tab character-tab">
          {(book.characters || []).length === 0 ? (
            <p className="muted">暂无角色档案：新建/改写章节时，正文中出现的重要角色会自动建档并记录各章状态变化。</p>
          ) : (
            <>
              <input
                className="directory-search character-search"
                placeholder="搜索章节/角色…"
                value={characterQuery}
                onChange={(e) => setCharacterQuery(e.target.value)}
              />
              {filteredCharacters.length === 0 ? (
                <p className="muted">没有匹配的角色</p>
              ) : (
                <CharacterRow>
                  {mainCharacters.map((card) => (
                    <CharacterCard
                      key={card.name}
                      card={card}
                      bookId={bookId}
                      focusChapter={focusChapter}
                      expanded={expandedName === card.name}
                      onToggleHistory={() => setExpandedName((prev) => (prev === card.name ? '' : card.name))}
                      onOpenChapter={(index) => { setTab('content'); setChapterIndex(index); }}
                      onUpdated={setBook}
                      onNotice={showNotice}
                    />
                  ))}
                  {mainCharacters.length > 0 && supportCharacters.length > 0 && (
                    <div className="character-group-divider" />
                  )}
                  {supportCharacters.map((card) => (
                    <CharacterCard
                      key={card.name}
                      card={card}
                      bookId={bookId}
                      focusChapter={focusChapter}
                      expanded={expandedName === card.name}
                      onToggleHistory={() => setExpandedName((prev) => (prev === card.name ? '' : card.name))}
                      onOpenChapter={(index) => { setTab('content'); setChapterIndex(index); }}
                      onUpdated={setBook}
                      onNotice={showNotice}
                    />
                  ))}
                </CharacterRow>
              )}
            </>
          )}
        </div>
      ) : tab === 'bookInfo' ? (
        <div className="book-info-tab">
          <div className="book-info-top">
            <div className="book-info-cover-col">
              <div className="book-info-cover-wrap">
                {book.cover ? (
                  <img className="book-info-cover" src={book.cover} alt={book.title} />
                ) : (
                  <div className="book-info-cover-empty">{book.title?.[0] || "书"}</div>
                )}
              </div>
              <div className="book-info-cover-actions">
                <button className="secondary" onClick={triggerCoverUpload}>{book.cover ? '更换封面' : '上传封面'}</button>
                <button className="secondary" onClick={() => showNotice('AI 生图功能尚未实现，敬请期待')}>AI 生图</button>
              </div>
              <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleCoverChange} />
            </div>
            <div className="book-info-top-main">
              <h2 className="book-info-title">{book.title}</h2>
              <p className="book-info-author">作者：{user?.nickname || user?.username || '未知'}</p>
              <p className="book-info-outline">{book.outline || '暂无简介'}</p>
            </div>
          </div>
          <div className="book-info-style-section">
            <h4 className="book-info-section-title">文笔风格</h4>
            <ModelSelect
              value={book.writingStyle || 'default'}
              onChange={saveWritingStyle}
              groups={[{ label: '文笔风格', options: styles.map((item) => ({ id: item.id, label: item.label })) }]}
              placeholder="请选择文笔风格"
              disabled={styleSaving}
              buttonHover={bindHover('文笔风格只影响之后新建/改写的正文，不修改已有章节')}
            />
          </div>
          <WorldSettingsPanel book={book} onUpdated={setBook} onNotice={showNotice} />
        </div>
      ) : (
        <div className="relation-tab">
          {developmentLineLoading && <p className="muted">正在加载发展线…</p>}
          {developmentLineError && <p className="form-error">{developmentLineError}</p>}
          {!developmentLineLoading && developmentLine && (
            <DevelopmentLineView
              developmentLine={developmentLine}
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
          {!developmentLineLoading && (
            <button className="primary" onClick={() => setDevelopmentLineTick((value) => value + 1)}>刷新发展线</button>
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
      {notice && (
        <div className="toast-layer">
          <div className="saved-toast">{notice}</div>
        </div>
      )}
      <HoverTip tip={hoverTip} />
    </aside>
  );
}
