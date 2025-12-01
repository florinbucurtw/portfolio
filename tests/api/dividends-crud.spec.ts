import { test, expect } from 'vitest';
import { fetch } from 'undici';
import { API_BASE } from '../utils/env.js';

async function json(res: Response) {
  const data = await res.json();
  return data as any;
}

test('dividends CRUD flow', async () => {
  // Create dividend
  const createRes = await fetch(`${API_BASE}/api/dividends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'AAPL', amount: 3, currency: 'USD', date: Date.now() }),
  });
  expect(createRes.status).toBe(201);

  // List dividends
  const listRes = await fetch(`${API_BASE}/api/dividends`);
  expect(listRes.ok).toBe(true);
  const listJson = await json(listRes);
  expect(Array.isArray(listJson.dividends)).toBe(true);
  const created = listJson.dividends.find((d: any) => d.symbol === 'AAPL' && d.amount === 3);
  expect(created?.currency).toBe('USD');
});
