import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const SUGGESTIONS = ['今天有什么想法', '来聊聊吧！'];

export default function ChatPanel({ mode }) {
  const [input, setInput] = useState('');
  const [bookId, setBookId] = useState('');
  const [books, setBooks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'continue') {
      api('/books').then((data) => setBooks(data.books)).catch((err) => setError(err.message));
    }
  }, [mode]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    setError('');
    setLoading(true);
    const question = input.trim();
    setMessages((list) => [...list, { role: 'user', text: question }]);
    setInput('');
    try {
      const payload = mode === 'create'
        ? { concept: question }
        : { bookId, instruction: question };
      const data = await api(mode === 'create' ? '/chat/create-book' : '/chat/continue', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const text = mode === 'create'
        ? `已创建《${data.book.title}》，共 ${data.book.chapters.length} 章。`
        : `已续写《${data.book.title}》下一章。`;
      setMessages((list) => [...list, { role: 'agent', text }]);
      navigate('/my');
    } catch (err) {
      setMessages((list) => [...list, { role: 'agent', text: `失败：${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        {mode === 'create' ? '创作新书' : '续写章节'}
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            {SUGGESTIONS.map((text) => (
              <button key={text} onClick={() => setInput(text)}>{text}</button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`chat-message ${message.role}`}>{message.text}</div>
        ))}
        {loading && <div className="chat-message agent">正在创作，请稍候…</div>}
        {error && <div className="chat-message agent">失败：{error}</div>}
      </div>
      {mode === 'continue' && (
        <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">选择一本书</option>
          {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
        </select>
      )}
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'create' ? '输入一本小说的构思…' : '输入续写指令…'}
        />
        <button className="primary" onClick={handleSend} disabled={loading || (mode === 'continue' && !bookId)}>发送</button>
      </div>
    </div>
  );
}
