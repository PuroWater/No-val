import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

export default function ChatPanel({ bookId, onOpenBook, onSessionCreated }) {
  const isNew = !bookId;
  const [book, setBook] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

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
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [book?.chat?.length]);

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

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div>
          <strong>{isNew ? '新创作' : book.title}</strong>
          <span className={`status-badge ${hasProcessing ? 'processing' : book.status}`}>
            {hasProcessing ? '处理中' : isNew ? '等待构思' : book.status === 'draft' ? '创作中' : '已生成'}
          </span>
        </div>
        {!isNew && book.status === 'ready' && (
          <button className="primary" onClick={() => onOpenBook(book.id)}>并列查看</button>
        )}
      </div>
      <div className="chat-messages">
        {book.chat.length === 0 && (
          <div className="chat-empty">
            {SUGGESTIONS.map((text) => (
              <button key={text} onClick={() => setInput(text)}>{text}</button>
            ))}
          </div>
        )}
        {book.chat.map((message) => {
          if (message.kind === 'book') {
            return <BookWidget key={message.id} book={book} onOpen={onOpenBook} />;
          }
          return (
            <div
              key={message.id}
              className={`chat-message ${message.role}${message.kind === 'error' ? ' error' : ''}${message.kind === 'processing' ? ' processing' : ''}`}
            >
              {message.content}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isNew ? '输入小说构思，开始新的创作会话…' : '输入续写、修改或剧情问题…'}
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
