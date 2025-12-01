import { test, expect } from 'vitest';
import { fetch } from 'undici';
import { API_BASE } from '../utils/env.js';

test('performance snapshot responds', async () => {
  const res = await fetch(`${API_BASE}/api/performance-snapshot`);
  expect(res.ok).toBe(true);
  const json = await res.json();
  expect(json).toHaveProperty('balance_eur');
  expect(json).toHaveProperty('total_deposits_eur');
});
