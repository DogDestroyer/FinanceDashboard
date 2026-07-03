"use client";
import { useState } from "react";
import { AppState } from "@/lib/types";

export default function Settings({ settings, appState, onSave, onClose }: {
  settings: AppState["settings"]; appState: AppState;
  onSave: (s: AppState["settings"]) => void; onClose: () => void;
}) {
  const [base, setBase] = useState(settings.base);
  const [benchmark, setBenchmark] = useState(settings.benchmark);
  const [benchmarkStooq, setBenchmarkStooq] = useState(settings.benchmarkStooq);

  const save = () => {
    onSave({ base, benchmark: benchmark.trim() || "ACWI", benchmarkStooq: benchmarkStooq.trim() || "acwi.us" });
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
