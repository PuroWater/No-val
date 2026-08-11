import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { applySettings } from '../components/SettingsApplier.jsx';

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
  const [activeSetting, setActiveSetting] = useState('appearance');
  const [theme, setTheme] = useState('paper');
  const [fontSize, setFontSize] = useState('medium');
  const [chaptersPerOutput, setChaptersPerOutput] = useState(3);
  const [chapterWords, setChapterWords] = useState(2000);
  const [enterToSend, setEnterToSend] = useState(true);
  const [trash, setTrash] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const [appearanceError, setAppearanceError] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [permanentTarget, setPermanentTarget] = useState(null);

  async function loadTrash() {
    const data = await api('/books/trash');
    setTrash(data.books);
  }

  useEffect(() => {
    api('/settings').then((data) => {
      setTheme(data.settings.theme);
      setFontSize(data.settings.fontSize);
      setChaptersPerOutput(Number(data.settings.chaptersPerOutput) || 3);
      setChapterWords(Number(data.settings.chapterWords) || 2000);
      setEnterToSend(data.settings.enterToSend !== false);
      applySettings(data.settings);
    });
    loadTrash();
  }, []);

  async function save(nextTheme, nextSize, nextChapters, nextWords, nextEnter) {
    try {
      setAppearanceError('');
      const data = await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          theme: nextTheme,
          fontSize: nextSize,
          chaptersPerOutput: nextChapters,
          chapterWords: nextWords,
          enterToSend: nextEnter
        })
      });
      applySettings(data.settings);
      const id = ++toastIdRef.current;
      setToasts((list) => [...list, id]);
      setTimeout(() => {
        setToasts((list) => list.filter((item) => item !== id));
      }, 1000);
    } catch (err) {
      setAppearanceError(err.message);
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

  async function changePassword(event) {
    event.preventDefault();
    setAccountMessage('');
    setAccountError('');
    if (newPassword !== confirmPassword) {
      setAccountError('两次输入的新密码不一致');
      return;
    }
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword })
      });
      setAccountMessage('密码已修改');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setAccountError(err.message);
    }
  }

  const trashBooks = trash.filter((book) => book.status === 'ready');
  const trashDrafts = trash.filter((book) => book.status === 'draft');

  return (
    <section className="page settings-page">
      <div className="settings-layout">
        <aside className="settings-directory">
          <button
            className={`directory-item ${activeSetting === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveSetting('appearance')}
          >
            外观
          </button>
          <button
            className={`directory-item ${activeSetting === 'general' ? 'active' : ''}`}
            onClick={() => setActiveSetting('general')}
          >
            常规
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
                    <button key={item.value} className={theme === item.value ? 'active' : ''} onClick={() => { setTheme(item.value); save(item.value, fontSize, chaptersPerOutput, chapterWords, enterToSend); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <span>字号</span>
                <div className="option-row">
                  {SIZES.map((item) => (
                    <button key={item.value} className={fontSize === item.value ? 'active' : ''} onClick={() => { setFontSize(item.value); save(theme, item.value, chaptersPerOutput, chapterWords, enterToSend); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {appearanceError && <p className="form-error">{appearanceError}</p>}
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
                    save(theme, fontSize, value, chapterWords, enterToSend);
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
                    save(theme, fontSize, chaptersPerOutput, value, enterToSend);
                  }}
                />
              </div>
              <div className="settings-group">
                <span>发送快捷键</span>
                <div className="option-row">
                  <button
                    className={enterToSend ? 'active' : ''}
                    onClick={() => { setEnterToSend(true); save(theme, fontSize, chaptersPerOutput, chapterWords, true); }}
                  >
                    Enter
                  </button>
                  <button
                    className={!enterToSend ? 'active' : ''}
                    onClick={() => { setEnterToSend(false); save(theme, fontSize, chaptersPerOutput, chapterWords, false); }}
                  >
                    Ctrl+Enter
                  </button>
                </div>
              </div>
              {appearanceError && <p className="form-error">{appearanceError}</p>}
            </>
          )}
          {activeSetting === 'trash' && (
            <>
              <div className="trash-section">
                <h3>图书（已生成）</h3>
                {trashBooks.length === 0 && <p className="muted">暂无回收图书</p>}
                {trashBooks.map((book) => (
                  <div key={book.id} className="trash-item">
                    <div>
                      <strong>{book.title}</strong>
                      <span className="muted">{book.chapterCount} 章</span>
                    </div>
                    <div>
                      <button onClick={() => restore(book)}>恢复</button>
                      <button className="danger" onClick={() => setPermanentTarget(book)}>彻底删除</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="trash-section">
                <h3>构思（未生成）</h3>
                {trashDrafts.length === 0 && <p className="muted">暂无回收构思</p>}
                {trashDrafts.map((book) => (
                  <div key={book.id} className="trash-item">
                    <div>
                      <strong>{book.title}</strong>
                      <span className="muted">创作中</span>
                    </div>
                    <div>
                      <button onClick={() => restore(book)}>恢复</button>
                      <button className="danger" onClick={() => setPermanentTarget(book)}>彻底删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {activeSetting === 'account' && (
            <div className="settings-group">
              <span>账户设置</span>
              <form className="account-form" onSubmit={changePassword}>
                <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="原密码" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码（至少 6 位）" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码" />
                {accountError && <p className="form-error">{accountError}</p>}
                {accountMessage && <p className="saved-tip">{accountMessage}</p>}
                <button className="primary" type="submit">修改密码</button>
              </form>
            </div>
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
          {toasts.map((id) => (
            <div key={id} className="saved-toast">已保存</div>
          ))}
        </div>
      )}
    </section>
  );
}
