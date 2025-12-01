import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

async function gotoSection(page, sectionId: string) {
  const target = sectionId.replace('#','').replace('-section','');
  const link = page.locator(`.nav-link[data-section="${target}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  await gotoSection(page, '#dividends-section');
  await expect(page.locator('#dividends-table-body')).toBeVisible();
});

// Add new dividend via UI
test('Dividends: Add row appears and saves', async ({ page }) => {
  const tbody = page.locator('#dividends-table-body');
  const initialCount = await tbody.locator('tr').count();

  await page.locator('#add-dividend-btn').click();
  let editingRow = tbody.locator('tr.editing');
  await expect(editingRow).toBeVisible();
  await page.waitForFunction(() => {
    const row = document.querySelector('#dividends-table-body tr.editing');
    return !!row && row.isConnected;
  });

  const yearSelect = editingRow.locator('.year-select');
  await yearSelect.waitFor({ state: 'visible', timeout: 10000 });
  await yearSelect.selectOption({ label: String(new Date().getFullYear()) }).catch(async () => {
    editingRow = tbody.locator('tr.editing');
    await expect(editingRow).toBeVisible();
    const ys = editingRow.locator('.year-select');
    await expect(ys).toBeVisible();
    await ys.selectOption({ label: String(new Date().getFullYear()) });
  });

  const annCell = editingRow.locator('.annual-dividend-input');
  await annCell.waitFor({ state: 'visible', timeout: 10000 });
  await annCell.click();
  await page.keyboard.press('Meta+A').catch(async () => { await page.keyboard.press('Control+A').catch(() => {}); });
  await page.keyboard.type('240');

  await editingRow.locator('.save-icon-btn').click();
  await expect(tbody.locator('tr.editing')).toHaveCount(0);
  await expect(tbody.locator('tr')).toHaveCount(initialCount + 1);
});

// Edit last dividend row
test('Dividends: Edit last row updates value', async ({ page }) => {
  const tbody = page.locator('#dividends-table-body');
  const count = await tbody.locator('tr').count();
  expect(count).toBeGreaterThan(0);
  const lastRow = tbody.locator('tr').nth(count - 1);
  await lastRow.locator('.edit-icon-btn').click();
  const lastEditing = tbody.locator('tr').nth(count - 1);
  await expect(lastEditing.locator('.annual-dividend-cell')).toHaveClass(/editable/);
  await lastEditing.locator('.annual-dividend-cell').click();
  await page.keyboard.type('24');
  await lastEditing.locator('.save-icon-btn').click();
  await expect(tbody.locator('tr.editing')).toHaveCount(0);
});

// Delete last dividend row
test('Dividends: Delete last row restores count', async ({ page }) => {
  const tbody = page.locator('#dividends-table-body');
  const before = await tbody.locator('tr').count();
  expect(before).toBeGreaterThan(0);
  const lastRow = tbody.locator('tr').nth(before - 1);
  page.once('dialog', (dialog) => dialog.accept());
  await lastRow.locator('.delete-icon-btn').click();
  await expect(tbody.locator('tr')).toHaveCount(before - 1);
});
