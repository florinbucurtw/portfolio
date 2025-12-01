import { test, expect } from 'vitest';
import { fetch } from 'undici';
import { API_BASE } from '../utils/env.js';

async function json(res: Response) {
  const data = await res.json();
  return data as any;
}

test('deposits CRUD flow', async () => {
  // Create deposit
  const createRes = await fetch(`${API_BASE}/api/deposits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 250, currency: 'EUR', date: Date.now() }),
  });
  expect(createRes.status).toBe(201);

  // List deposits
  const listRes = await fetch(`${API_BASE}/api/deposits`);
  expect(listRes.ok).toBe(true);
  const listJson = await json(listRes);
  expect(Array.isArray(listJson.deposits)).toBe(true);
  const created = listJson.deposits.find((d: any) => d.amount === 250);
  expect(created?.currency).toBe('EUR');
});
