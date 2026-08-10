import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('zh-CN');
  } catch {
    return '';
  }
}

function compareDate(a, b) {
  const pa = a.split('/').map(Number);
  const pb = b.split('/').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getDateRanges(book) {
  const byDate = new Map();
  (book.chat || []).forEach((message) => {
    const date = formatDate(message.createdAt);
    if (!date) return;
    byDate.set(date, byDate.get(date) || { active: true, start: Infinity, end: 0 });
  });
  (book.chapters || []).forEach((chapter, index) => {
    const date = formatDate(chapter.updatedAt);
    if (!date) return;
    const info = byDate.get(date) || { active: false, start: Infinity, end: 0 };
    info.start = Math.min(info.start, index + 1);
    info.end = Math.max(info.end, index + 1);
    byDate.set(date, info);
  });
  return [...byDate.entries()]
    .sort((a, b) => compareDate(a[0], b[0]))
    .map(([date, info]) => {
      const hasRange = info.end >= info.start;
      const range = hasRange
        ? info.start === info.end
          ? `${info.start}章`
          : `${info.start}-${info.end}章`
        : '';
      return { date, label: range ? `${date} ${range}` : date };
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
  const visibleMessages = selectedDate
    ? book.chat.filter((message) => formatDate(message.createdAt) === selectedDate)
    : book.chat;
  let lastDate = null;

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div>
          <strong>{isNew ? '新创作' : book.title}</strong>
          <span className={`status-badge ${hasProcessing ? 'processing' : book.status}`}>
            {hasProcessing ? '处理中' : isNew ? '等待构思' : book.status === 'draft' ? '创作中' : '已生成'}
          </span>
        </div>
        {!isNew && dateOptions.length > 0 && (
          <select
            className="chat-date-select"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            <option value="">全部日期</option>
            {dateOptions.map((option) => (
              <option key={option.date} value={option.date}>{option.label}</option>
            ))}
          </select>
        )}
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
        {selectedDate && visibleMessages.length === 0 && (
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
          className="primary"
          onClick={sendMessage}
          disabled={sending || hasProcessing || !input.trim()}
        >
          {sending || hasProcessing ? '处理中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
