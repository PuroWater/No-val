// 通用模型下拉选择器（0.9.6）：应用内自定义下拉，替换原生 select，风格与聊天模型选择器一致。
// groups: [{ label, options: [{ id, label }] }]；点击按钮展开菜单（向下弹出），点击选项回调 onChange。
import { useEffect, useRef, useState } from 'react';

export default function ModelSelect({ value, onChange, groups = [], placeholder = '请选择模型', disabled = false, buttonHover = {} }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const flat = groups.flatMap((group) => group.options || []);
  const current = flat.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="model-select" ref={wrapRef}>
      <button type="button" className="model-select-btn" disabled={disabled} onClick={() => setOpen((v) => !v)} {...buttonHover}>
        <span className="model-select-value">{current ? current.label : placeholder}</span>
        <span className="chat-model-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="model-select-menu">
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
        </div>
      )}
    </div>
  );
}
