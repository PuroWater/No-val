import { Component, useEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 1200;
const VIEW_H = 900;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeLayout(nodes, edges) {
  if (!nodes.length) return { positions: new Map(), protagonist: null };
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  });
  const degree = (id) => (adjacency.get(id) || []).length;
  const main = nodes.find((node) => node.isMain);
  const protagonist = main || [...nodes].sort((a, b) => degree(b.id) - degree(a.id)).find((node) => node.type === 'person') || nodes[0];
  const layer = new Map(nodes.map((node) => [node.id, -1]));
  const parent = new Map();
  layer.set(protagonist.id, 0);
  const queue = [protagonist.id];
  while (queue.length > 0) {
    const current = queue.shift();
    const currentLayer = layer.get(current);
    (adjacency.get(current) || []).forEach((neighbor) => {
      if (layer.get(neighbor) === -1) {
        layer.set(neighbor, currentLayer + 1);
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    });
  }
  const layers = new Map();
  nodes.forEach((node) => {
    const key = layer.get(node.id) === -1 ? 99 : layer.get(node.id);
    if (!layers.has(key)) layers.set(key, []);
    layers.get(key).push(node.id);
  });
  const radii = [0, 180, 330, 480, 620, 720];
  const positions = new Map();
  positions.set(protagonist.id, { x: 0, y: 0, angle: 0 });
  const maxLayer = Math.max(...[...layers.keys()].filter((key) => key !== 99), 0);
  for (let level = 1; level <= maxLayer; level += 1) {
    const ids = layers.get(level) || [];
    const groups = new Map();
    ids.forEach((id) => {
      const key = parent.get(id) || 'root';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    });
    const ordered = [];
    groups.forEach((list, key) => {
      const base = key === 'root' ? 0 : Math.atan2(positions.get(key)?.y || 0, positions.get(key)?.x || 0);
      list.forEach((id, index) => {
        ordered.push({ id, angle: base + (index - (list.length - 1) / 2) * 0.32 });
      });
    });
    ordered.sort((a, b) => a.angle - b.angle);
    const radius = radii[level] || 720;
    ordered.forEach((item) => {
      positions.set(item.id, {
        x: radius * Math.cos(item.angle),
        y: radius * Math.sin(item.angle),
        angle: item.angle
      });
    });
  }
  const unconnected = layers.get(99) || [];
  unconnected.forEach((id, index) => {
    const angle = (2 * Math.PI * index) / Math.max(unconnected.length, 1);
    positions.set(id, { x: 720 * Math.cos(angle), y: 720 * Math.sin(angle), angle });
  });
  const maxWeight = Math.max(...nodes.map((node) => Math.max(1, Number(node.weight) || 1)), 1);
  const sized = new Map(nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 0, y: 0, angle: 0 };
    const rawWeight = Math.max(1, Number(node.weight) || 1);
    const weight = rawWeight + degree(node.id) * 0.5;
    const radius = 22 + (weight / (maxWeight + Math.max(...nodes.map((n) => degree(n.id))) * 0.5)) * 30;
    return [node.id, { ...node, ...pos, weight, degree: degree(node.id), radius }];
  }));
  return { positions: sized, protagonist: protagonist.id };
}

function RelationGraphInner({ relations }) {
  const nodes = relations?.nodes || [];
  const edges = relations?.edges || [];
  const hasGraph = nodes.length > 0;
  const layout = useMemo(() => computeLayout(nodes, edges), [relations]);
  const [view, setView] = useState({ x: VIEW_W / 2, y: VIEW_H / 2, scale: 1 });
  const drag = useRef(null);
  const dragHandlers = useRef(null);
  const containerRef = useRef(null);

  function zoom(factor) {
    setView((current) => ({ ...current, scale: clamp(current.scale * factor, 0.2, 3) }));
  }

  useEffect(() => {
    // 关系网为空时组件提前返回空态，容器 div 不存在；有节点后再挂滚轮监听。
    if (!hasGraph) return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    const handler = (event) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((current) => ({ ...current, scale: clamp(current.scale * factor, 0.2, 3) }));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [hasGraph]);

  useEffect(() => () => {
    if (dragHandlers.current) {
      window.removeEventListener('pointermove', dragHandlers.current.onMove);
      window.removeEventListener('pointerup', dragHandlers.current.onUp);
      window.removeEventListener('pointercancel', dragHandlers.current.onUp);
    }
    drag.current = null;
  }, []);

  function handlePointerDown(event) {
    if (event.target?.closest?.('button')) return;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    drag.current = { startX: event.clientX - view.x, startY: event.clientY - view.y };
    const onMove = (moveEvent) => {
      const state = drag.current;
      if (!state) return;
      if (!Number.isFinite(moveEvent.clientX) || !Number.isFinite(moveEvent.clientY)) return;
      setView((current) => ({
        ...current,
        x: moveEvent.clientX - state.startX,
        y: moveEvent.clientY - state.startY
      }));
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragHandlers.current = null;
    };
    dragHandlers.current = { onMove, onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  if (nodes.length === 0) return <p className="muted">关系网暂无数据，章节创作或修改后请点击重新生成按钮。</p>;

  const showEdgeLabels = edges.length <= 30;

  return (
    <div
      ref={containerRef}
      className="relation-graph"
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none' }}
    >
      <div className="graph-toolbar">
        <button onClick={() => zoom(1.25)}>放大</button>
        <button onClick={() => zoom(1 / 1.25)}>缩小</button>
        <button onClick={() => setView({ x: VIEW_W / 2, y: VIEW_H / 2, scale: 1 })}>重置</button>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label="人物与势力关系网">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {edges.map((edge, index) => {
            const from = layout.positions.get(edge.from);
            const to = layout.positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <g key={index}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                {showEdgeLabels && edge.label && (
                  <text className="edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{edge.label}</text>
                )}
              </g>
            );
          })}
          {[...layout.positions.values()].map((node) => (
            <g key={node.id} className={`relation-node ${node.type}`}>
              {node.isMain && <circle className="main-halo" cx={node.x} cy={node.y} r={node.radius + 8} />}
              <circle cx={node.x} cy={node.y} r={node.radius} />
              <text x={node.x} y={node.y - node.radius - 10} textAnchor="middle">{node.name}</text>
              <text className="node-type" x={node.x} y={node.y + 4} textAnchor="middle">
                {node.type === 'faction' ? '势力' : node.isMain ? '主角' : '人物'}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="graph-legend">
        <span><i className="legend-dot person" />人物</span>
        <span><i className="legend-dot faction" />势力</span>
        <span><i className="legend-dot main" />主角</span>
        <span>拖动平移 / 滚轮缩放</span>
      </div>
    </div>
  );
}

class GraphBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <p className="form-error">关系网渲染失败：{String(this.state.error)}</p>;
    }
    return this.props.children;
  }
}

export default function RelationGraph(props) {
  return (
    <GraphBoundary>
      <RelationGraphInner {...props} />
    </GraphBoundary>
  );
}
