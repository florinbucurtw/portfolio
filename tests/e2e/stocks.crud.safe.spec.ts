import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

const selectors = {
  sections: {
    stocks: '#stocks-section',
  },
  stocks: {
    table: '#stocks-section .stocks-table',
    tbody: '#stocks-tbody',
  },
};

async function gotoSection(page, sectionId: string) {
  const target = sectionId.replace('#', '').replace('-section', '');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.describe('Stocks CRUD (safe, cleanup)', () => {
  const symbol = 'TEST.EU';
  let createdId: number | null = null;

  test.beforeEach(async ({ page }) => {
    await page.goto(uiBase());
    await expect(page.locator(selectors.sections.stocks)).toBeHidden();
  });

  test('Add, verify in UI, then delete (cleanup)', async ({ page }) => {
    // Add via API to avoid flaky UI interactions
    const payload = {
      symbol,
      weight: '0.50%',
      company: 'Playwright Test Company',
      allocation: '-',
      shares: '2',
      share_price: '0 €',
      broker: 'XTB-EURO',
      risk: '🟧 Medium',
      sector: 'ETF - Technology',
    };

    const createRes = await page.request.post(`${uiBase()}/api/stocks`, { data: payload });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    createdId = created.id as number;
    expect(createdId).toBeGreaterThan(0);

    // Verify in UI
    await page.reload();
    await gotoSection(page, selectors.sections.stocks);
    await expect(page.locator(selectors.stocks.table)).toBeVisible();
    const tbody = page.locator(selectors.stocks.tbody);
    const row = tbody.locator('tr').filter({ hasText: symbol });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td[data-field="company"]')).toHaveText('Playwright Test Company');

    // Cleanup: delete via API
    const delRes = await page.request.delete(`${uiBase()}/api/stocks/${createdId}`);
    expect(delRes.ok()).toBeTruthy();

    // Confirm row removed in UI
    await page.reload();
    await gotoSection(page, selectors.sections.stocks);
    await expect(tbody.locator('tr').filter({ hasText: symbol })).toHaveCount(0);
  });
});
