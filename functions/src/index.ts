import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import admin from 'firebase-admin';
import {
  fetchPremFromGoogle,
  convertToEUR,
  parseSharePriceToEUR,
  getNormalizedStocks,
  buildAllocation,
  inferCountry,
  computePortfolioBalanceEUR,
  computeTotalDepositsEUR,
  fetchRates,
  getLiveOrFallbackPrice,
} from './logic.js';

admin.initializeApp();
const db = admin.firestore();
const app = express();
app.use(express.json());

function json(res: express.Response, data: any, status = 200) {
  res
    .status(status)
    .set({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    .send(JSON.stringify(data));
}

app.get('/api/exchange-rates', async (_req, res) => {
  const rates = await fetchRates(db);
  const withEur = { EUR: 1.0, ...rates };
  json(res, { rates: withEur });
});

app.get('/api/stocks', async (_req, res) => {
  const rates = await fetchRates(db);
  const stocks = await getNormalizedStocks(db, rates);
  const total = stocks.reduce((s, x) => s + x.allocation_eur, 0);
  const withPct =
    total > 0
      ? stocks.map((s) => ({
          ...s,
          allocation_percent: +((100 * s.allocation_eur) / total).toFixed(4),
        }))
      : stocks.map((s) => ({ ...s, allocation_percent: 0 }));
  json(res, { total_eur: +total.toFixed(2), stocks: withPct });
});

app.post('/api/stocks', async (req, res) => {
  const {
    symbol,
    company,
    shares = 0,
    share_price = '',
    broker = '',
    sector = '',
    risk = '',
    allocation = '',
  } = req.body || {};
  await db
    .collection('stocks')
    .add({ symbol, company, shares, share_price, broker, sector, risk, allocation });
  json(res, { ok: true }, 201);
});

app.put('/api/stocks/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('stocks').doc(id).set(req.body, { merge: true });
  json(res, { ok: true });
});

app.delete('/api/stocks/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('stocks').doc(id).delete();
  json(res, { ok: true });
});

app.get('/api/deposits', async (_req, res) => {
  const snap = await db.collection('deposits').orderBy('date', 'asc').get();
  json(res, { deposits: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

app.post('/api/deposits', async (req, res) => {
  const { amount, currency = 'EUR', date } = req.body || {};
  await db.collection('deposits').add({ amount, currency, date });
  json(res, { ok: true }, 201);
});

app.put('/api/deposits/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('deposits').doc(id).set(req.body, { merge: true });
  json(res, { ok: true });
});

app.delete('/api/deposits/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('deposits').doc(id).delete();
  json(res, { ok: true });
});

app.get('/api/dividends', async (_req, res) => {
  const snap = await db.collection('dividends').orderBy('date', 'asc').get();
  json(res, { dividends: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

app.post('/api/dividends', async (req, res) => {
  const { amount, currency = 'EUR', date, symbol = '' } = req.body || {};
  await db.collection('dividends').add({ amount, currency, date, symbol });
  json(res, { ok: true }, 201);
});

app.put('/api/dividends/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('dividends').doc(id).set(req.body, { merge: true });
  json(res, { ok: true });
});

app.delete('/api/dividends/:id', async (req, res) => {
  const { id } = req.params;
  await db.collection('dividends').doc(id).delete();
  json(res, { ok: true });
});

app.get('/api/performance-snapshot', async (_req, res) => {
  const rates = await fetchRates(db);
  const balance = await computePortfolioBalanceEUR(db, rates);
  const depositsTotal = await computeTotalDepositsEUR(db, rates);
  const baselineSnap = await db
    .collection('performance_snapshots')
    .orderBy('created_at', 'asc')
    .limit(1)
    .get();
  const baseline = baselineSnap.docs[0]?.data() || null;
  json(res, {
    balance_eur: balance,
    total_deposits_eur: depositsTotal,
    gain_eur: +(balance - depositsTotal).toFixed(2),
    gain_percent: depositsTotal
      ? +(((balance - depositsTotal) * 100) / depositsTotal).toFixed(2)
      : 0,
    baseline,
    index_percent: 0,
  });
});

app.get('/api/performance-snapshots', async (_req, res) => {
  const snap = await db.collection('performance_snapshots').orderBy('created_at', 'desc').get();
  json(res, { snapshots: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

app.get('/api/stock-price/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const rates = await fetchRates(db);
  const priceInfo = await getLiveOrFallbackPrice(db, symbol, rates);
  json(res, priceInfo);
});

app.get('/api/quotes', async (_req, res) => json(res, { quotes: [] }));

app.get('/api/allocation/sectors', async (_req, res) => {
  const rates = await fetchRates(db);
  const stocks = await getNormalizedStocks(db, rates);
  const sectors = buildAllocation(stocks, (s) => s.sector || 'Unknown');
  json(res, sectors);
});

app.get('/api/allocation/countries', async (_req, res) => {
  const rates = await fetchRates(db);
  const stocks = await getNormalizedStocks(db, rates);
  const countries = buildAllocation(stocks, inferCountry);
  json(res, countries);
});

// Debug: emulate SQL with simple Firestore queries (limited)
app.post('/api/debug-sql', async (req, res) => {
  json(res, { error: 'Not supported on Firestore' }, 400);
});

export const api = onRequest({ region: 'europe-west1' }, app);
