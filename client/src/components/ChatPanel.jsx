import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';
import { useStack } from './OverlayStack.jsx';

const SUGGESTIONS = ['今天有什么想法？', '来聊聊吧！'];

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

export default function ChatPanel({ bookId, onOpenBook, onSessionCreated, sideOpen, onToggleSide }) {
  const isNew = !bookId;
  const { open } = useStack();
  const [greeting] = useState(() => SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]);
  const [book, setBook] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState('__today__');
  const [dateOpen, setDateOpen] = useState(false);
  const [dateHover, setDateHover] = useState(null);
  const [enterToSend, setEnterToSend] = useState(true);
  const dateWrapRef = useRef(null);

  async function loadBook() {
    setError('');
    try {
      const data = await api(`/books/${bookId}`);
      setBook(data.book);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (isNew) {
      setBook({
        id: '',
        title: '新创作',
        status: 'draft',
        chapters: [],
        chat: []
      });
    } else {
      loadBook();
    }
  }, [bookId]);

  const hasProcessing = Boolean(book?.chat?.some((message) => message.kind === 'processing'));

  useEffect(() => {
    if (!bookId || !hasProcessing) return undefined;
    const timer = setInterval(() => {
      api(`/books/${bookId}`)
        .then((data) => setBook(data.book))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [bookId, hasProcessing]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [book?.chat?.length, bookId, selectedDate]);

  useEffect(() => {
    if (!dateOpen) return undefined;
    const onDown = (event) => {
      if (dateWrapRef.current && !dateWrapRef.current.contains(event.target)) {
        setDateOpen(false);
        setDateHover(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dateOpen]);

  useEffect(() => {
    api('/settings')
      .then((data) => setEnterToSend(data.settings.enterToSend !== false))
      .catch(() => {});
  }, []);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending || hasProcessing) return;
    setInput('');
    setSending(true);
    setError('');
    const optimistic = {
      id: `local_${Date.now()}`,
      role: 'user',
      content,
      kind: 'text',
      createdAt: new Date().toISOString()
    };
    const typing = {
      id: `local_typing_${Date.now()}`,
      role: 'agent',
      content: '回复中',
      kind: 'typing',
      createdAt: new Date().toISOString()
    };
    setBook((prev) => (prev ? { ...prev, chat: [...(prev.chat || []), optimistic, typing] } : prev));
    try {
      const body = isNew ? { content } : { bookId, content };
      const data = await api('/chat/message', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setBook(data.book);
      if (isNew && onSessionCreated) onSessionCreated(data.book);
    } catch (err) {
      setError(err.message);
      setBook((prev) => (
        prev
          ? {
              ...prev,
              chat: [
                ...(prev.chat || []).filter((message) => message.kind !== 'typing'),
                {
                  id: `local_error_${Date.now()}`,
                  role: 'agent',
                  kind: 'error',
                  content: `失败：${err.message}`
                }
              ]
            }
          : prev
      ));
    } finally {
      setSending(false);
    }
  }

  async function abortSend() {
    setSending(true);
    try {
      await api('/chat/abort', {
        method: 'POST',
        body: JSON.stringify(bookId ? { bookId } : {})
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (error && !book) {
    return (
      <div className="chat-panel">
        <p className="form-error">{error}</p>
      </div>
    );
  }
  if (!book) {
    return (
      <div className="chat-panel">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  const todayKey = formatDate(new Date());
  const dateOptions = getDateRanges(book);
  const hasTodayRecord = dateOptions.some((option) => option.date === todayKey);
  const archiveOptions = hasTodayRecord
    ? dateOptions
    : dateOptions.filter((option) => option.date !== todayKey);
  const isKnownDate = selectedDate && selectedDate !== '__today__' && dateOptions.some((option) => option.date === selectedDate);
  const mode = selectedDate === '__today__' || !selectedDate
    ? selectedDate
    : isKnownDate ? selectedDate : '';
  const isTodayView = mode === '__today__' || mode === todayKey;
  const viewOnly = Boolean(mode && !isTodayView);
  const canAbort = sending || hasProcessing;
  const visibleMessages = isTodayView
    ? book.chat.filter((message) => formatDate(message.createdAt) === todayKey)
    : mode
      ? book.chat.filter((message) => formatDate(message.createdAt) === mode)
      : book.chat;
  let lastDate = null;

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div className="chat-head-left">
          <div>
            <strong>{isNew ? '新创作' : book.title}</strong>
            <span className={`status-badge ${hasProcessing ? 'processing' : book.status}`}>
              {hasProcessing ? '处理中' : isNew ? '等待构思' : book.status === 'draft' ? '创作中' : '已生成'}
            </span>
          </div>
          {!isNew && (
            <div className="chat-date-wrap" ref={dateWrapRef}>
              <button
                className="chat-date-select"
                onClick={() => {
                  setDateHover(null);
                  setDateOpen((open) => !open);
                }}
                aria-haspopup="listbox"
              >
                {mode === '__today__' ? '当前日期' : mode || '全部日期'}
                <span className="chat-date-caret">▾</span>
              </button>
              {dateOpen && (
                <div className="chat-date-panel" role="listbox">
                  <button
                    className={`chat-date-option${mode === '__today__' ? ' active' : ''}`}
                    onClick={() => { setSelectedDate('__today__'); setDateOpen(false); setDateHover(null); }}
                  >
                    当前日期
                  </button>
                  <button
                    className={`chat-date-option${mode === '' ? ' active' : ''}`}
                    onClick={() => { setSelectedDate(''); setDateOpen(false); setDateHover(null); }}
                  >
                    全部日期
                  </button>
                  {archiveOptions.map((option) => (
                    <button
                      key={option.date}
                      className={`chat-date-option${mode === option.date ? ' active' : ''}`}
                      onClick={() => { setSelectedDate(option.date); setDateOpen(false); setDateHover(null); }}
                      onMouseEnter={(event) => {
                        if (option.lines.length > 0) {
                          setDateHover({ x: event.clientX, y: event.clientY, lines: option.lines });
                        }
                      }}
                      onMouseMove={(event) => {
                        if (option.lines.length > 0) {
                          setDateHover({ x: event.clientX, y: event.clientY, lines: option.lines });
                        }
                      }}
                      onMouseLeave={() => setDateHover(null)}
                    >
                      {option.date}
                    </button>
                  ))}
                </div>
              )}
              {dateHover && dateHover.lines.length > 0 && (
                <div
                  className="chat-date-tooltip"
                  style={{
                    left: Math.min(dateHover.x + 14, window.innerWidth - 270),
                    top: Math.min(dateHover.y + 16, window.innerHeight - 90)
                  }}
                >
                  {dateHover.lines.map((line) => <div key={line}>{line}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        {!isNew && book.status === 'ready' && (
          <button
            className={`primary side-toggle ${sideOpen ? 'active' : ''}`}
            onClick={() => onToggleSide?.()}
          >
            并列查看
          </button>
        )}
        {!isNew && book.status === 'ready' && (
          <button className="primary side-toggle" onClick={() => open({ bookId: book.id })}>
            详情查看
          </button>
        )}
      </div>
      <div className="chat-messages" ref={messagesRef}>
        {book.chat.length === 0 && (
          <div className="chat-empty-greeting">{greeting}</div>
        )}
        {mode && visibleMessages.length === 0 && book.chat.length > 0 && (
          <p className="muted">{isTodayView ? '今天还没有对话，输入即可开始今天的创作' : '该日期暂无消息'}</p>
        )}
        {visibleMessages.map((message) => {
          const date = formatDate(message.createdAt);
          const showSeparator = !lastDate || date !== lastDate;
          lastDate = date;
          const bubble = message.kind === 'book' ? (
            <Fragment>
              {message.content && (
                <div className={`chat-message ${message.role}`}>{message.content}</div>
              )}
              <BookWidget
                book={book}
                onOpen={onOpenBook}
                active={sideOpen}
                chapter={Number(message.chapter) || 1}
              />
            </Fragment>
          ) : message.kind === 'typing' || message.kind === 'processing' ? (
            <div className="chat-message agent processing">
              回复中
              <span className="typing-dots"><i>.</i><i>.</i><i>.</i></span>
            </div>
          ) : (
            <div
              className={`chat-message ${message.role}${message.kind === 'error' ? ' error' : ''}${message.kind === 'processing' ? ' processing' : ''}`}
            >
              {message.content}
            </div>
          );
          return (
            <Fragment key={message.id}>
              {showSeparator && date && <div className="chat-date-separator">{date}</div>}
              {bubble}
            </Fragment>
          );
        })}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={viewOnly ? '该日期仅可查看，不可输入' : isNew || book.status === 'draft' ? '谈谈你的想法…' : '输入续写、修改或剧情问题…'}
          disabled={sending || hasProcessing || viewOnly}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.metaKey) return;
            const shouldSend = enterToSend ? !e.ctrlKey : e.ctrlKey;
            if (shouldSend) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button
          className={`primary${canAbort ? ' stop' : ''}`}
          onClick={canAbort ? abortSend : sendMessage}
          disabled={canAbort ? false : viewOnly || !input.trim()}
          title={canAbort ? '中断输出' : '发送'}
        >
          {canAbort ? <span className="stop-icon" aria-hidden="true" /> : '发送'}
        </button>
      </div>
    </div>
  );
}
