// 聊天消息列表（纯展示）：渲染消息气泡/书籍卡片/日期分隔线，滚动由父级通过 ref 控制。
import { Fragment } from 'react';
import BookWidget from './BookWidget.jsx';

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

export default function ChatMessageList({ messages, book, greeting, emptyText, scrollRef, onScroll, onOpenBook }) {
  let lastDate = null;
  return (
    <div className="chat-messages" ref={scrollRef} onScroll={onScroll}>
      {book.chat.length === 0 && (
        <div className="chat-empty-greeting">{greeting}</div>
      )}
      {emptyText && messages.length === 0 && book.chat.length > 0 && (
        <p className="muted">{emptyText}</p>
      )}
      {messages.map((message) => {
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
  );
}
