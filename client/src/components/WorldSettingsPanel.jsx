import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToasts, Toasts } from './TooltipKit.jsx';

function listToText(list) {
  return (list || []).map((item) => (item.status ? `${item.name}：${item.status}` : item.name)).join('\n');
}

function textToList(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.search(/[:：]/);
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });
}

function parseChapterQuery(q) {
  const m = String(q || '').trim().match(/^第?\s*(\d+)\s*章?$/);
  return m ? Number(m[1]) : null;
}

function validateNameIntro(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const idx = line.search(/[:：]/);
    if (idx === -1 || !line.slice(0, idx).trim()) return false;
  }
  return true;
}

export default function WorldSettingsPanel({ book, onUpdated, onNotice }) {
  const history = book.world?.history || [];
  const [historyQuery, setHistoryQuery] = useState('');
  const [summary, setSummary] = useState('');
  const [power, setPower] = useState('');
  const [factions, setFactions] = useState('');
  const [places, setPlaces] = useState('');
  const [saving, setSaving] = useState(false);
  const { toasts, pushToast } = useToasts();

  const queryChapter = parseChapterQuery(historyQuery);
  const focusChapter = Number.isInteger(queryChapter)
    ? queryChapter - 1
    : (history.length > 0 ? history[history.length - 1].chapter : (book.chapters.length > 0 ? book.chapters.length - 1 : 0));
  const focused = history.find((item) => item.chapter === focusChapter) || null;

  useEffect(() => {
    const s = focused?.snapshot;
    setSummary(s?.summary || '');
    setPower(s?.power || '');
    setFactions(listToText(s?.factions || []));
    setPlaces(listToText(s?.places || []));
  }, [focusChapter, book.id, book.world?.history?.length]);

  const q = historyQuery.trim().toLowerCase();
  const filteredHistory = history.filter((item) => {
    if (!q) return false;
    if (Number.isInteger(queryChapter)) return false;
    const text = [item.snapshot?.summary, item.snapshot?.power, listToText(item.snapshot?.factions), listToText(item.snapshot?.places)].join(' ');
    return text.toLowerCase().includes(q);
  });

  async function saveWorld(event) {
    event.preventDefault();
    setSaving(true);
    if (!validateNameIntro(factions)) {
      pushToast('势力/集团格式：每行需为“名称：介绍”', true);
      setSaving(false);
      return;
    }
    if (!validateNameIntro(places)) {
      pushToast('地点/区域格式：每行需为“名称：介绍”', true);
      setSaving(false);
      return;
    }
    try {
      const data = await api(`/books/${book.id}/world`, {
        method: 'PUT',
        body: JSON.stringify({
          version: book.version,
          chapter: focusChapter,
          snapshot: {
            summary: summary.trim(),
            power: power.trim(),
            factions: textToList(factions),
            places: textToList(places)
          }
        })
      });
      onUpdated?.(data.book);
      onNotice?.('世界观已保存');
    } catch (err) {
      pushToast(err.message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="world-settings">
      <h4 className="book-info-section-title">世界观设定</h4>
      <input
        className="directory-search"
        placeholder="搜索历史章节世界观..."
        value={historyQuery}
        onChange={(e) => setHistoryQuery(e.target.value)}
      />
      <div className="world-current">当前：第{focusChapter + 1}章</div>
      <form className="world-form" onSubmit={saveWorld}>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="世界观总述" />
        <textarea value={power} onChange={(e) => setPower(e.target.value)} placeholder="境界/等级设定（如有）" />
        <textarea value={factions} onChange={(e) => setFactions(e.target.value)} placeholder="势力/集团（每行一个，名称与介绍之间用冒号分隔）" />
        <textarea value={places} onChange={(e) => setPlaces(e.target.value)} placeholder="地点/区域（每行一个，名称与介绍之间用冒号分隔）" />
        <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存世界观'}</button>
      </form>
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
      <Toasts toasts={toasts} />
    </div>
  );
}
