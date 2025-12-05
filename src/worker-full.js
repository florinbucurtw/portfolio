export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    try {
      // Serve static assets from public/ via Wrangler [assets]
      if (!path.startsWith('/api/')) {
        // Allow SPA-style routing: serve index.html for root and known pages
        return env.ASSETS.fetch(request);
      }

      if (path === '/api/exchange-rates' && method === 'GET') {
        const rates = await fetchRates(env);
        return json({ rates });
      }

      if (path === '/api/stocks' && method === 'GET') {
        const rates = await fetchRates(env);
        const stocks = await getNormalizedStocks(env.DB, rates);
        const total = stocks.reduce((s, x) => s + x.allocation_eur, 0);
        const withPct =
          total > 0
            ? stocks.map((s) => ({
                ...s,
                allocation_percent: +((100 * s.allocation_eur) / total).toFixed(4),
              }))
            : stocks.map((s) => ({ ...s, allocation_percent: 0 }));
        return json({ total_eur: +total.toFixed(2), stocks: withPct });
      }

      if (path === '/api/stocks' && method === 'POST') {
        const body = await request.json();
        const {
          symbol,
          company,
          shares = 0,
          share_price = '',
          broker = '',
          sector = '',
          risk = '',
          allocation = '',
        } = body;
        await env.DB.prepare(
          `INSERT INTO stocks (symbol, company, shares, share_price, broker, sector, risk, allocation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(symbol, company, shares, share_price, broker, sector, risk, allocation)
          .run();
        return json({ ok: true }, 201);
      }
      if (path.startsWith('/api/stocks/') && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        const fields = [
          'symbol',
          'company',
          'shares',
          'share_price',
          'broker',
          'sector',
          'risk',
          'allocation',
        ];
        const updates = [];
        const values = [];
        for (const f of fields) {
          if (f in body) {
            updates.push(`${f} = ?`);
            values.push(body[f]);
          }
        }
        if (!updates.length) return json({ error: 'No fields provided' }, 400);
        values.push(id);
        await env.DB.prepare(`UPDATE stocks SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run();
        return json({ ok: true });
      }
      if (path.startsWith('/api/stocks/') && method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM stocks WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (path === '/api/deposits' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM deposits ORDER BY date ASC').all();
        return json({ deposits: results });
      }
      if (path === '/api/deposits' && method === 'POST') {
        const body = await request.json();
        const { amount, currency = 'EUR', date } = body;
        await env.DB.prepare('INSERT INTO deposits (amount, currency, date) VALUES (?, ?, ?)')
          .bind(amount, currency, date)
          .run();
        return json({ ok: true }, 201);
      }
      if (path.startsWith('/api/deposits/') && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        const { amount, currency, date } = body;
        await env.DB.prepare('UPDATE deposits SET amount = ?, currency = ?, date = ? WHERE id = ?')
          .bind(amount, currency, date, id)
          .run();
        return json({ ok: true });
      }
      if (path.startsWith('/api/deposits/') && method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM deposits WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (path === '/api/dividends' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM dividends ORDER BY date ASC').all();
        return json({ dividends: results });
      }
      if (path === '/api/dividends' && method === 'POST') {
        const body = await request.json();
        const { amount, currency = 'EUR', date, symbol = '' } = body;
        await env.DB.prepare(
          'INSERT INTO dividends (amount, currency, date, symbol) VALUES (?, ?, ?, ?)'
        )
          .bind(amount, currency, date, symbol)
          .run();
        return json({ ok: true }, 201);
      }
      if (path.startsWith('/api/dividends/') && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        const { amount, currency, date, symbol } = body;
        await env.DB.prepare(
          'UPDATE dividends SET amount = ?, currency = ?, date = ?, symbol = ? WHERE id = ?'
        )
          .bind(amount, currency, date, symbol, id)
          .run();
        return json({ ok: true });
      }
      if (path.startsWith('/api/dividends/') && method === 'DELETE') {
        const id = path.split('/').pop();
        await env.DB.prepare('DELETE FROM dividends WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (path === '/api/performance-snapshot' && method === 'GET') {
        const rates = await fetchRates(env);
        const balance = await computePortfolioBalanceEUR(env.DB, rates);
        const depositsTotal = await computeTotalDepositsEUR(env.DB, rates);
        const { results: baselineRows } = await env.DB.prepare(
          'SELECT * FROM performance_snapshots ORDER BY created_at ASC LIMIT 1'
        ).all();
        const baseline = baselineRows[0] || null;
        const latestIdxPct = await latestIndexPercent(env);
        return json({
          balance_eur: balance,
          total_deposits_eur: depositsTotal,
          gain_eur: +(balance - depositsTotal).toFixed(2),
          gain_percent: depositsTotal
            ? +(((balance - depositsTotal) * 100) / depositsTotal).toFixed(2)
            : 0,
          baseline,
          index_percent: latestIdxPct,
        });
      }

      if (path === '/api/performance-snapshots' && method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM performance_snapshots ORDER BY created_at DESC'
        ).all();
        return json({ snapshots: results });
      }

      if (path.startsWith('/api/stock-price/') && method === 'GET') {
        const symbol = decodeURIComponent(path.split('/').pop());
        const rates = await fetchRates(env);
        const priceInfo = await getLiveOrFallbackPrice(env.DB, symbol, rates);
        return json(priceInfo);
      }

      if (path === '/api/quotes' && method === 'GET') {
        return json({ quotes: [] });
      }

      if (path === '/api/allocation/sectors' && method === 'GET') {
        const rates = await fetchRates(env);
        const stocks = await getNormalizedStocks(env.DB, rates);
        const sectors = buildAllocation(stocks, (s) => s.sector || 'Unknown');
        return json(sectors);
      }

      if (path === '/api/allocation/countries' && method === 'GET') {
        const rates = await fetchRates(env);
        const stocks = await getNormalizedStocks(env.DB, rates);
        const countries = buildAllocation(stocks, inferCountry);
        return json(countries);
      }

      if (path === '/api/debug-sql' && method === 'POST') {
        const body = await request.json();
        if (!body.sql) return json({ error: 'sql required' }, 400);
        const stmt = env.DB.prepare(body.sql);
        const isSelect = /^\s*select/i.test(body.sql);
        const res = isSelect ? await stmt.all() : await stmt.run();
        return json({ result: res });
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: e.message, stack: e.stack }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const rates = await fetchRates(env);
      const balance = await computePortfolioBalanceEUR(env.DB, rates);
      const depositsTotal = await computeTotalDepositsEUR(env.DB, rates);
      const gain = balance - depositsTotal;
      const gainPct = depositsTotal ? (gain * 100) / depositsTotal : 0;
      await env.DB.prepare(
        'INSERT INTO performance_snapshots (balance_eur, total_deposits_eur, gain_eur, gain_percent, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
      )
        .bind(balance, depositsTotal, gain, gainPct)
        .run();
    } catch (e) {
      console.error('scheduled error', e);
    }
  },
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  });
}

