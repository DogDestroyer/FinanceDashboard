"use client";
import { useMemo } from "react";

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
              <circle key={k} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={R - r} strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-acc * C} />
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

export function LineChart({ labels, a, b, aName, bName }:
  { labels: string[]; a: number[]; b?: number[] | null; aName: string; bName?: string }) {
  const W = 340, H = 150, P = 6;
  const path = useMemo(() => {
    const all = b ? [...a, ...b] : a;
    const min = Math.min(...all), max = Math.max(...all);
    const span = max - min || 1;
    const pts = (arr: number[]) => arr.map((v, i) =>
      `${P + (i / Math.max(arr.length - 1, 1)) * (W - 2 * P)},${H - P - ((v - min) / span) * (H - 2 * P)}`
    ).join(" L");
    return { a: pts(a), b: b ? pts(b) : null };
  }, [a, b]);
  if (a.length < 2) return <div className="text-fog text-xs py-8 text-center">Not enough history yet. Log dated transactions and the chart builds itself.</div>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Performance chart">
        {path.b && <path d={`M${path.b}`} fill="none" stroke="#8A94AC" strokeWidth="1.4" strokeDasharray="4 3" />}
        <path d={`M${path.a}`} fill="none" stroke="#D9A441" strokeWidth="1.8" />
      </svg>
      <div className="flex gap-4 text-[11px] text-fog mt-1">
        <span><span className="inline-block w-3 h-0.5 bg-brass align-middle mr-1.5" />{aName}</span>
        {path.b && <span><span className="inline-block w-3 h-0.5 bg-fog align-middle mr-1.5" style={{ borderTop: "1px dashed" }} />{bName}</span>}
        <span className="ml-auto num">{labels[0]} → {labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}
