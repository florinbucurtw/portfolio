import { test, expect } from '@playwright/test';

test.describe('API: Exchange rates', () => {
  test('GET /api/exchange-rates responds OK', async ({ request }) => {
    const res = await request.get('/api/exchange-rates');
    expect(res.ok()).toBeTruthy();
  });

  test('Exchange rates include USD/GBP/RON', async ({ request }) => {
    const res = await request.get('/api/exchange-rates');
    const data = await res.json();
    const rates = data.rates || data;
    expect(rates).toHaveProperty('USD');
    expect(rates).toHaveProperty('GBP');
    expect(rates).toHaveProperty('RON');
  });
});

test.describe('API: Stocks', () => {
  test('GET /api/stocks responds OK', async ({ request }) => {
    const res = await request.get('/api/stocks');
    expect(res.ok()).toBeTruthy();
  });

  test('Stocks payload shape contains list', async ({ request }) => {
    const res = await request.get('/api/stocks');
    const data = await res.json();
    expect(Array.isArray(data) || Array.isArray(data?.stocks)).toBeTruthy();
  });
});

test.describe('API: Allocation sectors', () => {
  test('GET /api/allocation/sectors responds OK', async ({ request }) => {
    const res = await request.get('/api/allocation/sectors');
    expect(res.ok()).toBeTruthy();
  });

  test('Allocation sectors payload is object', async ({ request }) => {
    const res = await request.get('/api/allocation/sectors');
    const data = await res.json();
    expect(typeof data).toBe('object');
  });
});

test.describe('API: Allocation countries', () => {
  test('GET /api/allocation/countries responds OK', async ({ request }) => {
    const res = await request.get('/api/allocation/countries');
    expect(res.ok()).toBeTruthy();
  });

  test('Allocation countries payload is object', async ({ request }) => {
    const res = await request.get('/api/allocation/countries');
    const data = await res.json();
    expect(typeof data).toBe('object');
  });
});
