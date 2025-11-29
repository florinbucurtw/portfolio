export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Simple JSON response helper
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status,
      headers: { 'content-type': 'application/json' }
    });

    // Exchange rates endpoint (USD/GBP/RON -> EUR reference)
    if (path === '/api/exchange-rates' && method === 'GET') {
      try {
        const bnrResp = await fetch('https://www.bnr.ro/nbrfxrates.xml');
        const xml = await bnrResp.text();
        const eurMatch = xml.match(/<Rate currency="EUR">([0-9.]+)<\/Rate>/);
        const bnrRon = eurMatch?.[1] ? parseFloat(eurMatch[1]) : null;
        const fxResp = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
        const data = await fxResp.json();
        return json({
          USD: data?.rates?.USD ?? 1.16,
          GBP: data?.rates?.GBP ?? 0.86,
          RON: bnrRon ?? data?.rates?.RON ?? 5.09
        });
      } catch (e) {
        return json({ USD: 1.16, GBP: 0.86, RON: 5.09 }, 200);
      }
    }

    // Stocks
    if (path === '/api/stocks' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM stocks').all();
      return json(rows.results || []);
    }
    if (path === '/api/stocks' && method === 'POST') {
      const body = await request.json();
      const { symbol, weight, company, allocation, shares, share_price, broker, risk, sector } = body;
      // Unique by symbol
      const dup = await env.DB.prepare('SELECT id FROM stocks WHERE symbol = ?').bind(symbol).first();
      if (dup) return json({ error: `Stock with symbol '${symbol}' already exists` }, 409);
      const res = await env.DB.prepare(
        'INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(symbol, weight, company, allocation, shares, share_price, broker, risk, sector).run();
      return json({ id: res.lastRowId, ...body });
    }
    if (path.startsWith('/api/stocks/') && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await request.json();
      // If only share_price, update only that
      if (Object.keys(body).length === 1 && body.share_price !== undefined) {
        await env.DB.prepare('UPDATE stocks SET share_price = ? WHERE id = ?').bind(body.share_price, id).run();
        return json({ id: Number(id), share_price: body.share_price });
      }
      const { symbol, weight, company, allocation, shares, share_price, broker, risk, sector } = body;
      if (symbol && symbol !== '-') {
        const dup = await env.DB.prepare('SELECT id FROM stocks WHERE symbol = ? AND id != ?').bind(symbol, id).first();
        if (dup) return json({ error: `Stock with symbol '${symbol}' already exists` }, 409);
      }
      await env.DB.prepare(
        'UPDATE stocks SET symbol=?, weight=?, company=?, allocation=?, shares=?, share_price=?, broker=?, risk=?, sector=? WHERE id = ?'
      ).bind(symbol, weight, company, allocation, shares, share_price, broker, risk, sector, id).run();
      return json({ id: Number(id), ...body });
    }
    if (path.startsWith('/api/stocks/') && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM stocks WHERE id = ?').bind(id).run();
      return json({ message: 'Stock deleted successfully' });
    }

    // Deposits
    if (path === '/api/deposits' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM deposits ORDER BY id').all();
      return json(rows.results || []);
    }
    if (path === '/api/deposits' && method === 'POST') {
      const body = await request.json();
      const { count, date, amount, account, month } = body;
      const res = await env.DB.prepare(
        'INSERT INTO deposits (count, date, amount, account, month) VALUES (?, ?, ?, ?, ?)'
      ).bind(count, date, amount, account, month).run();
      return json({ id: res.lastRowId, ...body });
    }
    if (path.startsWith('/api/deposits/') && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await request.json();
      const { count, date, amount, account, month } = body;
      await env.DB.prepare(
        'UPDATE deposits SET count=?, date=?, amount=?, account=?, month=? WHERE id = ?'
      ).bind(count, date, amount, account, month, id).run();
      return json({ id: Number(id), ...body });
    }
    if (path.startsWith('/api/deposits/') && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM deposits WHERE id = ?').bind(id).run();
      return json({ message: 'Deposit deleted successfully' });
    }

    // Dividends
    if (path === '/api/dividends' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM dividends ORDER BY id').all();
      return json(rows.results || []);
    }
    if (path === '/api/dividends' && method === 'POST') {
      const body = await request.json();
      const { year, annual_dividend } = body;
      const res = await env.DB.prepare('INSERT INTO dividends (year, annual_dividend) VALUES (?, ?)')
        .bind(year, annual_dividend).run();
      return json({ id: res.lastRowId, year, annual_dividend });
    }
    if (path.startsWith('/api/dividends/') && method === 'PUT') {
      const id = path.split('/').pop();
      const body = await request.json();
      const { annual_dividend } = body;
      await env.DB.prepare('UPDATE dividends SET annual_dividend = ? WHERE id = ?')
        .bind(annual_dividend, id).run();
      return json({ id: Number(id), annual_dividend });
    }
    if (path.startsWith('/api/dividends/') && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM dividends WHERE id = ?').bind(id).run();
      return json({ message: 'Dividend deleted successfully' });
    }

    // Performance snapshots: save
    if (path === '/api/performance-snapshot' && method === 'POST') {
      try {
        const body = await request.json();
        const portfolio_balance = Number(body.portfolio_balance || 0);
        const total_deposits = Number(body.total_deposits || 0);
        const timestamp = Date.now();

        const baseline = await env.DB.prepare('SELECT * FROM performance_baseline WHERE id = 1').first();
        if (!baseline) {
          const spBase = await fetchIndexPrice('^GSPC');
          const betBase = await fetchIndexPrice('^BET-TRN.RO');
          await env.DB.prepare(
            'INSERT INTO performance_baseline (id, timestamp, portfolio_balance, total_deposits, sp500_price, bet_price) VALUES (1, ?, ?, ?, ?, ?)'
          ).bind(timestamp, portfolio_balance, total_deposits, spBase, betBase).run();
          await env.DB.prepare(
            'INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent) VALUES (?, ?, 0, 0, 0, 0)'
          ).bind(timestamp, portfolio_balance).run();
          return json({ id: 1, timestamp, portfolio_percent: 0, deposits_percent: 0, sp500_percent: 0, bet_percent: 0, is_baseline: true });
        }
        const portfolioPercent = baseline.portfolio_balance > 0
          ? ((portfolio_balance - baseline.portfolio_balance) / baseline.portfolio_balance) * 100
          : 0;
        const depositDiff = Math.abs((total_deposits ?? 0) - (baseline.total_deposits ?? 0));
        const depositsPercent = baseline.total_deposits > 0
          ? (depositDiff < 0.01 ? 0 : ((total_deposits - baseline.total_deposits) / baseline.total_deposits) * 100)
          : 0;
        // Fetch indices percent vs baseline prices
        const sp500Percent = await latestIndexPercent(env, baseline.sp500_price || 0, '^GSPC');
        const betPercent = await latestIndexPercent(env, baseline.bet_price || 0, '^BET-TRN.RO');

        await env.DB.prepare(
          'INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(timestamp, portfolio_balance, portfolioPercent, depositsPercent, sp500Percent, betPercent).run();
        return json({ timestamp, portfolio_percent: portfolioPercent, deposits_percent: depositsPercent, sp500_percent: sp500Percent, bet_percent: betPercent });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // Performance snapshots: list
    if (path === '/api/performance-snapshots' && method === 'GET') {
      const range = url.searchParams.get('range') || '1m';
      const now = Date.now();
      let startTime = 0;
      switch (range) {
        case '1h': startTime = now - 3600000; break;
        case '1d': startTime = now - 86400000; break;
        case '1w': startTime = now - 604800000; break;
        case '1m': startTime = now - 2592000000; break;
        case '6m': startTime = now - 15552000000; break;
        case '1y': startTime = now - 31536000000; break;
        case '5y': startTime = now - 157680000000; break;
        case 'ytd': startTime = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
        case 'max': startTime = 0; break;
        default: startTime = now - 2592000000;
      }
      const rows = await env.DB.prepare('SELECT * FROM performance_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC').bind(startTime).all();
      return json({ range, snapshots: rows.results || [] });
    }

    return json({ error: 'Not Found' }, 404);
  },

  async scheduled(event, env, ctx) {
    // Duplicate protection
    const last = await env.DB.prepare('SELECT timestamp FROM performance_snapshots ORDER BY timestamp DESC LIMIT 1').first();
    const now = Date.now();
    if (last && (now - last.timestamp) < 55000) {
      console.log(`Cron skip: last snapshot ${Math.round((now - last.timestamp)/1000)}s ago`);
      return;
    }

    const portfolio_balance = await computePortfolioBalanceEUR(env);
    if (!portfolio_balance || portfolio_balance <= 0) {
      console.log('Cron skip: portfolio balance unavailable');
      return;
    }
    const total_deposits = await computeTotalDepositsEUR(env);

    const baseline = await env.DB.prepare('SELECT * FROM performance_baseline WHERE id = 1').first();
    const timestamp = now;
    if (!baseline) {
      const spBase = await fetchIndexPrice('^GSPC');
      const betBase = await fetchIndexPrice('^BET-TRN.RO');
      await env.DB.prepare(
        'INSERT INTO performance_baseline (id, timestamp, portfolio_balance, total_deposits, sp500_price, bet_price) VALUES (1, ?, ?, ?, ?, ?)'
      ).bind(timestamp, portfolio_balance, total_deposits, spBase, betBase).run();
      await env.DB.prepare(
        'INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent) VALUES (?, ?, 0, 0, 0, 0)'
      ).bind(timestamp, portfolio_balance).run();
      console.log('Cron: baseline created with index prices');
      return;
    }

    const portfolioPercent = baseline.portfolio_balance > 0
      ? ((portfolio_balance - baseline.portfolio_balance) / baseline.portfolio_balance) * 100
      : 0;
    const depositDiff = Math.abs((total_deposits ?? 0) - (baseline.total_deposits ?? 0));
    const depositsPercent = baseline.total_deposits > 0
      ? (depositDiff < 0.01 ? 0 : ((total_deposits - baseline.total_deposits) / baseline.total_deposits) * 100)
      : 0;

    const sp500Percent = await latestIndexPercent(env, baseline.sp500_price || 0, '^GSPC');
    const betPercent = await latestIndexPercent(env, baseline.bet_price || 0, '^BET-TRN.RO');

    await env.DB.prepare(
      'INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(timestamp, portfolio_balance, portfolioPercent, depositsPercent, sp500Percent, betPercent).run();
    console.log('Cron snapshot saved');
  }
}

async function latestIndexPercent(env, baselinePrice, symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const resp = await fetch(url);
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    let price = meta.regularMarketPrice ?? meta.previousClose ?? null;
    if (price == null && result?.indicators?.quote?.[0]?.close) {
      const closes = result.indicators.quote[0].close.filter(v => v != null);
      if (closes.length > 0) price = closes[closes.length - 1];
    }
    if (baselinePrice > 0 && price != null) {
      return ((price - baselinePrice) / baselinePrice) * 100;
    }
  } catch (e) {
    console.log('Index fetch failed', symbol, e.message);
  }
  return 0;
}

async function fetchIndexPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const resp = await fetch(url);
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    let price = meta.regularMarketPrice ?? meta.previousClose ?? null;
    if (price == null && result?.indicators?.quote?.[0]?.close) {
      const closes = result.indicators.quote[0].close.filter(v => v != null);
      if (closes.length > 0) price = closes[closes.length - 1];
    }
    return price ?? 0;
  } catch (e) {
    console.log('Baseline index fetch failed', symbol, e.message);
    return 0;
  }
}

