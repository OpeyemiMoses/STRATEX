export default function PnLChart({ data, height = 160 }) {
  const w = 400;
  const h = height;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };

  // Use real data if provided, otherwise use mock
  const points = data?.length > 0 ? data : Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    value: 100 + Math.sin(i * 0.3) * 10 + i * 1.5,
  }));

  const values = points.map(p => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  const scaleX = (i) =>
    padding.left + (i / (points.length - 1)) * (w - padding.left - padding.right);
  const scaleY = (v) =>
    padding.top + (1 - (v - minV) / (maxV - minV + 1)) * (h - padding.top - padding.bottom);

  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(p.value)}`
  ).join(' ');

  const fill = d +
    ` L${scaleX(points.length - 1)},${h - padding.bottom}` +
    ` L${scaleX(0)},${h - padding.bottom} Z`;

  // Y axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV].map(v => v.toFixed(0));

  return (
    <div style={{ background: '#060A10', borderRadius: 6, border: '1px solid var(--border)', padding: 12 }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: '100%', height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1B6FF8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#1B6FF8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((ratio, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={padding.top + ratio * (h - padding.top - padding.bottom)}
            x2={w - padding.right}
            y2={padding.top + ratio * (h - padding.top - padding.bottom)}
            stroke="#1E2D45"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
        ))}

        {/* Fill */}
        <path d={fill} fill="url(#pnlGrad)" />

        {/* Line */}
        <path d={d} fill="none" stroke="#1B6FF8" strokeWidth="1.5" />

        {/* Y labels */}
        {yLabels.map((label, i) => (
          <text
            key={i}
            x={padding.left - 6}
            y={scaleY([minV, (minV + maxV) / 2, maxV][i]) + 4}
            textAnchor="end"
            fill="#64748B"
            fontSize="9"
            fontFamily="JetBrains Mono"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}