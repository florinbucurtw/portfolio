import { test, expect } from '@playwright/test';
import { uiBase } from '../utils/env';

async function gotoSection(page, sectionId: string) {
  const link = page.locator(`.nav-link[data-section="${sectionId.replace('-section','')}"]`);
  await link.click();
  await expect(page.locator(sectionId)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => {
  await page.goto(uiBase());
  await gotoSection(page, '#dividends-section');
});

// Full UI CRUD using the table buttons and contenteditable fields
test('Dividends UI CRUD flow', async ({ page }) => {
  const tbody = page.locator('#dividends-table-body');
  await expect(tbody).toBeVisible();
  const initialCount = await tbody.locator('tr').count();

  // Add new dividend via UI (click +)
  await page.locator('#add-dividend-btn').click();
  const editingRow = tbody.locator('tr.editing');
  await expect(editingRow).toBeVisible();

  // Select year and enter annual dividend
  const yearSelect = editingRow.locator('.year-select');
  await yearSelect.selectOption({ label: String(new Date().getFullYear()) });

  const annCell = editingRow.locator('.annual-dividend-input');
  await annCell.click();
  // Replace contenteditable text
  await page.keyboard.type('240');

  // Save
  await editingRow.locator('.save-icon-btn').click();

  // After save, row should no longer be editing and count increases
  await expect(tbody.locator('tr.editing')).toHaveCount(0);
  const afterAdd = await tbody.locator('tr').count();
  expect(afterAdd).toBe(initialCount + 1);

  // Edit the last row
  const lastRow = tbody.locator('tr').nth(afterAdd - 1);
  await lastRow.locator('.edit-icon-btn').click();
  const lastEditing = tbody.locator('tr').nth(afterAdd - 1);
  await expect(lastEditing.locator('.annual-dividend-cell')).toHaveClass(/editable/);
  await lastEditing.locator('.annual-dividend-cell').click();
  await page.keyboard.type('24'); // append to make it larger
  await lastEditing.locator('.save-icon-btn').click();
  await expect(tbody.locator('tr.editing')).toHaveCount(0);

  // Delete the last row
  page.once('dialog', (dialog) => dialog.accept());
  await lastRow.locator('.delete-icon-btn').click();

  const finalCount = await tbody.locator('tr').count();
  expect(finalCount).toBe(initialCount);
});
