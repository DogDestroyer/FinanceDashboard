"use client";
import { useMemo, useState } from "react";
import { AppState } from "@/lib/types";
import { Valued, FxMap, groupWeights, navHistory, twrSeries, toUSD, rebase, totalReturn, currentDrawdown } from "@/lib/portfolio";
import { Donut, LineChart, Sparkline } from "./Charts";

const moveCol = (x: number) => x > 1e-9 ? "text-gain" : x < -1e-9 ? "text-loss" : "text-fog";
const PERIODS: [string, number][] = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", Infinity]];
const signedPct = (x: number, unit = "%") => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}${unit}`;

function Metric({ label, val, cls }: { label: string; val: string; cls: string }) {
  return (
    <div className="min-w-0">
      <p className="text-fog text-[10px] uppercase tracking-wide truncate">{label}</p>
      <p className={`num text-sm mt-0.5 ${cls}`}>{val}</p>
    </div>
  );
}

export default function Dashboard({ state, valued, cash, cashUSD, navUSD, fx, fmt, disp, hist, base, asOf, stale, onRefresh, refreshing }: {
  state: AppState; valued: Valued[]; cash: Record<string, number>; cashUSD: number;
  navUSD: number; fx: FxMap; fmt: (usd: number, dp?: number) => string; disp: (usd: number) => number;
  hist: any; base: string; asOf: number | null; stale: boolean; onRefresh: () => void; refreshing: boolean;
}) {
  const [donutMode, setDonutMode] = useState<"assetClass" | "geo" | "currency">("assetClass");
  const [showAllMovers, setShowAllMovers] = useState(false);
  const [period, setPeriod] = useState("All");

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

  // full TWR index and benchmark index over all available history, both based at 100
  const full = useMemo(() => {
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

  // slice the full series to the selected period and re-base both lines to 100 at its start
  const view = useMemo(() => {
    if (!full) return null;
    const days = PERIODS.find(([p]) => p === period)?.[1] ?? Infinity;
    let s = 0;
    if (isFinite(days) && full.labels.length) {
      const cut = new Date(full.labels[full.labels.length - 1]);
      cut.setDate(cut.getDate() - days);
      const cutoff = cut.toISOString().slice(0, 10);
      const i = full.labels.findIndex(d => d >= cutoff);
      s = i < 0 ? 0 : i;
    }
    const idx = rebase(full.idx.slice(s));
    const bIdx = full.bIdx ? rebase(full.bIdx.slice(s)) : null;
    return { labels: full.labels.slice(s), idx, bIdx };
  }, [full, period]);

  const stats = useMemo(() => {
    if (!view || view.idx.length < 2) return null;
    const periodRet = totalReturn(view.idx);
    const benchRet = view.bIdx ? totalReturn(view.bIdx) : null;
    return { periodRet, benchRet, activeRet: benchRet === null ? null : periodRet - benchRet, curDD: currentDrawdown(view.idx) };
  }, [view]);

  const asOfStr = asOf ? new Date(asOf).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }) : null;
  const hasChart = !!view && view.idx.length >= 2;

  const P = ({ v, pct }: { v: number; pct: number }) => (
    <span className={`num ${v >= 0 ? "text-gain" : "text-loss"}`}>
      {v >= 0 ? "+" : "−"}{fmt(Math.abs(v))} ({(pct * 100).toFixed(2)}%)
    </span>
  );

  return (
    <>
      <section aria-label="Net asset value">
        <div className="flex items-center gap-2">
          <p className="text-fog text-xs uppercase tracking-widest">
            Net asset value · {base}
            {asOfStr && <span className={`normal-case tracking-normal num ${refreshing ? "animate-pulse" : ""}`}> · {stale ? "stale, last" : "as of"} {asOfStr}</span>}
          </p>
          <button onClick={onRefresh} disabled={refreshing} aria-label="Refresh prices"
            className="text-fog hover:text-brass disabled:opacity-50 shrink-0">
            <svg className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
        <p className={`num text-4xl font-medium mt-1 ${stale ? "text-fog" : ""}`}>{fmt(navUSD)}</p>
        {hasChart && (
          <div className="flex items-center gap-3 mt-1.5">
            <Sparkline data={view!.idx} />
            {stats?.activeRet != null && (
              <span className={`num text-xs ${moveCol(stats.activeRet)}`}>
                {signedPct(stats.activeRet, "pp")}<span className="text-fog"> vs {state.settings.benchmark}</span>
              </span>
            )}
          </div>
        )}
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
        <div className="flex items-center mb-2">
          <h2 className="text-sm font-semibold">Performance vs {state.settings.benchmark}</h2>
          <div className="ml-auto flex gap-1 text-[11px]">
            {PERIODS.map(([p]) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 rounded-full border ${period === p ? "border-brass text-brass" : "border-edge text-fog"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-fog mb-2">Time-weighted return, both lines re-indexed to 100 at the period start. Deposits and withdrawals don't move this line, only investment performance does.</p>
        {hasChart
          ? <LineChart labels={view!.labels} a={view!.idx} b={view!.bIdx} aName="Portfolio (TWR)" bName={state.settings.benchmark} />
          : <p className="text-fog text-xs py-6 text-center">The NAV chart appears once you have dated transactions and price history.</p>}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-edge text-center">
            <Metric label="Return" val={signedPct(stats.periodRet)} cls={moveCol(stats.periodRet)} />
            <Metric label={state.settings.benchmark} val={stats.benchRet === null ? "—" : signedPct(stats.benchRet)}
              cls={stats.benchRet === null ? "text-fog" : moveCol(stats.benchRet)} />
            <Metric label="Active" val={stats.activeRet === null ? "—" : signedPct(stats.activeRet, "pp")}
              cls={stats.activeRet === null ? "text-fog" : moveCol(stats.activeRet)} />
            <Metric label="Drawdown" val={`${(stats.curDD * 100).toFixed(1)}%`} cls={stats.curDD < -1e-9 ? "text-loss" : "text-fog"} />
          </div>
        )}
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
