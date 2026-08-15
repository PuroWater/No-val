import { useEffect, useRef, useState } from 'react';
import ChatMessageList from './ChatMessageList.jsx';
import ChatDatePicker from './ChatDatePicker.jsx';
import { api } from '../api.js';
import BookWidget from './BookWidget.jsx';
import ChatModelPicker from './ChatModelPicker.jsx';
import { useStack } from './OverlayStack.jsx';

const SUGGESTIONS = ['今天有什么想法？', '来聊聊吧！'];

// 0.8.48 刷新即中断：模块级标记，仅页面刷新（模块重载）后首次加载时检查一次，切换书不重复中断。
let initializedForSession = false;

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

export default function ChatPanel({ bookId, onOpenBook, onSessionCreated, sideOpen, onToggleSide, onBookChanged }) {
  const isNew = !bookId;
  const { open } = useStack();
  const [greeting] = useState(() => SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)]);
  const [book, setBook] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  // 两阶段新书：首条消息先 /chat/sessions 拿 book.id，处理期间用它轮询进度
  const [activeBookId, setActiveBookId] = useState('');
  const messagesRef = useRef(null);
  const [selectedDate, setSelectedDate] = useState('__today__');
  const [enterToSend, setEnterToSend] = useState(true);
  // 每本书独立维护聊天输入草稿：存 sessionStorage，页面不关闭（含路由切换/刷新）期间保活。
  const draftKey = bookId ? `novel_chat_draft_${bookId}` : 'novel_chat_draft_new';

  async function loadBook() {
    setError('');
    try {
      const data = await api(`/books/${bookId}`);
      setBook(data.book);
      // 0.8.48 刷新即中断：本 SPA 会话首次加载时若存在 processing 残留（上一轮未正常收尾），自动中断标记，不再卡死
      if (!initializedForSession) {
        initializedForSession = true;
        if ((data.book.chat || []).some((message) => message.kind === 'processing')) {
          api(`/chat/abort`, { method: 'POST', body: JSON.stringify({ bookId }) }).catch(() => {});
        }
      }
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

  const effectiveBookId = bookId || activeBookId;
  const hasProcessing = Boolean(book?.chat?.some((message) => message.kind === 'processing'));
  const waiting = sending || hasProcessing;
  const progressBarVisible = hasProcessing && Boolean(progress) && progress.total > 0;

  useEffect(() => {
    // 发送即开始轮询（不等 book 里出现 processing 消息），响应返回后停止；
    // 普通问答也走同一条轮询，但 progress.total 为 0 时前端只显示统一等待文案。
    if (!effectiveBookId || !waiting) return undefined;
    const poll = () => {
      api(`/books/${effectiveBookId}`)
        .then((data) => setBook(data.book))
        .catch(() => {});
      api(`/chat/progress?bookId=${effectiveBookId}`)
        .then((data) => { if (data.progress) setProgress(data.progress); })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [effectiveBookId, waiting]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    updateScrollAnchor();
    // 顶部进度条出现/消失会改变消息区高度，需重新钉底，避免最新消息被挤出可视区
  }, [book?.chat?.length, bookId, selectedDate, progressBarVisible]);

  // 0.8.43 并列查看聊天上移修复：布局/尺寸变化（点并列宽度变窄、文本重排、拖分隔条）时，
  // 按“变化前”的阅读锚点修复滚动——原本在底部保持钉底，翻历史保持相对进度。
  // 锚点在滚动事件里用“变化前”的值更新。
  // 关键：并列切换会触发 ChatPanel 重挂载（条件分支），新实例的 ResizeObserver 会错过
  // 已完成的宽度变化，因此 sideOpen 变化时直接用锚点修复（主修复）；ResizeObserver 兜底
  // 处理同实例内的其他尺寸变化（如拖分隔条、内容加载）。
  const scrollAnchorRef = useRef({ atBottom: true, ratio: 0 });
  const updateScrollAnchor = () => {
    const el = messagesRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    scrollAnchorRef.current = {
      atBottom: max > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < 40,
      ratio: max > 0 ? el.scrollTop / max : 0
    };
  };
  // 并列切换（sideOpen 变化）后：DOM 已更新、文本重排完成，按“变化前”锚点修复滚动
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return undefined;
    const { atBottom, ratio } = scrollAnchorRef.current;
    const max = el.scrollHeight - el.clientHeight;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    } else if (max > 0) {
      el.scrollTop = Math.round(ratio * max);
    }
  }, [sideOpen]);
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return undefined;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { atBottom, ratio } = scrollAnchorRef.current;
        const max = el.scrollHeight - el.clientHeight;
        if (atBottom) {
          el.scrollTop = el.scrollHeight;
        } else if (max > 0) {
          el.scrollTop = Math.round(ratio * max);
        }
      });
    });
    observer.observe(el);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  useEffect(() => {
    api('/settings')
      .then((data) => setEnterToSend(data.settings.enterToSend !== false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(draftKey);
    if (saved) setInput(saved);
  }, [draftKey]);

  async function sendMessage(contentOverride) {
    // 防御：onClick 直接传函数时首个参数是事件对象，必须回退到输入框内容
    const content = typeof contentOverride === 'string' && contentOverride.trim()
      ? contentOverride.trim()
      : input.trim();
    if (!content || sending || hasProcessing) return;
    setInput('');
    sessionStorage.removeItem(draftKey);
    setProgress(null);
    setSending(true);
    setError('');
    try {
      let targetBookId = bookId;
      if (isNew && !activeBookId) {
        const session = await api('/chat/sessions', { method: 'POST' });
        setActiveBookId(session.book.id);
        targetBookId = session.book.id;
      }
      // 0.9.4 稳定重试令牌：同一本书、同一内容的“重发”复用同一 messageId，
      // 服务端按 book.lastAppliedMessageId 去重——响应丢失后用户重发不再重复写入。
      // 发送成功后清令牌；失败保留（下次同内容重发即复用）。
      // 边界：全新草稿首条消息失败重发会新建会话（不同 bookId），令牌不跨书，属已知限制。
      const retryKey = `novel_retry_${targetBookId}`;
      let messageId = '';
      try {
        const saved = JSON.parse(sessionStorage.getItem(retryKey) || 'null');
        if (saved && saved.content === content && saved.messageId) messageId = saved.messageId;
      } catch {
        messageId = '';
      }
      if (!messageId) messageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      sessionStorage.setItem(retryKey, JSON.stringify({ messageId, content }));
      const typing = {
        id: `local_typing_${Date.now()}`,
        role: 'agent',
        content: '回复中',
        kind: 'typing',
        createdAt: new Date().toISOString()
      };
      setBook((prev) => {
        if (!prev) return prev;
        const optimistic = { id: messageId, role: 'user', content, kind: 'text', createdAt: new Date().toISOString() };
        return { ...prev, chat: [...(prev.chat || []), optimistic, typing] };
      });
      const data = await api('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ bookId: targetBookId, content, messageId })
      });
      sessionStorage.removeItem(retryKey);
      setBook(data.book);
      onBookChanged?.();
      if (isNew && onSessionCreated) onSessionCreated(data.book);
    } catch (err) {
      // 失败保留 retry 令牌：同内容重发复用 messageId，服务端去重防重复写入
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
      const targetId = bookId || activeBookId;
      await api('/chat/abort', {
        method: 'POST',
        body: JSON.stringify(targetId ? { bookId: targetId } : {})
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
            <ChatDatePicker book={book} mode={mode} onSelect={setSelectedDate} />
          )}
        </div>
        {!isNew && book.status === 'ready' && (
          <div className="chat-head-actions">
            <button
              className={`primary side-toggle ${sideOpen ? 'active' : ''}`}
              onClick={() => onToggleSide?.()}
            >
              并列查看
            </button>
            <button className="primary side-toggle" onClick={() => open({ bookId: book.id })}>
              详情查看
            </button>
          </div>
        )}
      </div>
      {progressBarVisible && (
        <div className="chat-progress">
          <span className="chat-progress-text">{progress.text || '处理中…'}</span>
          {progress.total > 0 && (
            <span className="chat-progress-bar">
              <span
                className="chat-progress-fill"
                style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }}
              />
            </span>
          )}
        </div>
      )}
            <ChatMessageList
        messages={visibleMessages}
        book={book}
        greeting={greeting}
        emptyText={mode ? (isTodayView ? '今天还没有对话，输入即可开始今天的创作' : '该日期暂无消息') : ''}
        scrollRef={messagesRef}
        onScroll={updateScrollAnchor}
        onOpenBook={onOpenBook}
      />
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            sessionStorage.setItem(draftKey, e.target.value);
          }}
          placeholder={waiting ? '请等待回复完成或中断' : viewOnly ? '该日期仅可查看，不可输入' : isNew || book.status === 'draft' ? '谈谈你的想法…' : '输入续写、修改或剧情问题…'}
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
        <ChatModelPicker disabled={sending || hasProcessing} />
        <button
          className={`primary${canAbort ? ' stop' : ''}`}
          onClick={canAbort ? abortSend : () => sendMessage()}
          disabled={canAbort ? false : viewOnly || !input.trim()}
          title={canAbort ? '中断输出' : '发送'}
        >
          {canAbort ? <span className="stop-icon" aria-hidden="true" /> : '发送'}
        </button>
      </div>
    </div>
  );
}
