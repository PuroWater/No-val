// 章节目录（自包含）：搜索 + 章节列表 + 新建章输入 + 删除按钮，选择/删除/新建通过回调上报。
import { useEffect, useRef, useState } from 'react';

function intToChinese(number) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const n = Math.max(1, Math.floor(number));
  if (n < 10) return digits[n];
  if (n < 20) return n === 10 ? '十' : `十${digits[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ''}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${digits[hundreds]}百${rest ? (rest < 10 ? `零${digits[rest]}` : intToChinese(rest)) : ''}`;
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${digits[thousands]}千${rest ? (rest < 100 ? `零${intToChinese(rest)}` : intToChinese(rest)) : ''}`;
}

function nextChapterPrefix(chapters) {
  const last = chapters[chapters.length - 1];
  if (!last) return '';
  const match = String(last.title).match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章/);
  if (!match) return '';
  const chinese = /[零一二两三四五六七八九十百千]/.test(match[1]);
  return chinese ? `第${intToChinese(chapters.length + 1)}章 ` : `第${chapters.length + 1}章 `;
}

// 提取章节名部分：去掉“第n章”前缀（含冒号/空格），只剩“第n章”时返回空。
function chapterNamePart(raw) {
  const match = raw.match(/^第\s*([0-9零一二两三四五六七八九十百千]+)\s*章[\s:：]*/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

export default function ChapterDirectory({ chapters, chapterIndex, onSelect, onDelete, onAdd, deleteError }) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const addInputRef = useRef(null);
  const directoryRef = useRef(null);

  function startAddChapter() {
    setNewTitle(nextChapterPrefix(chapters));
    setAdding(true);
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  function commitAddChapter() {
    const raw = newTitle.trim();
    setAdding(false);
    setNewTitle('');
    if (!raw || !chapterNamePart(raw)) return;
    onAdd(raw);
  }

  const queryText = query.trim().toLowerCase();
  const filtered = chapters.filter((item, index) => (
    !queryText
    || item.title.toLowerCase().includes(queryText)
    || String(index + 1).includes(queryText)
  ));

  useEffect(() => {
    directoryRef.current?.querySelector('.directory-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [chapters, chapterIndex]);

  return (
    <aside className="chapter-directory" ref={directoryRef}>
      <input
        className="directory-search"
        placeholder="搜索章节…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.map((item) => (
        <button
          key={item.id}
          className={`directory-item ${chapterIndex === chapters.indexOf(item) ? 'active' : ''}`}
          onClick={() => onSelect(chapters.indexOf(item))}
        >
          <span className="directory-label">{item.title}</span>
          {chapters.length > 1 && (
            <span
              className="directory-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            >
              删除
            </span>
          )}
        </button>
      ))}
      {chapters.length <= 1 && <p className="muted">仅剩 1 章不可删除，删除整书请到「我的」页面。</p>}
      {adding ? (
        <input
          ref={addInputRef}
          className="directory-add-input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAddChapter(); }}
          onBlur={commitAddChapter}
          placeholder="章节名"
        />
      ) : (
        <button className="directory-add-chapter" onClick={startAddChapter}>
          点击添加新章节
        </button>
      )}
      {filtered.length === 0 && <p className="muted">没有匹配的章节</p>}
      {deleteError && <p className="form-error">{deleteError}</p>}
    </aside>
  );
}
