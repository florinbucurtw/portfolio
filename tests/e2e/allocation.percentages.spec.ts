import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

function num(t?: string | null) { return parseFloat((t || '').replace(/[^0-9.\-]/g, '')) || 0; }

async function gotoSection(page, sectionId: string) {
  const link = page.locator(`.nav-link[data-section="${sectionId.replace('-section','')}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test('Row weights match Allocation totals (pie basis)', async ({ page }) => {
  await page.goto(uiBase());
  await gotoSection(page, '#stocks-section');

  const rows = page.locator('#stocks-tbody tr');
  const count = await rows.count();
  if (count < 1) test.skip(true, 'No stock rows to validate');

  // Sum allocations
  let totalAlloc = 0;
  for (let i = 0; i < count; i++) {
    const t = await rows.nth(i).locator('td[data-field="allocation"]').textContent();
    totalAlloc += num(t);
  }
  expect(totalAlloc).toBeGreaterThan(0);

  // Each row: weight ≈ allocation / total * 100
  const tolerance = 0.75; // allow minor rounding/async updates
  for (let i = 0; i < count; i++) {
    const allocTxt = await rows.nth(i).locator('td[data-field="allocation"]').textContent();
    const weightTxt = await rows.nth(i).locator('td[data-field="weight"]').textContent();
    const alloc = num(allocTxt);
    const weight = num(weightTxt);
    if (alloc <= 0) continue;
    const expected = (alloc / totalAlloc) * 100;
    expect(Math.abs(weight - expected)).toBeLessThanOrEqual(tolerance);
  }
});
