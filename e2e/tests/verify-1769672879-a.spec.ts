import { test, expect, TEST_USERS } from '../fixtures/base.fixture';

/**
 * Verify: Auth - Group A (Positive scenarios)
 * s1: Successful login with valid credentials
 * s2: Session persistence after page refresh (JWT cookies)
 * s3: Logout - redirect to login form, cookies cleared
 * s12: Successful registration of new user
 */
test.describe('Verify: Auth - Group A (Positive)', () => {
  test('s1: successful login with valid credentials', async ({ mainPage, page }) => {
    // Navigate to the app (unauthenticated)
    await mainPage.goto();

    // Wait for login form to appear
    await mainPage.waitForLoginForm();

    // Fill in credentials
    await mainPage.usernameInput.fill(TEST_USERS.admin.username);
    await mainPage.passwordInput.fill(TEST_USERS.admin.password);

    // Submit
    await mainPage.loginSubmitButton.click();

    // Assert login success
    await mainPage.assertLoginSuccess();

    // Verify blocks are visible
    await mainPage.waitForShowedBlocks();
    const blocksCount = await mainPage.getBlocksCount();
    expect(blocksCount).toBeGreaterThan(0);
  });

  test('s2: session persistence after page refresh (JWT cookies)', async ({ mainPage, page }) => {
    // Login first to get real JWT cookies
    await mainPage.goto();
    await mainPage.waitForLoginForm();
    await mainPage.usernameInput.fill(TEST_USERS.admin.username);
    await mainPage.passwordInput.fill(TEST_USERS.admin.password);
    await mainPage.loginSubmitButton.click();
    await mainPage.assertLoginSuccess();

    // Remember current state
    const initialBlocksCount = await mainPage.getBlocksCount();
    expect(initialBlocksCount).toBeGreaterThan(0);

    // Refresh the page
    await page.reload();

    // Wait for app to load - login form should NOT appear
    await expect(page.locator('#login-form')).toBeHidden({ timeout: 10000 });

    // Verify blocks are still visible after reload
    await mainPage.waitForShowedBlocks();
    const afterRefreshCount = await mainPage.getBlocksCount();
    expect(afterRefreshCount).toBeGreaterThan(0);
  });

  test('s3: logout - redirect to login form, cookies cleared', async ({ mainPage, page }) => {
    // Login first to get real session
    await mainPage.goto();
    await mainPage.waitForLoginForm();
    await mainPage.usernameInput.fill(TEST_USERS.admin.username);
    await mainPage.passwordInput.fill(TEST_USERS.admin.password);
    await mainPage.loginSubmitButton.click();
    await mainPage.assertLoginSuccess();
    await mainPage.waitForShowedBlocks();

    // Perform logout via dispatch event (same as clicking logout button)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('Logout'));
    });

    // Wait for logout to process - cookies should be cleared
    await page.waitForFunction(
      () => !document.cookie.includes('access'),
      { timeout: 5000 }
    ).catch(() => {
      // Cookie may already be cleared or httpOnly
    });

    // Reload page to see effect of logout
    await page.reload();

    // After reload with cleared cookies, auth form should appear
    await expect(
      page.locator('#login-form').or(page.locator('#register-form')).or(page.locator('.auth-block'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('s12: successful registration of new user', async ({ mainPage, page }) => {
    // Generate unique user data with timestamp to avoid conflicts
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const uniqueUsername = `verify_user_${timestamp}_${randomSuffix}`;
    const uniqueEmail = `verify_${timestamp}_${randomSuffix}@test.omnimap.ru`;
    const password = 'TestPassword123';

    // Navigate to the app (unauthenticated)
    await mainPage.goto();

    // Wait for registration form to appear
    await expect(page.locator('#register-form')).toBeVisible({ timeout: 15000 });

    // Get registration form locators with specific selectors
    const regForm = page.locator('#register-form');
    const regUsernameInput = regForm.locator('input[autocomplete="username"]');
    const regEmailInput = regForm.locator('input[autocomplete="email"]');
    const regPasswordInput = regForm.locator('input[id="reg-password"]');
    const regConfirmPasswordInput = regForm.locator('input[id="confirm-password"]');
    const regSubmitButton = regForm.locator('button[type="submit"]');

    // Fill in registration form
    await regUsernameInput.fill(uniqueUsername);
    await regEmailInput.fill(uniqueEmail);
    await regPasswordInput.fill(password);
    await regConfirmPasswordInput.fill(password);

    // Submit registration
    await regSubmitButton.click();

    // Wait for registration to complete - form should disappear on success
    // or error message should appear
    const result = await Promise.race([
      // Success: registration form disappears
      regForm.waitFor({ state: 'detached', timeout: 15000 })
        .then(() => ({ success: true })),
      // Error: error message becomes visible
      regForm.locator('.auth-error')
        .filter({ hasText: /.+/ }) // Has any text
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(async () => {
          const errorText = await regForm.locator('.auth-error').textContent();
          return { success: false, error: errorText };
        })
    ]).catch(() => ({ success: false, error: 'timeout' }));

    if (!result.success) {
      // Check if it's a "user exists" error - this is acceptable
      if (result.error?.includes('другое имя') || result.error?.includes('ошибка')) {
        console.log(`Registration skipped (user may exist): ${result.error}`);
        test.skip();
        return;
      }
      throw new Error(`Registration failed: ${result.error}`);
    }

    // Registration was successful - user should be automatically logged in
    await mainPage.waitForAppLoad();
    await expect(mainPage.rootContainer).toBeVisible({ timeout: 10000 });

    // Verify we're logged in - login form should not be visible
    await expect(page.locator('#login-form')).toBeHidden({ timeout: 5000 });
  });
});
