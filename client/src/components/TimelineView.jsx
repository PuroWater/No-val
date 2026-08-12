import { useRef, useState } from 'react';

function rangeText(start, end) {
  return `第 ${start + 1}-${end + 1} 章`;
}

// 事件浮窗显示事件文本（AI 生成时已受 50 字约束），不贴 context/伏笔等字段
function eventsBrief(events) {
  return (events || []).map((item, index) => {
    const text = String(item.event || '').trim();
    return `${index + 1}. ${text}`;
  }).join('\n');
}

function clampScale(scale) {
  return Math.min(2.5, Math.max(0.5, scale));
}

export default function TimelineView({
  timeline,
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
  const dragRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [groupAnchor, setGroupAnchor] = useState(null);

  const groups = Array.isArray(timeline?.groups) ? timeline.groups : [];
  const expandedGroupData = groups.find((group) => group.label === expandedGroup) || null;
  const vertical = orientation === 'vertical';

  function startDrag(event) {
    if (event.button !== 0) return;
    if (event.target?.closest?.('button')) return;
    dragRef.current = { startX: event.clientX - view.x, startY: event.clientY - view.y, moved: false };
    const onMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (Math.abs(dx - view.x) + Math.abs(dy - view.y) > 4) drag.moved = true;
      onViewChange({ x: dx, y: dy, scale: view.scale });
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
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    onViewChange({ ...view, scale: clampScale(view.scale * factor) });
  }

  function handleGroupClick(label, event) {
    if (dragRef.current?.moved) return;
    onToggleGroup(label);
    if (expandedGroup !== label) {
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
        className="timeline-node timeline-chapter"
        onClick={() => {
          if (dragRef.current?.moved) return;
          onOpenChapter(chapter.chapterIndex);
        }}
        onMouseEnter={(event) => showHover(event, {
          title: chapter.chapterTitle,
          detail: eventsBrief(chapter.events)
        })}
        onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
        onMouseLeave={() => setHover(null)}
      >
        <span className="timeline-node-label">{chapter.chapterTitle}</span>
      </button>
    ));
  }

  // 场景与章节合并为单个浮窗：场景标题可点击展开/收起该场景章节（就地展开，不另弹浮窗）
  function renderFloat() {
    if (!expandedGroupData || !groupAnchor || !canvasRef.current) return null;
    const nodeRect = groupAnchor.el.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const left = nodeRect.left - canvasRect.left + (vertical ? nodeRect.width + 8 : 0);
    const top = nodeRect.top - canvasRect.top + (vertical ? 0 : nodeRect.height + 8);
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
      <div className="timeline-float" style={{ position: 'absolute', left, top, flexDirection: groupDirection }}>
        {directChapters.length > 0 && (
          <div className="timeline-chapter-column" style={{ flexDirection: chapterDirection }}>
            {renderChapterList(directChapters)}
          </div>
        )}
        {scenes.map((scene) => (
          <div key={scene.label || '__plain__'} className="timeline-scene-group">
            <button
              className={`timeline-scene-title${expandedScene === scene.label ? ' active' : ''}`}
              onClick={() => {
                if (dragRef.current?.moved) return;
                onToggleScene(scene.label);
              }}
              onMouseEnter={(event) => showHover(event, {
                title: `${scene.label || '未细分'}：${rangeText(scene.chapterStart ?? group.chapterStart, scene.chapterEnd ?? group.chapterEnd)}`
              })}
              onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
              onMouseLeave={() => setHover(null)}
            >
              {scene.label || '未细分'}
            </button>
            {expandedScene === scene.label && (
              <div className="timeline-chapter-column" style={{ flexDirection: chapterDirection }}>
                {renderChapterList(scene.chapters)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <div
        ref={canvasRef}
        className="timeline-canvas"
        onPointerDown={startDrag}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <div
          className={`timeline-content timeline-${orientation}`}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}
        >
          {groups.length === 0 && <p className="muted">这本书还在构思中，生成章节后这里会按重大事件展示时间线。</p>}
          {groups.map((group) => (
            <div key={group.label} className="timeline-group-block">
              <button
                className={`timeline-node timeline-group${expandedGroup === group.label ? ' active' : ''}`}
                onClick={(event) => handleGroupClick(group.label, event)}
                onMouseEnter={(event) => showHover(event, {
                  title: `${group.label}：影响范围 ${rangeText(group.chapterStart, group.chapterEnd)}`
                })}
                onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
                onMouseLeave={() => setHover(null)}
              >
                <span className="timeline-node-label">{group.label}</span>
                <span className="timeline-node-range">{rangeText(group.chapterStart, group.chapterEnd)}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      {renderFloat()}
      {hover && (
        <div
          className="chat-date-tooltip timeline-tooltip"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 280),
            top: Math.min(hover.y + 16, window.innerHeight - 120)
          }}
        >
          {hover.title && <strong>{hover.title}</strong>}
          {hover.detail && <pre className="timeline-tooltip-detail">{hover.detail}</pre>}
        </div>
      )}
    </div>
  );
}
