import { API_BASE } from '../utils/env.js';
import { test, expect } from 'vitest';
import { fetch } from 'undici';

test('exchange rates endpoint responds', async () => {
  const r = await fetch(`${API_BASE}/api/exchange-rates`);
  expect(r.ok).toBe(true);
  const json = await r.json();
  expect(json).toHaveProperty('rates');
});
