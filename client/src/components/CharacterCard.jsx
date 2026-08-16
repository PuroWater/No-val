import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useContentTooltip, ContentTip, useHoverTip, HoverTip } from './TooltipKit.jsx';

function snapshotRecent(snapshot) {
  if (!snapshot) return '';
  if (typeof snapshot === 'string') return snapshot;
  return String(snapshot.recent || '').trim();
}

export default function CharacterCard({ card, bookId, onOpenChapter, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const { popup, openAt, close } = useContentTooltip();
  const { tip, bindHover } = useHoverTip();
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];
  const snap = popup?.snapshot;

  function openLatest(event) {
    if (!latest) return;
    openAt(event, { chapter: latest.chapter, snapshot: latest.snapshot });
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
    <div className="character-card">
      <button
        type="button"
        className="character-card-cover"
        onClick={openLatest}
        {...bindHover('查看最新设定详情')}
      >
        {card.avatar ? <img src={card.avatar} alt={card.name} /> : <span className="character-card-fallback">{card.name?.[0] || '角'}</span>}
      </button>
      <div className="character-card-name">{card.name}</div>
      {latest && <div className="character-card-meta">最新·第{Number(latest.chapter) + 1}章</div>}
      <div className="character-card-actions">
        <button type="button" onClick={openLatest} disabled={!latest}>详情</button>
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={history.length <= 1}>{open ? '收起历史' : '历史'}</button>
        <button type="button" onClick={triggerUpload} disabled={uploading}>{uploading ? '上传中' : '立绘'}</button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleFile} />
      </div>
      {error && <p className="form-error">{error}</p>}
      {open && (
        <ul className="character-history">
          {history.slice().reverse().map((item) => (
            <li key={item.chapter}>
              <button
                type="button"
                className="character-history-chapter"
                onClick={(event) => openAt(event, { chapter: item.chapter, snapshot: item.snapshot })}
              >
                第{Number(item.chapter) + 1}章：{snapshotRecent(item.snapshot) || '（无近况）'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {popup && (
        <ContentTip popup={popup} onClose={close} className="character-detail-popup">
          <div className="character-detail-popup-head">
            <strong>{card.name}</strong>
            {Number.isInteger(popup.chapter) && <span>第{Number(popup.chapter) + 1}章</span>}
            <button className="modal-close" onClick={close} aria-label="关闭">×</button>
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
          {Number.isInteger(popup.chapter) && (
            <div className="character-detail-popup-foot">
              <button className="character-goto-chapter" onClick={() => { close(); onOpenChapter?.(popup.chapter); }}>
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
