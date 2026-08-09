import { useEffect, useState } from 'react';
import { api } from '../api.js';

const THEMES = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'paper', label: '护眼纸纹' }
];

const SIZES = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
];

const FONT_MAP = { small: '14px', medium: '16px', large: '18px' };

export default function SettingsPage() {
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState('medium');
  const [trash, setTrash] = useState([]);
  const [saved, setSaved] = useState(false);

  async function loadTrash() {
    const data = await api('/books/trash');
    setTrash(data.books);
  }

  useEffect(() => {
    api('/settings').then((data) => {
      setTheme(data.settings.theme);
      setFontSize(data.settings.fontSize);
      document.documentElement.dataset.theme = data.settings.theme;
      document.documentElement.style.fontSize = FONT_MAP[data.settings.fontSize] || '16px';
    });
    loadTrash();
  }, []);

  async function save(nextTheme, nextSize) {
    const data = await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ theme: nextTheme, fontSize: nextSize })
    });
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.style.fontSize = FONT_MAP[data.settings.fontSize] || '16px';
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function restore(book) {
    await api(`/books/${book.id}/restore`, { method: 'POST' });
    await loadTrash();
  }

  async function permanentDelete(book) {
    if (!window.confirm(`彻底删除“${book.title}”后无法恢复，确定继续吗？`)) return;
    await api(`/books/${book.id}/permanent`, { method: 'DELETE' });
    await loadTrash();
  }

  const trashBooks = trash.filter((book) => book.status === 'ready');
  const trashDrafts = trash.filter((book) => book.status === 'draft');

  return (
    <section className="page">
      <h2>设置</h2>
      <div className="settings-group">
        <span>背景风格</span>
        <div className="option-row">
          {THEMES.map((item) => (
            <button key={item.value} className={theme === item.value ? 'active' : ''} onClick={() => { setTheme(item.value); save(item.value, fontSize); }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group">
        <span>字号</span>
        <div className="option-row">
          {SIZES.map((item) => (
            <button key={item.value} className={fontSize === item.value ? 'active' : ''} onClick={() => { setFontSize(item.value); save(theme, item.value); }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-group">
        <span>回收站</span>
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
                <button className="danger" onClick={() => permanentDelete(book)}>彻底删除</button>
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
                <button className="danger" onClick={() => permanentDelete(book)}>彻底删除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {saved && <p className="saved-tip">已保存</p>}
    </section>
  );
}
