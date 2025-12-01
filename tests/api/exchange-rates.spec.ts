import { describe, it, expect } from 'vitest';
import { routes } from '../utils/env';

describe('GET /api/exchange-rates', () => {
  it('returna rate pentru USD/GBP/RON', async () => {
    const res = await fetch(routes.exchangeRates(), { headers: { accept: 'application/json' } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('rates');
    for (const code of ['USD', 'GBP', 'RON']) {
      expect(typeof body.rates[code]).toBe('number');
    }
  });
});
import { describe, it, expect } from 'vitest';
import { routes } from '../utils/env';

describe('GET /api/exchange-rates', () => {
  it('returns expected currency keys and numeric values', async () => {
    const res = await fetch(routes.exchangeRates(), { headers: { accept: 'application/json' } });
    expect(res.ok).toBe(true);
    const body = await res.json();
    const rates = body.rates || body;
    for (const k of ['USD', 'GBP', 'RON']) {
      expect(rates).toHaveProperty(k);
      expect(typeof rates[k]).toBe('number');
    }
  });
});
