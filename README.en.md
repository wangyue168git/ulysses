# Ulysses

**Tie yourself to the mast.** A self-hosted portfolio dashboard that holds you to the rules you wrote when you were calm.

[![CI](https://github.com/wangyue168git/ulysses/actions/workflows/ci.yml/badge.svg)](https://github.com/wangyue168git/ulysses/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文](README.md) | English

> In the *Odyssey*, Ulysses has to sail past the Sirens. Knowing he will not be able to resist their song, he has his crew tie him to the mast and tells them: "Whatever I say later, do not untie me."
>
> Behavioural economists call this a **Ulysses contract**: while you are clear-headed, you bind the impulsive person you will become later.
>
> Investing is the same. You want to chase rallies, run from crashes, and doubt yourself when a friend's stock doubles. This dashboard is the mast: **write down the rule before you buy; from then on every holding carries a small tag that says "add" or "hold off" according to your own rules.**

<p>
  <img src="docs/screenshots/m-home.png" width="250" alt="Overview">
  <img src="docs/screenshots/m-holdings.png" width="250" alt="Holdings">
  <img src="docs/screenshots/m-discipline.png" width="250" alt="Discipline">
</p>

## What it does

- **"Add / hold off" tags driven by your own rules**: always add, weight-based (add below one line, stop at another, stop once a target share count is reached), or never add. Rules can be set right on the page, and every change is logged.
- **Discipline page**: did this month's index purchase happen, is the index/stock split on target, have you bought enough of each stock — all on one screen.
- **Designed against anxiety**: profit and loss are hidden on the home screen by default; tap to peek and they hide again after a few seconds. Colour is used only where attention is needed.
- **All accounts in one place**: China A-shares, mutual funds, Hong Kong and US stocks, and crypto, converted to one currency.
- **Desktop analysis**: exposure breakdown, return attribution, an investment journal, and the equity curve.
- **AI advisor (optional)**: one-tap portfolio check-up, Q&A, an interview that drafts rules for beginners, and importing holdings from a broker screenshot. It can only *propose* changes — you confirm each one — and it has no ability to trade. By default only percentages are sent, never amounts.
- **Broker sync (optional)**: Interactive Brokers and Longbridge built in; any other broker via CSV import or a small custom adapter.
- **Your data stays yours**: one Node.js process and a few JSON files. No database, no third-party accounts.

<img src="docs/screenshots/d-overview.png" width="820" alt="Desktop">

> Screenshots show fictional demo data. The UI is currently in Chinese.

## Quick start

With Docker:

```bash
git clone https://github.com/wangyue168git/ulysses.git
cd ulysses
cp .env.example .env        # edit as needed, e.g. set APP_PASSWORD
docker compose up -d
docker compose logs         # without APP_PASSWORD, the generated first-run password is printed here
```

Open `http://<your-server>:3457` and log in. On a phone, "Add to Home Screen" turns it into an app.

Or run it directly with Node.js 18+, starting with demo data:

```bash
npm ci
DEMO=1 node server.js
```

Or deploy to a cloud platform in one click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wangyue168git/ulysses)

For Fly.io, Railway and other options, see the [deployment guide](docs/deploy.md).

## Documentation

The detailed guides are in Chinese for now.

| Topic | Guide |
|---|---|
| What each page does; setting rules in the UI | [docs/features.md](docs/features.md) |
| Writing the rules file `plan.json` | [docs/rules.md](docs/rules.md) |
| AI advisor: features, configuration, privacy | [docs/ai.md](docs/ai.md) |
| Docker, cloud platforms, Node.js | [docs/deploy.md](docs/deploy.md) |
| Broker sync: IB, Longbridge, CSV, Futu, custom adapters | [docs/brokers/](docs/brokers/) |
| Login, backups, market data sources | [docs/security.md](docs/security.md) |

## Disclaimer

This is a bookkeeping and reminder tool. The "add / hold off" tags are a mechanical comparison against **rules you wrote yourself**, and the AI advisor's output is for reference only. Nothing here is investment advice. You are responsible for your own decisions.

## Development and license

```bash
npm test
```

[MIT](LICENSE). Built with [Chart.js](https://www.chartjs.org/), [Tailwind CSS](https://tailwindcss.com/), [ws](https://github.com/websockets/ws) and the [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (all MIT).