const priceCache = new Map();

async function fetchRates(env) {
  const out = { USD: 1, GBP: 1, RON: 1 };
  try {
    const { results } = await env.DB.prepare('SELECT code, rate_eur FROM exchange_rates').all();
    for (const r of results) out[r.code] = r.rate_eur;
  } catch (_) {}
  if (!out.USD || out.USD === 1) out.USD = 0.92;
  if (!out.GBP || out.GBP === 1) out.GBP = 1.16;
  if (!out.RON || out.RON === 1) out.RON = 0.2;
  return out;
}

function parseSharePriceToEUR(stock, rates) {
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
  else if (currency === 'RON') eur = numeric * (rates.RON || 0.2);
  return +eur.toFixed(6);
}

function convertStoredSharePriceToEUR(rawStr, symbol, rates) {
  if (!rawStr) return 0;
  const numeric = parseFloat(String(rawStr).replace(/[^0-9.\-]/g, '')) || 0;
  if (!numeric) return 0;
  let currency = 'EUR';
  if (/^RON/i.test(rawStr)) currency = 'RON';
  else if (rawStr.startsWith('$')) currency = 'USD';
  else if (rawStr.startsWith('£')) currency = 'GBP';
  else if (/^GBX|^GBp/i.test(rawStr)) currency = 'GBX';
  else if (rawStr.startsWith('€') || /^EUR/i.test(rawStr)) currency = 'EUR';
  else {
    const sym = (symbol || '').toUpperCase();
    if (sym.endsWith('.L') || /^PREM/.test(sym)) currency = 'GBP';
    else if (sym.endsWith('.RO')) currency = 'RON';
  }
  if (currency === 'USD') return +(numeric * (rates.USD || 1)).toFixed(6);
  if (currency === 'GBP') return +(numeric * (rates.GBP || 1)).toFixed(6);
  if (currency === 'GBX') return +((numeric / 100) * (rates.GBP || 1)).toFixed(6);
  if (currency === 'RON') return +(numeric * (rates.RON || 0.2)).toFixed(6);
  return +numeric.toFixed(6);
}

