export default function MiniChart({ positive = true, height = 40 }) {
  const positivePoints = [0,10,5,20,15,30,20,35,28,25,35,38,40,36,45,40];
  const negativePoints = [0,30,5,25,15,15,20,20,28,10,35,8,40,12,45,5];
  const pts = positive ? positivePoints : negativePoints;

  const w = 80, h = height;
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const scaleX = (x) => (x / 45) * w;
  const scaleY = (y) => h - ((y - minY) / (maxY - minY + 1)) * (h - 4) - 2;

  const d = xs.map((x, i) =>
    `${i === 0 ? 'M' : 'L'}${scaleX(x)},${scaleY(ys[i])}`
  ).join(' ');

  const fill = d +
    ` L${w},${h} L0,${h} Z`;

  const color = positive ? '#00D68F' : '#FF4D6A';
  const gradId = `mini-grad-${positive ? 'pos' : 'neg'}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', height }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}