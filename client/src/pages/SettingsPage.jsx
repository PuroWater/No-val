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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/settings').then((data) => {
      setTheme(data.settings.theme);
      setFontSize(data.settings.fontSize);
      document.documentElement.dataset.theme = data.settings.theme;
      document.documentElement.style.fontSize = FONT_MAP[data.settings.fontSize] || '16px';
    });
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
      {saved && <p className="saved-tip">已保存</p>}
    </section>
  );
}
