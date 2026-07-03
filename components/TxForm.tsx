"use client";
import { useState } from "react";
import { AssetClass, Ccy, Tx, TxType } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function makeForm(t?: Tx) {
  if (t) return {
    type: t.type,
    symbol: t.type === "DEPOSIT" || t.type === "WITHDRAW" ? "" : t.symbol,
    name: t.name ?? "", assetClass: (t.assetClass === "Cash" ? "ETF" : t.assetClass) as AssetClass,
    currency: t.currency, qty: String(t.qty), price: String(t.price), fees: String(t.fees),
    date: t.date, geo: t.geo ?? "Global", stooq: t.stooq ?? ""
  };
  return {
    type: "BUY" as TxType, symbol: "", name: "", assetClass: "ETF" as AssetClass,
    currency: "USD" as Ccy, qty: "", price: "", fees: "0", date: today(), geo: "Global", stooq: ""
  };
}

export default function TxForm({ txs, initial, onAdd, onUpdate, onDelete, onClose }: {
  txs: Tx[]; initial?: Tx;
  onAdd: (tx: Tx) => void; onUpdate: (tx: Tx) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [f, setF] = useState(makeForm(initial));
  const [editingId, setEditingId] = useState<string | null>(initial?.id ?? null);
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  const isCash = f.type === "DEPOSIT" || f.type === "WITHDRAW";
  const valid = f.date && parseFloat(f.qty) > 0 && (isCash || (f.symbol && parseFloat(f.price) > 0));

  const reset = () => { setF(makeForm()); setEditingId(null); };
  const startEdit = (t: Tx) => { setF(makeForm(t)); setEditingId(t.id); };
  const remove = (id: string) => { onDelete(id); if (id === editingId) reset(); };

  const submit = () => {
    if (!valid) return;
    const fields = {
      date: f.date, type: f.type as TxType,
      symbol: isCash ? "CASH" : f.symbol.toUpperCase().trim(),
      name: f.name || undefined,
      assetClass: (isCash ? "Cash" : f.assetClass) as AssetClass,
      currency: f.currency as Ccy, qty: parseFloat(f.qty),
      price: isCash ? 1 : parseFloat(f.price), fees: parseFloat(f.fees) || 0,
      geo: f.geo || "Global", stooq: f.stooq.trim() || undefined
    };
    if (editingId) {
      const orig = txs.find(t => t.id === editingId);
      onUpdate({ ...orig, ...fields, id: editingId } as Tx);
    } else {
      onAdd({ id: crypto.randomUUID(), ...fields });
    }
    reset();
  };

  const L = ({ children }: { children: React.ReactNode }) => <label className="block t-label mb-1 mt-3">{children}</label>;
  const ledger = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-panel border border-edge/60 rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
        <div className="flex items-center mb-3">
          <h2 className="t-title">{editingId ? "Edit transaction" : "Log a transaction"}</h2>
          <button onClick={onClose} className="press ml-auto text-fog text-xl leading-none px-2" aria-label="Close">×</button>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {(["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAW"] as TxType[]).map(t => (
            <button key={t} onClick={() => set("type", t)}
              className={`press text-[10px] py-2 rounded-lg border ${f.type === t ? "border-brass text-brass" : "border-edge/60 text-fog"}`}>
              {cap(t)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-3">
          <div><L>Date</L><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></div>
          <div><L>Currency</L>
            <select value={f.currency} onChange={e => set("currency", e.target.value)}>
              {["USD", "SGD", "EUR", "GBP", "AUD", "JPY", "HKD"].map(c => <option key={c}>{c}</option>)}
            </select></div>
          {!isCash && <>
            <div><L>Ticker</L><input value={f.symbol} onChange={e => set("symbol", e.target.value)} placeholder="ACWI, BTC, O87…" autoCapitalize="characters" /></div>
            <div><L>Asset class</L>
              <select value={f.assetClass} onChange={e => set("assetClass", e.target.value)}>
                {["Equity", "ETF", "Bond", "Crypto"].map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><L>{f.type === "DIVIDEND" ? "Units held" : "Quantity"}</L>
              <input type="number" inputMode="decimal" value={f.qty} onChange={e => set("qty", e.target.value)} placeholder="10" /></div>
            <div><L>{f.type === "DIVIDEND" ? "Per-unit amount" : "Price per unit"}</L>
              <input type="number" inputMode="decimal" value={f.price} onChange={e => set("price", e.target.value)} placeholder="118.42" /></div>
            <div><L>Geography</L>
              <select value={f.geo} onChange={e => set("geo", e.target.value)}>
                {["Global", "US", "SG", "Asia ex-JP", "Europe", "AU", "EM"].map(g => <option key={g}>{g}</option>)}
              </select></div>
            <div><L>Fees</L><input type="number" inputMode="decimal" value={f.fees} onChange={e => set("fees", e.target.value)} /></div>
            <div className="col-span-2"><L>Price symbol override (optional)</L>
              <input value={f.stooq} onChange={e => set("stooq", e.target.value)} placeholder="e.g. vwra.uk for LSE, o87.sg for SGX" /></div>
          </>}
          {isCash && <>
            <div><L>Amount</L><input type="number" inputMode="decimal" value={f.qty} onChange={e => set("qty", e.target.value)} placeholder="5000" /></div>
            <div><L>Fees</L><input type="number" inputMode="decimal" value={f.fees} onChange={e => set("fees", e.target.value)} /></div>
          </>}
        </div>

        <button onClick={submit} disabled={!valid}
          className="press w-full mt-5 bg-brass text-ink font-semibold rounded-xl py-3 disabled:opacity-40">
          {editingId ? "Update transaction" : "Save transaction"}
        </button>
        {editingId && (
          <button onClick={reset} className="press w-full mt-2 text-fog text-xs py-1">Cancel edit, start a new entry</button>
        )}

        <div className="mt-6 pt-4 border-t border-edge/40">
          <div className="flex items-baseline mb-2">
            <p className="t-label">History ({txs.length})</p>
            <span className="ml-auto t-label">Tap a row to edit</span>
          </div>
          {ledger.length === 0 && <p className="t-caption py-2">No transactions yet.</p>}
          <div className="space-y-1 num text-xs">
            {ledger.map(t => {
              const cashRow = t.type === "DEPOSIT" || t.type === "WITHDRAW";
              return (
                <div key={t.id}
                  className={`flex items-center gap-2 rounded-lg pl-2 pr-1 py-1.5 ${t.id === editingId ? "bg-ink border border-brass/50" : "border border-transparent"}`}>
                  <button onClick={() => startEdit(t)} className="press flex-1 min-w-0 text-left flex items-baseline gap-2">
                    <span className="text-fog shrink-0">{t.date}</span>
                    <span className="font-medium shrink-0">{cap(t.type)}{cashRow ? "" : ` ${t.symbol}`}</span>
                    <span className="text-fog truncate ml-auto">{cashRow ? `${t.qty} ${t.currency}` : `${t.qty} @ ${t.price} ${t.currency}`}</span>
                  </button>
                  <button onClick={() => remove(t.id)} className="press text-loss shrink-0 px-2" aria-label="Delete transaction">Delete</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
