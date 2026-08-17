import { useEffect, useRef } from 'react';

// 横向卡片行：纵向滚轮转为横向滚动，避免容器高度被卡片撑开。
export default function CharacterRow({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      if (event.target.closest('.character-history-list')) return;
      if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        el.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return <div className="character-row" ref={ref}>{children}</div>;
}
