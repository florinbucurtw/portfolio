import { test, expect } from '@playwright/test';

test.describe('API endpoints', () => {
  test('GET /api/exchange-rates returns defaults', async ({ request }) => {
    const res = await request.get('/api/exchange-rates');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('USD');
    expect(data).toHaveProperty('GBP');
    expect(data).toHaveProperty('RON');
    expect(data).toHaveProperty('EUR');
  });

  test('GET /api/stocks returns structure', async ({ request }) => {
    const res = await request.get('/api/stocks');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_eur');
    expect(data).toHaveProperty('stocks');
    expect(Array.isArray(data.stocks)).toBeTruthy();
  });

  test('GET /api/allocation/sectors returns array', async ({ request }) => {
    const res = await request.get('/api/allocation/sectors');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('GET /api/allocation/countries returns array', async ({ request }) => {
    const res = await request.get('/api/allocation/countries');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });
});
