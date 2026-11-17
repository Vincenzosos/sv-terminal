# SV Terminal · public snapshot

**Paper money only: an educational experiment in which Claude, an artificial intelligence (AI) model, makes the decisions. Not affiliated with Anthropic. Not a financial service, not investment advice, not a recommendation or solicitation to buy or sell any security. The owner provides no investment services. Past or simulated results do not predict future results.**

Site: https://vincenzosos.github.io/sv-terminal/

## What this is

SV Terminal is a personal app on its owner's computer. This repository is a static, read-only snapshot of its one
public page, the Claude Portfolio, published on GitHub Pages. Nothing here runs a server, places orders or holds
credentials.

## The Claude Portfolio

- **Start:** October 19, 2026, $100,000 of paper money in US dollars.
- **Decisions:** twice a week Claude, through the owner's Claude Code, sets target weights: Wednesday evening on that
  day's Lang & Schwarz session-end prices, Saturday morning on Friday's. It reads a brief built by the program and may
  run up to four web searches to verify facts. Since November 18, 2026, the brief also carries company figures from
  Securities and Exchange Commission (SEC) filings, the S&P 500's sector weights, Claude's own earlier theses with
  their results, and a group of candidates chosen on those figures (growing, profitable companies with high free cash
  flow for their price) besides the ones chosen on price trends; Claude states for each holding the condition that would
  make it sell, and names the candidates it passed on.
- **Rules** (version 3, fixed before the first trade): 10 to 15 companies of the Standard & Poor's 500 (S&P 500)
  index; 3% to 10% in each; cash up to 20%; at most 3 companies in or out per decision; whole shares; no short
  selling, leverage, options, futures or crypto. The program adjusts a decision that breaks them and lists each
  change, or rejects it when fewer than 10 valid companies are left.
- **Orders:** on the following Thursday or Monday, market-on-close orders go to an Interactive Brokers demo account
  and fill at the US closing auction; the site records those fills. If no broker fills are recorded that day, for
  example because the broker cannot be reached or the US market is closed, fills are simulated at that day's
  Lang & Schwarz session-end mid price ± 0.05%, $1 per order, and marked as simulated.
- **Benchmark:** an S&P 500 exchange-traded fund (ETF), iShares Core S&P 500 (accumulating). It is not traded: the
  same $100,000 goes in at its October 19, 2026 price, with no fees.

## What you can check

- Each decision has a SHA-256 fingerprint (Secure Hash Algorithm, 256 bits) computed from its exact text: its date,
  target weights and Claude's full answer. The rules have one too.
- The page's Verify dialog recomputes them in your browser and lets you download the portfolio's data (summary,
  holdings, decisions and curve) as JavaScript Object Notation (JSON) files.
- The decision job asks for a new snapshot right after each decision, before its orders. Since October 17, 2026, each
  published snapshot is a new commit on top of the previous ones on `gh-pages` (none when nothing changed), so a
  fingerprint can be compared with earlier versions.

## Not advice

This is paper money and an educational experiment. It is not a financial service, not investment advice and not a
recommendation or solicitation to buy or sell any security. The owner provides no investment services. Past or
simulated results do not predict future results. The site is not affiliated with Anthropic; Claude is used as a tool.

## Data

- **Prices:** Lang & Schwarz indicative quotes (ls-tc.de) in euros, fetched by the owner's app for personal use and
  converted to dollars at Lang & Schwarz's euro-to-dollar exchange rate of the same day. They are indications, not
  trades, and can differ from the broker's prices.
- **Fills:** the Interactive Brokers demo account's own, when it can be reached.
- **Members:** Wikipedia's "List of S&P 500 companies" (Creative Commons Attribution-ShareAlike 4.0).
- **Company figures:** SEC EDGAR's company facts from 10-Q and 10-K filings (revenue, earnings, cash flow, debt and
  shares outstanding), as reported. The S&P 500's sector weights are those share counts times Lang & Schwarz prices.
- **Risk-free rate** (Sharpe ratio, alpha): the US 3-month Treasury bill, Federal Reserve Economic Data (FRED)
  series DTB3.
- **Charts:** TradingView Lightweight Charts.

## When it updates

Jobs on the owner's computer publish a new snapshot, in Berlin time:

- after each decision: Wednesday from 23:40, Saturday from 08:30;
- after each weekday's valuation: Monday to Friday from 23:25, after the Lang & Schwarz session end;
- sometimes by hand.

The broker job (Monday and Thursday at 18:00, 20:15 and 22:20) publishes nothing; its fills appear with that night's
valuation. A job missed while the computer sleeps runs when it wakes. While the computer is off, the snapshot stays
as it was. The page shows when its snapshot was taken.

## Files

- `index.html`: the page. It carries `<meta name="robots" content="noindex, nofollow">`, which asks search engines
  not to index it.
- `app.css`, `css/`: styles. `js/`: the page's code, plus `js/static.js`, which serves the page's data from `data/`
  and refuses any change, and `js/lock.js`, which marks the page as this public copy and turns off the live
  connection (its name is left from an earlier version of the site).
- `data/index.json`: when the snapshot was taken and the list of answers, each with its file in `data/p/`.
  `data/p/`: one file per answer.
- `og.png`: link preview. `icon.svg`: tab icon. `.nojekyll`: an empty file for GitHub Pages. `README.md`: this file.
- `robots.txt` disallows all crawling, but crawlers read it only at a domain's root: the meta tag is the control.
