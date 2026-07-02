import { NextRequest, NextResponse } from "next/server";
import { CG_IDS } from "@/lib/coingecko";

const cache: Record<string, { t: number; v: any }> = {};
const CACHE_MS = 15 * 60_000;

async function stooqDaily(stooqSym: string, from: string) {
  const d1 = from.replace(/-/g, "");
  const r = await fetch(`https://stooq.com/q/d/l/?s=${stooqSym}&d1=${d1}&i=d`, { cache: "no-store" });
  if (!r.ok) return null;
  const lines = (await r.text()).trim().split("\n").slice(1);
  const dates: string[] = [], closes: number[] = [];
  for (const l of lines) {
    const c = l.split(",");
    const close = parseFloat(c[4]);
    if (c[0] && isFinite(close)) { dates.push(c[0]); closes.push(close); }
  }
  return dates.length ? { dates, closes } : null;
}

async function cgDaily(id: string, days: number) {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${Math.min(days, 365)}&interval=daily`,
    { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  const dates: string[] = [], closes: number[] = [];
  for (const [ts, px] of j.prices ?? []) {
    dates.push(new Date(ts).toISOString().slice(0, 10)); closes.push(px);
  }
  return dates.length ? { dates, closes } : null;
}

async function fxDaily(ccys: string[], from: string) {
  const out: Record<string, { dates: string[]; closes: number[] }> = {};
  const need = ccys.filter(c => c !== "USD");
  if (!need.length) return out;
  const to = new Date().toISOString().slice(0, 10);
  const r = await fetch(`https://api.frankfurter.app/${from}..${to}?from=USD&to=${need.join(",")}`, { cache: "no-store" });
  if (!r.ok) return out;
  const j = await r.json();
  const dates = Object.keys(j.rates).sort();
  for (const c of need) {
    out[c] = { dates, closes: dates.map(d => 1 / (j.rates[d][c] ?? 1)) }; // USD per ccy
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { symbols, currencies, from, benchmarkStooq } = await req.json() as {
    symbols: { symbol: string; assetClass: string; stooq?: string; coingeckoId?: string }[];
    currencies: string[]; from: string; benchmarkStooq: string;
  };
  const ck = JSON.stringify({ s: symbols.map(x => x.symbol).sort(), currencies: [...currencies].sort(), from, benchmarkStooq });
  if (cache[ck] && Date.now() - cache[ck].t < CACHE_MS) return NextResponse.json(cache[ck].v);

  const days = Math.max(30, Math.ceil((Date.now() - new Date(from).getTime()) / 86400000));
  const series: Record<string, any> = {};

  await Promise.all(symbols.map(async s => {
    const key = s.symbol.toUpperCase();
    if (s.assetClass === "Crypto") {
      const id = s.coingeckoId || CG_IDS[key] || s.symbol.toLowerCase();
      const d = await cgDaily(id, days);
      if (d) series[key] = { symbol: key, ...d };
    } else {
      const d = await stooqDaily(s.stooq || `${s.symbol.toLowerCase()}.us`, from);
      if (d) series[key] = { symbol: key, ...d };
    }
  }));

  const [bench, fxSeries] = await Promise.all([
    stooqDaily(benchmarkStooq, from),
    fxDaily(currencies, from)
  ]);

  const v = { series, bench, fxSeries };
  cache[ck] = { t: Date.now(), v };
  return NextResponse.json(v);
}
