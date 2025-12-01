import type { Firestore } from 'firebase-admin/firestore';
import { fetch as undiciFetch } from 'undici';

const priceCache = new Map<string, { priceEUR: number; ts: number }>();

export async function fetchRates(db: Firestore) {
  const out: Record<string, number> = { USD: 1, GBP: 1, RON: 1 };
  const snap = await db.collection('exchange_rates').get();
  for (const d of snap.docs) {
    const { code, rate_eur } = d.data() as any;
    out[code] = rate_eur;
  }
  if (!out.USD || out.USD === 1) out.USD = 0.92;
  if (!out.GBP || out.GBP === 1) out.GBP = 1.16;
  if (!out.RON || out.RON === 1) out.RON = 0.20;
  return out;
}

export function parseSharePriceToEUR(stock: any, rates: Record<string, number>) {
  const rawStr = String(stock.share_price || '').trim();
  if (!rawStr) return 0;
  const numeric = parseFloat(rawStr.replace(/[^0-9.\-]/g, '')) || 0;
  if (!numeric) return 0;
  let currency = 'EUR';
  if (/^RON/i.test(rawStr)) currency = 'RON';
  else if (rawStr.startsWith('$')) currency = 'USD';
  else if (rawStr.startsWith('£')) currency = 'GBP';
  else if (/^GBX|^GBp/i.test(rawStr)) currency = 'GBX';
  else if (rawStr.startsWith('€') || /^EUR/i.test(rawStr)) currency = 'EUR';
  else {
    const sym = (stock.symbol || '').toUpperCase();
    if (sym.endsWith('.L') || /^PREM/.test(sym)) currency = 'GBP';
    else if (sym.endsWith('.RO')) currency = 'RON';
  }
  let eur = numeric;
  if (currency === 'USD') eur = numeric * (rates.USD || 1);
  else if (currency === 'GBP') eur = numeric * (rates.GBP || 1);
  else if (currency === 'GBX') eur = (numeric / 100) * (rates.GBP || 1);
  else if (currency === 'RON') eur = numeric * (rates.RON || 0.20);
  return +eur.toFixed(6);
}

export async function getNormalizedStocks(db: Firestore, rates: Record<string, number>) {
  const snap = await db.collection('stocks').orderBy('symbol', 'asc').get();
  return snap.docs.map(d => {
    const s = { id: d.id, ...d.data() } as any;
    const priceEUR = parseSharePriceToEUR(s, rates);
    const shares = parseFloat(s.shares) || 0;
    const allocationEUR = +(shares * priceEUR).toFixed(6);
    return { ...s, share_price_eur: priceEUR, allocation_eur: allocationEUR };
  });
}

export function buildAllocation(stocks: any[], keyFn: (s:any)=>string) {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const s of stocks) {
    grand += s.allocation_eur;
    const key = keyFn(s);
    totals.set(key, (totals.get(key) || 0) + s.allocation_eur);
  }
  const items = Array.from(totals.entries()).map(([name, valueEUR]) => ({
    name,
    value_eur: +valueEUR.toFixed(2),
    percentage: grand ? +(100 * valueEUR / grand).toFixed(4) : 0
  })).sort((a,b) => b.value_eur - a.value_eur);
  return { total_eur: +grand.toFixed(2), items };
}

export function inferCountry(stock: any) {
  const sym = stock.symbol || '';
  if (sym.endsWith('.L') || /^PREM/i.test(sym)) return 'United Kingdom';
  if (sym.endsWith('.PA')) return 'France';
  if (sym.endsWith('.MI')) return 'Italy';
  if (sym.endsWith('.DE') || sym.endsWith('.F')) return 'Germany';
  if (sym.endsWith('.AS')) return 'Netherlands';
  if (sym.endsWith('.ST')) return 'Sweden';
  if (sym.endsWith('.BR')) return 'Belgium';
  if (sym.endsWith('.TO')) return 'Canada';
  if (sym.endsWith('.HK')) return 'Hong Kong';
  return 'Unknown';
}

