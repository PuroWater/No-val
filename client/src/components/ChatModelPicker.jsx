// 聊天输入框模型选择器（0.9.6 v2）：按钮只显示设置名称（保持 56px 高度、横向更窄），
// 点击菜单向上弹出（输入框在底部），菜单内显示各条目名称；悬浮菜单内某个名称时，
// 用已有 tooltip 风格显示“名称：模型”。切换即全局激活。
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function ChatModelPicker({ disabled }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [itemTip, setItemTip] = useState(null); // { left, top, text }
  const wrapRef = useRef(null);

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

  function showItemTip(event, entry) {
    const rect = event.currentTarget.getBoundingClientRect();
    const tipWidth = 260;
    let left = rect.left - tipWidth - 8;
    if (left < 8) left = rect.right + 8;
    setItemTip({
      left: Math.min(left, window.innerWidth - tipWidth - 8),
      top: Math.max(8, rect.top + 4),
      text: `${entry.name}：${entry.model}`
    });
  }

  async function switchModel(id) {
    if (!id || id === activeId) return;
    setOpen(false);
    setItemTip(null);
    try {
      const data = await api('/providers/' + id + '/activate', { method: 'POST' });
      setActiveId(data.active || '');
      setEntries(data.entries || []);
    } catch (err) {
      // 切换失败：悬浮提示错误信息
      const btnRect = wrapRef.current?.querySelector('.chat-model-btn')?.getBoundingClientRect();
      if (btnRect) {
        setItemTip({
          left: Math.max(8, Math.min(btnRect.right - 260, window.innerWidth - 270)),
          top: Math.max(8, btnRect.top - 34),
          text: err.message
        });
      }
    }
  }

  return (
    <div className="chat-model-picker" ref={wrapRef}>
      <button
        className="chat-model-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="切换当前模型（全局生效）"
      >
        {activeEntry.name}
        <span className="chat-model-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="chat-model-menu">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === activeId ? 'active' : ''}
              onClick={() => switchModel(entry.id)}
              onMouseEnter={(e) => showItemTip(e, entry)}
              onMouseLeave={() => setItemTip(null)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      )}
      {itemTip && (
        <div className="chat-date-tooltip" style={{ left: itemTip.left, top: itemTip.top }}>
          {itemTip.text}
        </div>
      )}
    </div>
  );
}
