"use client";
import { useState } from "react";
import { AppState } from "@/lib/types";
import { INDICES, DEFAULT_INDICES } from "@/lib/indices";

export default function Settings({ settings, appState, onSave, onClose }: {
  settings: AppState["settings"]; appState: AppState;
  onSave: (s: AppState["settings"]) => void; onClose: () => void;
}) {
  const [base, setBase] = useState(settings.base);
  const [benchmark, setBenchmark] = useState(settings.benchmark);
  const [benchmarkStooq, setBenchmarkStooq] = useState(settings.benchmarkStooq);
  const [compare, setCompare] = useState<string[]>(settings.compareIndices ?? DEFAULT_INDICES);
  const toggle = (k: string) => setCompare(c => c.includes(k) ? c.filter(x => x !== k) : [...c, k]);

  const save = () => {
    onSave({ base, benchmark: benchmark.trim() || "ACWI", benchmarkStooq: benchmarkStooq.trim() || "acwi.us", compareIndices: compare });
    onClose();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `delta-am-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-panel border border-edge/60 rounded-t-2xl sm:rounded-2xl p-5"
        onClick={e => e.stopPropagation()} style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
        <div className="flex items-center mb-4">
          <h2 className="t-title">Settings</h2>
          <button onClick={onClose} className="press ml-auto text-fog text-xl leading-none px-2" aria-label="Close">×</button>
        </div>

        <p className="t-label mb-1.5">Base currency</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(["USD", "SGD"] as const).map(c => (
            <button key={c} onClick={() => setBase(c)}
              className={`press num text-sm rounded-xl py-2.5 border ${base === c ? "border-brass text-brass" : "border-edge text-fog"}`}>
              {c}
            </button>
          ))}
        </div>

        <p className="t-label mb-1.5">Benchmark</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <input value={benchmark} onChange={e => setBenchmark(e.target.value)} placeholder="ACWI" autoCapitalize="characters" />
            <p className="t-caption mt-1">Display ticker</p>
          </div>
          <div>
            <input value={benchmarkStooq} onChange={e => setBenchmarkStooq(e.target.value)} placeholder="acwi.us" autoCapitalize="none" />
            <p className="t-caption mt-1">Stooq price symbol</p>
          </div>
        </div>

        <p className="t-label mb-1.5">Comparison indices</p>
        <p className="t-caption mb-2">Shown on the Book tab market strip. Portfolio and your benchmark always appear.</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {INDICES.map(ix => {
            const on = compare.includes(ix.key);
            return (
              <button key={ix.key} onClick={() => toggle(ix.key)}
                className={`press flex items-center gap-2 rounded-xl py-2 px-2.5 border text-left ${on ? "border-brass/60" : "border-edge/60"}`}>
                <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${on ? "bg-brass border-brass" : "border-edge"}`}>
                  {on && <svg className="w-3 h-3 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span className="text-[11px] text-paper truncate">{ix.name}</span>
              </button>
            );
          })}
        </div>

        <p className="t-label mb-1.5">Backup</p>
        <button onClick={exportJson} className="press w-full rounded-xl py-2.5 border border-edge text-paper text-sm mb-5">
          Export data as JSON
        </button>

        <button onClick={save} className="press w-full bg-brass text-ink font-semibold rounded-xl py-3">
          Save
        </button>
      </div>
    </div>
  );
}
