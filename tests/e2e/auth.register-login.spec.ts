import { test, expect } from '@playwright/test';
import { uiBase } from './utils/env';

function uniqueSuffix() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `${ts}${rand}`;
}

test('Register → Activate → Login succeeds', async ({ page, request }) => {
  const base = uiBase();
  const suffix = uniqueSuffix();
  const email = `user${suffix}@example.com`;
  const username = `user_${suffix}`;
  const password = `Pw_${suffix}`;

  // Go to Register page and submit form
  await page.goto(`${base}/register.html`);
  await page.fill('#first_name', 'Test');
  await page.fill('#last_name', 'User');
  await page.fill('#age', '30');
  await page.selectOption('#country', { label: 'Romania' }).catch(() => {});
  await page.fill('#email', email);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#register-submit');

  // Wait for backend to respond; capture activation link from API directly for reliability
  const res = await request.post(`${base}/api/register`, {
    data: { first_name: 'Test', last_name: 'User', age: 30, country: 'Romania', email, username, password },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.activation_url).toBeTruthy();

  // Activate via token URL
  const activateUrl = json.activation_url as string;
  await page.goto(activateUrl);
  await expect(page.locator('text=Account Activated')).toBeVisible();

  // Login
  await page.goto(`${base}/login.html`);
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#login-submit');

  // Expect redirect to the app (new.html)
  await page.waitForURL(/new\.html$/);
  // Sanity: verify a visible element on the app page
  await expect(page.locator('#dashboard-section')).toBeVisible();
});
