import { AssetClass, Ccy, Quote, Series, Tx } from "./types";

// ---------- FX ----------
// fx[ccy] = units of USD per 1 unit of ccy (USD per CCY)
export type FxMap = Record<string, number>;
export const toUSD = (amt: number, ccy: Ccy, fx: FxMap) => amt * (fx[ccy] ?? 1);
export const usdTo = (usd: number, ccy: Ccy, fx: FxMap) => usd / (fx[ccy] ?? 1);

// ---------- Positions via FIFO ----------
export interface Lot { qty: number; price: number; date: string; }
export interface Position {
  symbol: string; name: string; assetClass: AssetClass; currency: Ccy; geo: string;
  qty: number; costBasis: number;          // trade ccy, remaining lots incl. fees
  realizedPnl: number;                     // trade ccy
  dividends: number;                       // trade ccy
  stooq?: string; coingeckoId?: string;
}

export function buildPositions(txs: Tx[]): { positions: Position[]; cash: Record<string, number> } {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const lots: Record<string, Lot[]> = {};
  const pos: Record<string, Position> = {};
  const cash: Record<string, number> = {};
  const bump = (ccy: string, amt: number) => { cash[ccy] = (cash[ccy] ?? 0) + amt; };

  for (const t of sorted) {
    if (t.type === "DEPOSIT") { bump(t.currency, t.qty - t.fees); continue; }
    if (t.type === "WITHDRAW") { bump(t.currency, -t.qty - t.fees); continue; }

    const key = t.symbol.toUpperCase();
    if (!pos[key]) {
      pos[key] = { symbol: key, name: t.name || key, assetClass: t.assetClass, currency: t.currency,
        geo: t.geo || "Global", qty: 0, costBasis: 0, realizedPnl: 0, dividends: 0,
        stooq: t.stooq, coingeckoId: t.coingeckoId };
      lots[key] = [];
    }
    const p = pos[key];
    if (t.stooq) p.stooq = t.stooq;
    if (t.coingeckoId) p.coingeckoId = t.coingeckoId;

    if (t.type === "DIVIDEND") { p.dividends += t.qty * t.price - t.fees; bump(t.currency, t.qty * t.price - t.fees); continue; }

    if (t.type === "BUY") {
      const cost = t.qty * t.price + t.fees;
      lots[key].push({ qty: t.qty, price: cost / t.qty, date: t.date });
      p.qty += t.qty; p.costBasis += cost;
      bump(t.currency, -cost);
    } else if (t.type === "SELL") {
      let remaining = t.qty;
      const proceeds = t.qty * t.price - t.fees;
      let costOut = 0;
      while (remaining > 1e-12 && lots[key].length) {
        const lot = lots[key][0];
        const take = Math.min(lot.qty, remaining);
        costOut += take * lot.price;
        lot.qty -= take; remaining -= take;
        if (lot.qty <= 1e-12) lots[key].shift();
      }
      p.qty -= t.qty; p.costBasis -= costOut;
      p.realizedPnl += proceeds - costOut;
      bump(t.currency, proceeds);
    }
  }
  return { positions: Object.values(pos).filter(p => p.qty > 1e-9 || Math.abs(p.realizedPnl) > 1e-9), cash };
}

// ---------- Valuation ----------
export interface Valued extends Position {
  price: number; prevClose: number;
  mvUSD: number; dayPnlUSD: number; unrealizedUSD: number; realizedUSD: number;
  weight: number; // of NAV
}

export function valuePositions(positions: Position[], quotes: Record<string, Quote>, fx: FxMap) {
  const valued: Valued[] = positions.filter(p => p.qty > 1e-9).map(p => {
    const q = quotes[p.symbol] || { price: 0, prevClose: 0, currency: p.currency, symbol: p.symbol };
    const mv = p.qty * q.price, prevMv = p.qty * q.prevClose;
    return { ...p, price: q.price, prevClose: q.prevClose,
      mvUSD: toUSD(mv, p.currency, fx),
      dayPnlUSD: toUSD(mv - prevMv, p.currency, fx),
      unrealizedUSD: toUSD(mv - p.costBasis, p.currency, fx),
      realizedUSD: toUSD(p.realizedPnl, p.currency, fx),
      weight: 0 };
  });
  return valued;
}

