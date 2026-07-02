"use client";
import { Fragment, useMemo, useState } from "react";
import { AppState, JournalEntry, Tx } from "@/lib/types";
import { Valued, FxMap, annVol, beta, contributions, dailyReturns, drift, maxDrawdown, navHistory, toUSD, twrSeries, rollingVol, drawdownSeries } from "@/lib/portfolio";
import { Sparkline } from "./Charts";
import dynamic from "next/dynamic";
import type { TSSeries } from "./TSChart";

const TSChart = dynamic(() => import("./TSChart"), { ssr: false, loading: () => <div className="h-[196px]" /> });
const pct = (x: number | null, dp = 1) => x === null ? "—" : `${(x * 100).toFixed(dp)}%`;
const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;

/* ---------------- Holdings ---------------- */
export function Holdings({ valued, fmt, txs, hist, onDelete, onEdit }: {
  valued: Valued[]; fmt: (usd: number, dp?: number) => string; txs: Tx[]; hist: any;
  onDelete: (id: string) => void; onEdit: (tx: Tx) => void;
}) {
  const [sort, setSort] = useState<keyof Valued>("weight");
  const [showTxs, setShowTxs] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = useMemo(() => [...valued].filter(v => v.qty > 1e-9)
    .sort((a, b) => (b[sort] as number) - (a[sort] as number)), [valued, sort]);
  const H = ({ k, label }: { k: keyof Valued; label: string }) => (
    <button onClick={() => setSort(k)} className={`text-left ${sort === k ? "text-brass" : "text-fog"}`}>{label}{sort === k ? " ↓" : ""}</button>
  );
  return (
    <>
      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide">
              <th className="text-left pb-2"><H k="symbol" label="Position" /></th>
              <th className="text-left pb-2 font-normal text-fog">Trend</th>
              <th className="text-right pb-2"><H k="weight" label="Wt" /></th>
              <th className="text-right pb-2"><H k="mvUSD" label="Value" /></th>
              <th className="text-right pb-2"><H k="unrealizedUSD" label="Unrl P&L" /></th>
              <th className="text-right pb-2"><H k="realizedUSD" label="Rlzd" /></th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map(v => {
              const cost = v.costBasis / (v.qty || 1);
              const open = expanded === v.symbol;
              const symTxs = txs.filter(t => t.symbol === v.symbol).sort((a, b) => b.date.localeCompare(a.date));
              return (
                <Fragment key={v.symbol}>
                  <tr className="hair cursor-pointer" onClick={() => setExpanded(open ? null : v.symbol)}>
                    <td className="py-2">
                      <span className="font-medium text-paper"><span className="text-fog">{open ? "▾" : "▸"}</span> {v.symbol}</span>
                      <span className="block text-fog text-[10px]">{v.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} @ {cost.toFixed(2)} {v.currency}</span>
                    </td>
                    <td className="py-2"><Sparkline data={hist?.series?.[v.symbol]?.closes?.slice(-30) ?? []} width={60} height={20} /></td>
                    <td className="text-right">{(v.weight * 100).toFixed(1)}%</td>
                    <td className="text-right">{fmt(v.mvUSD)}</td>
                    <td className={`text-right ${v.unrealizedUSD >= 0 ? "text-gain" : "text-loss"}`}>{fmt(v.unrealizedUSD)}</td>
                    <td className={`text-right ${v.realizedUSD >= 0 ? "text-gain" : "text-loss"}`}>{fmt(v.realizedUSD)}</td>
                  </tr>
                  {open && (
                    <tr className="bg-ink/40">
                      <td colSpan={6} className="pb-2">
                        <div className="space-y-1.5 px-1 pt-1">
                          {symTxs.map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-[11px]">
                              <span className="text-fog w-[72px] shrink-0">{t.date}</span>
                              <span className="font-medium shrink-0">{t.type}</span>
                              <span className="text-fog truncate">{t.qty} @ {t.price} {t.currency}</span>
                              <button onClick={e => { e.stopPropagation(); onEdit(t); }} className="ml-auto text-brass shrink-0 px-1">Edit</button>
                            </div>
                          ))}
                          {symTxs.length === 0 && <span className="text-fog text-[11px]">No transactions for this symbol.</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-fog text-xs py-4 text-center">No open positions. Tap + Trade to log your first buy.</p>}
        {rows.length > 0 && <p className="text-fog text-[10px] mt-2">Tap a position to see and edit its transactions.</p>}
      </div>
      <button onClick={() => setShowTxs(!showTxs)} className="text-xs text-fog underline underline-offset-2">
        {showTxs ? "Hide" : "Show"} transaction log ({txs.length})
      </button>
      {showTxs && (
        <div className="card space-y-2 text-xs num">
          {[...txs].sort((a, b) => b.date.localeCompare(a.date)).map(t => (
            <div key={t.id} className="hair pt-2 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <span className="text-fog shrink-0">{t.date}</span>
                <span className="font-medium truncate">{t.type} {t.symbol}</span>
                <div className="ml-auto flex gap-3 shrink-0">
                  <button onClick={() => onEdit(t)} className="text-brass">Edit</button>
                  <button onClick={() => onDelete(t.id)} className="text-loss">Delete</button>
                </div>
              </div>
              <span className="block text-fog text-[11px] mt-0.5">{t.qty} @ {t.price} {t.currency}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Risk ---------------- */
export function Risk({ valued, cash, cashUSD, navUSD, fx, hist, state }: {
  valued: Valued[]; cash: Record<string, number>; cashUSD: number; navUSD: number;
  fx: FxMap; hist: any; state: AppState;
}) {
  const stats = useMemo(() => {
    if (!hist?.series || !state.transactions.length) return null;
    const allDates = new Set<string>();
    Object.values<any>(hist.series).forEach((s: any) => s.dates.forEach((d: string) => allDates.add(d)));
    const dates = [...allDates].sort();
    if (dates.length < 20) return null;
    const { nav, flows } = navHistory(state.transactions, hist.series, hist.fxSeries ?? {}, dates);
    const start = nav.findIndex(v => v > 0);
    if (start < 0) return null;
    const idx = twrSeries(nav.slice(start), flows.slice(start));
    const pr = dailyReturns(idx);
    let b: number | null = null;
    if (hist.bench) {
      const bMap: Record<string, number> = {};
      hist.bench.dates.forEach((d: string, i: number) => bMap[d] = hist.bench.closes[i]);
      let last = 0; const closes = dates.slice(start).map(d => (last = bMap[d] ?? last));
      b = beta(pr, dailyReturns(closes.map(c => c || 1)));
    }
    return { vol: annVol(pr), mdd: maxDrawdown(idx), beta: b, obs: pr.length, idx, rets: pr, dates: dates.slice(start) };
  }, [hist, state.transactions]);

  const riskCharts = useMemo(() => {
    if (!stats) return null;
    const d = stats.dates;
    const dd: TSSeries[] = [{ data: drawdownSeries(stats.idx).map((v, i) => ({ time: d[i], value: v })), color: "#E0596B", label: "drawdown", kind: "area", areaOpacity: 0.15 }];
    const volData = rollingVol(stats.rets, 30)
      .map((v, i) => v == null ? null : { time: d[i + 1], value: v })
      .filter(Boolean) as { time: string; value: number }[];
    const vol: TSSeries[] = [{ data: volData, color: "#D9A441", label: "30d vol", kind: "line" }];
    return { dd, vol, volCount: volData.length };
  }, [stats]);

  const ccyExposure = useMemo(() => {
    const m: Record<string, number> = {};
    valued.forEach(v => { m[v.currency] = (m[v.currency] ?? 0) + v.mvUSD; });
    Object.entries(cash).forEach(([c, amt]) => { m[c] = (m[c] ?? 0) + toUSD(amt, c as any, fx); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [valued, cash, fx]);

  const top10 = [...valued].sort((a, b) => b.weight - a.weight).slice(0, 10)
    .reduce((a, v) => a + v.weight, 0);

  const Stat = ({ label, value, note }: { label: string; value: string; note: string }) => (
    <div className="card">
      <p className="text-fog text-[11px] uppercase tracking-wide">{label}</p>
      <p className="num text-2xl mt-1">{value}</p>
      <p className="text-fog text-[11px] mt-1 leading-snug">{note}</p>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Volatility (ann.)" value={pct(stats?.vol ?? null)}
          note="Std dev of daily TWR × √252. Under ~10% reads defensive, 15 to 20% is equity-like." />
        <Stat label="Max drawdown" value={pct(stats?.mdd ?? null)}
          note="Worst peak-to-trough fall in your TWR index. The number you must be able to sit through." />
        <Stat label={`Beta vs ${state.settings.benchmark}`} value={stats?.beta === null || !stats ? "—" : stats.beta.toFixed(2)}
          note="Regression slope of your daily returns on the benchmark's. 1.0 = moves one-for-one." />
        <Stat label="Top-10 concentration" value={pct(top10)}
          note="Weight in your 10 largest positions. Institutional books flag anything north of ~40%." />
      </div>
      {riskCharts && riskCharts.volCount >= 2 && (
        <div className="card">
          <h2 className="text-sm font-semibold mb-1">Rolling volatility, 30 day</h2>
          <p className="text-[11px] text-fog mb-2">Annualized standard deviation of the trailing 30 days of daily TWR. A rising line means the book is getting choppier, independent of direction.</p>
          <TSChart series={riskCharts.vol} height={180} valueFmt={pctFmt} />
        </div>
      )}
      {riskCharts && stats && stats.idx.length >= 2 && (
        <div className="card">
          <h2 className="text-sm font-semibold mb-1">Drawdown</h2>
          <p className="text-[11px] text-fog mb-2">Distance of the TWR index below its running peak. Flat at zero means you are at a high-water mark; the troughs are what you had to sit through.</p>
          <TSChart series={riskCharts.dd} height={180} valueFmt={pctFmt} />
        </div>
      )}
      <div className="card">
        <h2 className="text-sm font-semibold mb-1">Currency exposure</h2>
        <p className="text-[11px] text-fog mb-3">Where your NAV actually lives. For an SGD-based investor, USD assets carry FX risk on top of asset risk.</p>
        {ccyExposure.map(([c, v]) => (
          <div key={c} className="flex items-center gap-2 text-xs mb-2">
            <span className="num w-10">{c}</span>
            <div className="flex-1 h-2 bg-ink rounded-full overflow-hidden">
              <div className="h-full bg-brass" style={{ width: `${navUSD ? (v / navUSD) * 100 : 0}%` }} />
            </div>
            <span className="num w-12 text-right">{navUSD ? ((v / navUSD) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
      {stats && <p className="text-fog text-[11px]">Computed on {stats.obs} daily observations. Statistics firm up as history accumulates.</p>}
    </>
  );
}

/* ---------------- Attribution ---------------- */
export function Attribution({ valued, navUSD, fmt }: {
  valued: Valued[]; navUSD: number; fmt: (usd: number, dp?: number) => string;
}) {
  const { rows, byClass } = useMemo(() => contributions(valued, navUSD), [valued, navUSD]);
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnlUSD)), 1);
  return (
    <>
      <div className="card">
        <h2 className="text-sm font-semibold mb-1">Contribution to return, by position</h2>
        <p className="text-[11px] text-fog mb-3">Each position's total P&L (realized + unrealized) as a share of NAV. Contribution ≈ weight × return, so a small position must work much harder to matter.</p>
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.symbol} className="flex items-center gap-2 text-xs">
              <span className="num w-14 font-medium">{r.symbol}</span>
              <div className="flex-1 flex items-center h-2">
                <div className="w-1/2 flex justify-end">
                  {r.pnlUSD < 0 && <div className="h-2 bg-loss rounded-l-full transition-[width] duration-500 ease-out" style={{ width: `${Math.abs(r.pnlUSD) / maxAbs * 100}%` }} />}
                </div>
                <div className="w-px h-3 bg-edge" />
                <div className="w-1/2">
                  {r.pnlUSD >= 0 && <div className="h-2 bg-gain rounded-r-full transition-[width] duration-500 ease-out" style={{ width: `${r.pnlUSD / maxAbs * 100}%` }} />}
                </div>
              </div>
              <span className={`num w-24 text-right ${r.pnlUSD >= 0 ? "text-gain" : "text-loss"}`}>{fmt(r.pnlUSD)}</span>
              <span className="num w-14 text-right text-fog">{(r.contribPct * 100).toFixed(2)}%</span>
            </div>
          ))}
          {rows.length === 0 && <p className="text-fog text-xs text-center py-4">Attribution builds from your P&L. Log trades first.</p>}
        </div>
      </div>
      <div className="card">
        <h2 className="text-sm font-semibold mb-2">By asset class</h2>
        {Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div key={k} className="flex text-xs py-1.5 hair first:border-0">
            <span>{k}</span>
            <span className={`num ml-auto ${v >= 0 ? "text-gain" : "text-loss"}`}>{fmt(v)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Rebalance ---------------- */
export function Rebalance({ valued, cashUSD, navUSD, targets, setTargets, fmt }: {
  valued: Valued[]; cashUSD: number; navUSD: number; targets: Record<string, number>;
  setTargets: (t: Record<string, number>) => void; fmt: (usd: number, dp?: number) => string;
}) {
  const cashW = navUSD ? cashUSD / navUSD : 0;
  const rows = useMemo(() => drift(valued, cashW, targets), [valued, cashW, targets]);
  const sumT = Object.values(targets).reduce((a, b) => a + (b || 0), 0);
  return (
    <>
      <div className="card">
        <h2 className="text-sm font-semibold mb-1">Targets vs actual</h2>
        <p className="text-[11px] text-fog mb-3">Set policy weights. Drift beyond ±3% is highlighted; the trade column shows the notional to restore target. Targets sum to <span className={`num ${Math.abs(sumT - 100) < 0.01 ? "text-gain" : "text-brass"}`}>{sumT.toFixed(0)}%</span>.</p>
        <div className="space-y-2">
          {rows.map(r => {
            const tradeUSD = (r.target - r.actual) * navUSD;
            const flag = Math.abs(r.drift) > 0.03;
            return (
              <div key={r.symbol} className="flex items-center gap-2 text-xs">
                <span className="num w-14 font-medium">{r.symbol}</span>
                <input type="number" inputMode="decimal" className="!w-16 !py-1 !px-2 num text-right"
                  value={targets[r.symbol] ?? ""} placeholder="0"
                  onChange={e => setTargets({ ...targets, [r.symbol]: parseFloat(e.target.value) || 0 })} />
                <span className="num text-fog w-14 text-right">{(r.actual * 100).toFixed(1)}%</span>
                <span className={`num w-14 text-right ${flag ? (r.drift > 0 ? "text-loss" : "text-brass") : "text-fog"}`}>
                  {r.drift >= 0 ? "+" : ""}{(r.drift * 100).toFixed(1)}
                </span>
                <span className={`num flex-1 text-right ${Math.abs(tradeUSD) < 1 ? "text-fog" : tradeUSD > 0 ? "text-gain" : "text-loss"}`}>
                  {r.target || r.actual ? `${tradeUSD >= 0 ? "Buy" : "Sell"} ${fmt(Math.abs(tradeUSD))}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-fog text-[11px] px-1">Columns: target input · actual weight · drift (pp) · suggested trade. Rebalancing is where discipline beats forecasting: you are systematically selling what ran and buying what lagged.</p>
    </>
  );
}

/* ---------------- Journal ---------------- */
export function Journal({ state, setJournal, setDecisions, valued }: {
  state: AppState; setJournal: (j: JournalEntry[]) => void;
  setDecisions: (d: AppState["decisions"]) => void; valued: Valued[];
}) {
  const [note, setNote] = useState("");
  const symbols = valued.filter(v => v.qty > 1e-9).map(v => v.symbol);
  const upsert = (symbol: string, field: "thesis" | "sellTriggers", text: string) => {
    const existing = state.journal.find(j => j.symbol === symbol);
    const entry: JournalEntry = existing
      ? { ...existing, [field]: text, updated: new Date().toISOString().slice(0, 10) }
      : { id: crypto.randomUUID(), symbol, thesis: "", sellTriggers: "", [field]: text, updated: new Date().toISOString().slice(0, 10) };
    setJournal([...state.journal.filter(j => j.symbol !== symbol), entry]);
  };
  return (
    <>
      {symbols.map(sym => {
        const j = state.journal.find(x => x.symbol === sym);
        return (
          <details key={sym} className="card">
            <summary className="text-sm font-semibold cursor-pointer flex items-center">
              <span className="num">{sym}</span>
              <span className="ml-auto text-[10px] text-fog">{j?.updated ? `updated ${j.updated}` : "no thesis yet"}</span>
            </summary>
            <label className="block text-[11px] text-fog mt-3 mb-1">Why I own it</label>
            <textarea rows={3} defaultValue={j?.thesis ?? ""} onBlur={e => upsert(sym, "thesis", e.target.value)}
              placeholder="The variant view. What the market is mispricing and why you'll be paid for it." />
            <label className="block text-[11px] text-fog mt-3 mb-1">Sell triggers</label>
            <textarea rows={2} defaultValue={j?.sellTriggers ?? ""} onBlur={e => upsert(sym, "sellTriggers", e.target.value)}
              placeholder="Pre-committed exits: thesis broken, target hit, better use of capital." />
          </details>
        );
      })}
      {symbols.length === 0 && <p className="text-fog text-xs text-center py-4">Theses attach to open positions. Log a trade first.</p>}
      <div className="card">
        <h2 className="text-sm font-semibold mb-2">Decision log</h2>
        <div className="flex gap-2 mb-3">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What did you decide, and why?" />
          <button onClick={() => { if (!note.trim()) return;
            setDecisions([{ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), text: note.trim() }, ...state.decisions]);
            setNote(""); }}
            className="bg-brass text-ink font-semibold rounded-lg px-3 text-sm shrink-0">Log</button>
        </div>
        {state.decisions.map(d => (
          <div key={d.id} className="text-xs py-2 hair first:border-0">
            <span className="num text-fog mr-2">{d.date}</span>{d.text}
          </div>
        ))}
      </div>
    </>
  );
}
