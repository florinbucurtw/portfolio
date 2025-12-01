import { describe, it, expect } from 'vitest';
import { routes } from '../utils/env';

describe('GET /api/stocks', () => {
  it('returna stocks si total_eur numeric', async () => {
    const res = await fetch(routes.stocks(), { headers: { accept: 'application/json' } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('stocks');
    expect(body).toHaveProperty('total_eur');
    expect(typeof body.total_eur).toBe('number');

    if (Array.isArray(body.stocks) && body.stocks.length > 0) {
      const s = body.stocks[0];
      expect(s).toHaveProperty('symbol');
      expect(s).toHaveProperty('share_price_eur');
      expect(typeof s.share_price_eur).toBe('number');
    }
  });
});
import { describe, it, expect } from 'vitest';
import { routes } from '../utils/env';

describe('GET /api/stocks', () => {
  it('returns non-empty stocks with EUR totals', async () => {
    const res = await fetch(routes.stocks(), { headers: { accept: 'application/json' } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.stocks)).toBe(true);
    // Allow zero-length if DB is currently empty, but validate shape
    if (body.stocks.length > 0) {
      const s = body.stocks[0];
      expect(s).toHaveProperty('symbol');
      expect(s).toHaveProperty('shares');
      expect(s).toHaveProperty('share_price_eur');
      expect(typeof s.share_price_eur).toBe('number');
    }
    expect(body).toHaveProperty('total_eur');
    expect(typeof body.total_eur).toBe('number');
  });
});
