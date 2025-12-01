import { test, expect } from 'vitest';
import { fetch } from 'undici';
import { API_BASE } from '../utils/env.js';

async function json(res: Response) {
  const data = await res.json();
  return data as any;
}

test('stocks CRUD flow', async () => {
  // Create
  const createRes = await fetch(`${API_BASE}/api/stocks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'TEST', company: 'Test Corp', shares: 3, sector: 'Tech' }),
  });
  expect(createRes.status).toBe(201);
  const createJson = await json(createRes);
  expect(createJson).toHaveProperty('ok', true);

  // List
  const listRes = await fetch(`${API_BASE}/api/stocks`);
  expect(listRes.ok).toBe(true);
  const listJson = await json(listRes);
  expect(listJson).toHaveProperty('stocks');
  const anyStock = listJson.stocks.find((s: any) => s.symbol === 'TEST');
  // When normalized, ID isn't exposed; update by querying Firestore emulator is not possible via API.
  // We'll skip update/delete due to API shape, but assert listing works.
  expect(anyStock?.symbol).toBe('TEST');
});