export function withWeights(valued: Valued[], navUSD: number) {
  return valued.map(v => ({ ...v, weight: navUSD ? v.mvUSD / navUSD : 0 }));
}

// ---------- Grouping for donut ----------
export function groupWeights(valued: Valued[], cashUSD: Record<string, number>, fx: FxMap,
  mode: "assetClass" | "geo" | "currency") {
  const buckets: Record<string, number> = {};
  for (const v of valued) {
    const k = mode === "assetClass" ? v.assetClass : mode === "geo" ? v.geo : v.currency;
    buckets[k] = (buckets[k] ?? 0) + v.mvUSD;
  }
  for (const [ccy, amt] of Object.entries(cashUSD)) {
    const usd = toUSD(amt, ccy as Ccy, fx);
    const k = mode === "assetClass" ? "Cash" : mode === "geo" ? "Cash" : ccy;
    buckets[k] = (buckets[k] ?? 0) + usd;
  }
  return Object.entries(buckets).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]);
}

// ---------- NAV history (transaction-based, daily) ----------
// series: symbol -> daily closes in trade ccy; fxSeries: ccy -> USD-per-ccy daily
export function navHistory(txs: Tx[], series: Record<string, Series>,
  fxSeries: Record<string, Series>, dates: string[]) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const nav: number[] = []; const flows: number[] = [];
  let ti = 0;
  const qty: Record<string, number> = {};
  const cash: Record<string, number> = {};
  const px = (sym: string, di: number) => {
    const s = series[sym]; if (!s) return 0;
    // last known close on or before dates[di]
    let best = 0;
    for (let i = s.dates.length - 1; i >= 0; i--) if (s.dates[i] <= dates[di]) { best = s.closes[i]; break; }
    return best;
  };
  const fxAt = (ccy: string, di: number) => {
    if (ccy === "USD") return 1;
    const s = fxSeries[ccy]; if (!s) return 1;
    let best = 1;
    for (let i = s.dates.length - 1; i >= 0; i--) if (s.dates[i] <= dates[di]) { best = s.closes[i]; break; }
    return best;
  };
  for (let di = 0; di < dates.length; di++) {
    let flow = 0;
    while (ti < sorted.length && sorted[ti].date <= dates[di]) {
      const t = sorted[ti]; ti++;
      const f = fxAt(t.currency, di);
      if (t.type === "DEPOSIT") { cash[t.currency] = (cash[t.currency] ?? 0) + t.qty - t.fees; flow += (t.qty - t.fees) * f; }
      else if (t.type === "WITHDRAW") { cash[t.currency] = (cash[t.currency] ?? 0) - t.qty - t.fees; flow -= (t.qty + t.fees) * f; }
      else if (t.type === "DIVIDEND") { cash[t.currency] = (cash[t.currency] ?? 0) + t.qty * t.price - t.fees; }
      else if (t.type === "BUY") { qty[t.symbol] = (qty[t.symbol] ?? 0) + t.qty; cash[t.currency] = (cash[t.currency] ?? 0) - (t.qty * t.price + t.fees); }
      else if (t.type === "SELL") { qty[t.symbol] = (qty[t.symbol] ?? 0) - t.qty; cash[t.currency] = (cash[t.currency] ?? 0) + (t.qty * t.price - t.fees); }
    }
    let v = 0;
    for (const [sym, q] of Object.entries(qty)) {
      if (q <= 1e-9) continue;
      const t = sorted.find(x => x.symbol === sym)!;
      v += q * px(sym, di) * fxAt(t.currency, di);
    }
    for (const [ccy, amt] of Object.entries(cash)) v += amt * fxAt(ccy, di);
    nav.push(v); flows.push(flow);
  }
  return { nav, flows };
}

