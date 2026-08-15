// 人物设定卡（0.9.0 方案 B）：展示角色最新快照 + 按章历史（只读派生，不直接编辑卡）。
import { useState } from 'react';

export default function CharacterCard({ card }) {
  const [open, setOpen] = useState(false);
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];
  return (
    <div className="character-card">
      <div className="character-card-head">
        <strong className="character-name">{card.name}</strong>
        {latest && <span className="character-latest">最新状态·第{Number(latest.chapter) + 1}章</span>}
        {history.length > 1 && (
          <button className="character-history-toggle" onClick={() => setOpen((value) => !value)}>
            {open ? '收起历史' : `历史（${history.length}）`}
          </button>
        )}
      </div>
      {latest && <p className="character-snapshot">{latest.snapshot}</p>}
      {open && (
        <ul className="character-history">
          {history.map((item) => (
            <li key={item.chapter}>
              <strong>第{Number(item.chapter) + 1}章</strong>：{item.snapshot}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
