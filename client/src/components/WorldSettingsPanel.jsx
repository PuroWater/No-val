import { useState } from 'react';
import { api } from '../api.js';
import { useContentTooltip, ContentTip } from './TooltipKit.jsx';

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
      if (idx === -1) return { name: line, status: '' };
      return { name: line.slice(0, idx).trim(), status: line.slice(idx + 1).trim() };
    });
}

function snapshotText(snapshot) {
  if (!snapshot) return '';
  const parts = [];
  if (snapshot.summary) parts.push(`总述/规则：${snapshot.summary}`);
  if ((snapshot.factions || []).length) parts.push(`势力：${listToText(snapshot.factions)}`);
  if ((snapshot.places || []).length) parts.push(`地点：${listToText(snapshot.places)}`);
  if ((snapshot.systems || []).length) parts.push(`体系/规则：${listToText(snapshot.systems)}`);
  return parts.join('\n');
}

export default function WorldSettingsPanel({ book, onUpdated, onNotice }) {
  const history = (book.world?.history || []);
  const latest = history[history.length - 1];
  const [summary, setSummary] = useState(latest?.snapshot?.summary || '');
  const [factions, setFactions] = useState(listToText(latest?.snapshot?.factions || []));
  const [places, setPlaces] = useState(listToText(latest?.snapshot?.places || []));
  const [systems, setSystems] = useState(listToText(latest?.snapshot?.systems || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openHistory, setOpenHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const historyTip = useContentTooltip();

  async function saveWorld(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const data = await api(`/books/${book.id}/world`, {
        method: 'PUT',
        body: JSON.stringify({
          version: book.version,
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

  const q = historyQuery.trim().toLowerCase();
  const chapterMatch = q.match(/^第?\s*(\d+)\s*章?$/);
  const filteredHistory = history.filter((item) => {
    if (!q) return true;
    if (chapterMatch) return Number(item.chapter) + 1 === Number(chapterMatch[1]);
    return snapshotText(item.snapshot).toLowerCase().includes(q);
  });

  return (
    <div className="world-settings">
      <div className="world-settings-head">
        <strong>世界观设定</strong>
        <button type="button" className="secondary" onClick={() => setOpenHistory((v) => !v)}>{openHistory ? '收起历史' : '历史'}</button>
      </div>
      <form className="world-form" onSubmit={saveWorld}>
        <label>
          <span>总述/规则</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="一两段概括世界观与核心规则" />
        </label>
        <label>
          <span>势力（每行 名称：状态）</span>
          <textarea value={factions} onChange={(e) => setFactions(e.target.value)} placeholder={'青云宗：正道魁首\n魔教：盘踞西域'} />
        </label>
        <label>
          <span>地点（每行 名称：状态）</span>
          <textarea value={places} onChange={(e) => setPlaces(e.target.value)} placeholder={'北境：苦寒之地\n藏书阁：家族重地'} />
        </label>
        <label>
          <span>体系/规则（每行 名称：状态）</span>
          <textarea value={systems} onChange={(e) => setSystems(e.target.value)} placeholder={'境界：炼气→筑基→金丹\n灵石：通用货币'} />
        </label>
        <button className="primary" type="submit" disabled={saving}>{saving ? '保存中…' : '保存世界观'}</button>
      </form>
      {error && <p className="form-error">{error}</p>}

      {openHistory && (
        <div className="world-history">
          <input
            className="directory-search"
            placeholder="搜索章号…"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
          <div className="world-history-list">
            {filteredHistory.length === 0 ? (
              <p className="muted">暂无世界观历史</p>
            ) : (
              filteredHistory.slice().reverse().map((item) => (
                <button
                  key={item.chapter}
                  type="button"
                  className="world-history-item"
                  onClick={(event) => historyTip.openAt(event, { chapter: item.chapter, snapshot: item.snapshot })}
                >
                  <span>第{Number(item.chapter) + 1}章</span>
                  <span>{item.snapshot.summary || '（无总述）'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {historyTip.popup && (
        <ContentTip popup={historyTip.popup} onClose={historyTip.close} className="world-detail-popup">
          <div className="character-detail-popup-head">
            <strong>世界观·第{Number(historyTip.popup.chapter) + 1}章</strong>
            <button className="modal-close" onClick={historyTip.close} aria-label="关闭">×</button>
          </div>
          <pre className="world-detail-text">{snapshotText(historyTip.popup.snapshot) || '（空）'}</pre>
        </ContentTip>
      )}
    </div>
  );
}
