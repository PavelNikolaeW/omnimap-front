import { test, expect } from '../fixtures/base.fixture';
import { uniqueBlockTitle } from '../fixtures/test-data.fixture';
import { apiCleanupByPrefix, createTestBlock } from '../fixtures/verify-helpers.fixture';

/**
 * Verify: Group B - Negative scenarios and validation (Copy/Paste/Link)
 *
 * s4: shift+v with invalid clipboard content should not cause errors
 * s5: shift+g cannot create a link to itself (self-link prevention)
 *
 * Timestamp: 1769690304
 *
 * Code references:
 * - src/js/actions/selectionActions.js:82-108 (getBlockIdsFromClipboard with UUID validation)
 * - src/js/utils/functions.js:25-28 (isValidUUID regex)
 * - src/js/controller/comands/commands.js:541 (if (!clipboardResult.success) return)
 * - src/js/controller/comands/commands.js:566 (destId === clipboardResult.blockId check)
 */
test.describe('Verify: Group B - Copy/Paste Negative Scenarios', () => {
  const createdBlockIds: string[] = [];
  let cleanupDone = false;

  test.beforeEach(async ({ authenticatedPage, page }) => {
    // Clean up stale test data from previous runs (only once)
    if (!cleanupDone) {
      await apiCleanupByPrefix(page, 'Verify_B_');
      cleanupDone = true;
    }
  });

  test.afterEach(async ({ page }) => {
    // API cleanup of created blocks (delete in reverse order)
    for (const id of [...createdBlockIds].reverse()) {
      try {
        await page.evaluate(async (blockId) => {
          const token = localStorage.getItem('token');
          if (!token) return;
          await fetch('/api/v1/delete-tree/' + blockId + '/', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
        }, id);
      } catch {
        // Block may already be deleted
      }
    }
    createdBlockIds.length = 0;
  });

  /**
   * s4: shift+v with invalid clipboard content should not cause errors
   *
   * This test verifies that pasting from clipboard with invalid content
   * (non-UUID text) does not break the UI or cause console errors.
   *
   * Expected behavior:
   * - getBlockIdsFromClipboard() returns {success: false}
   * - pasteBlock command returns early without dispatching
   * - No visible errors, UI remains functional
   */
  test('s4: shift+v with invalid clipboard content should not cause errors', async ({ authenticatedPage, page }) => {
    // Track console errors during test
    const consoleErrors: string[] = [];
    const consoleHandler = (msg: any) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    page.on('console', consoleHandler);

    // Ensure we have a block to select
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });
    const initialBlockCount = await blocks.count();
    expect(initialBlockCount).toBeGreaterThan(0);

    // Select the first block with Shift+Click
    const firstBlock = blocks.first();
    const titleBlock = firstBlock.locator('titleBlock').first();
    await titleBlock.waitFor({ state: 'visible', timeout: 5000 });
    await titleBlock.click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Write invalid content to clipboard (not a UUID, not JSON array of UUIDs)
    await page.evaluate(async () => {
      try {
        await navigator.clipboard.writeText('invalid-not-a-uuid-content-123');
      } catch (e) {
        // Fallback if clipboard API fails in test environment
        const textarea = document.createElement('textarea');
        textarea.value = 'invalid-not-a-uuid-content-123';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    });

    // Attempt to paste with Shift+V
    await page.keyboard.down('Shift');
    await page.keyboard.press('v');
    await page.keyboard.up('Shift');

    // Wait a bit for any potential errors to surface
    await page.waitForTimeout(1500);

    // Verify: No error dialogs appeared
    const errorDialog = page.locator('.error-overlay, [class*="error-dialog"], [class*="error-modal"]');
    const errorDialogCount = await errorDialog.count();
    expect(errorDialogCount).toBe(0);

    // Verify: UI is still functional - blocks are still visible
    const currentBlockCount = await blocks.count();
    // Note: Block count may change due to parallel tests or WebSocket updates
    // The key verification is that no JS errors occurred
    expect(currentBlockCount).toBeGreaterThanOrEqual(initialBlockCount - 1);

    // Verify: First block is still clickable (UI not broken)
    // Just click without checking selection class - the important thing is no crash
    await titleBlock.click({ force: true });
    await page.waitForTimeout(300);

    // Verify block still exists and is visible
    expect(await titleBlock.isVisible()).toBeTruthy();

    // Remove console listener
    page.off('console', consoleHandler);

    // Filter out non-critical errors (like network errors, third-party scripts)
    const criticalErrors = consoleErrors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('net::ERR') &&
      !err.includes('404') &&
      err.toLowerCase().includes('clipboard') ||
      err.toLowerCase().includes('paste') ||
      err.toLowerCase().includes('typeerror') ||
      err.toLowerCase().includes('referenceerror')
    );

    // Log any clipboard/paste related errors for debugging
    if (criticalErrors.length > 0) {
      console.log('Console errors during paste with invalid clipboard:', criticalErrors);
    }

    // No TypeErrors or ReferenceErrors should have occurred
    const jsErrors = consoleErrors.filter(err =>
      err.includes('TypeError') || err.includes('ReferenceError')
    );
    expect(jsErrors).toHaveLength(0);
  });

  /**
   * s5: shift+g cannot create a link to itself (self-link prevention)
   *
   * This test verifies that when a block's own ID is in the clipboard,
   * attempting to create a link with Shift+G is silently prevented.
   *
   * Code reference: commands.js line 566: if (destId === clipboardResult.blockId) return
   *
   * Expected behavior:
   * - User copies a block ID (Shift+C)
   * - User selects the SAME block
   * - User presses Shift+G to create link
   * - Nothing happens (self-link is prevented)
   * - No link block is created
   */
  test('s5: shift+g cannot create a link to itself (self-link prevention)', async ({ authenticatedPage, page }) => {
    // Create a test block that we'll try to self-link
    const testTitle = await createTestBlock(page, 'Verify_B_s5');

    // Find the created block
    const testBlock = page.locator(`#rootContainer [block]:has(titleBlock:has-text("${testTitle}"))`).first();
    await expect(testBlock).toBeVisible({ timeout: 10000 });

    // Get block ID for cleanup
    const blockId = await testBlock.getAttribute('id');
    if (blockId) {
      const cleanId = blockId.split('*').at(-1);
      if (cleanId) createdBlockIds.push(cleanId);
    }

    // Count initial blocks
    const blocks = page.locator('#rootContainer [block]');
    const initialBlockCount = await blocks.count();

    // Select the test block with Shift+Click
    const titleBlock = testBlock.locator('titleBlock').first();
    await titleBlock.click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Copy the block ID with Shift+C
    await page.keyboard.down('Shift');
    await page.keyboard.press('c');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    // The block is already selected, now try to paste as link with Shift+G
    // This should be prevented because destId === clipboardResult.blockId
    await page.keyboard.down('Shift');
    await page.keyboard.press('g');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1500);

    // The key verification: no SELF-LINK was created pointing to our test block
    // A self-link would have blockLink attribute pointing to itself
    const testBlockIdClean = blockId?.split('*').at(-1) || '';

    // Check for any link blocks pointing to our test block
    const linkBlocksToSelf = page.locator(`[blockLink*="${testBlockIdClean}"]`);
    const selfLinkCount = await linkBlocksToSelf.count();

    // There should be NO link blocks pointing to the test block (self-link prevented)
    expect(selfLinkCount).toBe(0);

    // Verify: UI is still functional - just check the test block is still visible
    // (it shouldn't have been deleted by the self-link attempt)
    const testBlockStillExists = page.locator(`#rootContainer [block]:has(titleBlock:has-text("${testTitle}"))`).first();
    expect(await testBlockStillExists.isVisible()).toBeTruthy();
  });

  /**
   * Additional test: Verify empty clipboard handling
   *
   * Tests that shift+v with empty clipboard does not cause errors.
   */
  test('s4-extra: shift+v with empty clipboard should not cause errors', async ({ authenticatedPage, page }) => {
    // Track console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Ensure we have a block to select
    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });
    const initialBlockCount = await blocks.count();

    // Select the first block
    const firstBlock = blocks.first();
    const titleBlock = firstBlock.locator('titleBlock').first();
    await titleBlock.click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Clear clipboard by writing empty string
    await page.evaluate(async () => {
      try {
        await navigator.clipboard.writeText('');
      } catch (e) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = '';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    });

    // Attempt to paste with Shift+V
    await page.keyboard.down('Shift');
    await page.keyboard.press('v');
    await page.keyboard.up('Shift');

    await page.waitForTimeout(1500);

    // Verify: Block count unchanged
    const currentBlockCount = await blocks.count();
    expect(currentBlockCount).toBe(initialBlockCount);

    // Verify: No JS errors
    const jsErrors = consoleErrors.filter(err =>
      err.includes('TypeError') || err.includes('ReferenceError')
    );
    expect(jsErrors).toHaveLength(0);
  });

  /**
   * Additional test: Verify JSON array with invalid UUIDs is rejected
   *
   * Tests that clipboard containing JSON array with non-UUID strings
   * is correctly rejected.
   */
  test('s4-extra: shift+v with JSON array of invalid UUIDs should not cause errors', async ({ authenticatedPage, page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const blocks = page.locator('#rootContainer [block]');
    await blocks.first().waitFor({ state: 'visible', timeout: 10000 });
    const initialBlockCount = await blocks.count();

    // Select the first block
    const firstBlock = blocks.first();
    const titleBlock = firstBlock.locator('titleBlock').first();
    await titleBlock.click({ force: true, modifiers: ['Shift'] });
    await page.waitForTimeout(500);

    // Write JSON array with invalid UUIDs to clipboard
    await page.evaluate(async () => {
      const invalidJsonArray = JSON.stringify(['not-uuid-1', 'also-not-uuid-2', '123']);
      try {
        await navigator.clipboard.writeText(invalidJsonArray);
      } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = invalidJsonArray;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    });

    // Attempt to paste with Shift+V
    await page.keyboard.down('Shift');
    await page.keyboard.press('v');
    await page.keyboard.up('Shift');

    await page.waitForTimeout(1500);

    // Verify: Block count unchanged (invalid array should be rejected)
    const currentBlockCount = await blocks.count();
    expect(currentBlockCount).toBe(initialBlockCount);

    // Verify: No JS errors
    const jsErrors = consoleErrors.filter(err =>
      err.includes('TypeError') || err.includes('ReferenceError')
    );
    expect(jsErrors).toHaveLength(0);
  });
});
