import { NextRequest, NextResponse } from "next/server";
import { CG_IDS } from "@/lib/coingecko";

// Simple in-memory cache (per lambda instance)
const cache: Record<string, { t: number; v: any }> = {};
const CACHE_MS = 60_000;

async function finnhub(sym: string) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`, { cache: "no-store" });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.c) return null;
  return { price: j.c, prevClose: j.pc || j.c };
}

async function stooqQuote(stooqSym: string) {
  const r = await fetch(`https://stooq.com/q/l/?s=${stooqSym}&f=sd2t2ohlcv&h&e=csv`, { cache: "no-store" });
  if (!r.ok) return null;
  const lines = (await r.text()).trim().split("\n");
  if (lines.length < 2) return null;
  const c = lines[1].split(",");
  const close = parseFloat(c[6]), open = parseFloat(c[3]);
  if (!isFinite(close)) return null;
  return { price: close, prevClose: isFinite(open) ? open : close };
}

async function coingecko(ids: string[]) {
  if (!ids.length) return {};
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
    { cache: "no-store" });
  if (!r.ok) return {};
  return r.json();
}

async function fxRates(ccys: string[]) {
  // USD per 1 unit of each ccy
  const out: Record<string, number> = { USD: 1 };
  const need = ccys.filter(c => c !== "USD");
  if (!need.length) return out;
  const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${need.join(",")}`, { cache: "no-store" });
  if (r.ok) {
    const j = await r.json();
    for (const [c, perUSD] of Object.entries<number>(j.rates)) out[c] = 1 / perUSD;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { symbols, currencies } = await req.json() as {
    symbols: { symbol: string; assetClass: string; stooq?: string; coingeckoId?: string }[];
    currencies: string[];
  };
  const ck = JSON.stringify({ symbols: symbols.map(s => s.symbol).sort(), currencies: [...currencies].sort() });
  if (cache[ck] && Date.now() - cache[ck].t < CACHE_MS) return NextResponse.json(cache[ck].v);

  const cryptos = symbols.filter(s => s.assetClass === "Crypto");
  const listed = symbols.filter(s => s.assetClass !== "Crypto");
  const cgIds = cryptos.map(s => s.coingeckoId || CG_IDS[s.symbol.toUpperCase()] || s.symbol.toLowerCase());

  const [cg, fx] = await Promise.all([coingecko(cgIds), fxRates(currencies)]);

  const quotes: Record<string, any> = {};
  for (const s of cryptos) {
    const id = s.coingeckoId || CG_IDS[s.symbol.toUpperCase()] || s.symbol.toLowerCase();
    const row = (cg as any)[id];
    if (row?.usd) {
      const chg = row.usd_24h_change ?? 0;
      quotes[s.symbol.toUpperCase()] = { symbol: s.symbol.toUpperCase(), price: row.usd,
        prevClose: row.usd / (1 + chg / 100), currency: "USD" };
    }
  }
  await Promise.all(listed.map(async s => {
    const fh = await finnhub(s.symbol.toUpperCase());
    const q = fh ?? await stooqQuote(s.stooq || `${s.symbol.toLowerCase()}.us`);
    if (q) quotes[s.symbol.toUpperCase()] = { symbol: s.symbol.toUpperCase(), ...q, currency: "TRADE" };
  }));

  const v = { quotes, fx };
  cache[ck] = { t: Date.now(), v };
  return NextResponse.json(v);
}