// TWR: chain-link daily returns net of external flows
export function twrSeries(nav: number[], flows: number[]) {
  const idx: number[] = [100];
  for (let i = 1; i < nav.length; i++) {
    const prev = nav[i - 1];
    const r = prev > 0 ? (nav[i] - flows[i] - prev) / prev : 0;
    idx.push(idx[i - 1] * (1 + r));
  }
  return idx;
}

export function dailyReturns(idx: number[]) {
  const r: number[] = [];
  for (let i = 1; i < idx.length; i++) r.push(idx[i - 1] ? idx[i] / idx[i - 1] - 1 : 0);
  return r;
}

// Re-base an index series so its first positive point equals `base` (default 100).
// Slicing a geometric index then re-basing gives the honest return of the sub-period.
export function rebase(series: number[], base = 100) {
  const first = series.find(v => v > 0);
  if (!first) return series.map(() => base);
  return series.map(v => (v / first) * base);
}

// Total return implied by an index series over its full span: last / first - 1.
export function totalReturn(idx: number[]) {
  const first = idx.find(v => v > 0);
  return first ? idx[idx.length - 1] / first - 1 : 0;
}

// Current drawdown: distance of the final point below the running peak to date (<= 0).
export function currentDrawdown(idx: number[]) {
  let peak = -Infinity;
  for (const v of idx) peak = Math.max(peak, v);
  return peak > 0 ? idx[idx.length - 1] / peak - 1 : 0;
}

// ---------- Risk ----------
export function annVol(rets: number[]) {
  const r = rets.filter(x => isFinite(x));
  if (r.length < 10) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

export function maxDrawdown(idx: number[]) {
  let peak = -Infinity, mdd = 0;
  for (const v of idx) { peak = Math.max(peak, v); if (peak > 0) mdd = Math.min(mdd, v / peak - 1); }
  return mdd;
}

export function beta(portRets: number[], benchRets: number[]) {
  const n = Math.min(portRets.length, benchRets.length);
  if (n < 20) return null;
  const p = portRets.slice(-n), b = benchRets.slice(-n);
  const mp = p.reduce((a, x) => a + x, 0) / n, mb = b.reduce((a, x) => a + x, 0) / n;
  let cov = 0, varb = 0;
  for (let i = 0; i < n; i++) { cov += (p[i] - mp) * (b[i] - mb); varb += (b[i] - mb) ** 2; }
  return varb ? cov / varb : null;
}

// ---------- Attribution ----------
// Contribution to total-period return ≈ position P&L (realized+unrealized+divs, USD) / total invested capital proxy.
// We report contribution to NAV growth: pnlUSD / current NAV, plus by asset class rollup.
export function contributions(valued: Valued[], navUSD: number) {
  const rows = valued.map(v => ({
    symbol: v.symbol, assetClass: v.assetClass,
    pnlUSD: v.unrealizedUSD + v.realizedUSD + (v.dividends ? toUSDsafe(v.dividends) : 0),
    contribPct: navUSD ? (v.unrealizedUSD + v.realizedUSD) / navUSD : 0
  })).sort((a, b) => b.pnlUSD - a.pnlUSD);
  const byClass: Record<string, number> = {};
  for (const r of rows) byClass[r.assetClass] = (byClass[r.assetClass] ?? 0) + r.pnlUSD;
  return { rows, byClass };
  function toUSDsafe(x: number) { return 0 * x; } // dividends already flow into cash; avoid double count
}

// ---------- Rebalancing ----------
export function drift(valued: Valued[], cashW: number, targets: Record<string, number>) {
  const rows = valued.map(v => {
    const target = (targets[v.symbol] ?? 0) / 100;
    return { symbol: v.symbol, actual: v.weight, target, drift: v.weight - target, mvUSD: v.mvUSD };
  });
  const tCash = (targets["CASH"] ?? 0) / 100;
  rows.push({ symbol: "CASH", actual: cashW, target: tCash, drift: cashW - tCash, mvUSD: 0 });
  return rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}
