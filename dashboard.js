let dashboardPriceUpload = null;
let dashboardPriceSource = 'backtest';
let dashboardPriceSeries = [];

const dashboardMoney = value => Number.isFinite(value)
  ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : '—';
const dashboardPercent = value => Number.isFinite(value)
  ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  : '—';

function getDashboardPriceData() {
  return dashboardPriceSource === 'dashboard'
    ? dashboardPriceUpload
    : uploads.priceHistory;
}

function collectDashboardSeries(data) {
  const byTicker = new Map();
  const rows = rowsAsObjects(data);
  for (const row of rows) {
    const ticker = String(row.ticker || row.symbol || '').trim().toUpperCase();
    const date = analystDateKey(row.date || row.timestamp || '');
    const close = Number(String(row.close ?? '').replaceAll(',', '').trim());
    const parsedDate = date ? new Date(`${date}T00:00:00Z`) : null;
    if (!ticker || ticker === 'SPY' || !date || Number.isNaN(parsedDate?.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || !Number.isFinite(close) || close <= 0) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, new Map());
    byTicker.get(ticker).set(date, { date, close });
  }
  return [...byTicker.entries()]
    .map(([ticker, byDate]) => ({
      ticker,
      rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    }))
    .filter(item => item.rows.length)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function closeHistoryStats(item) {
  const rows = item.rows;
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const trailing20 = rows.length > 20 ? rows[rows.length - 21] : null;
  const closes = rows.map(row => row.close);
  return {
    ...item,
    first,
    latest,
    previous,
    dailyChange: previous ? (latest.close / previous.close - 1) * 100 : null,
    change20: trailing20 ? (latest.close / trailing20.close - 1) * 100 : null,
    high: Math.max(...closes),
    low: Math.min(...closes),
    average: closes.reduce((sum, value) => sum + value, 0) / closes.length
  };
}

function renderDashboard() {
  const data = getDashboardPriceData();
  const file = dashboardPriceSource === 'dashboard' ? dashboardPriceUpload : uploads.priceHistory;
  const series = collectDashboardSeries(data?.data);
  const empty = $('#dashboard-price-empty');
  const content = $('#dashboard-price-content');
  const backtestButton = $('#dashboard-use-backtest');
  backtestButton.hidden = !uploads.priceHistory || dashboardPriceSource === 'backtest';

  if (!series.length) {
    empty.hidden = false;
    content.hidden = true;
    $('#dashboard-source-title').textContent = file ? 'No usable close-price rows found' : 'Waiting for price history';
    $('#dashboard-source-description').textContent = file
      ? 'The file needs Date, Ticker (or Symbol), and positive Close values. Upload a corrected CSV or Excel file.'
      : 'Upload a file with Date, Ticker, and Close columns, or upload price history on the Back Test page. Each stock ticker in the file is summarized; SPY is excluded.';
    return;
  }

  dashboardPriceSeries = series.map(closeHistoryStats);
  const allRows = dashboardPriceSeries.flatMap(item => item.rows);
  const dates = allRows.map(row => row.date).sort();
  const latestDate = dates[dates.length - 1];
  const earliestDate = dates[0];
  const filename = file?.name || 'Back Test price history';
  $('#dashboard-source-title').textContent = `${filename} · ${dashboardPriceSeries.length} stock tickers`;
  $('#dashboard-source-description').textContent = `Showing closing prices from ${earliestDate} through ${latestDate}. Statistics use the Close column and the tickers supplied in this file; SPY is excluded.`;
  empty.hidden = true;
  content.hidden = false;
  $('#dashboard-price-metrics').innerHTML = [
    ['Stock tickers', dashboardPriceSeries.length, 'Non-benchmark tickers with valid close data'],
    ['Daily closes', allRows.length.toLocaleString(), 'Valid ticker/date observations'],
    ['Coverage', `${earliestDate} – ${latestDate}`, 'Date span in the uploaded history'],
    ['Latest close date', latestDate, 'Latest date found in the file']
  ].map(([label, value, detail]) => `<div class="card metric"><span>${label}</span><strong class="dashboard-metric-value">${value}</strong><small>${detail}</small></div>`).join('');

  const select = $('#dashboard-ticker-select');
  const previousTicker = select.value;
  select.innerHTML = dashboardPriceSeries.map(item => `<option value="${esc(item.ticker)}">${esc(item.ticker)}</option>`).join('');
  select.value = dashboardPriceSeries.some(item => item.ticker === previousTicker) ? previousTicker : dashboardPriceSeries[0].ticker;
  select.onchange = renderSelectedCloseChart;

  $('#dashboard-ticker-count').textContent = `${dashboardPriceSeries.length} tickers`;
  $('#dashboard-price-rows').innerHTML = dashboardPriceSeries.map(item => `<tr>
    <td><button class="dashboard-ticker-link" type="button" data-dashboard-ticker="${esc(item.ticker)}"><b>${esc(item.ticker)}</b></button></td>
    <td>${item.latest.date}</td>
    <td class="num">${dashboardMoney(item.latest.close)}</td>
    <td class="num ${item.dailyChange > 0 ? 'dashboard-positive' : item.dailyChange < 0 ? 'dashboard-negative' : ''}">${dashboardPercent(item.dailyChange)}</td>
    <td class="num ${item.change20 > 0 ? 'dashboard-positive' : item.change20 < 0 ? 'dashboard-negative' : ''}">${dashboardPercent(item.change20)}</td>
    <td class="num">${dashboardMoney(item.high)}</td>
    <td class="num">${dashboardMoney(item.low)}</td>
    <td class="num">${dashboardMoney(item.average)}</td>
    <td class="num">${item.rows.length.toLocaleString()}</td>
  </tr>`).join('');
  $$('.dashboard-ticker-link').forEach(button => {
    button.onclick = () => {
      select.value = button.dataset.dashboardTicker;
      renderSelectedCloseChart();
      $('#dashboard-chart-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  });
  renderSelectedCloseChart();
}

function renderSelectedCloseChart() {
  const ticker = $('#dashboard-ticker-select').value;
  const item = dashboardPriceSeries.find(entry => entry.ticker === ticker);
  if (!item) return;
  const rows = item.rows;
  const width = 960, height = 285;
  const margin = { top: 18, right: 24, bottom: 38, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minValue = Math.min(...rows.map(row => row.close));
  const maxValue = Math.max(...rows.map(row => row.close));
  const spread = maxValue - minValue || Math.max(maxValue * 0.06, 1);
  const low = minValue - spread * 0.08;
  const high = maxValue + spread * 0.08;
  const x = index => margin.left + (rows.length > 1 ? index / (rows.length - 1) : 0.5) * plotWidth;
  const y = value => margin.top + (high - value) / (high - low) * plotHeight;
  const step = Math.max(1, Math.ceil(rows.length / 700));
  const points = rows.map((row, index) => ({ row, index }))
    .filter(({ index }) => index % step === 0 || index === rows.length - 1)
    .map(({ row, index }) => `${x(index).toFixed(1)},${y(row.close).toFixed(1)}`).join(' ');
  const grid = Array.from({ length: 4 }, (_, index) => {
    const value = high - (high - low) * index / 3;
    const lineY = y(value);
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${lineY}" y2="${lineY}" class="dashboard-chart-grid"/><text x="${margin.left - 10}" y="${lineY + 4}" text-anchor="end" class="dashboard-chart-axis">${dashboardMoney(value)}</text>`;
  }).join('');
  const latest = rows[rows.length - 1];
  const totalReturn = rows.length > 1 ? (latest.close / rows[0].close - 1) * 100 : null;
  $('#dashboard-chart-title').textContent = `${ticker} closing-price history`;
  $('#dashboard-chart-subtitle').textContent = `${rows.length.toLocaleString()} daily closes · ${rows[0].date} to ${latest.date}`;
  $('#dashboard-price-chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ticker)} daily closing prices from ${rows[0].date} to ${latest.date}">
    ${grid}<polyline points="${points}" class="dashboard-chart-line"/>
    <text x="${margin.left}" y="${height - 10}" class="dashboard-chart-axis">${rows[0].date}</text>
    <text x="${width - margin.right}" y="${height - 10}" text-anchor="end" class="dashboard-chart-axis">${latest.date}</text>
    <circle cx="${x(rows.length - 1)}" cy="${y(latest.close)}" r="4" class="dashboard-chart-point"/>
  </svg>`;
  $('#dashboard-chart-stats').innerHTML = [
    ['Latest close', dashboardMoney(latest.close)],
    ['Change over available history', dashboardPercent(totalReturn)],
    ['Highest close', dashboardMoney(item.high)],
    ['Lowest close', dashboardMoney(item.low)]
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
}

async function handleDashboardPriceUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    let data;
    if (/\.csv$/i.test(file.name)) data = parseCsv(await file.text());
    else {
      if (!window.XLSX) throw Error('Excel reader could not load. Please use CSV.');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
    }
    if (data.length < 2) throw Error('The uploaded file has no price rows.');
    const candidate = { name: file.name, data };
    if (!collectDashboardSeries(candidate.data).length) throw Error('No valid rows found. Include Date, Ticker, and positive Close values.');
    dashboardPriceUpload = candidate;
    dashboardPriceSource = 'dashboard';
    renderDashboard();
    toast('Dashboard price history loaded');
  } catch (error) {
    toast(error.message);
  } finally {
    event.target.value = '';
  }
}

$('#dashboard-price-file').onchange = handleDashboardPriceUpload;
$('#dashboard-use-backtest').onclick = () => {
  dashboardPriceSource = 'backtest';
  renderDashboard();
};
$$('.nav-item[data-view="dashboard"]').forEach(button => button.addEventListener('click', renderDashboard));
renderDashboard();
