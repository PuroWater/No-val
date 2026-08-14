// 聊天日期选择器（自包含）：下拉日期列表 + 悬浮详情，选中通过 onSelect 回调上报。
import { useEffect, useRef, useState } from 'react';

function formatDate(iso) {
  try {
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

function getDateRanges(book) {
  const byDate = new Map();
  const touch = (date) => {
    if (!date) return;
    byDate.set(date, byDate.get(date) || { start: Infinity, end: 0, modified: [] });
  };
  (book.chat || []).forEach((message) => touch(formatDate(message.createdAt)));
  (book.chapters || []).forEach((chapter, index) => {
    const created = formatDate(chapter.createdAt || chapter.updatedAt);
    const updated = formatDate(chapter.updatedAt);
    touch(created);
    touch(updated);
    if (created && updated && updated !== created) {
      byDate.get(updated).modified.push(index + 1);
    }
    if (created) {
      const info = byDate.get(created);
      info.start = Math.min(info.start, index + 1);
      info.end = Math.max(info.end, index + 1);
    }
  });
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, info]) => {
      const lines = [];
      const modified = [...new Set(info.modified)].sort((a, b) => a - b);
      if (modified.length > 0) {
        lines.push(`修改：第${modified.join('、')}章`);
      }
      const hasAdded = info.end >= info.start;
      if (hasAdded) {
        lines.push(info.start === info.end ? `新增：第${info.start}章` : `新增：第${info.start}-${info.end}章`);
      }
      return { date, lines };
    });
}

export default function ChatDatePicker({ book, mode, onSelect }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
        setHover(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const todayKey = formatDate(new Date());
  const dateOptions = getDateRanges(book);
  const hasTodayRecord = dateOptions.some((option) => option.date === todayKey);
  const archiveOptions = hasTodayRecord
    ? dateOptions
    : dateOptions.filter((option) => option.date !== todayKey);

  return (
    <div className="chat-date-wrap" ref={wrapRef}>
      <button
        className="chat-date-select"
        onClick={() => {
          setHover(null);
          setOpen((value) => !value);
        }}
        aria-haspopup="listbox"
      >
        {mode === '__today__' ? '当前日期' : mode || '全部日期'}
        <span className="chat-date-caret">▾</span>
      </button>
      {open && (
        <div className="chat-date-panel" role="listbox">
          <button
            className={`chat-date-option${mode === '__today__' ? ' active' : ''}`}
            onClick={() => { onSelect('__today__'); setOpen(false); setHover(null); }}
          >
            当前日期
          </button>
          <button
            className={`chat-date-option${mode === '' ? ' active' : ''}`}
            onClick={() => { onSelect(''); setOpen(false); setHover(null); }}
          >
            全部日期
          </button>
          {archiveOptions.map((option) => (
            <button
              key={option.date}
              className={`chat-date-option${mode === option.date ? ' active' : ''}`}
              onClick={() => { onSelect(option.date); setOpen(false); setHover(null); }}
              onMouseEnter={(event) => {
                if (option.lines.length > 0) {
                  setHover({ x: event.clientX, y: event.clientY, lines: option.lines });
                }
              }}
              onMouseMove={(event) => {
                if (option.lines.length > 0) {
                  setHover({ x: event.clientX, y: event.clientY, lines: option.lines });
                }
              }}
              onMouseLeave={() => setHover(null)}
            >
              {option.date}
            </button>
          ))}
        </div>
      )}
      {hover && hover.lines.length > 0 && (
        <div
          className="chat-date-tooltip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 270),
            top: Math.min(hover.y + 16, window.innerHeight - 90)
          }}
        >
          {hover.lines.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}
    </div>
  );
}
