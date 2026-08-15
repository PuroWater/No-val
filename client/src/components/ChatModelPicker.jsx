// 聊天输入框模型选择器（0.9.6 v2）：按钮只显示设置名称（保持 56px 高度、横向更窄），
// 点击菜单向上弹出（输入框在底部），菜单内显示各条目名称；悬浮菜单内某个名称时，
// 用已有 tooltip 风格显示“名称：模型”。切换即全局激活。
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';


// tooltip 定位：右上角钉在鼠标上（右边缘 = x、顶边缘 = y），内容自动向左/向下生长，
// 天然适配不同长度；鼠标贴近左边缘时才改为左边缘锚定，避免超出左侧屏幕。
function tooltipStyle(x, y) {
  const margin = 8;
  if (x < 200) {
    return { left: x + 8, top: Math.max(margin, Math.min(y, window.innerHeight - 48)) };
  }
  return {
    right: Math.max(margin, window.innerWidth - x),
    top: Math.max(margin, Math.min(y, window.innerHeight - 48))
  };
}

export default function ChatModelPicker({ disabled }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [itemTip, setItemTip] = useState(null); // { x, y, text }（跟随鼠标，同设置页写前确认）
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
    setItemTip({ x: event.clientX, y: event.clientY, text: entry.name + '：' + entry.model });
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
        setItemTip({ x: btnRect.left, y: btnRect.top, text: err.message });
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
              onMouseMove={(e) => showItemTip(e, entry)}
              onMouseLeave={() => setItemTip(null)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      )}
      {itemTip && (
        <div
          className="chat-date-tooltip"
          style={tooltipStyle(itemTip.x, itemTip.y)}
        >
          {itemTip.text}
        </div>
      )}
    </div>
  );
}
