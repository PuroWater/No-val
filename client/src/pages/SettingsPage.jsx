import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { applySettings } from '../components/SettingsApplier.jsx';
import TrashPanel from '../components/TrashPanel.jsx';
import AccountPanel from '../components/AccountPanel.jsx';

const THEMES = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'green', label: '护眼绿' },
  { value: 'paper', label: '护眼纸纹' }
];

const SIZES = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
];

export default function SettingsPage() {
  const [activeSetting, setActiveSetting] = useState('general');
  const [theme, setTheme] = useState('paper');
  const [fontSize, setFontSize] = useState('medium');
  const [chaptersPerOutput, setChaptersPerOutput] = useState(3);
  const [chapterWords, setChapterWords] = useState(2000);
  const [enterToSend, setEnterToSend] = useState(true);
  const [thinkingForWriting, setThinkingForWriting] = useState(false);
  const [thinkingTip, setThinkingTip] = useState(null);
  const [timelineOrientation, setTimelineOrientation] = useState('vertical');
  const [reviewAfterWrite, setReviewAfterWrite] = useState(false);
  const [confirmBeforeWrite, setConfirmBeforeWrite] = useState(false);
  const [confirmTip, setConfirmTip] = useState(null);
  const [reviewTip, setReviewTip] = useState(null);
  const [trash, setTrash] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const [permanentTarget, setPermanentTarget] = useState(null);

  async function loadTrash() {
    const data = await api('/books/trash');
    setTrash(data.books);
  }

  function pushToast(text, error = false) {
    const id = ++toastIdRef.current;
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, 1000);
  }

  useEffect(() => {
    api('/settings').then((data) => {
      setTheme(data.settings.theme);
      setFontSize(data.settings.fontSize);
      setChaptersPerOutput(Number(data.settings.chaptersPerOutput) || 3);
      setChapterWords(Number(data.settings.chapterWords) || 2000);
      setEnterToSend(data.settings.enterToSend !== false);
      setThinkingForWriting(data.settings.thinkingForWriting === true);
      setTimelineOrientation((data.settings.developmentLineOrientation ?? data.settings.timelineOrientation) === 'horizontal' ? 'horizontal' : 'vertical');
      setReviewAfterWrite(data.settings.reviewAfterWrite === true);
      setConfirmBeforeWrite(data.settings.confirmBeforeWrite === true);
      applySettings(data.settings);
    });
    loadTrash();
  }, []);

  async function save(nextTheme, nextSize, nextChapters, nextWords, nextEnter, nextOrientation, nextThinking, nextReview, nextConfirm) {
    const confirm = nextConfirm === undefined ? confirmBeforeWrite : nextConfirm;
    try {
      const data = await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          theme: nextTheme,
          fontSize: nextSize,
          chaptersPerOutput: nextChapters,
          chapterWords: nextWords,
          enterToSend: nextEnter,
          developmentLineOrientation: nextOrientation,
          thinkingForWriting: nextThinking,
          reviewAfterWrite: nextReview,
          confirmBeforeWrite: confirm
        })
      });
      applySettings(data.settings);
      pushToast('已保存');
    } catch (err) {
      pushToast(`保存失败：${err.message}`, true);
    }
  }

  async function restore(book) {
    await api(`/books/${book.id}/restore`, { method: 'POST' });
    await loadTrash();
  }

  async function confirmPermanentDelete() {
    if (!permanentTarget) return;
    await api(`/books/${permanentTarget.id}/permanent`, { method: 'DELETE' });
    await loadTrash();
    setPermanentTarget(null);
  }

  const trashBooks = trash.filter((book) => book.status === 'ready');
  const trashDrafts = trash.filter((book) => book.status === 'draft');

  return (
    <section className="page settings-page">
      <div className="settings-layout">
        <aside className="settings-directory">
          <button
            className={`directory-item ${activeSetting === 'general' ? 'active' : ''}`}
            onClick={() => setActiveSetting('general')}
          >
            常规
          </button>
          <button
            className={`directory-item ${activeSetting === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveSetting('appearance')}
          >
            外观
          </button>
          <button
            className={`directory-item ${activeSetting === 'trash' ? 'active' : ''}`}
            onClick={() => setActiveSetting('trash')}
          >
            回收站
          </button>
          <button
            className={`directory-item ${activeSetting === 'account' ? 'active' : ''}`}
            onClick={() => setActiveSetting('account')}
          >
            账户设置
          </button>
        </aside>
        <div className="settings-content">
          {activeSetting === 'appearance' && (
            <>
              <div className="settings-group">
                <span>背景风格</span>
                <div className="option-row">
                  {THEMES.map((item) => (
                    <button key={item.value} className={theme === item.value ? 'active' : ''} onClick={() => { setTheme(item.value); save(item.value, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <span>字号</span>
                <div className="option-row">
                  {SIZES.map((item) => (
                    <button key={item.value} className={fontSize === item.value ? 'active' : ''} onClick={() => { setFontSize(item.value); save(theme, item.value, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <span>发展线方向</span>
                <div className="option-row">
                  <button
                    className={timelineOrientation === 'vertical' ? 'active' : ''}
                    onClick={() => { setTimelineOrientation('vertical'); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, 'vertical', thinkingForWriting, reviewAfterWrite); }}
                  >
                    纵向
                  </button>
                  <button
                    className={timelineOrientation === 'horizontal' ? 'active' : ''}
                    onClick={() => { setTimelineOrientation('horizontal'); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, 'horizontal', thinkingForWriting, reviewAfterWrite); }}
                  >
                    横向
                  </button>
                </div>
              </div>
            </>
          )}
          {activeSetting === 'general' && (
            <>
              <div className="settings-group">
                <span>默认输出章节数</span>
                <input
                  className="setting-number"
                  type="number"
                  min="1"
                  max="5"
                  value={chaptersPerOutput}
                  onChange={(e) => setChaptersPerOutput(Number(e.target.value))}
                  onBlur={() => {
                    const value = Math.min(5, Math.max(1, Math.round(Number(chaptersPerOutput) || 1)));
                    setChaptersPerOutput(value);
                    save(theme, fontSize, value, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite);
                  }}
                />
              </div>
              <div className="settings-group">
                <span>默认输出字数（每章）</span>
                <input
                  className="setting-number"
                  type="number"
                  min="1000"
                  max="10000"
                  step="500"
                  value={chapterWords}
                  onChange={(e) => setChapterWords(Number(e.target.value))}
                  onBlur={() => {
                    const value = Math.min(10000, Math.max(1000, Math.round(Number(chapterWords) || 1000)));
                    setChapterWords(value);
                    save(theme, fontSize, chaptersPerOutput, value, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite);
                  }}
                />
              </div>
              <div className="settings-group">
                <span>发送快捷键</span>
                <div className="option-row">
                  <button
                    className={enterToSend ? 'active' : ''}
                    onClick={() => { setEnterToSend(true); save(theme, fontSize, chaptersPerOutput, chapterWords, true, timelineOrientation, thinkingForWriting, reviewAfterWrite); }}
                  >
                    Enter
                  </button>
                  <button
                    className={!enterToSend ? 'active' : ''}
                    onClick={() => { setEnterToSend(false); save(theme, fontSize, chaptersPerOutput, chapterWords, false, timelineOrientation, thinkingForWriting, reviewAfterWrite); }}
                  >
                    Ctrl+Enter
                  </button>
                </div>
              </div>
              <div className="settings-group">
                <span>写前确认</span>
                <div className="option-row">
                  <button
                    className={!confirmBeforeWrite ? 'active' : ''}
                    onClick={() => { setConfirmBeforeWrite(false); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite, false); }}
                  >
                    关闭
                  </button>
                  <button
                    className={confirmBeforeWrite ? 'active' : ''}
                    onClick={() => { setConfirmBeforeWrite(true); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, reviewAfterWrite, true); }}
                    onMouseEnter={(event) => setConfirmTip({ x: event.clientX, y: event.clientY })}
                    onMouseMove={(event) => setConfirmTip({ x: event.clientX, y: event.clientY })}
                    onMouseLeave={() => setConfirmTip(null)}
                  >
                    开启
                  </button>
                  {confirmTip && (
                    <div
                      className="chat-date-tooltip"
                      style={{
                        left: Math.min(confirmTip.x + 14, window.innerWidth - 270),
                        top: Math.min(confirmTip.y + 16, window.innerHeight - 90)
                      }}
                    >
                      开启后，在新建/改写/删除/批量修改等写操作执行前，AI 会先在对话中向你确认，回复“确认”后才真正执行。
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-group">
                <span>正文思考</span>
                <div className="option-row">
                  <button
                    className={!thinkingForWriting ? 'active' : ''}
                    onClick={() => { setThinkingForWriting(false); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, false, reviewAfterWrite); }}
                  >
                    关闭
                  </button>
                  <button
                    className={thinkingForWriting ? 'active' : ''}
                    onClick={() => { setThinkingForWriting(true); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, true, reviewAfterWrite); }}
                    onMouseEnter={(event) => setThinkingTip({ x: event.clientX, y: event.clientY })}
                    onMouseMove={(event) => setThinkingTip({ x: event.clientX, y: event.clientY })}
                    onMouseLeave={() => setThinkingTip(null)}
                  >
                    开启
                  </button>
                  {thinkingTip && (
                    <div
                      className="chat-date-tooltip"
                      style={{
                        left: Math.min(thinkingTip.x + 14, window.innerWidth - 270),
                        top: Math.min(thinkingTip.y + 16, window.innerHeight - 90)
                      }}
                    >
                      开启后正文生成会先进行深度思考再输出，质量更高但耗时更长；默认关闭。
                    </div>
                  )}
                </div>
              </div>
              <div className="settings-group">
                <span>生成后审校</span>
                <div className="option-row">
                  <button
                    className={!reviewAfterWrite ? 'active' : ''}
                    onClick={() => { setReviewAfterWrite(false); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, false); }}
                  >
                    关闭
                  </button>
                  <button
                    className={reviewAfterWrite ? 'active' : ''}
                    onClick={() => { setReviewAfterWrite(true); save(theme, fontSize, chaptersPerOutput, chapterWords, enterToSend, timelineOrientation, thinkingForWriting, true); }}
                    onMouseEnter={(event) => setReviewTip({ x: event.clientX, y: event.clientY })}
                    onMouseMove={(event) => setReviewTip({ x: event.clientX, y: event.clientY })}
                    onMouseLeave={() => setReviewTip(null)}
                  >
                    开启
                  </button>
                  {reviewTip && (
                    <div
                      className="chat-date-tooltip"
                      style={{
                        left: Math.min(reviewTip.x + 14, window.innerWidth - 270),
                        top: Math.min(reviewTip.y + 16, window.innerHeight - 90)
                      }}
                    >
                      生成或改写章节后 AI 会通读一遍，不通过时自动修订；会额外耗时与消耗 token，默认关闭。
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {activeSetting === 'trash' && (
            <TrashPanel
              books={trashBooks}
              drafts={trashDrafts}
              onRestore={restore}
              onPermanent={setPermanentTarget}
            />
          )}
          {activeSetting === 'account' && (
            <AccountPanel />
          )}
        </div>
      </div>
      <ConfirmModal
        open={Boolean(permanentTarget)}
        title="彻底删除确认"
        message={`彻底删除“${permanentTarget?.title || ''}”后无法恢复，确定继续吗？`}
        confirmText="彻底删除"
        onConfirm={confirmPermanentDelete}
        onCancel={() => setPermanentTarget(null)}
      />
      {toasts.length > 0 && (
        <div className="toast-layer">
          {toasts.map((toast) => (
            <div key={toast.id} className={`saved-toast${toast.error ? ' error' : ''}`}>{toast.text}</div>
          ))}
        </div>
      )}
    </section>
  );
}
