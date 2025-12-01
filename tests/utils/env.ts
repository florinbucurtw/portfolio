import fs from 'node:fs';
import path from 'node:path';

function loadEnvTest() {
  const p = path.resolve(process.cwd(), '.env.test');
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  }
}

loadEnvTest();

export function apiBase(): string {
  const override = process.env.API_BASE_OVERRIDE;
  const fallback = 'http://127.0.0.1:5001/florinportfolio/europe-west1/api';
  const base = override && override.startsWith('http') ? override : fallback;
  return base.replace(/\/+$/, '');
}

export const API_BASE = apiBase();

export function uiBase(): string {
  const base = process.env.UI_BASE_URL || 'http://localhost:4173';
  return base.replace(/\/+$/, '');
}

export const routes = {
  stocks: () => `${apiBase()}/api/stocks`,
  exchangeRates: () => `${apiBase()}/api/exchange-rates`,
  performance: () => `${apiBase()}/api/performance-snapshot`,
  stockPrice: (symbol: string) => `${apiBase()}/api/stock-price/${encodeURIComponent(symbol)}`,
};
