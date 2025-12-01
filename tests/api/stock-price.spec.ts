import { describe, it, expect } from 'vitest';
import { routes } from '../utils/env';

describe('GET /api/stock-price/:symbol', () => {
  it('returns a numeric price for PREM', async () => {
    const res = await fetch(routes.stockPrice('PREM'), { headers: { accept: 'application/json' } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('symbol', 'PREM');
    expect(typeof body.price_eur).toBe('number');
  });
});
