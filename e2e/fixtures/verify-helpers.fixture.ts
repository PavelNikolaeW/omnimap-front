import { expect, Page } from '@playwright/test';
import { uniqueBlockTitle } from './test-data.fixture';

/**
 * API-based cleanup: delete all blocks whose title starts with the given prefix.
 * Uses delete-tree endpoint for cascading deletion (children first).
 * Should be called in beforeAll to clean stale data from previous runs.
 */
export async function apiCleanupByPrefix(page: Page, prefix: string): Promise<void> {
  await page.evaluate(async (pfx) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const resp = await fetch('/api/v1/block/?format=json', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();
    const stale = (data.results || []).filter((b: any) =>
      b.title && b.title.startsWith(pfx)
    );
    for (const block of stale.reverse()) {
      try {
        await fetch('/api/v1/delete-tree/' + block.id + '/', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
      } catch {}
    }
  }, prefix);
}

/**
 * Create a dedicated verify tree for test isolation.
 * Returns the tree name (used to identify and cleanup later).
 */
export async function createVerifyTree(page: Page, timestamp: string): Promise<string> {
  const treeName = `VerifyTree_${timestamp}`;
  // Click tree add button
  await page.locator('[data-testid="tree-add-button"]').click();
  await page.locator('[data-testid="custom-dialog-input"]').fill(treeName);
  await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
  await page.waitForTimeout(2000);
  return treeName;
}

/**
 * Delete a verify tree by name via API.
 * Finds root block matching the tree name and deletes it with delete-tree.
 */
export async function deleteVerifyTree(page: Page, treeName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const resp = await fetch('/api/v1/block/?format=json', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await resp.json();
    const tree = (data.results || []).find((b: any) => b.title === name && !b.parent_id);
    if (tree) {
      await fetch('/api/v1/delete-tree/' + tree.id + '/', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    }
  }, treeName);
}

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
 * Uses Shift+Click to select the first visible block WITHOUT navigating.
 * The new block is created as a child of the selected block and
 * is immediately visible at the current level.
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

  // Select the first block with Shift+Click (select WITHOUT navigation)
  const firstBlock = blocks.first();
  await firstBlock.locator('titleBlock').first().click({ force: true, modifiers: ['Shift'] });
  await page.waitForTimeout(500);

  // Press 'n' to create a new block
  await page.keyboard.press('n');
  const dialogInput = page.locator('[data-testid="custom-dialog-input"]');
  await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
  await dialogInput.fill(title);
  await page.locator('[data-testid="custom-dialog-ok-btn"]').click();
  await page.waitForTimeout(2000);

  // Verify block was created (it's a child of the selected block, visible at current level)
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
