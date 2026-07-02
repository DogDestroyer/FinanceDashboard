"use client";

const PALETTE = ["#D9A441", "#3FB68B", "#5B8DEF", "#B57BD6", "#E0596B", "#4FC3D9", "#8A94AC", "#E2C36B"];

export function Donut({ data, total }: { data: [string, number][]; total: number }) {
  const R = 62, r = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Allocation">
        <g transform="translate(75,75) rotate(-90)">
          {data.map(([k, v], i) => {
            const frac = total ? v / total : 0;
            const el = (
              // key by index (not bucket name) so React reuses the same <circle> across
              // mode toggles, letting stroke-dasharray/offset transition into a sweep
              <circle key={i} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={R - r} strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-acc * C}
                className="transition-all duration-500 ease-out" />
            );
            acc += frac;
            return el;
          })}
        </g>
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.slice(0, 6).map(([k, v], i) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-fog truncate">{k}</span>
            <span className="num ml-auto text-paper">{total ? ((v / total) * 100).toFixed(1) : "0.0"}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, width = 76, height = 26, color = "#D9A441" }:
  { data: number[]; width?: number; height?: number; color?: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / span) * (height - 2) - 1}`).join(" L");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio trend">
      <path d={`M${pts}`} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
