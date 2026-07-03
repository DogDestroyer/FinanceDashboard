"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AppState } from "@/lib/types";
import { Valued, Position, FxMap, groupWeights, navHistory, twrSeries, rebase, totalReturn, currentDrawdown, externalFlows, xirr, bookSummary } from "@/lib/portfolio";
import { Donut, Sparkline } from "./Charts";
import type { TSSeries } from "./TSChart";

const TSChart = dynamic(() => import("./TSChart"), { ssr: false, loading: () => <div className="h-[216px]" /> });
const moveCol = (x: number) => x > 1e-9 ? "text-gain" : x < -1e-9 ? "text-loss" : "text-fog";
const PERIODS: [string, number][] = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", Infinity]];
const signedPct = (x: number, unit = "%") => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}${unit}`;
const idxFmt = (v: number) => v.toFixed(2);

function Metric({ label, val, cls }: { label: string; val: string; cls: string }) {
  return (
    <div className="min-w-0">
      <p className="text-fog text-[10px] uppercase tracking-wide truncate">{label}</p>
      <p className={`num text-sm mt-0.5 ${cls}`}>{val}</p>
    </div>
  );
}

export default function Dashboard({ state, valued, positions, cash, cashUSD, navUSD, fx, fmt, disp, hist, base, asOf, stale, onRefresh, refreshing }: {
  state: AppState; valued: Valued[]; positions: Position[]; cash: Record<string, number>; cashUSD: number;
  navUSD: number; fx: FxMap; fmt: (usd: number, dp?: number) => string; disp: (usd: number) => number;
  hist: any; base: string; asOf: number | null; stale: boolean; onRefresh: () => void; refreshing: boolean;
}) {
  const [donutMode, setDonutMode] = useState<"assetClass" | "geo" | "currency">("assetClass");
  const [showAllMovers, setShowAllMovers] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [period, setPeriod] = useState("All");

  const summary = useMemo(() => bookSummary(valued, positions, state.transactions, cashUSD, navUSD, fx),
    [valued, positions, state.transactions, cashUSD, navUSD, fx]);
  // day P&L percent is measured against yesterday's NAV
  const dayPct = navUSD - summary.dayPnlUSD > 0 ? summary.dayPnlUSD / (navUSD - summary.dayPnlUSD) : 0;

  // dev cross-check: total return on capital must equal the simple total return
  // by accounting identity; a divergence beyond 0.1pp signals a bug
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const a = summary.totalReturnOnCapital, b = summary.simpleTotalReturn;
    if (a == null || b == null) return;
    if (Math.abs(a - b) > 0.001)
      console.warn(`[Delta AM] summary cross-check diverged by ${((a - b) * 100).toFixed(3)}pp: total return on capital ${(a * 100).toFixed(3)}% vs simple total return ${(b * 100).toFixed(3)}%. Possible accounting bug.`);
  }, [summary]);

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

  const navSeries: TSSeries[] = useMemo(() => {
    if (!view || view.idx.length < 2) return [];
    const s: TSSeries[] = [{ data: view.labels.map((t, i) => ({ time: t, value: view.idx[i] })), color: "#D9A441", label: "Portfolio", kind: "line" }];
    if (view.bIdx) s.push({ data: view.labels.map((t, i) => ({ time: t, value: view.bIdx![i] })), color: "#8A94AC", label: state.settings.benchmark, kind: "line", dashed: true });
    return s;
  }, [view, state.settings.benchmark]);

  // money-weighted return since inception: external flows (deposits negative,
  // withdrawals positive) plus today's NAV as a terminal positive flow.
  const mwr = useMemo(() => {
    if (!hist || navUSD <= 0) return null;
    const flows = externalFlows(state.transactions, hist.fxSeries ?? {});
    if (!flows.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    const r = xirr([...flows, { date: today, amount: navUSD }]);
    if (r === null) return null;
    const days = Math.round((new Date(today).getTime() - new Date(flows[0].date).getTime()) / 86400000);
    const annualized = days >= 30;
    // below 30 days, annualizing is noise; show the un-annualized holding period return
    return { value: annualized ? r : Math.pow(1 + r, days / 365) - 1, annualized, days };
  }, [hist, state.transactions, navUSD]);

  const asOfStr = asOf ? new Date(asOf).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }) : null;
  const hasChart = !!view && view.idx.length >= 2;

  const signedMoney = (usd: number) => `${usd >= 0 ? "+" : "−"}${fmt(Math.abs(usd))}`;
  // secondary balance-sheet cell: fog label over a mono value
  const Cell = ({ label, val, cls = "text-paper", hint }: { label: string; val: string; cls?: string; hint?: string }) => (
    <div className="min-w-0">
      <p className="text-fog text-[10px] uppercase tracking-wide truncate">{label}</p>
      <p className={`num text-[15px] leading-tight mt-0.5 transition-colors duration-1000 ${cls}`}>{val}</p>
      {hint && <p className="text-fog text-[10px] mt-0.5 leading-tight">{hint}</p>}
    </div>
  );
  // primary P&L cell: larger value with its percent stacked beneath, both tinted
  const Hero = ({ label, val, pct, cls }: { label: string; val: string; pct: string; cls: string }) => (
    <div className="min-w-0">
      <p className="text-fog text-[10px] uppercase tracking-wide">{label}</p>
      <p className={`num text-xl leading-tight mt-0.5 transition-colors duration-1000 ${cls}`}>{val}</p>
      <p className={`num text-xs mt-0.5 transition-colors duration-1000 ${cls}`}>{pct}</p>
    </div>
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
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-edge">
          <Hero label="Day P&L" val={signedMoney(summary.dayPnlUSD)} cls={moveCol(summary.dayPnlUSD)}
            pct={`${dayPct >= 0 ? "+" : "−"}${Math.abs(dayPct * 100).toFixed(2)}%`} />
          <Hero label="Total P&L" val={signedMoney(summary.totalPnlUSD)} cls={moveCol(summary.totalPnlUSD)}
            pct={summary.totalReturnOnCapital != null ? signedPct(summary.totalReturnOnCapital) : "—"} />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
          <Cell label="Deployed" val={fmt(summary.deployedUSD)} hint="in the market, at cost" />
          <Cell label="Cash" val={fmt(summary.cashUSD)} hint="uninvested" />
          <Cell label="Holdings value" val={fmt(summary.holdingsUSD)} hint="at today's prices" />
          <Cell label="Contributed" val={fmt(summary.netInvestedUSD)} hint="deposits less withdrawals" />
        </div>
        <button onClick={() => setShowDetails(s => !s)}
          className="flex items-center gap-1 text-xs text-fog hover:text-paper mt-4">
          <svg className={`w-3 h-3 transition-transform ${showDetails ? "rotate-90" : ""}`} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showDetails ? "Hide breakdown" : "P&L breakdown"}
        </button>
        {showDetails && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3 pt-3 border-t border-edge">
            <Cell label="Unrealized P&L" val={signedMoney(summary.unrealizedUSD)} cls={moveCol(summary.unrealizedUSD)} />
            <Cell label="Realized P&L" val={signedMoney(summary.realizedUSD)} cls={moveCol(summary.realizedUSD)} />
            <Cell label="Dividends collected" val={fmt(summary.dividendsUSD)} cls={moveCol(summary.dividendsUSD)} />
            <Cell label="Simple return" val={summary.simpleTotalReturn != null ? signedPct(summary.simpleTotalReturn) : "—"}
              cls={summary.simpleTotalReturn != null ? moveCol(summary.simpleTotalReturn) : "text-fog"} hint="cross-check" />
          </div>
        )}
        <p className="text-[11px] text-fog mt-3 leading-snug">Total P&L percent is return on contributed capital (deposits less withdrawals), not on cost basis.</p>
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
          ? <TSChart series={navSeries} height={200} valueFmt={idxFmt} spreadLabel="active" />
          : <p className="text-fog text-xs py-6 text-center">The NAV chart appears once you have dated transactions and price history.</p>}
        {stats && (
          <>
            <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-edge text-center">
              <Metric label="Return" val={signedPct(stats.periodRet)} cls={moveCol(stats.periodRet)} />
              <Metric label={state.settings.benchmark} val={stats.benchRet === null ? "—" : signedPct(stats.benchRet)}
                cls={stats.benchRet === null ? "text-fog" : moveCol(stats.benchRet)} />
              <Metric label="Active" val={stats.activeRet === null ? "—" : signedPct(stats.activeRet, "pp")}
                cls={stats.activeRet === null ? "text-fog" : moveCol(stats.activeRet)} />
              <Metric label="Drawdown" val={`${(stats.curDD * 100).toFixed(1)}%`} cls={stats.curDD < -1e-9 ? "text-loss" : "text-fog"} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 text-center">
              <Metric label="TWR" val={signedPct(stats.periodRet)} cls={moveCol(stats.periodRet)} />
              <Metric label={mwr && !mwr.annualized ? `MWR ${mwr.days}d` : "XIRR"} val={mwr ? signedPct(mwr.value) : "—"}
                cls={mwr ? moveCol(mwr.value) : "text-fog"} />
              <Metric label="Timing gap" val={mwr ? signedPct(stats.periodRet - mwr.value, "pp") : "—"}
                cls={mwr ? moveCol(stats.periodRet - mwr.value) : "text-fog"} />
            </div>
            <p className="text-[11px] text-fog mt-2">TWR is what your strategy earned; XIRR is what your dollars earned. The gap is your deposit timing.</p>
          </>
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
