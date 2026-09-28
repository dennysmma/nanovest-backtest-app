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

The **Weekly Updated** page searches public Google News RSS coverage through the RSS2JSON public API, selects headlines from the last seven days, and links each tracked ticker to related articles. It ranks up to 10 matches by headline count. Bullish or bearish outlooks require directional wording in the headlines; mixed and non-directional coverage stays visible with an explicit label. Unmatched companies are excluded. The browser checks on page load, no more than once every seven days, and keeps up to 104 snapshots in that browser's local storage. Manual refreshes are saved as separate snapshots.

This static prototype needs an internet connection and a browser that permits the public feed request. It cannot refresh while closed or share history between browsers. A server-side scheduled feed is needed for unattended or shared updates.

## Evaluation rule

The composite score is the weighted mean of the three category scores. A score of 55 or higher is **Bullish**, 45 or lower is **Bearish**, and all other scores are **Neutral**. Accuracy / win rate compares that direction to the supplied actual return. This is deliberately transparent prototype behavior and not financial advice or a predictive trading system.

## Back Test and Forward Test

**Back Test** compares historical signals with realized returns and can use uploaded price history. **Forward Test** uses its own Fundamental, Technical, and Catalyst uploads to calculate current signals with the active configuration; it does not require or display future prices or realized outcomes. A ticker must appear in all three Forward Test files. CSV and Excel uploads are held in this browser.
