# Nanovest Signal Lab

A local, browser-only prototype for previewing fundamental, technical, and catalyst data; configuring two-level signal weights; and evaluating a simple bullish/bearish/neutral directional rule against actual returns.

## Run locally

From this folder, run:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

CSV uploads work fully offline. Excel (`.xlsx` / `.xls`) previews use the SheetJS CDN dependency included in `index.html`.

## Weekly Updated

The **Weekly Updated** page reads the public Google News RSS search feed in the browser, selects headlines from the last seven days, and links every listed ticker to its supporting articles. Tickers are matched against a small explicit company alias list. Bullish or bearish outlooks require a directional headline keyword; conflicting or unmatched evidence is left out. The browser checks on page load, no more than once every seven days, and keeps up to 104 weekly snapshots in that browser's local storage. Use **Refresh update** to fetch sooner.

This static prototype needs an internet connection and a browser that permits the public feed request. It cannot refresh while closed or share history between browsers. A server-side scheduled feed is needed for unattended or shared updates.

## Evaluation rule

The composite score is the weighted mean of the three category scores. A score of 55 or higher is **Bullish**, 45 or lower is **Bearish**, and all other scores are **Neutral**. Accuracy / win rate compares that direction to the supplied actual return. This is deliberately transparent prototype behavior and not financial advice or a predictive trading system.
