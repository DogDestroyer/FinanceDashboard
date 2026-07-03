"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, LineStyle, LineSeries, AreaSeries } from "lightweight-charts";

// One reusable wrapper around Lightweight Charts. All chart config lives here so
// the time-series charts across the app share one themed look. Import this only
// through next/dynamic with ssr:false: the library touches window on load.

export type TSSeries = {
  data: { time: string; value: number }[];
  color: string;
  label: string;
  kind?: "line" | "area";
  dashed?: boolean;
  areaOpacity?: number;
};

const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};
const fmtTime = (t: any) => typeof t === "string" ? t
  : (t && t.year ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}` : String(t));

type Legend = { date: string; items: { label: string; text: string; color: string }[]; spread?: { text: string; pos: boolean } };

export default function TSChart({ series, height = 200, valueFmt, spreadLabel }: {
  series: TSSeries[]; height?: number; valueFmt?: (v: number) => string; spreadLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  const fmt = valueFmt ?? ((v: number) => v.toFixed(2));

  useEffect(() => {
    const el = box.current;
    if (!el || !series.length) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8A94AC", fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(35, 45, 69, 0.35)" },
        horzLines: { color: "rgba(35, 45, 69, 0.35)" },
      },
      rightPriceScale: { borderColor: "#232D45", scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: "#232D45", fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#8A94AC", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#232D45" },
        horzLine: { color: "#8A94AC", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#232D45" },
      },
      // keep the page scrollable on mobile: the chart never hijacks scroll or pinch
      handleScroll: false,
      handleScale: false,
    });

    const made = series.map(s => {
      if (s.kind === "area") {
        const a = chart.addSeries(AreaSeries, {
          lineColor: s.color, topColor: hexA(s.color, s.areaOpacity ?? 0.15), bottomColor: hexA(s.color, 0.02),
          lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
        });
        a.setData(s.data as any);
        return a;
      }
      const l = chart.addSeries(LineSeries, {
        color: s.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
        lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid,
      });
      l.setData(s.data as any);
      return l;
    });
    chart.timeScale().fitContent();

    const mkSpread = (d: number) => ({ text: `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}pp`, pos: d >= 0 });
    const showLast = () => {
      const last = series.map(s => s.data[s.data.length - 1]);
      const items = series.map((s, i) => ({ label: s.label, color: s.color, text: last[i] ? fmt(last[i].value) : "–" }));
      const spread = spreadLabel && series.length >= 2 && last[0] && last[1] ? mkSpread(last[0].value - last[1].value) : undefined;
      setLegend({ date: last[0] ? fmtTime(last[0].time) : "", items, spread });
    };
    chart.subscribeCrosshairMove(param => {
      if (param.time == null || !param.point) { showLast(); return; }
      const items = series.map((s, i) => {
        const pt = param.seriesData.get(made[i]) as any;
        return { label: s.label, color: s.color, text: pt && pt.value != null ? fmt(pt.value) : "–" };
      });
      let spread;
      if (spreadLabel && series.length >= 2) {
        const a = param.seriesData.get(made[0]) as any, b = param.seriesData.get(made[1]) as any;
        if (a?.value != null && b?.value != null) spread = mkSpread(a.value - b.value);
      }
      setLegend({ date: fmtTime(param.time), items, spread });
    });
    showLast();

    return () => chart.remove();
  }, [series, height, spreadLabel, fmt]);

  return (
    <div>
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11px] mb-1 min-h-[16px]">
        {legend && <>
          <span className="num text-fog">{legend.date}</span>
          {legend.items.map(it => (
            <span key={it.label} className="num" style={{ color: it.color }}>
              <span className="text-fog">{it.label} </span>{it.text}
            </span>
          ))}
          {legend.spread && (
            <span className={`num ${legend.spread.pos ? "text-gain" : "text-loss"}`}>
              <span className="text-fog">{spreadLabel} </span>{legend.spread.text}
            </span>
          )}
        </>}
      </div>
      <div ref={box} className="w-full" style={{ height }} />
    </div>
  );
}
