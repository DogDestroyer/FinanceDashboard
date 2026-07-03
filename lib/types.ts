export type AssetClass = "Equity" | "ETF" | "Bond" | "Crypto" | "Cash";
export type Ccy = "USD" | "SGD" | "EUR" | "GBP" | "AUD" | "JPY" | "HKD";
export type TxType = "BUY" | "SELL" | "DEPOSIT" | "WITHDRAW" | "DIVIDEND";

export interface Tx {
  id: string;
  date: string;          // YYYY-MM-DD
  type: TxType;
  symbol: string;        // "CASH" for pure cash moves; ticker otherwise
  name?: string;
  assetClass: AssetClass;
  currency: Ccy;         // trade currency
  qty: number;           // units (or cash amount for cash moves)
  price: number;         // per unit in trade currency (1 for cash)
  fees: number;          // in trade currency
  geo?: string;          // "US", "Global", "SG", "Asia ex-JP", ...
  stooq?: string;        // optional price symbol override, e.g. "vwra.uk"
  coingeckoId?: string;  // optional override for crypto
}

export interface JournalEntry {
  id: string;
  symbol: string;
  thesis: string;        // why I own it
  sellTriggers: string;  // what makes me exit
  updated: string;
}

export interface DecisionLog {
  id: string;
  date: string;
  text: string;
}

export interface AppState {
  transactions: Tx[];
  journal: JournalEntry[];
  decisions: DecisionLog[];
  targets: Record<string, number>;   // symbol -> target weight %
  settings: { benchmark: string; benchmarkStooq: string; base: "USD" | "SGD"; compareIndices?: string[] };
}

export interface Quote { symbol: string; price: number; prevClose: number; currency: Ccy; }
export interface Series { symbol: string; dates: string[]; closes: number[]; }

export const emptyState: AppState = {
  transactions: [],
  journal: [],
  decisions: [],
  targets: {},
  settings: { benchmark: "ACWI", benchmarkStooq: "acwi.us", base: "SGD", compareIndices: ["ACWI", "SPY", "EWS"] }
};
