import { useEffect, useState } from 'react';
import { api } from '../api.js';

function listToText(list) {
  return (list || []).map((item) => (item.status ? `${item.name}：${item.status}` : item.name)).join('，');
}

function textToList(text) {
  return String(text || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const idx = item.search(/[:：]/);
      if (idx === -1) return { name: item, status: '' };
      return { name: item.slice(0, idx).trim(), status: item.slice(idx + 1).trim() };
    });
}

function parseChapterQuery(q) {
  const m = String(q || '').trim().match(/^第?\s*(\d+)\s*章?$/);
  return m ? Number(m[1]) : null;
}

export default function WorldSettingsPanel({ book, onUpdated, onNotice }) {
  const history = book.world?.history || [];
  const [historyQuery, setHistoryQuery] = useState('');
  const [summary, setSummary] = useState('');
  const [factions, setFactions] = useState('');
  const [places, setPlaces] = useState('');
  const [systems, setSystems] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const queryChapter = parseChapterQuery(historyQuery);
  const focusChapter = Number.isInteger(queryChapter)
    ? queryChapter - 1
    : (history.length > 0 ? history[history.length - 1].chapter : (book.chapters.length > 0 ? book.chapters.length - 1 : 0));
  const focused = history.find((item) => item.chapter === focusChapter) || null;

  useEffect(() => {
    const s = focused?.snapshot;
    setSummary(s?.summary || '');
    setFactions(listToText(s?.factions || []));
    setPlaces(listToText(s?.places || []));
    setSystems(listToText(s?.systems || []));
  }, [focusChapter, book.id, book.world?.history?.length]);

  const q = historyQuery.trim().toLowerCase();
  const filteredHistory = history.filter((item) => {
    if (!q) return false;
    if (Number.isInteger(queryChapter)) return false;
    const text = [item.snapshot?.summary, listToText(item.snapshot?.factions), listToText(item.snapshot?.places), listToText(item.snapshot?.systems)].join(' ');
    return text.toLowerCase().includes(q);
  });

  async function saveWorld(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await api(`/books/${book.id}/world`, {
        method: 'PUT',
        body: JSON.stringify({
          version: book.version,
          chapter: focusChapter,
          snapshot: {
            summary: summary.trim(),
            factions: textToList(factions),
            places: textToList(places),
            systems: textToList(systems)
          }
        })
      });
      onUpdated?.(data.book);
      onNotice?.('世界观已保存');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="world-settings">
      <input
        className="directory-search"
        placeholder="搜索历史章节世界观..."
        value={historyQuery}
        onChange={(e) => setHistoryQuery(e.target.value)}
      />
      <div className="world-current">当前：第{focusChapter + 1}章</div>
      <form className="world-form" onSubmit={saveWorld}>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="总述/规则" />
        <textarea value={factions} onChange={(e) => setFactions(e.target.value)} placeholder="势力（逗号分隔，如：青云宗,魔教,散修）" />
        <textarea value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="地点（逗号分隔，如：北境,藏书阁）" />
        <textarea value={systems} onChange={(e) => setSystems(e.target.value)} placeholder="体系/规则（逗号分隔，如：炼气,筑基,金丹,元婴）" />
        <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存世界观'}</button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {filteredHistory.length > 0 && (
        <div className="world-history-list">
          {filteredHistory.map((item) => (
            <button
              key={item.chapter}
              type="button"
              className="world-history-item"
              onClick={() => setHistoryQuery(`第${Number(item.chapter) + 1}章`)}
            >
              <span>第{Number(item.chapter) + 1}章</span>
              <span>{item.snapshot?.summary || '（无总述）'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
