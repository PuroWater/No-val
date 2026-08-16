import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useContentTooltip, ContentTip, useHoverTip, HoverTip } from './TooltipKit.jsx';

function snapshotRecent(snapshot) {
  if (!snapshot) return '';
  if (typeof snapshot === 'string') return snapshot;
  return String(snapshot.recent || '').trim();
}

export default function CharacterCard({ card, bookId, focusChapter, expanded, onToggleHistory, onOpenChapter, onUpdated, onNotice }) {
  const [uploading, setUploading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const detailTip = useContentTooltip();
  const imageTip = useContentTooltip();
  const { tip, bindHover } = useHoverTip();

  const history = Array.isArray(card.history) ? card.history : [];
  const focusIndex = Number.isInteger(focusChapter)
    ? history.findIndex((item) => Number(item.chapter) + 1 === focusChapter)
    : -1;
  const currentIndex = focusIndex >= 0 ? focusIndex : history.length - 1;
  const current = history[currentIndex] || null;
  const currentChapter = current ? Number(current.chapter) + 1 : null;
  const snap = detailTip.popup?.snapshot;

  const historyQueryText = historyQuery.trim().toLowerCase();
  const historyChapterMatch = historyQueryText.match(/^第?\s*(\d+)\s*章?$/);
  const filteredHistory = history.filter((item) => {
    if (!historyQueryText) return true;
    if (historyChapterMatch) return Number(item.chapter) + 1 === Number(historyChapterMatch[1]);
    return snapshotRecent(item.snapshot).toLowerCase().includes(historyQueryText);
  });

  function openDetail(event, item) {
    detailTip.openAt(event, { chapter: item.chapter, snapshot: item.snapshot });
  }

  function triggerUpload() {
    fileRef.current?.click();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !bookId) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError('立绘图片大小需在 5MB 以内');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = await api(`/books/${bookId}/characters/avatar`, {
          method: 'POST',
          body: JSON.stringify({ name: card.name, image: String(reader.result || '') })
        });
        onUpdated?.(data.book);
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={`character-card${expanded ? ' expanded' : ''}`}>
      <div className="character-card-left">
        <button
          type="button"
          className="character-card-cover"
          onClick={(event) => imageTip.openAt(event)}
          {...bindHover('点击设置图片')}
        >
          {card.avatar ? <img src={card.avatar} alt={card.name} /> : <span className="character-card-fallback">{card.name?.[0] || '角'}</span>}
        </button>
        <div className="character-card-info">
          <div className="character-card-name">{card.name}</div>
          {current && <div className="character-card-meta">当前：第{currentChapter}章</div>}
          <div className="character-card-actions">
            <button type="button" onClick={(event) => current && openDetail(event, current)} disabled={!current}>详情</button>
            <button type="button" onClick={onToggleHistory} disabled={history.length === 0}>{expanded ? '收起' : '历史'}</button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="character-history-panel">
          <input
            className="directory-search character-history-search"
            placeholder="搜索该角色章号…"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
          <div className="character-history-list">
            {filteredHistory.length === 0 ? (
              <p className="muted">没有匹配的历史</p>
            ) : (
              filteredHistory.slice().reverse().map((item) => (
                <button
                  key={item.chapter}
                  type="button"
                  className="character-history-item"
                  onClick={(event) => openDetail(event, item)}
                >
                  <span>第{Number(item.chapter) + 1}章</span>
                  <span>{snapshotRecent(item.snapshot) || '（无近况）'}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleFile} />
      {error && <p className="form-error">{error}</p>}

      {imageTip.popup && (
        <ContentTip popup={imageTip.popup} onClose={imageTip.close} className="character-menu-popup">
          <div className="character-detail-popup-head">
            <strong>设置图片</strong>
            <button className="modal-close" onClick={imageTip.close} aria-label="关闭">×</button>
          </div>
          <div className="character-menu-actions">
            <button type="button" onClick={() => { imageTip.close(); triggerUpload(); }} disabled={uploading}>
              {uploading ? '上传中…' : '本地上传'}
            </button>
            <button type="button" onClick={() => { imageTip.close(); onNotice?.('AI 生图功能尚未实现，敬请期待'); }}>
              AI 生成
            </button>
          </div>
        </ContentTip>
      )}

      {detailTip.popup && (
        <ContentTip popup={detailTip.popup} onClose={detailTip.close} className="character-detail-popup">
          <div className="character-detail-popup-head">
            <strong>{card.name}</strong>
            {Number.isInteger(detailTip.popup.chapter) && <span>第{Number(detailTip.popup.chapter) + 1}章</span>}
            <button className="modal-close" onClick={detailTip.close} aria-label="关闭">×</button>
          </div>
          <div className="character-detail-body">
            {snap.identity && (
              <div className="character-detail-row"><strong>身份</strong><span>{snap.identity}</span></div>
            )}
            {(snap.bag || []).length > 0 && (
              <div className="character-detail-row">
                <strong>背包</strong>
                <ul className="character-bag">
                  {(snap.bag || []).map((item2, index) => (
                    <li key={index} className={item2.junk ? 'junk' : ''}>
                      <button
                        type="button"
                        className="character-bag-item"
                        {...bindHover(item2.status ? `${item2.name}：${item2.status}` : item2.name)}
                      >
                        {item2.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {snap.goal && (
              <div className="character-detail-row"><strong>目标</strong><span>{snap.goal}</span></div>
            )}
            {snap.recent && (
              <div className="character-detail-row"><strong>近况</strong><span>{snap.recent}</span></div>
            )}
          </div>
          {Number.isInteger(detailTip.popup.chapter) && (
            <div className="character-detail-popup-foot">
              <button className="character-goto-chapter" onClick={() => { detailTip.close(); onOpenChapter?.(detailTip.popup.chapter); }}>
                点击前往该章节
              </button>
            </div>
          )}
        </ContentTip>
      )}
      <HoverTip tip={tip} />
    </div>
  );
}
