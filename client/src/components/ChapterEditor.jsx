import { useEffect, useRef, useState } from 'react';

export default function ChapterEditor({ chapter, onSave, onCommit }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [dirty, setDirty] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const first = useRef(true);
  const savedTimerRef = useRef(null);

  function showSavedToast() {
    setSavedToast(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedToast(false), 1000);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        await onSave({ title, content });
        showSavedToast();
      } catch {
        // 保存失败保持 dirty，下次失焦或改动时重试
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content]);

  async function handleBlur() {
    if (!dirty) return;
    setDirty(false);
    try {
      await onSave({ title, content });
      showSavedToast();
      onCommit?.();
    } catch {
      setDirty(true);
    }
  }

  return (
    <div className="chapter-editor">
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
        placeholder="章节标题"
      />
      <textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
        placeholder={content ? '正文内容' : '还没有内容，可键入章节构思'}
      />
      {savedToast && (
        <div className="toast-layer">
          <div className="saved-toast">已保存</div>
        </div>
      )}
    </div>
  );
}
