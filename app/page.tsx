"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AppState, Quote, Tx, emptyState } from "@/lib/types";
import { buildPositions, valuePositions, withWeights, toUSD, FxMap } from "@/lib/portfolio";
import { INDICES, DEFAULT_INDICES } from "@/lib/indices";
import Dashboard from "@/components/Dashboard";
import { Holdings, Risk, Attribution, Rebalance, Journal } from "@/components/Views";
import TxForm from "@/components/TxForm";
import Settings from "@/components/Settings";

const TABS = ["Book", "Holdings", "Risk", "Attribution", "Rebalance", "Journal"] as const;
type Tab = typeof TABS[number];

export default function App() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("Book");
  const [base, setBase] = useState<"USD" | "SGD">("SGD");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [fx, setFx] = useState<FxMap>({ USD: 1 });
  const [hist, setHist] = useState<any>(null);
  const [showTx, setShowTx] = useState(false);
  const [editTx, setEditTx] = useState<Tx | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [err, setErr] = useState("");
  const [asOf, setAsOf] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [indexQuotes, setIndexQuotes] = useState<Record<string, { price: number; prevClose: number }>>({});
  const histAt = useRef(0);
  const lastManual = useRef(0);

  useEffect(() => { setPasscode(localStorage.getItem("passcode")); }, []);

  const save = useCallback(async (key: string, value: unknown) => {
    await fetch("/api/db", { method: "POST", headers: { "x-passcode": passcode ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }) });
  }, [passcode]);

  const update = useCallback(<K extends keyof AppState>(key: K, value: AppState[K]) => {
    setState(s => ({ ...s, [key]: value }));
    save(key, value);
  }, [save]);

  // load persisted state
  useEffect(() => {
    if (!passcode) return;
    fetch("/api/db", { headers: { "x-passcode": passcode } }).then(async r => {
      if (r.status === 401) { localStorage.removeItem("passcode"); setPasscode(null); return; }
      const j = await r.json();
      setState({ ...emptyState, ...j });
      if (j.settings?.base) setBase(j.settings.base);
      setLoaded(true);
    }).catch(() => setErr("Could not reach the server."));
  }, [passcode]);

  const { positions, cash } = useMemo(() => buildPositions(state.transactions), [state.transactions]);
  const symbols = useMemo(() => positions.filter(p => p.qty > 1e-9).map(p =>
    ({ symbol: p.symbol, assetClass: p.assetClass, stooq: p.stooq, coingeckoId: p.coingeckoId })), [positions]);
  const currencies = useMemo(() => {
    const s = new Set<string>(["USD", "SGD"]);
    state.transactions.forEach(t => s.add(t.currency));
    return [...s];
  }, [state.transactions]);

  // reusable quote pull; force:true bypasses the 60s server cache for a manual refresh
  const refreshQuotes = useCallback(async (force = false) => {
    // display-only index proxies for the market comparison strip; the benchmark
    // is always fetched so the Portfolio chip can show its delta versus it
    const keys = state.settings.compareIndices ?? DEFAULT_INDICES;
    const extra = INDICES.filter(i => keys.includes(i.key)).map(i => ({ symbol: i.symbol, stooq: i.stooq }));
    // always fetch the S&P 500, the strip's comparison for the Portfolio chip
    const spy = INDICES.find(i => i.key === "SPY")!;
    if (!extra.some(e => e.symbol === spy.symbol)) extra.push({ symbol: spy.symbol, stooq: spy.stooq });
    try {
      const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, currencies, force, extra }) });
      const j = await r.json();
      const q: Record<string, Quote> = {};
      for (const [k, v] of Object.entries<any>(j.quotes ?? {})) {
        const pos = positions.find(p => p.symbol === k);
        q[k] = { ...v, currency: v.currency === "TRADE" ? (pos?.currency ?? "USD") : v.currency };
      }
      setQuotes(q); setFx({ USD: 1, ...j.fx }); setIndexQuotes(j.extra ?? {});
      setAsOf(Date.now()); setStale(false); setErr("");
    } catch { setStale(true); setErr("Price fetch failed. Retrying."); }
  }, [symbols, currencies, positions, state.settings.compareIndices]);

  // daily history for NAV chart + risk
  const refreshHistory = useCallback(async () => {
    if (!state.transactions.length) return;
    const from = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))[0].date;
    try {
      const r = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, currencies, from, benchmarkStooq: state.settings.benchmarkStooq }) });
      setHist(await r.json()); histAt.current = Date.now();
    } catch { /* keep last good history */ }
  }, [symbols, currencies, state.transactions, state.settings.benchmarkStooq]);

  useEffect(() => {
    if (!loaded) return;
    refreshQuotes();
    const id = setInterval(() => refreshQuotes(), 60_000);
    return () => clearInterval(id);
  }, [loaded, refreshQuotes]);

  useEffect(() => {
    if (!loaded) return;
    refreshHistory();
  }, [loaded, refreshHistory]);

  // manual refresh: debounced to 5s (CoinGecko rate limits), pulls quotes now
  // and history too if it is older than 15 minutes
  const manualRefresh = useCallback(async () => {
    if (refreshing || Date.now() - lastManual.current < 5000) return;
    lastManual.current = Date.now();
    setRefreshing(true);
    try {
      await refreshQuotes(true);
      if (Date.now() - histAt.current > 15 * 60_000) await refreshHistory();
    } finally { setRefreshing(false); }
  }, [refreshing, refreshQuotes, refreshHistory]);

  const valuedRaw = useMemo(() => valuePositions(positions, quotes, fx), [positions, quotes, fx]);
  const cashUSD = useMemo(() => Object.entries(cash).reduce((a, [c, amt]) => a + toUSD(amt, c as any, fx), 0), [cash, fx]);
  const navUSD = useMemo(() => valuedRaw.reduce((a, v) => a + v.mvUSD, 0) + cashUSD, [valuedRaw, cashUSD]);
  const valued = useMemo(() => withWeights(valuedRaw, navUSD), [valuedRaw, navUSD]);

  const sgdRate = fx["SGD"] ?? 0.74; // USD per SGD
  const disp = useCallback((usd: number) => base === "USD" ? usd : usd / sgdRate, [base, sgdRate]);
  const fmt = useCallback((usd: number, dp = 0) =>
    `${base === "USD" ? "US$" : "S$"}${disp(usd).toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`, [disp, base]);

  const addTx = (tx: Tx) => update("transactions", [...state.transactions, tx]);
  const updateTx = (tx: Tx) => update("transactions", state.transactions.map(t => t.id === tx.id ? tx : t));
  const delTx = (id: string) => update("transactions", state.transactions.filter(t => t.id !== id));
  const openTx = (tx?: Tx) => { setEditTx(tx ?? null); setShowTx(true); };
  const closeTx = () => { setShowTx(false); setEditTx(null); };
  const saveSettings = (s: AppState["settings"]) => { setBase(s.base); update("settings", s); };

  if (passcode === null) return <Gate onSet={p => { localStorage.setItem("passcode", p); setPasscode(p); }} />;

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col overflow-x-hidden" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 76px)" }}>
      <header className="flex items-center gap-2 px-4 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}>
        <h1 className="font-sans font-bold text-lg tracking-tight truncate min-w-0">Delta AM</h1>
        <button onClick={() => { const b = base === "USD" ? "SGD" : "USD"; setBase(b); update("settings", { ...state.settings, base: b }); }}
          className="press num text-xs border border-edge/60 rounded-full px-2.5 py-1 text-fog shrink-0" aria-label={`Base currency ${base}, tap to switch`}>
          {base} <span className="text-fog/60">⇄</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button onClick={() => setShowSettings(true)} aria-label="Settings" className="press text-fog p-1.5">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button onClick={() => openTx()} className="press bg-brass text-ink font-semibold text-sm rounded-full px-4 py-1.5">
            + Trade
          </button>
        </div>
      </header>
      {err && <p className="t-caption text-loss px-4 pb-1">{err}</p>}

      <main className="flex-1 px-4 pt-1">
        <div key={tab} className="animate-fade space-y-3">
          {tab === "Book" && <Dashboard state={state} valued={valued} positions={positions} cash={cash} cashUSD={cashUSD}
            navUSD={navUSD} fx={fx} fmt={fmt} disp={disp} hist={hist} base={base} asOf={asOf} stale={stale}
            loaded={loaded} onRefresh={manualRefresh} refreshing={refreshing} onAddTrade={() => openTx()} indexQuotes={indexQuotes} />}
          {tab === "Holdings" && <Holdings valued={valued} positions={positions} fx={fx} fmt={fmt} txs={state.transactions} hist={hist} onDelete={delTx} onEdit={openTx} onAddTrade={() => openTx()} />}
          {tab === "Risk" && <Risk valued={valued} cash={cash} cashUSD={cashUSD} navUSD={navUSD} fx={fx} hist={hist} state={state} onAddTrade={() => openTx()} />}
          {tab === "Attribution" && <Attribution valued={valued} navUSD={navUSD} fmt={fmt} onAddTrade={() => openTx()} />}
          {tab === "Rebalance" && <Rebalance valued={valued} cashUSD={cashUSD} navUSD={navUSD}
            targets={state.targets} setTargets={t => update("targets", t)} fmt={fmt} onAddTrade={() => openTx()} />}
          {tab === "Journal" && <Journal state={state}
            setJournal={j => update("journal", j)} setDecisions={d => update("decisions", d)} valued={valued} />}
        </div>
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-raised/95 backdrop-blur border-t border-edge/60"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto grid grid-cols-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`press relative py-3 text-[10px] font-medium ${tab === t ? "text-brass" : "text-fog"}`}>
              {tab === t && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-full bg-brass" />}
              {t}
            </button>
          ))}
        </div>
      </nav>

      {showTx && <TxForm txs={state.transactions} initial={editTx ?? undefined}
        onAdd={addTx} onUpdate={updateTx} onDelete={delTx} onClose={closeTx} />}
      {showSettings && <Settings settings={state.settings} appState={state} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function Gate({ onSet }: { onSet: (p: string) => void }) {
  const [v, setV] = useState("");
  const submit = () => { if (v) onSet(v); };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="w-full max-w-xs flex flex-col items-center text-center">
        <svg width="46" height="46" viewBox="0 0 46 46" className="mb-4" aria-hidden="true">
          <path d="M23 7 L40 39 L6 39 Z" fill="#D9A441" />
        </svg>
        <h1 className="font-sans font-bold text-xl tracking-tight">Delta AM</h1>
        <p className="t-caption mt-1.5 mb-6">Enter your passcode to unlock your portfolio.</p>
        <input type="password" value={v} onChange={e => setV(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Passcode" autoFocus className="text-center" />
        <button onClick={submit} className="press w-full bg-brass text-ink font-semibold rounded-xl py-2.5 mt-3">Unlock</button>
      </div>
    </div>
  );
}
