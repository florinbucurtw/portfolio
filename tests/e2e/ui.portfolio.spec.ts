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
  headerProfit: '#total-profit',
  navLinks: '.nav-link',
  sections: {
    dashboard: '#dashboard-section',
    stocks: '#stocks-section',
    allocation: '#sectors-section',
    deposits: '#deposits-section',
    dividends: '#dividends-section',
    admin: '#admin-section',
  },
  stocks: {
    table: '#stocks-section .stocks-table',
    tbody: '#stocks-tbody',
    addBtn: '#add-row-btn',
    refreshBtn: '#refresh-stocks-btn',
  },
  deposits: {
    table: '#deposits-section .stocks-table',
    tbody: '#deposits-tbody',
    total: '#deposits-section #total-deposits-amount',
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
  const target = sectionId.replace('#', '').replace('-section', '');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
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
test('Header: Balance and Profit visible', async ({ page }) => {
  await expect(page.locator(selectors.headerBalance)).toBeVisible();
  await expect(page.locator(selectors.headerProfit)).toBeVisible();
  const balanceTxt = await page.locator(selectors.headerBalance).textContent();
  const profitTxt = await page.locator(selectors.headerProfit).textContent();
  expect(balanceTxt).toBeTruthy();
  expect(profitTxt).toBeTruthy();
});

test('Menu: All nav links visible', async ({ page }) => {
  for (const [, id] of Object.entries(selectors.sections)) {
    const target = id.replace('#', '').replace('-section', '');
    await expect(page.locator(`.nav-link[data-section="${target}"]`)).toBeVisible();
  }
});

test('Sections: Dashboard visible on load; others hidden', async ({ page }) => {
  await expect(page.locator(selectors.sections.dashboard)).toBeVisible();
  for (const id of [
    selectors.sections.stocks,
    selectors.sections.allocation,
    selectors.sections.deposits,
    selectors.sections.dividends,
    selectors.sections.admin,
  ]) {
    await expect(page.locator(id)).toBeHidden();
  }
});

test('Sections: Navigating shows target section', async ({ page }) => {
  for (const id of Object.values(selectors.sections)) {
    await gotoSection(page, id);
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
// Wait until a given column shows populated values (non-empty/non-placeholder)
async function waitForColumnPopulated(page: any, column: string) {
  const fieldMap: Record<string, string> = {
    weight: 'weight',
    allocation: 'allocation',
    price_change: 'price_change',
    broker: 'broker',
    sector: 'sector',
    risk: 'risk',
  };
  const field = fieldMap[column] || column;
  await page.waitForFunction((f) => {
    const cells = Array.from(document.querySelectorAll(`#stocks-tbody td[data-field="${f}"]`));
    const meaningful = cells.filter((td: any) => {
      const t = (td.textContent || '').trim();
      return t && t !== '-' && t !== '0' && t !== '0 %';
    });
    return cells.length > 0 && meaningful.length >= Math.min(cells.length, 2);
  }, field, { timeout: 30000 });
}

for (const column of ['weight','allocation','price_change','broker','sector','risk']) {
  test(`Stocks table sorts by ${column}`, async ({ page }) => {
    await gotoSection(page, selectors.sections.stocks);
    await expect(page.locator(selectors.stocks.table)).toBeVisible();

    // Click header to sort asc then desc
    const header = page.locator(`.stocks-table th[data-column="${column}"]`);
    // Ensure the target column is populated first
    if (column === 'price_change') {
      await page.locator(selectors.stocks.refreshBtn).click().catch(() => {});
    }
    await waitForColumnPopulated(page, column);
    await header.click();

    const rows = page.locator(`${selectors.stocks.tbody} tr`);
    const count = await rows.count();
    if (count < 2) test.skip(true, 'Not enough rows to validate sorting');

    // Capture first row value after asc
    const firstAsc = await rows.nth(0).locator(`td[data-field="${column}"]`).textContent();
    await header.click();
    const firstDesc = await rows.nth(0).locator(`td[data-field="${column}"]`).textContent();

    // Sanity: values should differ between asc/desc for sortable columns in typical data
    const a = (firstAsc || '').trim();
    const d = (firstDesc || '').trim();
    if (!firstAsc || !firstDesc || firstAsc.trim() === '-' || firstDesc.trim() === '-') {
      test.skip(true, 'Non-sortable placeholder values');
    }
    // For categorical columns like risk, ensure there are at least two distinct values
    if (column === 'risk') {
      const riskTexts = await rows.locator('td[data-field="risk"]').allTextContents();
      const risks = new Set(riskTexts.map(s => s.trim()).filter(Boolean));
      if (risks.size < 2) test.skip(true, 'Insufficient distinct risk values to validate sorting');
      // If distinct values exist, require asc vs desc to differ
      expect(a).not.toEqual(d);
    } else {
      expect(a).not.toEqual(d);
    }
  });
}

// CRUD tests removed per request to avoid DB mutations

// Deposits CRUD basic flow and propagation to totals
test('Deposits: Add via API increases row count', async ({ page }) => {
  await gotoSection(page, selectors.sections.deposits);
  await expect(page.locator(selectors.deposits.table)).toBeVisible();
  const tbody = page.locator(selectors.deposits.tbody);
  const initialCount = await tbody.locator('tr').count();
  const res = await page.request.post(`${uiBase()}/api/deposits`, {
    data: { amount: '100', account: 'XTB-EURO', month: 'January', date: '01/01/2024' },
  });
  expect(res.ok()).toBeTruthy();
  await page.reload();
  await gotoSection(page, selectors.sections.deposits);
  const afterAddCount = await tbody.locator('tr').count();
  expect(afterAddCount).toBe(initialCount + 1);
});

test('Deposits: Total reflects new amount', async ({ page }) => {
  await gotoSection(page, selectors.sections.deposits);
  await expect(page.locator(selectors.deposits.total)).toBeVisible();
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
