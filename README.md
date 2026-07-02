# Book — personal multi-asset portfolio manager

Mobile-first PWA. Transaction-based accounting, dual USD/SGD base currency, live prices, TWR performance vs benchmark, risk, attribution, rebalancing, and an investment journal.

## Setup (about 10 minutes)

### 1. Supabase (persistence)
1. Create a free project at supabase.com
2. SQL Editor → paste and run `supabase.sql`
3. Project Settings → API: copy the **Project URL** and the **service_role** key

### 2. Finnhub (equity quotes, optional but recommended)
Free key at finnhub.io. Without it the app falls back to Stooq (still free, slightly delayed).

### 3. Deploy
```bash
npm i -g vercel   # if not already
vercel
```
Set these environment variables in Vercel (Project → Settings → Environment Variables):

| Variable | Value |
|---|---|
| SUPABASE_URL | your project URL |
| SUPABASE_SERVICE_ROLE_KEY | service role key |
| APP_PASSCODE | any passcode you choose |
| FINNHUB_API_KEY | your Finnhub key (optional) |

Redeploy after setting env vars.

### 4. Install on iPhone
Open the Vercel URL in Safari → Share → **Add to Home Screen**. Enter your passcode once per device.

## Data sources and fallbacks
- Equities/ETFs: Finnhub → Stooq CSV fallback (keyless)
- Daily history (NAV chart, vol, beta, drawdown): Stooq
- Crypto: CoinGecko (keyless)
- FX: Frankfurter / ECB (keyless), daily series for historical conversion

## Ticker conventions
- US listings: just the ticker (ACWI, AAPL)
- Non-US: set the **price symbol override** when logging the trade, using Stooq notation, e.g. `vwra.uk` (LSE), `o87.sg` (SGX), `cspx.uk`
- Crypto: BTC, ETH, SOL etc. are pre-mapped; anything exotic, use the CoinGecko id

## Portfolio math implemented
- **Cost basis:** FIFO lots, fees capitalized into cost on buys, netted from proceeds on sells
- **Performance:** time-weighted return (daily chain-linking, external flows stripped) so deposits never flatter the line
- **Risk:** annualized vol (√252 scaling), max drawdown on the TWR index, beta as cov(p,b)/var(b) on daily returns
- **Attribution:** position P&L over NAV ≈ weight × return contribution
- **Rebalancing:** drift vs policy weights, ±3pp highlight, suggested notional trades
