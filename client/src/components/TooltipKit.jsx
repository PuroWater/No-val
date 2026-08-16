// 三类 tooltip 统一抽象（0.9.7）：避免各处复制粘贴。
// 类型1 消息提示性：toast（屏幕中间，已保存/测试连接消息）→ useToasts + <Toasts/>
// 类型2 解释性：悬浮跟随鼠标（设置页开启按钮说明）→ useHoverTip + <HoverTip/>
// 类型3 内容性：点击唤出，左上角 x+14/y+16 定位、不跟随鼠标、点外部关闭（人物卡详情/发展线事件详情）→ useContentTooltip + <ContentTip/>；主题色、宽、内容多
import { useEffect, useRef, useState } from 'react';

// ---------- 类型1：消息提示性 toast ----------
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  function pushToast(text, error = false, duration = 1000) {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, duration);
  }
  return { toasts, pushToast };
}

export function Toasts({ toasts }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;
  return (
    <div className="toast-layer">
      {toasts.map((toast) => (
        <div key={toast.id} className={`saved-toast${toast.error ? ' error' : ''}`}>{toast.text}</div>
      ))}
    </div>
  );
}

// ---------- 类型2：解释性悬浮提示（跟随鼠标，x+14/y+16） ----------
export function useHoverTip() {
  const [tip, setTip] = useState(null);
  function bindHover(text) {
    return {
      onMouseEnter: (event) => setTip({ x: event.clientX, y: event.clientY, text }),
      onMouseMove: (event) => setTip((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : { x: event.clientX, y: event.clientY, text })),
      onMouseLeave: () => setTip(null)
    };
  }
  return { tip, setTip, bindHover };
}

export function HoverTip({ tip }) {
  if (!tip) return null;
  return (
    <div
      className="chat-date-tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 270),
        top: Math.min(tip.y + 16, window.innerHeight - 90)
      }}
    >
      {tip.text}
    </div>
  );
}

// ---------- 类型3：内容性提示（点击唤出，左上角 x+14/y+16，不跟随，点外部关闭） ----------
export function useContentTooltip() {
  const [popup, setPopup] = useState(null);
  useEffect(() => {
    if (!popup) return undefined;
    const onDocClick = (event) => {
      if (!event.target.closest('[data-content-tip]')) setPopup(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [popup]);
  function openAt(event, payload = {}) {
    event?.stopPropagation?.();
    setPopup({ x: event.clientX, y: event.clientY, ...payload });
  }
  return { popup, openAt, close: () => setPopup(null) };
}

export function ContentTip({ popup, onClose, className = '', children }) {
  if (!popup) return null;
  return (
    <div
      data-content-tip
      className={`content-tip ${className}`.trim()}
      style={{
        left: Math.max(8, Math.min(popup.x + 14, window.innerWidth - 300)),
        top: Math.max(8, Math.min(popup.y + 16, window.innerHeight - 90))
      }}
    >
      {children}
    </div>
  );
}
