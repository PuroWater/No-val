import { Fragment, useEffect, useRef, useState } from 'react';
import { useContentTooltip, ContentTip } from './TooltipKit.jsx';

function rangeText(start, end) {
  return `第 ${start + 1}-${end + 1} 章`;
}

function clampScale(scale) {
  return Math.min(2.5, Math.max(0.5, scale));
}

export default function DevelopmentLineView({
  developmentLine,
  orientation,
  expandedGroup,
  expandedScene,
  onToggleGroup,
  onToggleScene,
  onOpenChapter,
  view,
  onViewChange
}) {
  const canvasRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef(null);
  // 0.8.49 rAF 节流：拖动/缩放高频事件每帧最多应用一次，避免长书大图重渲染卡顿
  const rafRef = useRef(0);
  const [hover, setHover] = useState(null);
  const [groupAnchor, setGroupAnchor] = useState(null);

  const { popup: eventPopup, openAt: openEventPopup, close: closeEventPopup } = useContentTooltip();
  const groups = Array.isArray(developmentLine?.groups) ? developmentLine.groups : [];
  // 同一背景可能按连续章节区间拆成多个同标签组，展开状态用唯一 id（label#start-end）
  const expandedGroupData = groups.find((group) => group.id === expandedGroup) || null;
  const vertical = orientation === 'vertical';

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function startDrag(event) {
    if (event.button !== 0) return;
    if (event.target?.closest?.('button')) return;
    // 浮窗内部有独立滚动与按钮交互，框内按下不应平移画布
    if (event.target?.closest?.('.development-line-float')) return;
    dragRef.current = { startX: event.clientX - view.x, startY: event.clientY - view.y, moved: false };
    const onMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (Math.abs(dx - view.x) + Math.abs(dy - view.y) > 4) drag.moved = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => onViewChange({ x: dx, y: dy, scale: view.scale }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function handleWheel(event) {
    // 鼠标在二级浮窗内滚动时交给浮窗原生滚动，不缩放画布
    if (event.target?.closest?.('.development-line-float')) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => onViewChange({ ...view, scale: clampScale(view.scale * factor) }));
  }

  function handleGroupClick(id, event) {
    if (dragRef.current?.moved) return;
    onToggleGroup(id);
    if (expandedGroup !== id) {
      setGroupAnchor({ el: event.currentTarget });
    } else {
      setGroupAnchor(null);
    }
  }

  function showHover(event, payload) {
    setHover({ x: event.clientX, y: event.clientY, ...payload });
  }

  function renderChapterList(chapters) {
    return (chapters || []).map((chapter) => (
      <button
        key={chapter.chapterIndex}
        className="development-line-node development-line-chapter"
        onClick={(event) => {
          if (dragRef.current?.moved) return;
          openEventPopup(event, {
            chapterIndex: chapter.chapterIndex,
            chapterTitle: chapter.chapterTitle || `第${chapter.chapterIndex + 1}章`,
            events: chapter.events || []
          });
        }}
        onMouseEnter={(event) => showHover(event, { title: '点击查看详细内容' })}
        onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
        onMouseLeave={() => setHover(null)}
      >
        <span className="development-line-node-label">{chapter.chapterTitle}</span>
      </button>
    ));
  }

  // 场景与章节合并为单个浮窗：场景标题可点击展开/收起该场景章节（就地展开，不另弹浮窗）
  function renderFloat() {
    if (!expandedGroupData || !groupAnchor || !contentRef.current) return null;
    const nodeRect = groupAnchor.el.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    const scale = view.scale || 1;
    // 浮窗在 .development-line-content（被 transform: translate + scale 的层）内部绝对定位，
    // 屏幕坐标先换算回内容坐标，浮窗尺寸/字号随画布一起缩放。
    const contentX = (nodeRect.left - contentRect.left) / scale;
    const contentY = (nodeRect.top - contentRect.top) / scale;
    const nodeW = nodeRect.width / scale;
    const nodeH = nodeRect.height / scale;
    const left = contentX + (vertical ? nodeW + 8 : 0);
    const top = contentY + (vertical ? 0 : nodeH + 8);
    const groupDirection = vertical ? 'row' : 'column';
    const chapterDirection = vertical ? 'column' : 'row';
    const scenes = expandedGroupData.scenes.length > 0
      ? [
          ...(expandedGroupData.chapters.length > 0
            ? [{ label: '（未细分）', chapters: expandedGroupData.chapters }]
            : []),
          ...expandedGroupData.scenes
        ]
      : [];
    const directChapters = expandedGroupData.scenes.length === 0 ? expandedGroupData.chapters : [];
    return (
      <div className="development-line-float" style={{ position: 'absolute', left, top, flexDirection: groupDirection }}>
        {directChapters.length > 0 && (
          <div className="development-line-chapter-column" style={{ flexDirection: chapterDirection }}>
            {renderChapterList(directChapters)}
          </div>
        )}
        {scenes.map((scene) => (
          <div key={scene.label || '__plain__'} className="development-line-scene-group">
            <button
              className={`development-line-scene-title${expandedScene === scene.label ? ' active' : ''}`}
              onClick={() => {
                if (dragRef.current?.moved) return;
                onToggleScene(scene.label);
              }}
              onMouseEnter={(event) => showHover(event, {
                title: `${scene.label || '未细分'}：${rangeText(scene.chapterStart ?? expandedGroupData.chapterStart, scene.chapterEnd ?? expandedGroupData.chapterEnd)}`
              })}
              onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
              onMouseLeave={() => setHover(null)}
            >
              {scene.label || '未细分'}
            </button>
            {expandedScene === scene.label && (
              <div className="development-line-chapter-column" style={{ flexDirection: chapterDirection }}>
                {renderChapterList(scene.chapters)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="development-line-view">
      <div
        ref={canvasRef}
        className={`development-line-canvas development-line-canvas-${orientation}`}
        onPointerDown={startDrag}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <div
          ref={contentRef}
          className={`development-line-content development-line-${orientation}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}
        >
          {groups.length === 0 && <p className="muted">这本书还在构思中，生成章节后这里会按重大事件展示发展线。</p>}
          {groups.map((group, index) => (
            <Fragment key={group.id}>
              <div className="development-line-group-block">
                <button
                  className={`development-line-node development-line-group${expandedGroup === group.id ? ' active' : ''}`}
                  onClick={(event) => handleGroupClick(group.id, event)}
                >
                  <span className="development-line-node-label">{group.label}</span>
                  <span className="development-line-node-range">{rangeText(group.chapterStart, group.chapterEnd)}</span>
                </button>
              </div>
              {/* 背景组之间的连接线：主题色、居中连接相邻背景（0.8.42 美化） */}
              {index < groups.length - 1 && <div className="development-line-connector" />}
            </Fragment>
          ))}
          {renderFloat()}
        </div>
      </div>
      {eventPopup && (
        <ContentTip popup={eventPopup} onClose={closeEventPopup} className="development-line-event-popup">
          <div className="character-detail-popup-head">
            <strong>{eventPopup.chapterTitle}</strong>
            <button className="modal-close" onClick={closeEventPopup} aria-label="关闭">×</button>
          </div>
          <div className="character-detail-body">
            {eventPopup.events.length === 0 ? (
              <span>（本章无事件）</span>
            ) : (
              eventPopup.events.map((ev, index) => {
                const scene = Array.isArray(ev.context) ? ev.context[1] : '';
                return (
                  <div key={index} className="development-line-event-item">
                    {index + 1}. {String(ev.event || '')}{scene ? `（${scene}）` : ''}
                  </div>
                );
              })
            )}
          </div>
          <div className="character-detail-popup-foot">
            <button
              className="character-goto-chapter"
              onClick={() => {
                closeEventPopup();
                onOpenChapter(eventPopup.chapterIndex);
              }}
            >
              点击前往该章节
            </button>
          </div>
        </ContentTip>
      )}
      {hover && (
        <div
          className="chat-date-tooltip development-line-tooltip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 280),
            top: Math.min(hover.y + 16, window.innerHeight - 120)
          }}
        >
          {hover.title && <strong>{hover.title}</strong>}
          {hover.detail && <pre className="development-line-tooltip-detail">{hover.detail}</pre>}
        </div>
      )}
    </div>
  );
}
