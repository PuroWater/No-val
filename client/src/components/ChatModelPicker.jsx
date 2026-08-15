// 聊天输入框模型选择器（0.9.6 v2）：按钮只显示设置名称（保持 56px 高度、横向更窄），
// 点击菜单向上弹出（输入框在底部），菜单内显示各条目名称；悬浮菜单内某个名称时，
// 用已有 tooltip 风格显示“名称：模型”。切换即全局激活。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';


// tooltip 定位：右上角 = 鼠标 (x-10, y+16)——右边缘贴 x-10、顶边缘贴 y+16，内容向左/下展开。
// 先按基准定位渲染，再按实际宽高钳制（仅真正出屏才收），不同长度都跟手不钉死。
const TOOLTIP_MARGIN = 8;

export default function ChatModelPicker({ disabled }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [itemTip, setItemTip] = useState(null); // { x, y, text }（跟随鼠标，同设置页写前确认）
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

/  \/\/ 点击外部关闭菜单\r?\n  useEffect\(\(\) => \{\r?\n    if \(!open\) return undefined;\r?\n    const onDocClick = \(event\) => \{\r?\n      if \(wrapRef\.current && !wrapRef\.current\.contains\(event\.target\)\) setOpen\(false\);\r?\n    \};\r?\n    document\.addEventListener\('mousedown', onDocClick\);\r?\n    return \(\) => document\.removeEventListener\('mousedown', onDocClick\);\r?\n  \}, \[open\]\);/

  // 右上角锚定在 (x-10, y+16)：右边缘 = x-10、顶边缘 = y+16，内容向左/下展开；
  // 按实际渲染宽高钳制，仅当内容会超出视口才收拢。
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !itemTip) return;
    let left = itemTip.x - 10 - el.offsetWidth;
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
          ref={tipRef}
          className="chat-date-tooltip"
        >
          {itemTip.text}
        </div>
      )}
    </div>
  );
}
