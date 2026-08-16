// 聊天输入框模型选择器：按钮固定宽度（超长省略号），悬浮 tooltip（右上角 x-6/y+16 锚定，
// 与菜单条目悬浮一致）显示"当前模型：（名称），点击切换其他模型"；
// 点击菜单向上弹出，菜单内显示各条目名称；点击外部关闭；切换即全局激活。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// 悬浮提示：右上角 = 鼠标 (x-6, y+16)，内容向左/下展开（按实际宽高钳制防出屏）
const TOOLTIP_MARGIN = 8;

export default function ChatModelPicker({ disabled }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [itemTip, setItemTip] = useState(null); // { x, y, text }（右上角锚定，按钮/菜单条目共用）
  const wrapRef = useRef(null);
  const tipRef = useRef(null);

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

  // 悬浮提示：右上角锚定 (x-6, y+16)，按实际宽高钳制
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !itemTip) return;
    let left = itemTip.x - 6 - el.offsetWidth;
    let top = itemTip.y + 16;
    if (left < TOOLTIP_MARGIN) left = TOOLTIP_MARGIN;
    if (top + el.offsetHeight > window.innerHeight - TOOLTIP_MARGIN) {
      top = window.innerHeight - el.offsetHeight - TOOLTIP_MARGIN;
    }
    el.style.left = left + 'px';
    el.style.top = Math.max(TOOLTIP_MARGIN, top) + 'px';
  }, [itemTip]);

  const activeEntry = entries.find((item) => item.id === activeId) || entries[0];
  if (!activeEntry) return null;

  function showItemTip(event, text) {
    setItemTip({ x: event.clientX, y: event.clientY, text });
  }

  function showButtonTip(event) {
    showItemTip(event, `当前模型：${activeEntry.name}，点击切换其他模型`);
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
        onMouseEnter={showButtonTip}
        onMouseMove={showButtonTip}
        onMouseLeave={() => setItemTip(null)}
      >
        <span className="chat-model-btn-label">{activeEntry.name}</span>
        <span className="chat-model-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="chat-model-menu">
          {entries.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === activeId ? 'active' : ''}
              onClick={() => switchModel(entry.id)}
              onMouseEnter={(e) => showItemTip(e, `${entry.name}：${entry.model}`)}
              onMouseMove={(e) => showItemTip(e, `${entry.name}：${entry.model}`)}
              onMouseLeave={() => setItemTip(null)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      )}
      {itemTip && (
        <div ref={tipRef} className="chat-date-tooltip">
          {itemTip.text}
        </div>
      )}
    </div>
  );
}
