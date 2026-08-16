// 人物信息卡（0.9.7）：近况为超链接，点击唤出"内容性 tooltip"（类型3，主题色、宽、
// 左上角 x+14/y+16 定位、不跟随、点外部关闭）显示该快照详情 + 前往该章节；
// 展开历史：第x章粗体 + 缩进近况（无下划线/链接样式，点击同样可看对应章详情）。
import { useState } from 'react';
import { useContentTooltip, ContentTip, useHoverTip, HoverTip } from './TooltipKit.jsx';

function snapshotRecent(snapshot) {
  if (!snapshot) return '';
  if (typeof snapshot === 'string') return snapshot;
  return String(snapshot.recent || '').trim();
}

export default function CharacterCard({ card, onOpenChapter }) {
  const [open, setOpen] = useState(false);       // 展开历史
  const { popup, openAt, close } = useContentTooltip();
  const { tip, bindHover } = useHoverTip();
  const history = Array.isArray(card.history) ? card.history : [];
  const latest = history[history.length - 1];
  const snap = popup?.snapshot;

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
              onClick={(event) => openAt(event, { chapter: latest.chapter, snapshot: latest.snapshot })}
              {...bindHover('点击查看详细内容')}
            >
              {snapshotRecent(latest.snapshot)}
            </button>
          )}
        </div>
        {history.length > 1 && (
          <button
            className={`character-history-toggle${open ? ' active' : ''}`}
            onClick={() => setOpen((value) => !value)}
            {...bindHover(open ? '收起历史' : '展开历史')}
          >
            {open ? '收起历史' : '展开历史'}
          </button>
        )}
      </div>
      {open && (
        <ul className="character-history">
          {history.slice().reverse().map((item) => (
            <li key={item.chapter}>
              <div className="character-history-chapter-label">第{Number(item.chapter) + 1}章：</div>
              {snapshotRecent(item.snapshot) ? (
                <button
                  type="button"
                  className="character-history-snapshot"
                  onClick={(event) => openAt(event, { chapter: item.chapter, snapshot: item.snapshot })}
                  {...bindHover('点击查看详细内容')}
                >
                  {snapshotRecent(item.snapshot)}
                </button>
              ) : (
                <div className="character-history-snapshot">（无近况）</div>
              )}
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