export async function computePortfolioBalanceEUR(db: Firestore, rates: Record<string, number>) {
  const stocks = await getNormalizedStocks(db, rates);
  return +stocks.reduce((s, x) => s + x.allocation_eur, 0).toFixed(2);
}

export async function computeTotalDepositsEUR(db: Firestore, rates: Record<string, number>) {
  const snap = await db.collection('deposits').get();
  let total = 0;
  for (const d of snap.docs) {
    const { amount, currency } = d.data() as any;
    const amt = parseFloat(amount) || 0;
    if (currency === 'EUR') total += amt;
    else if (currency === 'USD') total += amt * (rates.USD || 1);
    else if (currency === 'GBP') total += amt * (rates.GBP || 1);
    else if (currency === 'RON') total += amt * (rates.RON || 0.20);
    else total += amt;
  }
  return +total.toFixed(2);
}

export function convertToEUR(value: number, currency: string, rates: Record<string, number>) {
  if (currency === 'USD') return value * (rates.USD || 1);
  if (currency === 'GBP') return value * (rates.GBP || 1);
  if (currency === 'RON') return value * (rates.RON || 0.20);
  if (currency === 'GBX') return (value / 100) * (rates.GBP || 1);
  return value;
}

export async function fetchPremFromGoogle(symbol: string, rates: Record<string, number>) {
  const gSym = 'PREM:LON';
  try {
    const res = await undiciFetch(`https://www.google.com/finance/quote/${gSym}`);
    if (!res.ok) return null;
    const html = await res.text();
    const poundMatch = html.match(/£\s?([0-9]+(?:\.[0-9]+)?)/);
    const gbxMatch = html.match(/GBX\s?([0-9]+(?:\.[0-9]+)?)/);
    let priceGBP: number | null = null;
    if (poundMatch) priceGBP = parseFloat(poundMatch[1]);
    else if (gbxMatch) priceGBP = parseFloat(gbxMatch[1]) / 100;
    if (priceGBP == null) return null;
    const priceEUR = priceGBP * (rates.GBP || 1);
    return { priceEUR: +priceEUR.toFixed(6) };
  } catch (_) {
    return null;
  }
}

export async function getLiveOrFallbackPrice(db: Firestore, symbol: string, rates: Record<string, number>) {
  const now = Date.now();
  const cached = priceCache.get(symbol);
  if (cached && (now - cached.ts < 120000)) {
    return { symbol, price_eur: cached.priceEUR, cached: true };
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  let yahooOk = false;
  let priceEUR: number | null = null;
  let rawCurrency = 'EUR';

  try {
    const res = await undiciFetch(yahooUrl);
    if (res.ok) {
      const data = await res.json() as any;
      const meta = data?.chart?.result?.[0]?.meta;
      const lastClose = meta?.regularMarketPrice;
      if (typeof lastClose === 'number') {
        rawCurrency = meta?.currency || 'EUR';
        priceEUR = convertToEUR(lastClose, rawCurrency, rates);
        yahooOk = true;
      }
    }
  } catch (_) {}

  let googleFallbackUsed = false;
  if (!yahooOk && /^PREM/i.test(symbol)) {
    const g = await fetchPremFromGoogle(symbol, rates);
    if (g && g.priceEUR) {
      priceEUR = g.priceEUR;
      googleFallbackUsed = true;
    }
  }

  if (priceEUR == null) {
    const snap = await db.collection('stocks').where('symbol', '==', symbol).limit(1).get();
    const doc = snap.docs[0];
    if (doc) {
      const rawStr = (doc.data() as any).share_price as string;
      const s = { symbol, share_price: rawStr };
      priceEUR = parseSharePriceToEUR(s, rates);
    } else {
      priceEUR = 0;
    }
  }

  const price = +(priceEUR || 0).toFixed(6);
  priceCache.set(symbol, { priceEUR: price, ts: now });

  return {
    symbol,
    price_eur: price,
    yahoo: yahooOk,
    googleFallback: googleFallbackUsed,
    currency_detected: rawCurrency
  };
}
