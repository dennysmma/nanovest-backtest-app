# Nanovest Signal Lab

A local, browser-only prototype for previewing fundamental, technical, and catalyst data; configuring two-level signal weights; and evaluating a simple bullish/bearish/neutral directional rule against actual returns.

## Run locally

From this folder, run:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

CSV uploads work fully offline. Excel (`.xlsx` / `.xls`) previews use the SheetJS CDN dependency included in `index.html`.

## Evaluation rule

The composite score is the weighted mean of the three category scores. A score of 55 or higher is **Bullish**, 45 or lower is **Bearish**, and all other scores are **Neutral**. Accuracy / win rate compares that direction to the supplied actual return. This is deliberately transparent prototype behavior and not financial advice or a predictive trading system.
