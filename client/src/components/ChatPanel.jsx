import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

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
      const parts = [];
      const modified = [...new Set(info.modified)].sort((a, b) => a - b);
      if (modified.length > 0) {
        parts.push(`修改：${modified.join('、')}`);
      }
      const hasAdded = info.end >= info.start;
      if (hasAdded) {
        parts.push(info.start === info.end ? `新增${info.start}` : `新增${info.start}-${info.end}`);
      }
      return { date, label: parts.length > 0 ? `${date} ${parts.join('')}` : date };
    });
}

export default function ChatPanel({ bookId, onOpenBook, onSessionCreated, sideOpen, onToggleSide }) {
  const isNew = !bookId;
  const [book, setBook] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState('');

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
    setBook((prev) => (prev ? { ...prev, chat: [...(prev.chat || []), optimistic] } : prev));
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
                ...(prev.chat || []),
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
    if (sending) return;
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

  const dateOptions = getDateRanges(book);
  const effectiveDate = dateOptions.some((option) => option.date === selectedDate) ? selectedDate : '';
  const visibleMessages = effectiveDate
    ? book.chat.filter((message) => formatDate(message.createdAt) === effectiveDate)
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
          {!isNew && dateOptions.length > 0 && (
            <select
              className="chat-date-select"
              value={effectiveDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              <option value="">全部日期</option>
              {dateOptions.map((option) => (
                <option key={option.date} value={option.date}>{option.label}</option>
              ))}
            </select>
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
      </div>
      <div className="chat-messages" ref={messagesRef}>
        {book.chat.length === 0 && (
          <div className="chat-empty">
            {SUGGESTIONS.map((text) => (
              <button key={text} onClick={() => setInput(text)}>{text}</button>
            ))}
          </div>
        )}
        {effectiveDate && visibleMessages.length === 0 && (
          <p className="muted">该日期暂无消息</p>
        )}
        {visibleMessages.map((message) => {
          const date = formatDate(message.createdAt);
          const showSeparator = !lastDate || date !== lastDate;
          lastDate = date;
          const bubble = message.kind === 'book' ? (
            <BookWidget book={book} onOpen={onOpenBook} />
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
          placeholder={isNew || book.status === 'draft' ? '谈谈你的想法…' : '输入续写、修改或剧情问题…'}
          disabled={sending || hasProcessing}
        />
        <button
          className={`primary${hasProcessing ? ' stop' : ''}`}
          onClick={hasProcessing ? abortSend : sendMessage}
          disabled={sending || (!hasProcessing && !input.trim())}
          title={hasProcessing ? '中断输出' : '发送'}
        >
          {hasProcessing ? '■' : sending ? '处理中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
