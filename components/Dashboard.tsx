"use client";
import { useMemo, useState } from "react";
import { AppState } from "@/lib/types";
import { Valued, FxMap, groupWeights, navHistory, twrSeries, toUSD } from "@/lib/portfolio";
import { Donut, LineChart } from "./Charts";

const moveCol = (x: number) => x > 1e-9 ? "text-gain" : x < -1e-9 ? "text-loss" : "text-fog";

export default function Dashboard({ state, valued, cash, cashUSD, navUSD, fx, fmt, disp, hist, base }: {
  state: AppState; valued: Valued[]; cash: Record<string, number>; cashUSD: number;
  navUSD: number; fx: FxMap; fmt: (usd: number, dp?: number) => string; disp: (usd: number) => number;
  hist: any; base: string;
}) {
  const [donutMode, setDonutMode] = useState<"assetClass" | "geo" | "currency">("assetClass");
  const [showAllMovers, setShowAllMovers] = useState(false);

  const dayPnl = valued.reduce((a, v) => a + v.dayPnlUSD, 0);
  const totalPnl = valued.reduce((a, v) => a + v.unrealizedUSD + v.realizedUSD, 0);
  const invested = valued.reduce((a, v) => a + toUSD(v.costBasis, v.currency, fx), 0);
  const dayPct = navUSD - dayPnl > 0 ? dayPnl / (navUSD - dayPnl) : 0;
  const totalPct = invested > 0 ? totalPnl / invested : 0;

  const donut = useMemo(() => groupWeights(valued, cash, fx, donutMode), [valued, cash, fx, donutMode]);
  const donutTotal = donut.reduce((a, [, v]) => a + v, 0);

  const movers = useMemo(() => [...valued].filter(v => v.prevClose > 0)
    .map(v => ({ symbol: v.symbol, name: v.name, chg: v.price / v.prevClose - 1, dayPnlUSD: v.dayPnlUSD }))
    .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)), [valued]);
  const visibleMovers = showAllMovers ? movers : movers.slice(0, 6);

  const chart = useMemo(() => {
    if (!hist?.series || !state.transactions.length) return null;
    const allDates = new Set<string>();
    Object.values<any>(hist.series).forEach((s: any) => s.dates.forEach((d: string) => allDates.add(d)));
    (hist.bench?.dates ?? []).forEach((d: string) => allDates.add(d));
    const dates = [...allDates].sort();
    if (dates.length < 3) return null;
    const { nav, flows } = navHistory(state.transactions, hist.series, hist.fxSeries ?? {}, dates);
    const start = nav.findIndex(v => v > 0);
    if (start < 0 || nav.length - start < 3) return null;
    const idx = twrSeries(nav.slice(start), flows.slice(start));
    let bIdx: number[] | null = null;
    if (hist.bench) {
      const bMap: Record<string, number> = {};
      hist.bench.dates.forEach((d: string, i: number) => bMap[d] = hist.bench.closes[i]);
      let last = 0; const closes = dates.slice(start).map(d => (last = bMap[d] ?? last));
      const first = closes.find(c => c > 0) ?? 1;
      bIdx = closes.map(c => (c / first) * 100);
    }
    return { labels: dates.slice(start), idx, bIdx };
  }, [hist, state.transactions]);

  const P = ({ v, pct }: { v: number; pct: number }) => (
    <span className={`num ${v >= 0 ? "text-gain" : "text-loss"}`}>
      {v >= 0 ? "+" : "−"}{fmt(Math.abs(v))} ({(pct * 100).toFixed(2)}%)
    </span>
  );

  return (
    <>
      <section aria-label="Net asset value">
        <p className="text-fog text-xs uppercase tracking-widest">Net asset value · {base}</p>
        <p className="num text-4xl font-medium mt-1">{fmt(navUSD)}</p>
        <div className="flex gap-5 mt-2 text-sm">
          <div><span className="text-fog text-xs block">Today</span><P v={dayPnl} pct={dayPct} /></div>
          <div><span className="text-fog text-xs block">Total</span><P v={totalPnl} pct={totalPct} /></div>
          <div><span className="text-fog text-xs block">Cash</span><span className="num">{fmt(cashUSD)}</span></div>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center mb-3">
          <h2 className="text-sm font-semibold">Allocation</h2>
          <div className="ml-auto flex gap-1 text-[11px]">
            {(["assetClass", "geo", "currency"] as const).map(m => (
              <button key={m} onClick={() => setDonutMode(m)}
                className={`px-2.5 py-1 rounded-full border ${donutMode === m ? "border-brass text-brass" : "border-edge text-fog"}`}>
                {m === "assetClass" ? "Class" : m === "geo" ? "Geo" : "Ccy"}
              </button>
            ))}
          </div>
        </div>
        <Donut data={donut} total={donutTotal} />
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold mb-2">Performance vs {state.settings.benchmark}</h2>
        <p className="text-[11px] text-fog mb-2">Time-weighted return, indexed to 100. Deposits and withdrawals don't move this line, only investment performance does.</p>
        {chart ? <LineChart labels={chart.labels} a={chart.idx} b={chart.bIdx} aName="Portfolio (TWR)" bName={state.settings.benchmark} />
          : <p className="text-fog text-xs py-6 text-center">The NAV chart appears once you have dated transactions and price history.</p>}
      </section>

      <section className="card">
        <div className="flex items-center mb-2">
          <h2 className="text-sm font-semibold">Movers today</h2>
          {movers.length > 0 && <span className="ml-auto text-[11px] text-fog num">{movers.length} priced</span>}
        </div>
        {movers.length === 0 && <p className="text-fog text-xs">No priced positions yet. Add a trade to begin.</p>}
        <div className="space-y-2">
          {visibleMovers.map(m => (
            <div key={m.symbol} className="flex items-center text-sm">
              <span className="num font-medium w-16 shrink-0">{m.symbol}</span>
              <span className="text-fog text-xs truncate flex-1">{m.name}</span>
              <span className={`num w-16 text-right ${moveCol(m.chg)}`}>{m.chg >= 0 ? "+" : "−"}{Math.abs(m.chg * 100).toFixed(2)}%</span>
              <span className={`num w-24 text-right ${moveCol(m.chg)}`}>{m.dayPnlUSD >= 0 ? "+" : "−"}{fmt(Math.abs(m.dayPnlUSD))}</span>
            </div>
          ))}
        </div>
        {movers.length > 6 && (
          <button onClick={() => setShowAllMovers(!showAllMovers)} className="text-xs text-fog underline underline-offset-2 mt-3">
            {showAllMovers ? "Show fewer" : `Show all ${movers.length}`}
          </button>
        )}
      </section>
    </>
  );
}
