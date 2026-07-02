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

// Single-series chart scaled to its own min/max. Optional low-opacity fill to the
// peak line (used for the drawdown area). Leading nulls (warm-up windows) are skipped.
export function SeriesChart({ data, color = "#D9A441", fill = false, height = 96, label }:
  { data: (number | null)[]; color?: string; fill?: boolean; height?: number; label?: string }) {
  const W = 340, P = 6, H = height;
  const pts = data.map(v => (v == null || !isFinite(v)) ? null : v);
  const nums = pts.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="text-fog text-xs py-6 text-center">Not enough history yet.</div>;
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const x = (i: number) => P + (i / Math.max(pts.length - 1, 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const first = pts.findIndex(v => v !== null);
  let last = pts.length - 1; while (last > 0 && pts[last] === null) last--;
  let line = "", started = false;
  pts.forEach((v, i) => { if (v === null) { started = false; return; } line += `${started ? " L" : " M"}${x(i)},${y(v)}`; started = true; });
  const area = fill
    ? `M${x(first)},${y(max)} ` + pts.map((v, i) => v === null ? "" : `L${x(i)},${y(v)} `).join("") + `L${x(last)},${y(max)} Z`
    : "";
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label ?? "chart"}>
        {fill && <path d={area} fill={color} opacity="0.15" />}
        <path d={line.trim()} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {label && <p className="text-[11px] text-fog mt-1">{label}</p>}
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
