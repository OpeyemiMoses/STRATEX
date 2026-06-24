# Stratex

**AI-powered trading bot builder for Bitget — describe a strategy in plain English, and an AI checks its own risk before anything goes live.**

Built for the Bitget AI Base Camp Hackathon S1 (Track 1: Trading Agent).

🔗 **Live app:** [stratex-agent-builder.vercel.app](https://stratex-agent-builder.vercel.app)
🔗 **Backend API:** [stratex-production.up.railway.app](https://stratex-production.up.railway.app)

---

## What is Stratex?

Stratex turns a plain-English trading idea into a fully simulated, autonomous trading bot — without ever touching real funds.

Type something like *"Buy BTC at $60k with 10% of my portfolio, sell at $61k"*, and Stratex:

1. **Parses it with AI** (Qwen) into structured trade parameters
2. **Asks what's missing** — stop-loss, position size, leverage — through a quick-pick chat, not a form
3. **Analyses the risk** and proposes a safer alternative version, side-by-side with yours
4. **Lets you choose or edit either version** before anything is deployed
5. **Runs it live** against real Bitget prices, with the AI continuing to monitor the position and adjust stop-loss/take-profit if conditions change
6. **Lets you audit it later** — ask the AI to review any bot's decisions and flag mistakes, in plain English

Every trade is **100% simulated paper trading.** Each wallet starts with $10,000 in paper USDT and trades against real, live Bitget market prices — so every result is genuinely earned against the actual market, with zero real-fund risk.

---

## Features

### Core strategy flow
- **Natural-language strategy parsing** — Qwen extracts asset, entry, TP/SL, position size, and leverage from plain English
- **Multi-turn clarifying chat** — quick-pick buttons or free text fill in anything missing
- **Live price grounding** — no hallucinated prices; every parse is checked against Bitget's real current price
- **Asset-availability checking** — gracefully rejects assets not listed on Bitget instead of guessing
- **Risk analysis with a safer alternative** — the AI proposes a second, lower-risk version of your strategy side-by-side with your original, with an explicit risk/reward comparison and recommendation
- **Long and short positions**, both fully supported

### Leverage, with real risk
- Ask for leverage in plain English (*"5x leverage"*) and the AI walks you through it as part of the clarifying chat — it's never silently assumed
- **Real liquidation price calculation** (`entryPrice × (1 ± 1/leverage)`), enforced in the simulator
- Margin vs. exposure are tracked separately — leverage genuinely amplifies both gains and the risk of a full margin wipeout, not just a cosmetic multiplier

### Live risk monitoring
- Once a bot is running, the AI re-evaluates the position whenever price moves significantly (≥1.5% since the last check) and can adjust stop-loss or take-profit, logging its reasoning every time
- Liquidation checks take priority over take-profit/stop-loss on every tick
- A **live decision console** (floating, tabbed by type) streams every risk re-check, adjustment, and audit flag in real time, so you can watch the AI's reasoning as it happens

### AI auditing
- **Per-bot auditing** — ask the AI to review any bot, active or archived, against its own trade log and decision history, and flag real mistakes or risk-management weaknesses (or confirm it found none)
- **Wallet-wide pattern detection** — beyond single trades, ask the AI to review your entire trading history for recurring patterns: repeated losses on the same asset, ignored risk warnings, leverage habits, and more

### Real, multi-regime backtesting
- Every bot can be backtested against **real historical Bitget price data** — not randomized numbers
- Historical price action is automatically split into regimes (bull / bear / sideways / high-volatility) based on actual computed trend and volatility statistics, not hardcoded calendar dates
- The strategy's entry/TP/SL/liquidation logic is replayed bar-by-bar against each regime using the exact same leverage math as live trading
- A **robustness score** and verdict explicitly flag strategies that only work in one market condition, instead of hiding that weakness in an averaged number

### Everything else
- **Shareable PnL cards** — a clean, branded snapshot of any live or closed position, with live current price and exact P&L, downloadable as a PNG
- **Full trade history** — every closed position archives permanently with its complete trade log; copy any single entry or the entire history as JSON
- **Per-wallet paper balances** — $10,000 USDT starting balance per connected wallet, persisted to disk, with real dollar P&L and an automatic reset if a wallet's balance drops below $100
- **Mobile-responsive** throughout, with a bottom tab bar nav and card-based layouts on small screens

---

## Tech stack

**Frontend**
- React 19 + Vite 8
- [wagmi](https://wagmi.sh/) v2 + [RainbowKit](https://www.rainbowkit.com/) v2 — wallet connect (Ethereum mainnet, Polygon, Arbitrum, Base)
- React Router v7
- Recharts
- html2canvas — client-side PNG generation for shareable PnL cards
- Dark trading-terminal aesthetic, JetBrains Mono for data

**Backend**
- Node.js + Express (ESM)
- In-memory data structures, persisted to JSON files on disk (no external database)
- A 5-second polling loop fills orders, monitors stop-loss/take-profit/liquidation, and triggers AI risk re-evaluation on significant price moves

**AI**
- [Qwen](https://www.alibabacloud.com/en/product/modelstudio) (via Alibaba Cloud), `qwen3.6-plus` — powers strategy parsing, risk analysis, live position monitoring, and bot/wallet auditing

**Market data**
- [Bitget](https://www.bitget.com/) public REST API — live prices, tickers, and historical candle data for backtesting
- [CoinGecko](https://www.coingecko.com/) API — dynamic coin icons

**Deployment**
- Frontend: [Vercel](https://vercel.com/)
- Backend: [Railway](https://railway.app/)

> **No real money or order execution exists anywhere in this project.** This is a fully simulated, paper-trading system. Bitget HMAC order-signing helpers exist in the codebase but are intentionally unused dead code.

---

## Running locally

### Prerequisites
- Node.js 18+
- npm
- A Qwen API key (Alibaba Cloud) — required for all AI features
- A CoinGecko API key (free tier is sufficient) — used for coin icons

> **Note on Bitget API access:** Bitget's public API is blocked by some ISPs in certain regions. If price/candle requests time out locally, a VPN may be required during development. This is not an issue on Vercel/Railway's servers in production.

### 1. Clone the repo
```bash
git clone https://github.com/OpeyemiMoses/STRATEX.git
cd STRATEX
```

### 2. Backend setup
```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:
```env
PORT=5000
QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=your_qwen_base_url
COINGECKO_API_KEY=your_coingecko_api_key
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=
ALCHEMY_API_KEY=
```

Start the backend:
```bash
node index.js
```
The API will run on `http://localhost:5000`. You should see `Server running on port 5000` and `Simulation engine started — checking every 5s` in the console.

### 3. Frontend setup
In a new terminal:
```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:
```env
VITE_API_URL=http://localhost:5000
```

Start the frontend:
```bash
npm run dev
```
The app will run on `http://localhost:5173` (Vite's default).

### 4. Connect a wallet and go
Open the app, connect a wallet via the RainbowKit modal, and you'll get a fresh $10,000 paper-trading balance automatically. Head to **Create Strategy** and describe a trade in plain English to get started.

---

## Project structure

```
stratex/
├── frontend/
│   └── src/
│       ├── pages/           # Landing, Dashboard, CreateStrategy, Bots, BotDetail,
│       │                       BacktestResults, TradeHistory, Signals, QwenAnalysis
│       ├── components/      # AssetIcon, DecisionConsole, PnLCard, Modal,
│       │                       BacktestModal, Navbar, charts, and more
│       └── hooks/            # useBots, useStrategy, useWallet, useMarkets
└── backend/
    ├── routes/               # strategy, bots, backtest, signals, coingecko,
    │                           decisions, whale, wallet
    ├── services/             # simulator, paperWallet, tradeHistory, decisionLog,
    │                           riskMonitor, botAuditor, walletAuditor, leverage,
    │                           marketRegime, backtestEngine
    └── data/                 # gitignored — bots.json, wallets.json,
                                trade-history.json, decision-log.json
```

---

## License

MIT