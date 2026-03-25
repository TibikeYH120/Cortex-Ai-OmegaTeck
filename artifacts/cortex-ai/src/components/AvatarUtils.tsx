function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const CYBER_PALETTES = [
  { from: "#00d0ff", to: "#6c3bff", accent: "#00d0ff" },
  { from: "#ff2e7e", to: "#6c3bff", accent: "#ff2e7e" },
  { from: "#00ff88", to: "#00d0ff", accent: "#00ff88" },
  { from: "#ffd700", to: "#ff6b00", accent: "#ffd700" },
  { from: "#c77dff", to: "#ff2e7e", accent: "#c77dff" },
  { from: "#00d0ff", to: "#00ff88", accent: "#00d0ff" },
  { from: "#ff6b6b", to: "#ff2e7e", accent: "#ff6b6b" },
  { from: "#00c9ff", to: "#92fe9d", accent: "#00c9ff" },
];

const SHAPES = ["hexagon", "diamond", "circle", "square"];

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function UserAvatar({
  name,
  email,
  size = 36,
  className = "",
}: {
  name: string;
  email?: string;
  size?: number;
  className?: string;
}) {
  const seed = email || name || "user";
  const h = hashStr(seed);
  const palette = CYBER_PALETTES[h % CYBER_PALETTES.length];
  const shape = SHAPES[(h >> 4) % SHAPES.length];
  const rotation = ((h >> 8) % 360);
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";

  const uid = `av-${seed.replace(/[^a-z0-9]/gi, "")}-${size}`;
  const r = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ borderRadius: shape === "circle" ? "50%" : shape === "square" ? "4px" : undefined, flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.from} stopOpacity="0.25" />
          <stop offset="100%" stopColor={palette.to} stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${uid}-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.from} stopOpacity="0.8" />
          <stop offset="100%" stopColor={palette.to} stopOpacity="0.6" />
        </linearGradient>
        <filter id={`${uid}-glow`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <clipPath id={`${uid}-clip`}>
          {shape === "hexagon" ? (
            <path d={hexPath(r, r, r - 1)} />
          ) : shape === "diamond" ? (
            <polygon points={`${r},1 ${size - 1},${r} ${r},${size - 1} 1,${r}`} />
          ) : shape === "circle" ? (
            <circle cx={r} cy={r} r={r - 1} />
          ) : (
            <rect x={1} y={1} width={size - 2} height={size - 2} rx={4} />
          )}
        </clipPath>
      </defs>

      {/* Background fill */}
      <rect x={0} y={0} width={size} height={size} fill="#06060f" />

      {/* Shape background */}
      <g clipPath={`url(#${uid}-clip)`}>
        <rect x={0} y={0} width={size} height={size} fill={`url(#${uid}-g)`} />

        {/* Decorative circuit lines based on hash */}
        {Array.from({ length: 4 }).map((_, i) => {
          const angle = (rotation + i * 90) * (Math.PI / 180);
          const x1 = r;
          const y1 = r;
          const x2 = r + Math.cos(angle) * r * 0.7;
          const y2 = r + Math.sin(angle) * r * 0.7;
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={palette.accent}
              strokeWidth="0.6"
              strokeOpacity="0.35"
            />
          );
        })}

        {/* Corner dots */}
        {[
          [r * 0.3, r * 0.3],
          [r * 1.7, r * 0.3],
          [r * 0.3, r * 1.7],
          [r * 1.7, r * 1.7],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={1} fill={palette.accent} fillOpacity={0.4} />
        ))}
      </g>

      {/* Shape border */}
      {shape === "hexagon" ? (
        <path d={hexPath(r, r, r - 1)} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="1" />
      ) : shape === "diamond" ? (
        <polygon points={`${r},1 ${size - 1},${r} ${r},${size - 1} 1,${r}`} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="1" />
      ) : shape === "circle" ? (
        <circle cx={r} cy={r} r={r - 1} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="1" />
      ) : (
        <rect x={1} y={1} width={size - 2} height={size - 2} rx={4} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="1" />
      )}

      {/* Initials */}
      <text
        x={r}
        y={r + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.3}
        fontWeight="700"
        fontFamily="Orbitron, monospace"
        fill={palette.accent}
        filter={`url(#${uid}-glow)`}
      >
        {initials}
      </text>
    </svg>
  );
}

export function CortexAvatar({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/cortex-avatar.png"
        alt="Cortex AI"
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          objectFit: "cover",
          boxShadow: "0 0 12px rgba(0,208,255,0.3)",
        }}
      />
      {/* Cyan border overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 10,
          border: "1px solid rgba(0,208,255,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
