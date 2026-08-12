import { useEffect, useRef, useState } from 'react';

function rangeText(start, end) {
  return `第 ${start + 1}-${end + 1} 章`;
}

function eventsBrief(events) {
  return (events || []).map((item, index) => {
    const ctx = Array.isArray(item.context) && item.context.length > 0 ? `（${item.context.join('/')}）` : '';
    const fw = item.foreshadow ? ` [伏笔：${item.foreshadow === 'setup' ? '铺设' : '回收'}]` : '';
    return `${index + 1}. ${item.event}${ctx}${fw}${item.time ? `（${item.time}）` : ''}`;
  }).join('\n');
}

function clampPos(left, top, width = 320, height = 240) {
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - height - 8))
  };
}

export default function TimelineView({
  timeline,
  orientation,
  expandedGroup,
  expandedScene,
  onToggleGroup,
  onToggleScene,
  onOpenChapter,
  scrollTop,
  onScroll
}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [groupAnchor, setGroupAnchor] = useState(null);
  const [sceneAnchor, setSceneAnchor] = useState(null);

  useEffect(() => {
    if (scrollRef.current && typeof scrollTop === 'number') {
      scrollRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  const groups = Array.isArray(timeline?.groups) ? timeline.groups : [];
  const expandedGroupData = groups.find((group) => group.label === expandedGroup) || null;
  const vertical = orientation === 'vertical';

  function startDrag(event) {
    if (event.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { x: event.clientX, y: event.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
    const onMove = (ev) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        el.scrollLeft = drag.sl - dx;
        el.scrollTop = drag.st - dy;
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleGroupClick(label, event) {
    if (dragRef.current?.moved) return;
    onToggleGroup(label);
    if (expandedGroup !== label) {
      setGroupAnchor({ el: event.currentTarget });
      setSceneAnchor(null);
    } else {
      setGroupAnchor(null);
      setSceneAnchor(null);
    }
  }

  function handleSceneClick(label, event) {
    if (dragRef.current?.moved) return;
    onToggleScene(label);
    if (expandedScene !== label) {
      setSceneAnchor({ el: event.currentTarget });
    } else {
      setSceneAnchor(null);
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

  function renderSceneFloat() {
    if (!expandedGroupData || !groupAnchor) return null;
    const rect = groupAnchor.el.getBoundingClientRect();
    const floatStyle = vertical
      ? { position: 'fixed', ...clampPos(rect.right + 8, rect.top, 480, 280), flexDirection: 'row' }
      : { position: 'fixed', ...clampPos(rect.left, rect.bottom + 8, 300, 340), flexDirection: 'column' };
    const directChapters = expandedGroupData.scenes.length === 0 ? expandedGroupData.chapters : [];
    const scenes = expandedGroupData.scenes.length > 0
      ? [
          ...(expandedGroupData.chapters.length > 0
            ? [{ label: '（未细分）', chapterStart: expandedGroupData.chapterStart, chapterEnd: expandedGroupData.chapterEnd, chapters: expandedGroupData.chapters }]
            : []),
          ...expandedGroupData.scenes
        ]
      : [];
    return (
      <div className="timeline-float" style={floatStyle}>
        {directChapters.length > 0 ? (
          <div className="timeline-chapter-column" style={{ flexDirection: vertical ? 'column' : 'row' }}>
            {renderChapterList(directChapters)}
          </div>
        ) : (
          scenes.map((scene) => (
            <div key={scene.label || '__plain__'} className="timeline-scene-block">
              <button
                className={`timeline-node timeline-scene${expandedScene === scene.label ? ' active' : ''}`}
                onClick={(event) => handleSceneClick(scene.label, event)}
                onMouseEnter={(event) => showHover(event, {
                  title: `${scene.label || '未细分'}：${rangeText(scene.chapterStart, scene.chapterEnd)}`
                })}
                onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
                onMouseLeave={() => setHover(null)}
              >
                <span className="timeline-node-label">{scene.label || '未细分'}</span>
              </button>
              {expandedScene === scene.label && sceneAnchor && (
                <div
                  className="timeline-chapter-float"
                  style={{
                    position: 'fixed',
                    ...(() => {
                      const sRect = sceneAnchor.el.getBoundingClientRect();
                      return vertical
                        ? clampPos(sRect.left, sRect.bottom + 8, 300, 260)
                        : clampPos(sRect.right + 8, sRect.top, 380, 220);
                    })(),
                    flexDirection: vertical ? 'column' : 'row'
                  }}
                >
                  {renderChapterList(scene.chapters)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <div
        ref={scrollRef}
        className={`timeline-scroll timeline-${orientation}`}
        onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
        onPointerDown={startDrag}
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
      {renderSceneFloat()}
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
