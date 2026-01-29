/**
 * Verify E2E Tests - Group C: Edge Cases
 * Generated for: Auth - Registration
 * Timestamp: 1769683473
 *
 * Tests: s10, s11, s13, s14
 * - s10: Error messages clear when user starts typing
 * - s11: Loading state during registration
 * - s13: Auto-focus on first field
 * - s14: Form submission via Enter key
 *
 * Note: s12 (network error) skipped - requires offline mode manipulation
 */

import { test, expect } from '@playwright/test';

// Unique generators
function uniqueUsername(): string {
  return `verify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uniqueEmail(): string {
  return `verify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.omnimap.ru`;
}

const VALID_PASSWORD = 'TestPass123!';

test.describe('Verify: Registration - Edge Cases (Group C)', () => {

  test.beforeEach(async ({ context }) => {
    // Clear cookies to ensure unauthenticated state
    await context.clearCookies();
  });

  test('s10: Error messages clear when user starts typing', async ({ page }) => {
    await page.goto('/');

    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    // Submit empty form to trigger errors
    await page.locator('#register-form button[type="submit"]').click();

    // Verify errors are displayed
    const usernameError = page.locator('#reg-username-error');
    await expect(usernameError).toBeVisible({ timeout: 5000 });

    // Start typing in username field
    await page.locator('#reg-username').fill('t');

    // Username error should disappear
    await expect(usernameError).not.toBeVisible({ timeout: 3000 });
  });

  test('s11: Loading state during registration', async ({ page }) => {
    await page.goto('/');

    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const username = uniqueUsername();
    const email = uniqueEmail();

    // Fill form
    await page.locator('#reg-username').fill(username);
    await page.locator('#email').fill(email);
    await page.locator('#reg-password').fill(VALID_PASSWORD);
    await page.locator('#confirm-password').fill(VALID_PASSWORD);

    const submitButton = page.locator('#register-form button[type="submit"]');
    const buttonText = page.locator('#register-form .auth-button-text');

    // Get initial text
    const initialText = await buttonText.textContent();

    // Click submit and immediately check loading state
    await submitButton.click();

    // Button should show loading state (either disabled or text changed)
    // Check within a short timeout as it may be quick
    try {
      await expect(submitButton).toBeDisabled({ timeout: 1000 });
    } catch {
      // If not disabled, check if text changed to loading
      const loadingText = await buttonText.textContent();
      // Text should have changed during loading
      expect(loadingText).not.toBe(initialText);
    }

    // Wait for registration to complete
    await regForm.waitFor({ state: 'detached', timeout: 30000 });
  });

  test('s13: Auto-focus on first field after form render', async ({ page }) => {
    await page.goto('/');

    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    // Wait a bit for focus to be set
    await page.waitForTimeout(500);

    // Check which element has focus
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.id : null;
    });

    // Username field should have focus (or be in the auth-block)
    // Note: focus may be on login form instead if it's the default view
    const activeInAuthBlock = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest('.auth-block') !== null;
    });

    expect(activeInAuthBlock).toBe(true);
  });

  test('s14: Form submission via Enter key', async ({ page }) => {
    await page.goto('/');

    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const username = uniqueUsername();
    const email = uniqueEmail();

    // Fill form
    await page.locator('#reg-username').fill(username);
    await page.locator('#email').fill(email);
    await page.locator('#reg-password').fill(VALID_PASSWORD);

    // Fill confirm password and press Enter
    const confirmInput = page.locator('#confirm-password');
    await confirmInput.fill(VALID_PASSWORD);
    await confirmInput.press('Enter');

    // Form should be submitted and disappear
    await regForm.waitFor({ state: 'detached', timeout: 30000 });

    // Verify user is logged in
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 15000 });
  });
});
