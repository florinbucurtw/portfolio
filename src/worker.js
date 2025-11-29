export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization'
    };

    // Respond to CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Simple JSON response helper
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status,
      headers: corsHeaders
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
      const out = (rows.results || []).map(r => {
        const weightStr = typeof r.weight === 'string' ? r.weight : (r.weight == null ? '-' : String(r.weight));
        const allocationStr = typeof r.allocation === 'string' ? r.allocation : (r.allocation == null ? '-' : String(r.allocation));
        const sharesStr = typeof r.shares === 'string' ? r.shares : (r.shares == null ? '-' : String(r.shares));
        const priceStr = typeof r.share_price === 'string' ? r.share_price : (r.share_price == null ? '-' : String(r.share_price));

        const shares_num = typeof r.shares === 'number'
          ? Number(r.shares)
          : (() => { const n = parseFloat(String(sharesStr).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; })();
        const weight_num = typeof r.weight === 'number'
          ? Number(r.weight)
          : (() => { const n = parseFloat(String(weightStr).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; })();
        const allocation_num = typeof r.allocation === 'number'
          ? Number(r.allocation)
          : (() => { const n = parseFloat(String(allocationStr).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; })();
        const share_price_num = typeof r.share_price === 'number'
          ? Number(r.share_price)
          : (() => { const n = parseFloat(String(priceStr).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; })();

        return {
          id: r.id,
          symbol: r.symbol ?? '-',
          weight: weightStr,
          company: r.company ?? '-',
          allocation: allocationStr,
          shares: sharesStr,
          share_price: priceStr,
          broker: r.broker ?? '-',
          risk: r.risk ?? '-',
          sector: r.sector ?? '-',
          // Normalized numeric helpers (non-breaking extras)
          shares_num,
          weight_num,
          allocation_num,
          share_price_num
        };
      });
      return json(out);
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
      const current = await env.DB.prepare('SELECT * FROM stocks WHERE id = ?').bind(id).first();
      const pick = (val, fallback) => (val === undefined || val === '-' || val === '') ? fallback : val;
      const symbol = pick(body.symbol, current?.symbol);
      const weight = pick(body.weight, current?.weight);
      const company = pick(body.company, current?.company);
      const allocation = pick(body.allocation, current?.allocation);
      const shares = pick(body.shares, current?.shares);
      const share_price = pick(body.share_price, current?.share_price);
      const broker = pick(body.broker, current?.broker);
      const risk = pick(body.risk, current?.risk);
      const sector = pick(body.sector, current?.sector);
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
      // Order by year descending for consistent chart ordering
      const rows = await env.DB.prepare('SELECT * FROM dividends ORDER BY year DESC').all();
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
      const { year, annual_dividend } = body;
      // If year omitted, keep existing year
      if (year === undefined) {
        const existing = await env.DB.prepare('SELECT year FROM dividends WHERE id = ?').bind(id).first();
        await env.DB.prepare('UPDATE dividends SET year = ?, annual_dividend = ? WHERE id = ?')
          .bind(existing?.year, annual_dividend, id).run();
        return json({ id: Number(id), year: existing?.year, annual_dividend });
      } else {
        await env.DB.prepare('UPDATE dividends SET year = ?, annual_dividend = ? WHERE id = ?')
          .bind(year, annual_dividend, id).run();
        return json({ id: Number(id), year, annual_dividend });
      }
    }
    if (path.startsWith('/api/dividends/') && method === 'DELETE') {
      const id = path.split('/').pop();
      await env.DB.prepare('DELETE FROM dividends WHERE id = ?').bind(id).run();
      return json({ message: 'Dividend deleted successfully' });
    }

    // Admin: bulk import stocks (upsert by symbol)
    if (path === '/api/admin/import-stocks' && method === 'POST') {
      const items = await request.json();
      if (!Array.isArray(items)) return json({ error: 'Expected an array of stocks' }, 400);
      const results = [];
      for (const it of items) {
        const { symbol, weight, company, allocation, shares, share_price, broker, risk, sector } = it;
        if (!symbol) { results.push({ symbol, status: 'skip', reason: 'missing symbol' }); continue; }
        const existing = await env.DB.prepare('SELECT id FROM stocks WHERE symbol = ?').bind(symbol).first();
        if (existing) {
          await env.DB.prepare(
            'UPDATE stocks SET weight=?, company=?, allocation=?, shares=?, share_price=?, broker=?, risk=?, sector=? WHERE id = ?'
          ).bind(weight, company, allocation, shares, share_price, broker, risk, sector, existing.id).run();
          results.push({ symbol, status: 'updated' });
        } else {
          const res = await env.DB.prepare(
            'INSERT INTO stocks (symbol, weight, company, allocation, shares, share_price, broker, risk, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(symbol, weight, company, allocation, shares, share_price, broker, risk, sector).run();
          results.push({ symbol, status: 'inserted', id: res.lastRowId });
        }
      }
      return json({ count: results.length, results });
    }

    // Admin: bulk import dividends (replace by year)
    if (path === '/api/admin/import-dividends' && method === 'POST') {
      const items = await request.json();
      if (!Array.isArray(items)) return json({ error: 'Expected an array of dividends' }, 400);
      const results = [];
      for (const it of items) {
        const { year, annual_dividend } = it;
        if (year == null) { results.push({ year, status: 'skip', reason: 'missing year' }); continue; }
        const existing = await env.DB.prepare('SELECT id FROM dividends WHERE year = ?').bind(year).first();
        if (existing) {
          await env.DB.prepare('UPDATE dividends SET annual_dividend = ? WHERE id = ?').bind(annual_dividend, existing.id).run();
          results.push({ year, status: 'updated' });
        } else {
          const res = await env.DB.prepare('INSERT INTO dividends (year, annual_dividend) VALUES (?, ?)').bind(year, annual_dividend).run();
          results.push({ year, status: 'inserted', id: res.lastRowId });
        }
      }
      return json({ count: results.length, results });
    }

    // Admin: bulk import performance snapshots (idempotent by timestamp)
    if (path === '/api/admin/import-snapshots' && method === 'POST') {
      const items = await request.json();
      if (!Array.isArray(items)) return json({ error: 'Expected an array of snapshots' }, 400);
      const results = [];
      for (const s of items) {
        const ts = Number(s.timestamp);
        if (!ts || Number.isNaN(ts)) { results.push({ timestamp: s.timestamp, status: 'skip', reason: 'invalid timestamp' }); continue; }
        const exists = await env.DB.prepare('SELECT timestamp FROM performance_snapshots WHERE timestamp = ?').bind(ts).first();
        if (exists) { results.push({ timestamp: ts, status: 'exists' }); continue; }
        const portfolio_balance = Number(s.portfolio_balance ?? 0);
        const portfolio_percent = Number(s.portfolio_percent ?? 0);
        const deposits_percent = Number(s.deposits_percent ?? 0);
        const sp500_percent = Number(s.sp500_percent ?? 0);
        const bet_percent = Number(s.bet_percent ?? 0);
        await env.DB.prepare(
          'INSERT INTO performance_snapshots (timestamp, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(ts, portfolio_balance, portfolio_percent, deposits_percent, sp500_percent, bet_percent).run();
        results.push({ timestamp: ts, status: 'inserted' });
      }
      return json({ count: results.length, results });
    }

    // Stock price fetch (frontend expects this route)
    if (path.startsWith('/api/stock-price/') && method === 'GET') {
      const symbol = decodeURIComponent(path.replace('/api/stock-price/', ''));
      try {
        // Simple in-memory cache (per Worker instance)
        globalThis.__PRICE_CACHE__ ||= {};
        const cacheKey = `price:${symbol}`;
        const cached = globalThis.__PRICE_CACHE__[cacheKey];
        const nowTs = Date.now();
        if (cached && (nowTs - cached.ts) < 120000) { // 120s TTL
          return json(cached.payload);
        }

        // Special-case PREM / PREM.L from Google Finance (GBX price)
        const upper = symbol.toUpperCase();
        if (upper === 'PREM' || upper === 'PREM.L') {
          try {
            const gfResp = await fetch('https://www.google.com/finance/quote/PREM:LON?hl=en');
            const html = await gfResp.text();
            let gbx = null;
            const regexes = [
              /data-last-price="([0-9]+(?:\.[0-9]+)?)"/i,
              /"lastPrice":{"raw":([0-9]+(?:\.[0-9]+)?)","fmt":"[0-9.]+"}/i,
              />([0-9]+(?:\.[0-9]+)?)<\/div><div class="[^"']*">GBX<\/div>/i,
              /GBX[^0-9]*([0-9]+(?:\.[0-9]+)?)/i
            ];
            for (const r of regexes) {
              const m = html.match(r);
              if (m) { gbx = parseFloat(m[1]); break; }
            }
            if (!Number.isFinite(gbx) || gbx <= 0) {
              throw new Error('PREM GBX price not found');
            }
            // Get FX for GBP conversion
            const fx = await fetch('https://api.exchangerate-api.com/v4/latest/EUR').then(r => r.json()).catch(() => ({ rates: { GBP: 0.86 } }));
            const GBP = fx?.rates?.GBP ?? 0.86; // EUR->GBP rate
            const priceGBp = gbx; // in pence
            const priceGBP = gbx / 100; // pounds
            const priceEUR = priceGBP / GBP; // convert to EUR
            const payload = {
              symbol,
              price: priceGBP,
              priceEUR,
              priceGBP,
              priceGBp,
              originalCurrency: 'GBX',
              isCrypto: false,
              validated: true,
              source: 'google-finance'
            };
            globalThis.__PRICE_CACHE__[cacheKey] = { ts: nowTs, payload };
            return json(payload);
          } catch (e) {
            return json({ symbol, error: e.message, source: 'google-finance' }, 502);
          }
        }

        const fx = await fetch('https://api.exchangerate-api.com/v4/latest/EUR').then(r => r.json()).catch(() => ({ rates: { USD: 1.16, GBP: 0.86, RON: 5.09 } }));
        const USD = fx?.rates?.USD ?? 1.16;
        const GBP = fx?.rates?.GBP ?? 0.86;
        const RON = fx?.rates?.RON ?? 5.09;

        // Yahoo price fetch
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
        // Fetch with basic retry/backoff to mitigate 429
        let data = null;
        let attempt = 0;
        while (attempt < 3 && !data) {
          const resp = await fetch(url);
          const text = await resp.text();
          try {
            data = JSON.parse(text);
          } catch {
            // If rate-limited, wait and retry
            await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
          }
          attempt++;
        }
        if (!data || !data.chart) {
          // Fallback: use last stored DB price from stocks (robust)
          const row = await env.DB.prepare('SELECT share_price, broker FROM stocks WHERE symbol = ?').bind(symbol).first();
          if (row && row.share_price) {
            const raw = String(row.share_price);
            const broker = String(row.broker || '');
            const num = parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
            let priceEUR = null, priceGBP = null, priceGBp = null, currency = 'EUR';
            if (raw.includes('$') || broker === 'Crypto') { priceEUR = num / USD; currency = 'USD'; }
            else if (raw.includes('£')) { priceGBP = num; priceEUR = num / GBP; currency = 'GBP'; }
            else if (/GBX|GBp|p\b/.test(raw)) { priceGBp = num; priceGBP = num / 100; priceEUR = (num/100) / GBP; currency = 'GBp'; }
            else if (/RON|Lei|lei/i.test(raw)) { priceEUR = num / RON; currency = 'RON'; }
            else { priceEUR = num; }
            const payload = { symbol, price: num, priceEUR, priceGBP, priceGBp, originalCurrency: currency, isCrypto: broker === 'Crypto', validated: true, fallback: true };
            globalThis.__PRICE_CACHE__[cacheKey] = { ts: nowTs, payload };
            return json(payload);
          }
          // As a last resort, return a 204 with minimal payload to avoid hard failures
          return json({ symbol, validated: false, fallback: false }, 204);
        }
        const result = data?.chart?.result?.[0];
        const meta = result?.meta || {};
        let price = meta.regularMarketPrice ?? meta.previousClose ?? null;
        if (price == null && result?.indicators?.quote?.[0]?.close) {
          const closes = result.indicators.quote[0].close.filter(v => v != null);
          if (closes.length > 0) price = closes[closes.length - 1];
        }
        const currency = (meta.currency || '').toUpperCase();
        let priceEUR = null, priceGBP = null, priceGBp = null;
        if (price != null) {
          if (currency === 'EUR') { priceEUR = price; }
          else if (currency === 'USD') { priceEUR = price / USD; }
          else if (currency === 'GBP') { priceGBP = price; priceEUR = price / GBP; }
          else if (currency === 'GBp') { priceGBp = price; priceGBP = price / 100; priceEUR = (price/100) / GBP; }
          else if (currency === 'RON') { priceEUR = price / RON; }
          else { priceEUR = price; }
        }
        const isCrypto = /-USD$/.test(symbol) || currency === 'USD' && /BTC|ETH|USDT|USDC|KAS|JASMY/i.test(symbol);
        const validated = price != null;
        const payload = { symbol, price, priceEUR, priceGBP, priceGBp, originalCurrency: currency, isCrypto, validated };
        globalThis.__PRICE_CACHE__[cacheKey] = { ts: nowTs, payload };
        return json(payload);
      } catch (e) {
        return json({ symbol, error: e.message }, 500);
      }
    }

    // Historical price data (needed for performance chart fallback)
    if (path.startsWith('/api/historical/') && method === 'GET') {
      const symbol = decodeURIComponent(path.replace('/api/historical/', ''));
      const range = url.searchParams.get('range') || '1m';
      const rangeMap = {
        '1h': { interval: '1m', range: '1d' },
        '1d': { interval: '1h', range: '1d' },
        '1w': { interval: '1d', range: '5d' },
        '1m': { interval: '1d', range: '1mo' },
        '6m': { interval: '1d', range: '6mo' },
        'ytd': { interval: '1d', range: 'ytd' },
        '1y': { interval: '1d', range: '1y' },
        '5y': { interval: '1wk', range: '5y' },
        'max': { interval: '1mo', range: 'max' }
      };
      const params = rangeMap[range] || rangeMap['1m'];
      try {
        const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;
        const resp = await fetch(yfUrl);
        const data = await resp.json();
        const result = data?.chart?.result?.[0];
        if (!result) return json({ symbol, range, data: [] }, 200);
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        const points = timestamps.map((t, i) => ({ timestamp: t * 1000, price: closes[i] })).filter(p => p.price != null);
        return json({ symbol, range, data: points });
      } catch (e) {
        return json({ symbol, range, error: e.message, data: [] }, 500);
      }
    }

    // Quotes placeholder for production (frontend optional feature)
    if (path === '/api/quotes' && method === 'GET') {
      return json({ cached: true, data: [] });
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
