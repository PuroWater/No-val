// 人物信息卡（0.9.6）：默认显示最新快照的近况（≤50字），可二级展开查看完整快照
// （身份/背包/目标/近况）；"展开历史"保留按章快照倒序列表（点击跳转章节）。
import { useState } from 'react';

function snapshotText(snapshot) {
  if (!snapshot) return '';
  if (typeof snapshot === 'string') return snapshot;
  return String(snapshot.recent || '').trim();
}

function BagList({ bag }) {
  const items = Array.isArray(bag) ? bag : [];
  if (items.length === 0) return null;
  return (
    <ul className="character-bag">
      {items.map((item, index) => (
        <li key={index} className={item.junk ? 'junk' : ''}>
          <strong>{item.name}</strong>
          {item.status ? `：${item.status}` : ''}
        </li>
      ))}
    </ul>
  );
}

export default function CharacterCard({ card, onOpenChapter }) {
  const [open, setOpen] = useState(false);       // 展开历史
  const [detail, setDetail] = useState(false);   // 二级展开快照详情
  const [tip, setTip] = useState(null);
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];
  const snap = latest?.snapshot || null;
  const isStructured = snap && typeof snap === 'object';
  return (
    <div className="character-card">
      <div className="character-card-main">
        <div className="character-card-body">
          <div className="character-card-head">
            <strong className="character-name">{card.name}</strong>
            {latest && <span className="character-latest">最新状态·第{Number(latest.chapter) + 1}章</span>}
          </div>
          {snapshotText(snap) && <p className="character-snapshot">{snapshotText(snap)}</p>}
          {isStructured && (snap.identity || snap.bag?.length > 0 || snap.goal || snap.recent) && (
            <button
              className={`character-detail-toggle${detail ? ' active' : ''}`}
              onClick={() => setDetail((value) => !value)}
            >
              {detail ? '收起详情' : '展开详情'}
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
      {detail && isStructured && (
        <div className="character-detail">
          {snap.identity && (
            <div className="character-detail-row"><strong>身份</strong><span>{snap.identity}</span></div>
          )}
          {(snap.bag || []).length > 0 && (
            <div className="character-detail-row"><strong>背包</strong><BagList bag={snap.bag} /></div>
          )}
          {snap.goal && (
            <div className="character-detail-row"><strong>目标</strong><span>{snap.goal}</span></div>
          )}
          {snap.recent && (
            <div className="character-detail-row"><strong>近况</strong><span>{snap.recent}</span></div>
          )}
        </div>
      )}
      {open && (
        <ul className="character-history">
          {history.slice().reverse().map((item) => (
            <li key={item.chapter}>
              <button className="character-history-chapter" onClick={() => onOpenChapter?.(item.chapter)}>
                第{Number(item.chapter) + 1}章
              </button>
              ：{snapshotText(item.snapshot)}
            </li>
          ))}
        </ul>
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
