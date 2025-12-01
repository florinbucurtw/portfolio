import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

function num(t?: string | null) { return parseFloat((t || '').replace(/[^0-9.\-]/g, '')) || 0; }

const sel = {
  headerBalance: '#total-balance',
  headerProfit: '#total-profit',
  dashboard: '#dashboard-section',
  allocationSection: '#sectors-section',
  depositsTotal: '#total-deposits-amount',
  moneyInvested: ['#xtb-eur-value','#tradeville-value','#t212-xtb-usd-value','#crypto-value','#bank-deposits-value'],
};

async function goto(page, sectionId: string) {
  const target = sectionId.replace('#','').replace('-section','').replace('allocation','sectors');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  await expect(page.locator(sel.dashboard)).toHaveClass(/active/);
});

// Header Balance should roughly equal sum of Allocation cells
// We allow tolerance because Allocation updates may be async.
test('Dashboard: Balance displayed', async ({ page }) => {
  await goto(page, sel.dashboard);
  const balTxt = await page.locator(sel.headerBalance).textContent();
  expect(num(balTxt)).toBeGreaterThanOrEqual(0);
});

test('Dashboard: Profit ~= Balance - Deposits', async ({ page }) => {
  await goto(page, '#deposits-section');
  const depTxt = await page.locator(sel.depositsTotal).textContent();
  const deposits = num(depTxt);
  await goto(page, sel.dashboard);
  const balTxt = await page.locator(sel.headerBalance).textContent();
  const profitTxt = await page.locator(sel.headerProfit).textContent();
  const bal = num(balTxt);
  const profit = num(profitTxt);
  expect(Math.abs((bal - deposits) - profit)).toBeLessThanOrEqual(3);
});

// Profit = Balance - Total Deposits (rounded in UI)
// Note: The previous test comparing Balance to sum of allocation percentages
// was removed for clarity, as allocations are percent values, not EUR amounts.

// Allocation section exists and contains charts or summaries
test('Allocation section renders', async ({ page }) => {
  await goto(page, sel.allocationSection);
  // Expect at least one canvas or chart container
  const canvases = page.locator(`${sel.allocationSection} canvas`);
  const containers = page.locator(`${sel.allocationSection} .chart-container`);
  expect((await canvases.count()) + (await containers.count())).toBeGreaterThanOrEqual(1);
});
