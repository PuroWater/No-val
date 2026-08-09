import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import ChapterEditor from '../components/ChapterEditor.jsx';
import RelationGraph from '../components/RelationGraph.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState('content');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/books/${id}`).then((data) => setBook(data.book)).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="form-error">{error}</p>;
  if (!book) return <p className="muted">加载中…</p>;

  const chapter = book.chapters[chapterIndex];

  async function saveChapter(patch) {
    const data = await api(`/books/${id}/chapters/${chapter.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    setBook(data.book);
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>{book.title}</h2>
        <p className="muted">{book.outline}</p>
      </div>
      <div className="tabs">
        <button className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>内容</button>
        <button className={tab === 'relations' ? 'active' : ''} onClick={() => setTab('relations')}>关系网</button>
      </div>
      {tab === 'content' ? (
        <div className="book-content">
          <select value={chapterIndex} onChange={(e) => setChapterIndex(Number(e.target.value))}>
            {book.chapters.map((item, index) => (
              <option key={item.id} value={index}>{item.title}</option>
            ))}
          </select>
          {chapter && <ChapterEditor key={chapter.id} chapter={chapter} onSave={saveChapter} />}
        </div>
      ) : (
        <RelationGraph relations={book.relations} />
      )}
    </section>
  );
}
