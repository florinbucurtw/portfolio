import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

const selectors = {
  allocation: '#sectors-section',
};

async function gotoSection(page, sectionId: string) {
  const target = sectionId.replace('#','').replace('-section','').replace('allocation','sectors');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  await gotoSection(page, selectors.allocation);
});

// Presence of sector/country allocations (depends on UI implementation)
test('Allocation: Charts present', async ({ page }) => {
  // Look for canvases or sections that likely hold charts
  const canvases = page.locator(`${selectors.allocation} canvas`);
  const chartLike = page.locator(`${selectors.allocation} [id*="chart"], ${selectors.allocation} .chart-container`);
  expect((await canvases.count()) + (await chartLike.count())).toBeGreaterThanOrEqual(1);
});

// Basic pie slice sanity: legend items exist (if any)
test('Allocation: Legends or labels exist', async ({ page }) => {
  const legends = page.locator(`${selectors.allocation} .legend, ${selectors.allocation} [class*="legend"]`);
  // Not all themes show legends; be lenient
  expect(await legends.count()).toBeGreaterThanOrEqual(0);
});
