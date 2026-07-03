// Market indices tracked via liquid US-listed ETF proxies, so day-change quotes
// flow through the existing Finnhub-then-Stooq plumbing. US listings are used
// throughout because free-tier index quotes and non-US Stooq intraday are
// unreliable (Stooq serves a bot challenge to datacenter IPs). These proxies are
// display-only: they never enter NAV, FX, or history-driven risk math.
export interface IndexProxy { key: string; name: string; label: string; symbol: string; stooq: string; }

export const INDICES: IndexProxy[] = [
  { key: "ACWI", name: "MSCI ACWI (ACWI)",  label: "ACWI",     symbol: "ACWI", stooq: "acwi.us" },
  { key: "SPY",  name: "S&P 500 (SPY)",     label: "S&P 500",  symbol: "SPY",  stooq: "spy.us" },
  { key: "EWS",  name: "Singapore (EWS)",   label: "SG (EWS)", symbol: "EWS",  stooq: "ews.us" },
  { key: "QQQ",  name: "Nasdaq 100 (QQQ)",  label: "Nasdaq",   symbol: "QQQ",  stooq: "qqq.us" },
  { key: "DIA",  name: "Dow Jones (DIA)",   label: "Dow",      symbol: "DIA",  stooq: "dia.us" },
  { key: "IWM",  name: "Russell 2000 (IWM)",label: "Russell",  symbol: "IWM",  stooq: "iwm.us" },
  { key: "EWU",  name: "UK / FTSE (EWU)",   label: "UK (EWU)", symbol: "EWU",  stooq: "ewu.us" },
  { key: "EWA",  name: "Australia (EWA)",   label: "AU (EWA)", symbol: "EWA",  stooq: "ewa.us" },
  { key: "EWJ",  name: "Japan (EWJ)",       label: "JP (EWJ)", symbol: "EWJ",  stooq: "ewj.us" },
  { key: "EWH",  name: "Hong Kong (EWH)",   label: "HK (EWH)", symbol: "EWH",  stooq: "ewh.us" },
];

// Shown by default (after the pinned Portfolio chip). The rest sit behind the
// horizontal scroll and are opt-in via the settings sheet.
export const DEFAULT_INDICES = ["ACWI", "SPY", "EWS"];
