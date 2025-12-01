import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

// Helper to extract number from text like "1,234 €" or "€1234"
function parseNumber(text: string): number {
  const s = text.replace(/[^0-9.\-]/g, '');
  return parseFloat(s) || 0;
}

// Common selectors based on index.html/script.js structure
const selectors = {
  headerBalance: '#total-balance',
  headerProfit: '#total-profit-amount',
  navLinks: '.nav-link',
  sections: {
    dashboard: '#dashboard-section',
    stocks: '#stocks-section',
    allocation: '#allocation-section',
    deposits: '#deposits-section',
    dividends: '#dividends-section',
    admin: '#admin-section',
  },
  stocks: {
    table: '.stocks-table',
    tbody: '#stocks-tbody',
    addBtn: '#add-row-btn',
    refreshBtn: '#refresh-stocks-btn',
  },
  deposits: {
    tbody: '#deposits-tbody',
    total: '#total-deposits-amount',
  },
  dashboard: {
    moneyInvested: {
      xtb: '#xtb-eur-value',
      tradeville: '#tradeville-value',
      t212XtbUsd: '#t212-xtb-usd-value',
      crypto: '#crypto-value',
      bank: '#bank-deposits-value',
    },
  },
};

// Navigate via click on nav link data-section attribute
async function gotoSection(page, sectionId: string) {
  const link = page.locator(`.nav-link[data-section="${sectionId.replace('-section','')}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

// Ensure app is loaded
test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  // App boot
  await expect(page.locator(selectors.sections.dashboard)).toHaveClass(/active/);
  await expect(page.locator(selectors.headerBalance)).toBeVisible();
});

// Header + Menu presence and consistency
test('Header values and menu sections present', async ({ page }) => {
  // Header
  const balanceTxt = await page.locator(selectors.headerBalance).textContent();
  const profitTxt = await page.locator(selectors.headerProfit).textContent();
  expect(balanceTxt).toBeTruthy();
  expect(profitTxt).toBeTruthy();

  // Menu links exist
  for (const key of Object.keys(selectors.sections)) {
    const id = (selectors.sections as any)[key];
    await expect(page.locator(id)).toBeVisible();
  }
});

// Dashboard totals match data sources
test('Dashboard Money Invested reflects Deposits', async ({ page }) => {
  // Navigate to Deposits and compute total
  await gotoSection(page, selectors.sections.deposits);
  // Ensure deposits table is present
  await expect(page.locator(selectors.deposits.tbody)).toBeVisible();

  // Read displayed total deposits text
  const depositsTotalTxt = await page.locator(selectors.deposits.total).textContent();
  expect(depositsTotalTxt).toBeTruthy();
  const depositsTotal = parseNumber(depositsTotalTxt || '0');

  // Back to Dashboard
  await gotoSection(page, selectors.sections.dashboard);

  // Sum dashboard breakdown values
  const ids = Object.values(selectors.dashboard.moneyInvested);
  const values = await Promise.all(ids.map((id) => page.locator(id).textContent()));
  const sum = values.reduce((acc, t) => acc + parseNumber(t || '0'), 0);

  // Allow small rounding differences
  expect(Math.abs(sum - depositsTotal)).toBeLessThanOrEqual(2);
});

// Stocks table sorting checks on key columns
for (const column of ['weight','allocation','price_change','broker','sector','risk']) {
  test(`Stocks table sorts by ${column}`, async ({ page }) => {
    await gotoSection(page, selectors.sections.stocks);
    await expect(page.locator(selectors.stocks.table)).toBeVisible();

    // Click header to sort asc then desc
    const header = page.locator(`.stocks-table th[data-column="${column}"]`);
    await header.click();

    const rows = page.locator(`${selectors.stocks.tbody} tr`);
    const count = await rows.count();
    if (count < 2) test.skip(true, 'Not enough rows to validate sorting');

    // Capture first row value after asc
    const firstAsc = await rows.nth(0).locator(`td[data-field="${column}"]`).textContent();
    await header.click();
    const firstDesc = await rows.nth(0).locator(`td[data-field="${column}"]`).textContent();

    // Sanity: values should differ between asc/desc for sortable columns in typical data
    expect(firstAsc).not.toEqual(firstDesc);
  });
}

// CRUD: add/edit/delete a stock
test('Stocks CRUD basic flow', async ({ page }) => {
  await gotoSection(page, selectors.sections.stocks);
  const tbody = page.locator(selectors.stocks.tbody);
  const initialCount = await tbody.locator('tr').count();

  // Add a new row
  await page.locator(selectors.stocks.addBtn).click();
  await page.waitForTimeout(250);
  const afterAddCount = await tbody.locator('tr').count();
  expect(afterAddCount).toBe(initialCount + 1);

  const newRow = tbody.locator('tr').nth(afterAddCount - 1);
  // Enter edit mode (button toggles to Save)
  await newRow.locator('.edit-btn').click();

  // Fill fields
  await newRow.locator('td[data-field="symbol"] input').fill('TEST.EU');
  await newRow.locator('td[data-field="company"] input').fill('Test Company');
  await newRow.locator('td[data-field="shares"] input').fill('2');
  await newRow.locator('td[data-field="broker"] select').selectOption('XTB-EURO');
  await newRow.locator('td[data-field="sector"] input').fill('ETF - Technology');
  await newRow.locator('td[data-field="risk"] select').selectOption('🟦 Safe');

  // Save
  await newRow.locator('.edit-btn').click();
  await page.waitForTimeout(300);

  // Ensure persisted in table
  await expect(newRow.locator('td[data-field="symbol"]')).toHaveText('TEST.EU');
  await expect(newRow.locator('td[data-field="company"]')).toHaveText('Test Company');

  // Delete
  await newRow.locator('.delete-btn').click();
  // Confirm in custom modal
  await page.locator('#confirm-delete').click();

  await page.waitForTimeout(200);
  const finalCount = await tbody.locator('tr').count();
  expect(finalCount).toBe(initialCount);
});

// Deposits CRUD basic flow and propagation to totals
test('Deposits CRUD and totals update', async ({ page }) => {
  await gotoSection(page, selectors.sections.deposits);
  const tbody = page.locator(selectors.deposits.tbody);
  const initialCount = await tbody.locator('tr').count();

  // Add via API (page has only edit buttons). Use a direct call.
  const res = await page.request.post(`${uiBase()}/api/deposits`, {
    data: { amount: '100', account: 'XTB-EURO', month: 'January', date: '01/01/2024' },
  });
  expect(res.ok()).toBeTruthy();

  // Reload deposits section view
  await page.reload();
  await gotoSection(page, selectors.sections.deposits);

  const afterAddCount = await tbody.locator('tr').count();
  expect(afterAddCount).toBe(initialCount + 1);

  // Verify total includes the new amount
  const totalTxt = await page.locator(selectors.deposits.total).textContent();
  expect(parseNumber(totalTxt || '0')).toBeGreaterThanOrEqual(100);
});

// Dashboard charts presence (not deep Chart.js introspection, just canvas visibility)
test('Dashboard charts visible', async ({ page }) => {
  await gotoSection(page, selectors.sections.dashboard);
  // Balance pie chart is dynamically created; wait for canvas to appear
  const pieCanvas = page.locator('#balance-pie-chart, canvas');
  await expect(pieCanvas.first()).toBeVisible();
});
