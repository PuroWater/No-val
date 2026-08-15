// 人物设定卡（0.9.0 方案 B）：展示角色最新快照 + 按章历史（只读派生，不直接编辑卡）。
import { useState } from 'react';

export default function CharacterCard({ card }) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(null);
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];
  return (
    <div className="character-card">
      <div className="character-card-body">
        <div className="character-card-head">
          <strong className="character-name">{card.name}</strong>
          {latest && <span className="character-latest">最新状态·第{Number(latest.chapter) + 1}章</span>}
        </div>
        {latest && <p className="character-snapshot">{latest.snapshot}</p>}
        {open && (
          <ul className="character-history">
            {history.slice().reverse().map((item) => (
              <li key={item.chapter}>
                <strong>第{Number(item.chapter) + 1}章</strong>：{item.snapshot}
              </li>
            ))}
          </ul>
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
