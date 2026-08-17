// 通用模型下拉选择器（0.9.6）：应用内自定义下拉，替换原生 select，风格与聊天模型选择器一致。
// groups: [{ label, options: [{ id, label }] }]；点击按钮展开菜单（向下弹出），点击选项回调 onChange。
// 0.9.9 修复：菜单改用 Portal 渲染到 body + position:fixed 悬浮定位，彻底脱离父容器 overflow 裁剪
// （模型配置弹窗 / 书籍信息文笔区曾把远端下拉截断，pro 项被隐藏）。自动向上/向下翻转并防出屏。
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MENU_MARGIN = 8;
const MENU_MAX_HEIGHT = 260;

export default function ModelSelect({ value, onChange, groups = [], placeholder = '请选择模型', disabled = false, buttonHover = {} }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const flat = groups.flatMap((group) => group.options || []);
  const current = flat.find((option) => option.id === value);

  // 菜单已挂载后（portal 在 body），测量真实高度并按按钮位置精确定位；下方放不下自动向上翻转
  useLayoutEffect(() => {
    if (!open) return undefined;
    const btn = wrapRef.current?.querySelector('.model-select-btn');
    const menuEl = menuRef.current;
    if (!btn || !menuEl) return undefined;
    const rect = btn.getBoundingClientRect();
    const menuHeight = Math.min(menuEl.offsetHeight, MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    let top;
    if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
    } else {
      top = Math.max(MENU_MARGIN, rect.top - 6 - menuHeight);
    }
    if (top + menuHeight > window.innerHeight - MENU_MARGIN) {
      top = Math.max(MENU_MARGIN, window.innerHeight - menuHeight - MENU_MARGIN);
    }
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.top = `${top}px`;
    menuEl.style.width = `${rect.width}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('resize', onResize);
    
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('resize', onResize);
      
    };
  }, [open]);

  return (
    <div className="model-select" ref={wrapRef}>
      <button type="button" className="model-select-btn" disabled={disabled} onClick={() => setOpen((v) => !v)} {...buttonHover}>
        <span className="model-select-value">{current ? current.label : placeholder}</span>
        <span className="chat-model-arrow" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="model-select-menu model-select-menu-fixed"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
          >
            {groups.map((group) => (
              <div className="model-select-group" key={group.label || 'group'}>
                {group.label && <div className="model-select-group-label">{group.label}</div>}
                {group.options.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={option.id === value ? 'active' : ''}
                    onClick={() => {
                      onChange?.(option.id);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
