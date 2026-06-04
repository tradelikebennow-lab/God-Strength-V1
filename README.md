# God Strength V1 · Trading Journal

Self-hosted prop trading journal for multi-account, multi-currency tracking. Dark blue Linear/Binance aesthetic. Zero cost via GitHub Pages.

## Features

- **6 tabs** — Dashboard, In Depth Analysis, Trade Log, Transactions, Accounts, Rule Book
- **Dual currency** — USD / EUR / Both display modes with FX conversion
- **Smart trade entry** — R-multiples auto-compute from entry/stop/TP prices, Market auto-detected from instrument
- **Full analytics** — TWR equity curves, payout-adjusted Max DD, Calmar, Profit Factor, R-multiple histogram, day-of-week performance, hold-time vs R scatter, market zone sizes, concurrent trades, payout projection
- **xlsx import** — Replace-all mode with auto-detection of Trade Log / Transactions sheets
- **JSON export** — One-click backup of all data
- **localStorage persistence** — Data survives browser restarts, no server needed

## Quick start (local dev)

Requires Node 18+ and npm.

```bash
# 1. Clone the repo
git clone https://github.com/YOUR-USERNAME/God-Strength-V1.git
cd God-Strength-V1

# 2. Install dependencies
npm install

# 3. Run dev server
npm run dev
# → opens http://localhost:5173/God-Strength-V1/
```

Open the app, click the 📥 import button (top right), upload your xlsx. Done.

## Deploying to GitHub Pages

### One-time setup

1. **Create a new GitHub repo** named exactly `God-Strength-V1` (must match the base path in `vite.config.js`)
2. **Push this project** to that repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/God-Strength-V1.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Repo Settings → Pages
   - Source: **GitHub Actions** (not "Deploy from branch")
   - Save

That's it. The workflow at `.github/workflows/deploy.yml` runs on every push to `main`, builds with Vite, and deploys to `https://YOUR-USERNAME.github.io/God-Strength-V1/`.

First deploy takes 2-3 minutes. Check the **Actions** tab to watch it.

### Subsequent updates

```bash
# Make changes locally
npm run dev     # test
git add .
git commit -m "Update X"
git push        # auto-deploys
```

### Custom repo name

If you want a different repo name (e.g. `trading-journal`), change **two** places:

1. `vite.config.js` → `base: '/trading-journal/'`
2. `package.json` → `"homepage": "https://YOUR-USERNAME.github.io/trading-journal/"`

## Importing your data

1. Export your Google Sheet trading journal as `.xlsx`
2. Open the app, click the **📥 import** button (top right)
3. Choose the file → app auto-detects "Trade Log" and "Transactions" sheets
4. Click **Parse & Preview** → review counts and any warnings
5. Click **Replace All Data** → done

Going forward, edit trades in the app. The xlsx is no longer the source of truth.

### Backing up

Click the **💾 export** button (top right) — downloads a JSON file with everything (accounts, trades, transactions, settings). Import it back via the import flow if you ever need to restore.

## Project structure

```
src/
├── App.jsx                    # Main shell + state + tab routing
├── main.jsx                   # React entry point
├── data/
│   ├── schema.js              # Data shape definitions
│   ├── defaults.js            # 5 pre-configured accounts
│   ├── storage.js             # localStorage + JSON export/import
│   ├── import.js              # xlsx parser with header auto-mapping
│   └── ruleBook.js            # Playbook content
├── analytics/
│   ├── trade.js               # Per-trade R-multiples, result classification
│   ├── account.js             # Balance timeline, DD, Calmar, stats
│   ├── portfolio.js           # FX-corrected portfolio aggregates, TWR
│   ├── monthly.js             # Per-account monthly performance grid
│   ├── breakdowns.js          # Strategy / direction / type / market grouping
│   └── extras.js              # Zone sizes, concurrent trades, R histogram, etc.
├── utils/
│   ├── dates.js               # Timezone-safe ISO date helpers
│   └── currency.js            # fmtCur(amount, currency, mode, fxRate)
├── tabs/
│   ├── Dashboard.jsx          # Hero + KPIs + breach + balances + monthly + equity + instruments + payout
│   ├── InDepth.jsx            # Breakdowns + concurrent + zones + new analytics
│   ├── TradeLog.jsx           # Sortable table + smart entry form + CSV export
│   ├── Transactions.jsx       # Deposit/Payout/Upgrade CRUD
│   ├── Accounts.jsx           # 10-slot account config
│   └── RuleBook.jsx           # Playbook + KPI thresholds + risk matrix + 16 rules
├── components/
│   ├── TopBar.jsx, TabNav.jsx, CurrencyToggle.jsx, FilterPopover.jsx
│   ├── StatCard.jsx, MiniTable.jsx, ProgressBar.jsx, Sparkline.jsx
│   ├── EquityChart.jsx, MonthlyGrid.jsx
│   ├── TradeForm.jsx, ImportModal.jsx
└── styles/
    ├── theme.css              # Dark blue theme + all component styles
    └── tokens.js              # Design tokens (JS-readable)
```

## Stack

- **React 18** + **Vite 5** (no SSR, static build)
- **Recharts** for AreaChart, BarChart, ScatterChart
- **SheetJS (xlsx)** for xlsx import
- **localStorage** for persistence
- **GitHub Pages** for hosting (free, no auth)

## Common tasks

| Task | How |
|------|-----|
| Add a trade | Trade Log tab → **+ New Trade** |
| Duplicate a similar trade | Trade Log tab → ⎘ icon on the source row |
| Change EUR→USD rate | Accounts tab → click Pepperstone → edit FX Rate |
| Mark FTMO as live (Unlocked) | Accounts tab → click FTMO → set Status to Unlocked |
| Add a new account | Accounts tab → **+ Add Account** (up to 10 slots) |
| Switch currency display | Top bar → click USD / EUR / BOTH |
| Filter to one year + account + strategy | Top bar → **Filters** popover |
| Backup my data | Top bar → 💾 icon → downloads JSON |
| Restore from backup | Top bar → 📥 icon → upload the JSON (note: this is for xlsx; JSON restore is a planned V2 feature) |

## Known methodology notes

- **YTD Growth** includes payouts taken as realized profit; xlsx shows portfolio-value-change which includes deposits. Different valid questions, different numbers.
- **Calmar Ratio** uses textbook formula: `(period return × 365/days) / |maxDD|`. xlsx uses a slightly different denominator giving ~0.5× the value.
- **Avg Concurrent Trades** counts all calendar days from first open to last close where ≥1 trade is open. xlsx uses "trading days only" giving a higher number.

These are documented choices, not bugs. The numbers tell consistent stories.

## License

Personal use. Not licensed for redistribution.