async function getNormalizedStocks(db, rates) {
  const { results } = await db.prepare('SELECT * FROM stocks ORDER BY id ASC').all();
  return results.map((s) => {
    const priceEUR = parseSharePriceToEUR(s, rates);
    const shares = parseFloat(s.shares) || 0;
    const allocationEUR = +(shares * priceEUR).toFixed(6);
    return { ...s, share_price_eur: priceEUR, allocation_eur: allocationEUR };
  });
}

function buildAllocation(stocks, keyFn) {
  const totals = new Map();
  let grand = 0;
  for (const s of stocks) {
    grand += s.allocation_eur;
    const key = keyFn(s);
    totals.set(key, (totals.get(key) || 0) + s.allocation_eur);
  }
  const items = Array.from(totals.entries())
    .map(([name, valueEUR]) => ({
      name,
      value_eur: +valueEUR.toFixed(2),
      percentage: grand ? +((100 * valueEUR) / grand).toFixed(4) : 0,
    }))
    .sort((a, b) => b.value_eur - a.value_eur);
  return { total_eur: +grand.toFixed(2), items };
}

function inferCountry(stock) {
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

async function computePortfolioBalanceEUR(db, rates) {
  const stocks = await getNormalizedStocks(db, rates);
  return +stocks.reduce((s, x) => s + x.allocation_eur, 0).toFixed(2);
}

async function computeTotalDepositsEUR(db, rates) {
  const { results } = await db.prepare('SELECT amount, currency FROM deposits').all();
  let total = 0;
  for (const r of results) {
    const amt = parseFloat(r.amount) || 0;
    if (r.currency === 'EUR') total += amt;
    else if (r.currency === 'USD') total += amt * (rates.USD || 1);
    else if (r.currency === 'GBP') total += amt * (rates.GBP || 1);
    else if (r.currency === 'RON') total += amt * (rates.RON || 0.2);
    else total += amt;
  }
  return +total.toFixed(2);
}

async function indexChart(env) {
  return [];
}
async function fetchIndexPrice(env) {
  return { index_price: 1000 };
}
async function latestIndexPercent(env) {
  return 0;
}

async function getLiveOrFallbackPrice(db, symbol, rates) {
  const now = Date.now();
  const cached = priceCache.get(symbol);
  if (cached && now - cached.ts < 120000) {
    return { symbol, price_eur: cached.priceEUR, cached: true };
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  let yahooOk = false;
  let priceEUR = null;
  let rawCurrency = 'EUR';

  try {
    const res = await fetch(yahooUrl);
    if (res.ok) {
      const data = await res.json();
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
    try {
      const { results } = await db
        .prepare('SELECT share_price FROM stocks WHERE symbol = ? LIMIT 1')
        .bind(symbol)
        .all();
      if (results.length) {
        priceEUR = convertStoredSharePriceToEUR(results[0].share_price, symbol, rates);
      } else {
        priceEUR = 0;
      }
    } catch (_) {
      priceEUR = 0;
    }
  }

  priceEUR = +priceEUR.toFixed(6);
  priceCache.set(symbol, { priceEUR, ts: now });

  return {
    symbol,
    price_eur: priceEUR,
    yahoo: yahooOk,
    googleFallback: googleFallbackUsed,
    currency_detected: rawCurrency,
  };
}

function convertToEUR(value, currency, rates) {
  if (currency === 'USD') return value * (rates.USD || 1);
  if (currency === 'GBP') return value * (rates.GBP || 1);
  if (currency === 'RON') return value * (rates.RON || 0.2);
  if (currency === 'GBX') return (value / 100) * (rates.GBP || 1);
  return value;
}

async function fetchPremFromGoogle(symbol, rates) {
  const gSym = 'PREM:LON';
  try {
    const res = await fetch(`https://www.google.com/finance/quote/${gSym}`);
    if (!res.ok) return null;
    const html = await res.text();
    const poundMatch = html.match(/£\s?([0-9]+(?:\.[0-9]+)?)/);
    const gbxMatch = html.match(/GBX\s?([0-9]+(?:\.[0-9]+)?)/);
    let priceGBP = null;
    if (poundMatch) priceGBP = parseFloat(poundMatch[1]);
    else if (gbxMatch) priceGBP = parseFloat(gbxMatch[1]) / 100;
    if (priceGBP == null) return null;
    const priceEUR = priceGBP * (rates.GBP || 1);
    return { priceEUR: +priceEUR.toFixed(6) };
  } catch (_) {
    return null;
  }
}
