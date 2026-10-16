# Signal Desk

An AI trading dashboard. It scans a market (stocks, ETFs, forex, crypto or indices) and returns one setup with an entry, stop loss, take profit, success probability and the reasons behind it. It also has a watchlist, a pick history that scores each pick against real prices, a Take trade button with a profit/loss total of the trades you actually took, trading costs, a walk-forward backtest, market-hours and news warnings, a daily loss limit, position sizing, alerts, and optional user accounts.

Picks are model estimates. This is not financial advice, and it does not place trades.

## What is in this folder

| File | What it does |
| --- | --- |
| `index.html`, `bg2.jpg` | The whole dashboard (one page, no build step) |
| `api/candles.js` | Fetches real price candles from Twelve Data |
| `api/search.js` | Searches every symbol Twelve Data offers |
| `api/earnings.js` | Looks up a stock's next earnings date for the warning (needs a Twelve Data plan that includes earnings) |
| `api/cron.js` | Scheduled check that emails users when a trade or tracked pick hits its stop or target (optional) |
| `api/_td.js` | Shared code for the Twelve Data endpoints |
| `terms.html` | Terms, privacy and risk disclosure. Fill in the highlighted placeholders before going public |
| `api/ai.js` | Asks Claude for the written analysis (Anthropic API) |
| `api/health.js`, `api/config.js` | Tell the page which services are connected |
| `supabase.sql` | Sets up the accounts database (optional) |
| `.env.example` | The list of settings you need to add in Vercel |
| `vercel.json`, `package.json` | Hosting settings |

## Home screen and paper trading

The page opens on a home screen with two tabs. **Dashboard** is the full tool. **Paper trading** is a simpler practice view with a navy colour scheme and an amber banner so it can never be mistaken for the real thing. It uses the same real prices (so it needs the same Twelve Data key), a pretend balance you can reset, and your trading-cost setting. Press Paper trade on the AI's pick, or turn on automatic taking to test the AI hands-free. Positions close when their stop or target is reached in the real price candles, or when you press Close now. It has the dashboard's search bar, minimum probability slider, risk slider (up to 75%), daily loss limit and its own watchlist. Practice data is saved in the browser only. No broker is connected and no real orders can be placed.

## Deploy

1. Create a GitHub repository and upload everything in this folder, keeping the `api` folder as it is. Do not upload real keys.
2. At vercel.com choose Add New, Project, import the repository, and click Deploy.
3. In the Vercel project open Settings, Environment Variables, and add:
   - `TWELVEDATA_KEY` from twelvedata.com (needed for real prices)
   - `ANTHROPIC_API_KEY` from console.anthropic.com (needed for the AI write-up)
4. Open Deployments, open the latest one, and choose Redeploy so it picks up the keys.
5. Open your site. The strip near the top should say Data: Live.

Until the Twelve Data key is added, the page says Not connected and shows a setup message instead of prices. To look at the layout without keys, add `?preview=1` to the address; that shows clearly labeled sample prices.

Without an Anthropic key everything still works, using the built-in rule-based analysis instead of the AI write-up.

## Accounts (optional, free)

Accounts let people sign up with email and password and keep their watchlist and pick history on any device. Without these steps the site still works, but data stays in each visitor's browser.

