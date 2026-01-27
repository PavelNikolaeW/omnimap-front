import { expect, Page } from '@playwright/test';
import { uniqueBlockTitle } from './test-data.fixture';

/**
 * Shared helpers for verify E2E tests.
 *
 * createTestBlock: selects the first visible block, presses 'n',
 * fills the dialog, and waits for the new block to appear.
 *
 * handleDeleteConfirmDialog: clicks the OK button in the
 * delete-confirmation dialog if it appears.
 *
 * cleanupTestBlocks: deletes blocks whose titles match given prefixes
 * via Shift+Click selection and Shift+D deletion.
 */

/**
 * Create a block via hotkey 'n' and return its title.
 *
 * IMPORTANT: This clicks the first visible block's titleBlock to select it,
 * which also navigates INTO that block. The new block is created as a child
 * of the selected block.
 */
export async function createTestBlock(
  page: Page,
  prefix: string,
): Promise<string> {
  const title = uniqueBlockTitle(prefix);

  // Ensure we have visible blocks. If not, go back.
  const blocks = page.locator('#rootContainer [block]');
  let attempts = 0;
  while ((await blocks.count()) === 0 && attempts < 3) {
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1500);
    attempts++;
  }

  // Select the first block (navigates into it)
  const firstBlock = blocks.first();
  await firstBlock.locator('titleBlock').first().click({ force: true });
  await page.waitForTimeout(500);

  // Press 'n' to create a new block
  await page.keyboard.press('n');
  const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
  await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
  await dialogInput.fill(title);
  await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
  await page.waitForTimeout(2000);

  // Verify block was created
  const newBlock = page.locator(
    `#rootContainer [block] titleBlock:has-text("${title}")`,
  );
  await expect(newBlock).toBeVisible({ timeout: 15000 });

  return title;
}

/**
 * Handle delete confirmation dialog if it appears.
 * No-op when dialog doesn't show (leaf blocks).
 */
export async function handleDeleteConfirmDialog(page: Page): Promise<void> {
  const okBtn = page.locator('[data-testid="custom-dialog-ok-btn"]');
  try {
    await okBtn.waitFor({ state: 'visible', timeout: 3000 });
    await okBtn.click();
  } catch {
    // No dialog appeared — that's OK for leaf blocks
  }
}

/**
 * Cleanup blocks whose titles contain any of the given prefixes.
 * Uses Shift+Click to select without navigation, then Shift+D to delete.
 */
export async function cleanupTestBlocks(
  page: Page,
  prefixes: string[],
): Promise<void> {
  for (const prefix of prefixes) {
    // Find all blocks with this prefix at the current level
    const matching = page.locator(
      `#rootContainer [block] titleBlock:has-text("${prefix}")`,
    );
    const count = await matching.count();

    for (let i = count - 1; i >= 0; i--) {
      try {
        const el = matching.nth(i);
        if (!(await el.isVisible({ timeout: 1000 }).catch(() => false))) continue;

        // Shift+Click to select without navigation
        await el.click({ force: true, modifiers: ['Shift'] });
        await page.waitForTimeout(300);

        // Shift+D to delete
        await page.keyboard.down('Shift');
        await page.keyboard.press('d');
        await page.keyboard.up('Shift');

        // Handle confirmation dialog
        await handleDeleteConfirmDialog(page);
        await page.waitForTimeout(1000);
      } catch {
        // Block may already be gone — continue
      }
    }
  }
}
