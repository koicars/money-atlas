# Money Atlas

An allowance book and subscription tracker in the FocusAtlas family.
Plain HTML/JS, no framework, no build step, served from GitHub Pages and added to the iPhone home screen.

**Principles**
- Simple is the best: the app does not talk to you. It answers when asked. The one exception is subscription renewals, because money leaves on its own.
- Spend less on waste, more on what makes you grow (NEED / GROW / WASTE).
- Your data stays on your device: no server, no AI/API, no bank syncing. Backups are files you keep.

## Using it
Open https://koicars.github.io/money-atlas/ in Safari on iPhone, then Share → Add to Home Screen.
It works offline. Back up regularly from 設定 → バックアップを書き出す.

## Layout
- `index.html`, `styles.css`, `src/app.js`: the app (Today, Report, Settings, the record sheet)
- `src/db.js`: on-device storage (IndexedDB)
- `src/budget.js`: budget math (daily allowance, carry-over, tag totals)
- `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/`: offline support, home-screen app, FocusAtlas fonts
- `src/model.js`: data model (entries, categories, recurring items, budgets)
- `src/import/expensebook.js`: importer for the ExpenseBook app's CSV export (runs in the browser and in Node)
- `tools/convert-expensebook.mjs`: CLI wrapper for the importer
- `test/`: `npm test` (Node's built-in test runner, no dependencies)

## Importing ExpenseBook data
```bash
npm run convert -- path/to/ExpenseBook.csv
```
Writes `data/expensebook.json` and prints a yearly summary plus rows to review.
`data/` and `*.csv` are git-ignored: personal financial data must never be committed.

### What the importer does
- Decodes the UTF-16 export.
- Maps tags to NEED / GROW / WASTE (`need`; `investment`/`投資` → GROW; `waste`/`浪費`/`無駄遣い` → WASTE).
- Moves payment tags (`card`, `credit card`, `クレジットカード`) into a separate `payment` field.
- Leaves the legacy `消費` tag (2015–2016) untagged, keeping the raw tag.
- Repairs rows with a broken year by inferring it from neighbouring IDs.
- Merges `clothes` into `clothing` and trims category names.
- Never drops a row: anything doubtful is flagged for review.