async function computePortfolioBalanceEUR(env) {
  const rows = await env.DB.prepare('SELECT shares, share_price, broker FROM stocks').all();
  const rates = await fetch('https://api.exchangerate-api.com/v4/latest/EUR').then(r => r.json()).catch(() => ({ rates: { USD: 1.16, GBP: 0.86, RON: 5.09 } }));
  const USD = rates?.rates?.USD ?? 1.16;
  const GBP = rates?.rates?.GBP ?? 0.86;
  const RON = rates?.rates?.RON ?? 5.09;
  let total = 0;
  for (const r of (rows.results || [])) {
    const shares = parseFloat(String(r.shares || '0').replace(/[^0-9.-]/g, '')) || 0;
    const raw = String(r.share_price || '0');
    const num = parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
    let priceEUR = num;
    if (raw.includes('$') || r.broker === 'Crypto') priceEUR = num / USD;
    else if (raw.includes('£')) priceEUR = num / GBP;
    else if (/RON|Lei|lei/i.test(raw)) priceEUR = num / RON;
    total += shares * (priceEUR || 0);
  }
  return Math.round(total * 100) / 100;
}

async function computeTotalDepositsEUR(env) {
  const rows = await env.DB.prepare('SELECT amount FROM deposits').all();
  const total = (rows.results || []).reduce((sum, r) => {
    const val = parseFloat(String(r.amount || '0').replace(/[^0-9.-]/g, '')) || 0;
    return sum + val;
  }, 0);
  return Math.round(total * 100) / 100;
}
