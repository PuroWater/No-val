// 人物信息卡（0.9.6/0.9.7）：默认显示最新快照的近况（≤50字），近况文字为超链接样式，
// 点击弹出该快照的详情悬浮窗（身份/背包/目标/近况）；"展开历史"各章近况同样可点击查看对应章详情。
import { useEffect, useState } from 'react';

function snapshotRecent(snapshot) {
  if (!snapshot) return '';
  if (typeof snapshot === 'string') return snapshot;
  return String(snapshot.recent || '').trim();
}

function SnapshotPopup({ card, item, onClose }) {
  const snap = item?.snapshot;
  if (!snap || typeof snap !== 'object') return null;
  return (
    <div className="character-detail-popup">
      <div className="character-detail-popup-head">
        <strong>{card.name}</strong>
        {Number.isInteger(item.chapter) && <span>第{Number(item.chapter) + 1}章</span>}
        <button className="modal-close" onClick={onClose} aria-label="关闭">×</button>
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
                  <strong>{item2.name}</strong>
                  {item2.status ? `：${item2.status}` : ''}
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
    </div>
  );
}

export default function CharacterCard({ card, onOpenChapter }) {
  const [open, setOpen] = useState(false);       // 展开历史
  const [detail, setDetail] = useState(null);    // { chapter, snapshot, left, top }
  const [tip, setTip] = useState(null);
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];

  // 点击外部关闭详情弹窗
  useEffect(() => {
    if (!detail) return undefined;
    const onDocClick = (event) => {
      if (!event.target.closest('.character-detail-popup')) setDetail(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [detail]);

  function openDetail(event, item) {
    event.stopPropagation();
    const width = 320;
    const height = 280;
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(event.clientY + 12, window.innerHeight - height - 8));
    setDetail({ chapter: item.chapter, snapshot: item.snapshot, left, top });
  }

  return (
    <div className="character-card">
      <div className="character-card-main">
        <div className="character-card-body">
          <div className="character-card-head">
            <strong className="character-name">{card.name}</strong>
            {latest && <span className="character-latest">最新状态·第{Number(latest.chapter) + 1}章</span>}
          </div>
          {snapshotRecent(latest?.snapshot) && (
            <button
              type="button"
              className="character-snapshot-link"
              onClick={(event) => openDetail(event, latest)}
              title="点击查看该章快照详情"
            >
              {snapshotRecent(latest.snapshot)}
            </button>
          )}
        </div>
        {history.length > 1 && (
          <button
            className={`character-history-toggle${open ? ' active' : ''}`}
            onClick={() => setOpen((value) => !value)}
            onMouseEnter={(event) => setTip({ x: event.clientX, y: event.clientY })}
            onMouseMove={(event) => setTip({ x: event.clientX, y: event.clientY })}
            onMouseLeave={() => setTip(null)}
          >
            {open ? '收起历史' : '展开历史'}
          </button>
        )}
      </div>
      {open && (
        <ul className="character-history">
          {history.slice().reverse().map((item) => (
            <li key={item.chapter}>
              <button className="character-history-chapter" onClick={() => onOpenChapter?.(item.chapter)}>
                第{Number(item.chapter) + 1}章
              </button>
              ：{' '}
              {snapshotRecent(item.snapshot) ? (
                <button
                  type="button"
                  className="character-snapshot-link"
                  onClick={(event) => openDetail(event, item)}
                  title="点击查看该章快照详情"
                >
                  {snapshotRecent(item.snapshot)}
                </button>
              ) : (
                ''
              )}
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <SnapshotPopup card={card} item={detail} onClose={() => setDetail(null)} />
      )}
      {tip && (
        <div
          className="chat-date-tooltip"
          style={{
            left: Math.min(tip.x + 14, window.innerWidth - 270),
            top: Math.min(tip.y + 16, window.innerHeight - 90)
          }}
        >
          共 {history.length} 条历史
        </div>
      )}
    </div>
  );
}
