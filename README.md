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

### Backtest CSV columns

Backtests join data by `Date` and `Ticker` (or `Symbol`). Use one row per ticker and date, with dates in `YYYY-MM-DD` format. The return direction is calculated from the historical `Adj_Close` when present, otherwise `Close`, after the selected forward period; an `actual_return` column is not required.

- **Price history (required):** `Date`, `Ticker`, `Close`; `Adj_Close` is preferred for return calculations when available. `Volume` is recommended. `Open`, `High`, and `Low` are optional.
- **Fundamental data (required):** `Date`, `Ticker`, and any available measures, such as `Revenue_Growth_YoY_%`, `EPS_Growth_YoY_%`, `FCF_Growth_YoY_%`, `Gross_Margin_%`, `Operating_Margin_%`, `Net_Margin_%`, `ROE_%`, `ROIC_%`, `Current_Ratio`, `Debt_to_Equity`, `PE_TTM`, `Forward_PE`, `PEG`, `PS_TTM`, `EV_EBITDA`, and `FCF_Yield_%`. Headers with `%` are read as percentage points (for example, `2.0` means 2%). For equivalent columns without `%`, values with absolute size at least 1 are treated as percentage points; smaller values are treated as decimal ratios.
- **Technical data (optional when price history is supplied):** `Date`, `Ticker`, plus any of `SMA_20`, `SMA_50`, `Volume_Ratio`, `Hist_Vol_20_%`, `RS_vs_SPX_20d_%`, `RS_vs_XLK_20d_%`, and `RS_Rating_1_99`. The app derives these features from prices when they are absent. `Hist_Vol_20_%` is treated as annualized volatility in percent points; relative-strength return columns are percent points.
- **Catalyst data (optional):** `Date`, `Ticker`, and any of `Company_Sentiment_Score`, `Macro_Sentiment_Score`, `Industry_Sentiment_Score`, `Composite_Catalyst_Score`, `Event_Category`, and `Event_Impact_Score`. Sentiment scores are interpreted on a −100 to +100 scale. Event impact scores on a −5 to +5 scale are normalized before scoring. Category names should be `Company`, `Macro`, or `Industry` to match the default catalyst subcomponents.

Each optional file can omit unavailable measurements; blank cells are ignored or use the model's neutral fallback. For point-in-time backtests, each fundamental or catalyst value must be dated when it became available, so the model cannot use information from the future. More columns do not guarantee higher accuracy; evaluate settings on dates not used to tune them.
