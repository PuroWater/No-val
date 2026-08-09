import { useEffect, useRef, useState } from 'react';

export default function ChapterEditor({ chapter, onSave }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const [saving, setSaving] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave({ title, content });
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content]);

  return (
    <div className="chapter-editor">
      <div className="editor-toolbar">
        <span>{saving ? '保存中…' : '已自动保存'}</span>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="章节标题" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="正文内容" />
    </div>
  );
}
