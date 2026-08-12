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

export default function TimelineView({
  timeline,
  orientation,
  onToggleOrientation,
  expandedGroup,
  expandedScene,
  onToggleGroup,
  onToggleScene,
  onOpenChapter,
  scrollTop,
  onScroll
}) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (scrollRef.current && typeof scrollTop === 'number') {
      scrollRef.current.scrollTop = scrollTop;
    }
  }, [scrollTop]);

  function showHover(event, payload) {
    setHover({ x: event.clientX, y: event.clientY, ...payload });
  }

  const groups = Array.isArray(timeline?.groups) ? timeline.groups : [];

  function renderChapterList(chapters) {
    return (chapters || []).map((chapter) => (
      <button
        key={chapter.chapterIndex}
        className="timeline-node timeline-chapter"
        onClick={() => onOpenChapter(chapter.chapterIndex)}
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

  function renderSceneColumn(group) {
    // context 一层：无命名场景，直接显示章节列
    if (group.scenes.length === 0) {
      return (
        <div className="timeline-scene-column">
          <div className="timeline-chapter-column">{renderChapterList(group.chapters)}</div>
        </div>
      );
    }
    const virtualScenes = group.chapters.length > 0
      ? [{ label: '（未细分）', chapterStart: group.chapterStart, chapterEnd: group.chapterEnd, chapters: group.chapters }]
      : [];
    const scenes = [...virtualScenes, ...group.scenes];
    return (
      <div className="timeline-scene-column">
        {scenes.map((scene) => (
          <div key={scene.label || '__plain__'} className="timeline-scene-block">
            <button
              className={`timeline-node timeline-scene${expandedScene === scene.label ? ' active' : ''}`}
              onClick={() => onToggleScene(scene.label)}
              onMouseEnter={(event) => showHover(event, {
                title: `${scene.label || '未细分'}${scene.label ? '寻宝' : ''}：${rangeText(scene.chapterStart, scene.chapterEnd)}`
              })}
              onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
              onMouseLeave={() => setHover(null)}
            >
              <span className="timeline-node-label">{scene.label || '未细分'}</span>
            </button>
            {expandedScene === scene.label && (
              <div className="timeline-chapter-column">{renderChapterList(scene.chapters)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <button
          className={orientation === 'vertical' ? 'active' : ''}
          onClick={() => onToggleOrientation('vertical')}
        >
          纵向
        </button>
        <button
          className={orientation === 'horizontal' ? 'active' : ''}
          onClick={() => onToggleOrientation('horizontal')}
        >
          横向
        </button>
      </div>
      <div
        ref={scrollRef}
        className={`timeline-scroll timeline-${orientation}`}
        onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      >
        {groups.length === 0 && <p className="muted">这本书还在构思中，生成章节后这里会按重大事件展示时间线。</p>}
        {groups.map((group) => {
          const open = expandedGroup === group.label;
          return (
            <div key={group.label} className="timeline-group-block">
              <button
                className={`timeline-node timeline-group${open ? ' active' : ''}`}
                onClick={() => onToggleGroup(group.label)}
                onMouseEnter={(event) => showHover(event, {
                  title: `${group.label}：影响范围 ${rangeText(group.chapterStart, group.chapterEnd)}`
                })}
                onMouseMove={(event) => setHover((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev))}
                onMouseLeave={() => setHover(null)}
              >
                <span className="timeline-node-label">{group.label}</span>
                <span className="timeline-node-range">{rangeText(group.chapterStart, group.chapterEnd)}</span>
              </button>
              {open && renderSceneColumn(group)}
            </div>
          );
        })}
      </div>
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
