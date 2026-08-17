// 聊天日期筛选器：菜单通过 Portal 挂到 body，避免被头部的 overflow 裁切；滚动仅作用于菜单自身。
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { formatDate, getDateRanges } from '../lib/chatDate.js';

function getPanelPosition(button) {
  const rect = button?.getBoundingClientRect();
  if (!rect) return { top: 0, left: 0 };
  const width = 180;
  const gap = 4;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + gap;
  const estimatedHeight = 268;
  const top = below + estimatedHeight <= window.innerHeight - 8
    ? below
    : Math.max(8, rect.top - estimatedHeight - gap);
  return { top, left };
}

export default function ChatDatePicker({ book, mode, onSelect }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => setPanelPosition(getPanelPosition(buttonRef.current));
    updatePosition();
    const onDown = (event) => {
      const target = event.target;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setHover(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const todayKey = formatDate(new Date());
  const dateOptions = getDateRanges(book);
  const hasTodayRecord = dateOptions.some((option) => option.date === todayKey);
  const archiveOptions = hasTodayRecord ? dateOptions : dateOptions.filter((option) => option.date !== todayKey);
  const choose = (value) => {
    onSelect(value);
    setOpen(false);
    setHover(null);
  };
  const menu = open ? createPortal(
    <div
      ref={panelRef}
      className="chat-date-panel"
      role="listbox"
      style={{ top: panelPosition.top, left: panelPosition.left }}
    >
      <button type="button" className={`chat-date-option${mode === '__today__' ? ' active' : ''}`} onClick={() => choose('__today__')}>当前日期</button>
      <button type="button" className={`chat-date-option${mode === '' ? ' active' : ''}`} onClick={() => choose('')}>全部日期</button>
      {archiveOptions.map((option) => (
        <button
          key={option.date}
          type="button"
          className={`chat-date-option${mode === option.date ? ' active' : ''}`}
          onClick={() => choose(option.date)}
          onMouseEnter={(event) => option.lines.length > 0 && setHover({ x: event.clientX, y: event.clientY, lines: option.lines })}
          onMouseMove={(event) => option.lines.length > 0 && setHover({ x: event.clientX, y: event.clientY, lines: option.lines })}
          onMouseLeave={() => setHover(null)}
        >
          {option.date}
        </button>
      ))}
    </div>,
    document.body
  ) : null;
  const tooltip = hover?.lines?.length > 0 ? createPortal(
    <div
      className="chat-date-tooltip"
      style={{
        left: Math.min(hover.x + 14, window.innerWidth - 270),
        top: Math.min(hover.y + 16, window.innerHeight - 90)
      }}
    >
      {hover.lines.map((line) => <div key={line}>{line}</div>)}
    </div>,
    document.body
  ) : null;

  return (
    <div className="chat-date-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="chat-date-select"
        onClick={() => { setHover(null); setOpen((value) => !value); }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {mode === '__today__' ? '当前日期' : mode || '全部日期'}
        <span className="chat-date-caret">▾</span>
      </button>
      {menu}
      {tooltip}
    </div>
  );
}
