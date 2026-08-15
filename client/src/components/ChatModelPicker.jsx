// 聊天输入框模型选择器（0.9.6 v2）：按钮只显示模型名（紧凑），鼠标悬浮显示 name · model 提示，
// 点击后菜单向上弹出（输入框在底部，下方无空间），菜单内显示各条目的设置名称；切换即全局激活。
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function ChatModelPicker({ disabled }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(null); // { left, top, text }
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    api('/providers')
      .then((data) => {
        setEntries(data.entries || []);
        setActiveId(data.active || '');
      })
      .catch(() => {});
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const activeEntry = entries.find((item) => item.id === activeId) || entries[0];
  if (!activeEntry) return null;

  function showTip() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 270)),
      top: Math.max(8, rect.top - 34),
      text: `${activeEntry.name} · ${activeEntry.model}`
    });
  }

  async function switchModel(id) {
    if (!id || id === activeId) return;
    setOpen(false);
    try {
      const data = await api('/providers/' + id + '/activate', { method: 'POST' });
      setActiveId(data.active || '');
      setEntries(data.entries || []);
    } catch (err) {
      // 切换失败：悬浮提示错误信息
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        setTip({
          left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 270)),
          top: Math.max(8, rect.top - 34),
          text: err.message
        });
      }
    }
  }

  return (
    <div className="chat-model-picker" ref={wrapRef}>
      <button
        ref={btnRef}
        className="chat-model-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
        title="切换当前模型（全局生效）"
      >
        {activeEntry.model}
        <span className="chat-model-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="chat-model-menu">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === activeId ? 'active' : ''}
              onClick={() => switchModel(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      )}
      {tip && (
        <div className="chat-date-tooltip" style={{ left: tip.left, top: tip.top }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
