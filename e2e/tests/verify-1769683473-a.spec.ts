/**
 * Verify E2E Tests - Group A: Positive Registration Scenarios
 * Generated for: Auth - Registration
 * Timestamp: 1769683473
 *
 * Tests: s1, s2, s3, s15
 * - s1: Successful registration with valid data
 * - s2: Password visibility toggle
 * - s3: Password hint updates dynamically
 * - s15: Control panel buttons visible after registration (CRITICAL)
 */

import { test, expect } from '@playwright/test';

// Unique username/email generator
function uniqueUsername(): string {
  return `verify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uniqueEmail(): string {
  return `verify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.omnimap.ru`;
}

const VALID_PASSWORD = 'TestPass123!';

test.describe('Verify: Registration - Positive Scenarios (Group A)', () => {

  test.beforeEach(async ({ context }) => {
    // Clear cookies to ensure unauthenticated state
    await context.clearCookies();
  });

  test('s2: Password visibility toggle works correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for registration form
    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const passwordInput = page.locator('#reg-password');
    const confirmPasswordInput = page.locator('#confirm-password');

    // Enter password
    await passwordInput.fill('TestPassword123');

    // Get the toggle button for password field
    const passwordToggle = page.locator('#register-form .auth-input-group:has(#reg-password) .auth-password-toggle');
    await expect(passwordToggle).toBeVisible();

    // Initially password should be hidden (type=password)
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle to show password
    await passwordToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await passwordToggle.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Test confirm password toggle
    await confirmPasswordInput.fill('TestPassword123');
    const confirmToggle = page.locator('#register-form .auth-input-group:has(#confirm-password) .auth-password-toggle');
    await expect(confirmToggle).toBeVisible();

    await expect(confirmPasswordInput).toHaveAttribute('type', 'password');
    await confirmToggle.click();
    await expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    await confirmToggle.click();
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password');
  });

  test('s3: Password hint updates dynamically', async ({ page }) => {
    await page.goto('/');

    // Wait for registration form
    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const passwordInput = page.locator('#reg-password');
    const passwordHint = page.locator('#register-form .auth-password-hint');

    // Initially hint should be visible without 'valid' class
    await expect(passwordHint).toBeVisible();
    await expect(passwordHint).not.toHaveClass(/valid/);

    // Type 5 characters - still not valid
    await passwordInput.fill('12345');
    await expect(passwordHint).not.toHaveClass(/valid/);

    // Type 8 characters - should be valid
    await passwordInput.fill('12345678');
    await expect(passwordHint).toHaveClass(/valid/);

    // Back to 7 - should be invalid again
    await passwordInput.fill('1234567');
    await expect(passwordHint).not.toHaveClass(/valid/);
  });

  test('s1: Successful registration with valid data', async ({ page }) => {
    await page.goto('/');

    // Wait for registration form
    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const username = uniqueUsername();
    const email = uniqueEmail();

    // Fill form
    await page.locator('#reg-username').fill(username);
    await page.locator('#email').fill(email);
    await page.locator('#reg-password').fill(VALID_PASSWORD);
    await page.locator('#confirm-password').fill(VALID_PASSWORD);

    // Submit
    await page.locator('#register-form button[type="submit"]').click();

    // Wait for form to disappear (registration success)
    await regForm.waitFor({ state: 'detached', timeout: 30000 });

    // Verify user is logged in - blocks should be visible
    const rootContainer = page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout: 15000 });
  });

  test('s15: Control panel buttons visible after successful registration (CRITICAL)', async ({ page }) => {
    await page.goto('/');

    // Wait for registration form
    const regForm = page.locator('#register-form');
    await regForm.waitFor({ state: 'visible', timeout: 15000 });

    const username = uniqueUsername();
    const email = uniqueEmail();

    // Fill form
    await page.locator('#reg-username').fill(username);
    await page.locator('#email').fill(email);
    await page.locator('#reg-password').fill(VALID_PASSWORD);
    await page.locator('#confirm-password').fill(VALID_PASSWORD);

    // Submit
    await page.locator('#register-form button[type="submit"]').click();

    // CRITICAL CHECK: Sidebar should become visible after registration
    // Note: Form may not disappear immediately, but sidebar buttons should render
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible({ timeout: 15000 });
    await expect(sidebar).not.toHaveClass(/hidden/);

    // CRITICAL CHECK: Control panel should have buttons
    const controlPanel = page.locator('#control-panel');
    await expect(controlPanel).toBeVisible();

    // Wait for buttons to be rendered
    const sidebarButtons = page.locator('#control-panel .sidebar-button');
    await expect(sidebarButtons.first()).toBeVisible({ timeout: 10000 });

    // Verify at least one button exists
    const buttonCount = await sidebarButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Verify a button is clickable (not just visible)
    const firstButton = sidebarButtons.first();
    await expect(firstButton).toBeEnabled();
  });
});
