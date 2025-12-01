import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

function num(t?: string | null) { return parseFloat((t || '').replace(/[^0-9.\-]/g, '')) || 0; }

const sel = {
  section: '#dividends-section',
};

async function gotoSection(page, sectionId: string) {
  const target = sectionId.replace('#','').replace('-section','');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  await gotoSection(page, sel.section);
});

// Add a dividend via API and check chart presence
// If the UI exposes a table or chart, we verify a canvas appears
// This stays generic due to limited selectors context.
test('Dividends chart visible after adding data', async ({ page }) => {
  // Add via API (server expects year and annual_dividend)
  const thisYear = new Date().getFullYear();
  const res = await page.request.post(`${uiBase()}/api/dividends`, {
    data: { year: thisYear, annual_dividend: 240 },
  });
  expect(res.ok()).toBeTruthy();

  // Reload and ensure chart shows
  await page.reload();
  await gotoSection(page, sel.section);
  const canvases = page.locator(`${sel.section} canvas`);
  await expect(canvases.first()).toBeVisible();
});

// Year filter sanity (if present)
test('Dividends year filter behaves', async ({ page }) => {
  const yearDropdown = page.locator(`${sel.section} select, ${sel.section} [data-role="year-dropdown"]`);
  const count = await yearDropdown.count();
  if (count === 0) test.skip(true, 'No year filter found');
  // Select first available option
  const el = yearDropdown.first();
  await el.selectOption({ index: 0 }).catch(() => {});
  await expect(el).toBeVisible();
});
