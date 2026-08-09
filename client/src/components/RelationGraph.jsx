function layoutNodes(nodes) {
  const cx = 250;
  const cy = 200;
  const radius = 150;
  return (nodes || []).map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

export default function RelationGraph({ relations }) {
  const nodes = layoutNodes(relations?.nodes);
  const edges = relations?.edges || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (nodes.length === 0) return <p className="muted">关系网暂无数据，完成章节创作后会生成。</p>;
  return (
    <div className="relation-graph">
      <svg viewBox="0 0 500 400" role="img" aria-label="人物与势力关系网">
        {edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <g key={index}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <text className="edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2}>{edge.label}</text>
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id} className={`relation-node ${node.type}`}>
            <circle cx={node.x} cy={node.y} r={24} />
            <text x={node.x} y={node.y - 32} textAnchor="middle">{node.name}</text>
            <text x={node.x} y={node.y + 4} textAnchor="middle">{node.type === 'faction' ? '势力' : '人物'}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
