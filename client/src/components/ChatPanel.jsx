import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

export default function ChatPanel({ bookId, onOpenBook }) {
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
    if (bookId) loadBook();
  }, [bookId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [book?.chat?.length]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);
    setError('');
    try {
      const data = await api('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ bookId, content })
      });
      setBook(data.book);
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

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div>
          <strong>{book.title}</strong>
          <span className={`status-badge ${book.status}`}>{book.status === 'draft' ? '创作中' : '已生成'}</span>
        </div>
        {book.status === 'ready' && (
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
              className={`chat-message ${message.role}${message.kind === 'error' ? ' error' : ''}`}
            >
              {message.content}
            </div>
          );
        })}
        {sending && <div className="chat-message agent">正在处理，请稍候…</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={book.status === 'draft' ? '输入小说构思或回答 Agent 的问题…' : '输入续写、修改或剧情问题…'}
        />
        <button className="primary" onClick={sendMessage} disabled={sending}>{sending ? '处理中…' : '发送'}</button>
      </div>
    </div>
  );
}