1. At supabase.com create a New project (free plan).
2. SQL Editor, New query, paste `supabase.sql`, click Run.
3. Authentication, URL Configuration: set Site URL to your Vercel address.
4. Project Settings, API: copy the Project URL and the `anon` `public` key.
5. In Vercel add `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then Redeploy.

With accounts on, only signed-in users get the AI write-up (this protects your Anthropic credit). Never use the `service_role` key in this project. For a public launch, connect your own email provider in Supabase (Authentication, SMTP), because the built-in email sending is limited.

## Things to know

- **Rate limits.** Free Twelve Data plans allow only a few requests per minute. One scan loads 8 symbols, so repeated scans can hit the limit. Results are cached briefly, and the page tells you when a symbol could not be loaded.
- **Plan coverage.** Which symbols and markets work (indices in particular) depends on your Twelve Data plan. Unavailable symbols show an error instead of made-up data.
- **Auto timeframe.** Choosing Auto in the Timeframe menu scans the market on 1h, then compares all six timeframes for the two strongest symbols and picks the best-scoring combination. That takes about a dozen extra data requests per scan, so on a free Twelve Data plan some may be refused for rate limits; the page uses whatever loaded.
- **Delayed prices.** Some plans deliver delayed prices.
- **Costs.** Set a monthly spend limit in the Anthropic Console. A signed-in user can still make many AI requests.
- **Scoring picks.** A pick counts as won when price touches its take profit first and lost when it touches its stop first. If both happen inside one candle it counts as lost. Press Check outcomes, or reload, to score open picks.
- **Take trade and the profit/loss box.** Picks are only suggestions. Press Take trade on a pick and enter your real entry price, size, stop, target and costs. When the stop or target is reached the trade closes by itself, or you can close it with your actual exit price (Close or edit in the history). The big profit/loss box adds up only these trades, after costs, and the account size field follows it. Typing a new account size sets a new starting point. The history also keeps a separate scoreboard of every pick the model made, whether you took it or not.
- **Trading costs.** Each market has an editable cost per trade (spread, commission and slippage, as a % of trade value). Defaults: stocks 0.05%, ETFs 0.03%, forex 0.02%, crypto 0.2%, indices 0.03%. Costs reduce the expected value and the walk-forward result, and they are subtracted from your trade results. They are estimates; set them to match your broker.
- **Walk-forward backtest.** Each past signal is scored using only data available before it, signals never overlap, and costs are charged. The page shows the win rate, what the model had predicted, and the average result per trade in R. If past predictions ran too optimistic, today's probability is reduced a little. Treat anything with fewer than 10 signals as weak.
- **Market hours and news.** The page shows whether the market is open (US stock hours, major index hours, forex week, crypto 24/7; holidays are not checked) and warns about FOMC decision days and the monthly US jobs report. The FOMC dates are listed by hand in `index.html` (search for `const FOMC`); update that list each year from the Federal Reserve's calendar. Earnings warnings come from `api/earnings.js` and only appear if your Twelve Data plan includes earnings data.
- **Daily loss limit.** If the trades you closed today lose more than this percent of the day's starting account, new picks and new trades are paused until tomorrow. You can override it for the day.
- **Alerts** in the browser only run while the page is open. For alerts when it is closed, set up email alerts below.

## Email alerts when the page is closed (optional)

This needs accounts (above) and two more free services. It is the most involved part of the setup, so do it last.

1. In Supabase, run `supabase.sql` again (the last lines add two columns).
2. At resend.com create an account and an API key. To email anyone you must verify a domain you own; for a first test you can use `onboarding@resend.dev` as the sender, but then Resend only delivers to your own address.
3. In Supabase, Project Settings, API, copy the `service_role` key. It has full access, so it goes only in Vercel's environment variables, never in a file, the page or GitHub.
4. In Vercel add `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `MAIL_FROM` (for example `Signal Desk <alerts@yourdomain.com>`) and `CRON_SECRET` (any long random text), then Redeploy.
5. Signed-in users will now see an Email alerts button in the watchlist panel.
6. The check runs from `/api/cron`. `vercel.json` schedules it once a day, which is the most the free Vercel plan allows. For checks every few minutes, create a free job at cron-job.org that opens `https://YOUR-SITE.vercel.app/api/cron?key=YOUR_CRON_SECRET` every 5 minutes.

Each run checks up to 8 symbols (so it respects free Twelve Data limits) and rotates through the rest on later runs. Price data comes from candles, so an alert can arrive minutes after the price touched the level.

## Run it on your own computer

Install the Vercel CLI (`npm i -g vercel`), copy `.env.example` to `.env`, fill it in, then run `vercel dev`.
