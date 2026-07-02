"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppState, Quote, Tx, emptyState } from "@/lib/types";
import { buildPositions, valuePositions, withWeights, toUSD, FxMap } from "@/lib/portfolio";
import Dashboard from "@/components/Dashboard";
import { Holdings, Risk, Attribution, Rebalance, Journal } from "@/components/Views";
import TxForm from "@/components/TxForm";

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
  const [err, setErr] = useState("");
  const [asOf, setAsOf] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

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

  // live quotes + fx, refresh every 60s
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const pull = async () => {
      try {
        const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols, currencies }) });
        const j = await r.json();
        if (!alive) return;
        const q: Record<string, Quote> = {};
        for (const [k, v] of Object.entries<any>(j.quotes ?? {})) {
          const pos = positions.find(p => p.symbol === k);
          q[k] = { ...v, currency: v.currency === "TRADE" ? (pos?.currency ?? "USD") : v.currency };
        }
        setQuotes(q); setFx({ USD: 1, ...j.fx });
        setAsOf(Date.now()); setStale(false); setErr("");
      } catch { setStale(true); setErr("Price fetch failed. Retrying."); }
    };
    pull();
    const id = setInterval(pull, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [loaded, symbols, currencies, positions]);

  // daily history for NAV chart + risk
  useEffect(() => {
    if (!loaded || !state.transactions.length) return;
    const from = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date))[0].date;
    fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, currencies, from, benchmarkStooq: state.settings.benchmarkStooq }) })
      .then(r => r.json()).then(setHist).catch(() => {});
  }, [loaded, symbols, currencies, state.transactions, state.settings.benchmarkStooq]);

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

  if (passcode === null) return <Gate onSet={p => { localStorage.setItem("passcode", p); setPasscode(p); }} />;

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 84px)" }}>
      <header className="flex items-center px-4 pt-4 pb-2 gap-3">
        <h1 className="font-sans font-700 text-lg tracking-tight font-bold">Delta AM</h1>
        <button onClick={() => { const b = base === "USD" ? "SGD" : "USD"; setBase(b); update("settings", { ...state.settings, base: b }); }}
          className="num text-xs border border-edge rounded-full px-3 py-1 text-fog" aria-label="Toggle base currency">
          {base} <span className="text-brass">⇄</span> {base === "USD" ? "SGD" : "USD"}
        </button>
        <button onClick={() => openTx()} className="ml-auto bg-brass text-ink font-semibold text-sm rounded-full px-4 py-1.5">
          + Trade
        </button>
      </header>
      {err && <p className="text-loss text-xs px-4">{err}</p>}

      <main className="flex-1 px-4 space-y-4 pt-2">
        {tab === "Book" && <Dashboard state={state} valued={valued} cash={cash} cashUSD={cashUSD}
          navUSD={navUSD} fx={fx} fmt={fmt} disp={disp} hist={hist} base={base} asOf={asOf} stale={stale} />}
        {tab === "Holdings" && <Holdings valued={valued} fmt={fmt} txs={state.transactions} onDelete={delTx} onEdit={openTx} />}
        {tab === "Risk" && <Risk valued={valued} cash={cash} cashUSD={cashUSD} navUSD={navUSD} fx={fx} hist={hist} state={state} />}
        {tab === "Attribution" && <Attribution valued={valued} navUSD={navUSD} fmt={fmt} />}
        {tab === "Rebalance" && <Rebalance valued={valued} cashUSD={cashUSD} navUSD={navUSD}
          targets={state.targets} setTargets={t => update("targets", t)} fmt={fmt} />}
        {tab === "Journal" && <Journal state={state}
          setJournal={j => update("journal", j)} setDecisions={d => update("decisions", d)} valued={valued} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-panel/95 backdrop-blur border-t border-edge"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto grid grid-cols-6">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3 text-[10px] font-medium ${tab === t ? "text-brass" : "text-fog"}`}>
              {t}
            </button>
          ))}
        </div>
      </nav>

      {showTx && <TxForm txs={state.transactions} initial={editTx ?? undefined}
        onAdd={addTx} onUpdate={updateTx} onDelete={delTx} onClose={closeTx} />}
    </div>
  );
}

function Gate({ onSet }: { onSet: (p: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="w-full max-w-xs space-y-4 text-center">
        <h1 className="font-bold text-xl">Delta AM</h1>
        <p className="text-fog text-sm">Enter your passcode to unlock your portfolio.</p>
        <input type="password" value={v} onChange={e => setV(e.target.value)} placeholder="Passcode" autoFocus />
        <button onClick={() => v && onSet(v)} className="w-full bg-brass text-ink font-semibold rounded-lg py-2">Unlock</button>
      </div>
    </div>
  );
}
