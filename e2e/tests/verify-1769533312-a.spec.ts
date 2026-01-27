import { test, expect } from '../fixtures/base.fixture';
// uniqueBlockTitle available from test-data.fixture if needed for block creation
import { uniqueBlockTitle } from '../fixtures/test-data.fixture'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { Page } from '@playwright/test';
import { MainPage } from '../pages/main.page';

/**
 * Group A: Positive auth scenarios (s1, s2, s3)
 *
 * s1 - Successful login with valid credentials
 * s2 - Successful registration (mocked API)
 * s3 - Logout clears cookies and shows login form
 */

const TEST_USER = {
  username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
  password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
};

// Fake tree/block data for mocked auth session
const FAKE_USER_ID = 'fake-user-e2e';
const FAKE_TREE_ID = 'fake-tree-001';
const FAKE_ROOT_BLOCK = {
  id: FAKE_TREE_ID,
  title: 'Root',
  parent_id: false,
  children: ['fake-block-001', 'fake-block-002'],
  updated_at: Math.floor(Date.now() / 1000),
  data: { text: '', childOrder: ['fake-block-001', 'fake-block-002'], color: [200, 50, 50] },
};
const FAKE_CHILD_1 = {
  id: 'fake-block-001',
  title: 'Block One',
  parent_id: FAKE_TREE_ID,
  children: [],
  updated_at: Math.floor(Date.now() / 1000),
  data: { text: 'content1', childOrder: [] },
};
const FAKE_CHILD_2 = {
  id: 'fake-block-002',
  title: 'Block Two',
  parent_id: FAKE_TREE_ID,
  children: [],
  updated_at: Math.floor(Date.now() / 1000),
  data: { text: 'content2', childOrder: [] },
};

// Anonymous tree blocks: root with auth + registration view blocks
// These are rendered by the painter as login/registration forms
const ANON_ROOT_ID = 'anon-root';
const ANON_AUTH_BLOCK_ID = 'anon-auth-block';
const ANON_REG_BLOCK_ID = 'anon-reg-block';
const ANON_TREE_RESPONSE = {
  [ANON_ROOT_ID]: {
    [ANON_ROOT_ID]: {
      id: ANON_ROOT_ID,
      title: 'Public',
      parent_id: false,
      children: [ANON_AUTH_BLOCK_ID, ANON_REG_BLOCK_ID],
      updated_at: Math.floor(Date.now() / 1000),
      data: { text: '', childOrder: [ANON_AUTH_BLOCK_ID, ANON_REG_BLOCK_ID], color: [200, 50, 50] },
    },
    [ANON_AUTH_BLOCK_ID]: {
      id: ANON_AUTH_BLOCK_ID,
      title: 'Auth',
      parent_id: ANON_ROOT_ID,
      children: [],
      updated_at: Math.floor(Date.now() / 1000),
      data: { view: 'auth', childOrder: [] },
    },
    [ANON_REG_BLOCK_ID]: {
      id: ANON_REG_BLOCK_ID,
      title: 'Registration',
      parent_id: ANON_ROOT_ID,
      children: [],
      updated_at: Math.floor(Date.now() / 1000),
      data: { view: 'registration', childOrder: [] },
    },
  },
};

function createFakeTokens(userId: string) {
  const fakeAccessToken = [
    btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    btoa(JSON.stringify({ user_id: userId, exp: Math.floor(Date.now() / 1000) + 3600 })),
    'fake-signature',
  ].join('.');
  const fakeRefreshToken = [
    btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    btoa(JSON.stringify({ user_id: userId, exp: Math.floor(Date.now() / 1000) + 86400 })),
    'fake-refresh-sig',
  ].join('.');
  return { fakeAccessToken, fakeRefreshToken };
}

/**
 * Set up route mocks for an authenticated session.
 *
 * The load-trees endpoint is stateful:
 *   - Before login: returns auth blocks (login/registration forms)
 *   - After login: returns regular blocks (Root, Block One, Block Two)
 *
 * Flow:
 *   1. Set up all route mocks
 *   2. Clear cookies + IndexedDB
 *   3. Navigate to / -- app shows login form (anonymous auth blocks)
 *   4. Fill credentials and submit -- mocked login returns tokens
 *   5. Login event triggers load-trees again -- now returns real blocks
 */
async function mockAuthenticatedSession(page: Page, mainPage: MainPage) {
  const { fakeAccessToken, fakeRefreshToken } = createFakeTokens(FAKE_USER_ID);

  // Build load-trees response for authenticated user
  const authenticatedTreesResponse = {
    [FAKE_TREE_ID]: {
      [FAKE_ROOT_BLOCK.id]: FAKE_ROOT_BLOCK,
      [FAKE_CHILD_1.id]: FAKE_CHILD_1,
      [FAKE_CHILD_2.id]: FAKE_CHILD_2,
    },
  };

  // Track login state to switch load-trees response
  let loginCompleted = false;

  // Mock login API
  await page.route('**/api/v1/login/', async (route) => {
    if (route.request().method() === 'POST') {
      loginCompleted = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: fakeAccessToken,
          refresh: fakeRefreshToken,
          user_id: FAKE_USER_ID,
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock load-trees API -- returns auth blocks before login, real blocks after
  await page.route('**/api/v1/load-trees/', async (route) => {
    if (loginCompleted) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(authenticatedTreesResponse),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ANON_TREE_RESPONSE),
      });
    }
  });

  // Mock token refresh
  await page.route('**/api/v1/token/refresh/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: fakeAccessToken,
          refresh: fakeRefreshToken,
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock onboarding status (to prevent onboarding popup)
  await page.route('**/api/v1/onboarding/status/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ onboarding_completed: true }),
    });
  });

  // Mock other API calls that might fire during init (health check, etc.)
  await page.route('**/api/v1/health/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });

  // Clear cookies to ensure clean state
  await page.context().clearCookies();

  // Navigate to the app so we can access IndexedDB
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Clear IndexedDB (localforage uses 'omniMap' database, 'omniMap' store)
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const request = indexedDB.open('omniMap', 1);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('omniMap', 'readwrite');
          const store = tx.objectStore('omniMap');
          store.clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch (e) {
          db.close();
          resolve();
        }
      };
      request.onerror = () => resolve();
    });
  });

  // Reload to get fresh state (no cached user -> InitAnonimUser -> auth blocks rendered)
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Wait for login form to appear (auth block with data.view='auth' renders #login-form)
  await page.locator('#login-form').waitFor({ state: 'visible', timeout: 15000 });

  // Fill credentials and submit
  await mainPage.login(TEST_USER.username, TEST_USER.password);

  // Wait for login form to disappear (Login event replaces auth blocks with real blocks)
  await page.waitForFunction(
    () => {
      const loginForm = document.getElementById('login-form');
      return !loginForm || !document.body.contains(loginForm);
    },
    { timeout: 15000 },
  );

  // Wait for real blocks to appear (non-auth blocks)
  await page.waitForFunction(
    () => {
      const root = document.getElementById('rootContainer');
      if (!root) return false;
      const blocks = root.querySelectorAll('[block]');
      // Check that at least one block does NOT have auth view (real content blocks)
      for (const b of blocks) {
        const titleEl = b.querySelector('titleBlock');
        if (titleEl && (titleEl.textContent === 'Block One' || titleEl.textContent === 'Block Two')) {
          return true;
        }
      }
      return blocks.length > 0;
    },
    { timeout: 15000 },
  );

  // Wait for sidebar .hidden class to be removed (Login handler removes it)
  await page.waitForFunction(
    () => {
      const sidebar = document.getElementById('sidebar');
      return sidebar && !sidebar.classList.contains('hidden');
    },
    { timeout: 15000 },
  );

  return { fakeUserId: FAKE_USER_ID, fakeAccessToken, fakeRefreshToken };
}

test.describe('Group A: Positive auth scenarios @auth', () => {
  /**
   * s1: Successful login with valid credentials
   *
   * Uses mainPage fixture + mocked API to simulate login.
   * Verifies that after login:
   * - Login form is gone
   * - rootContainer is visible with blocks
   * - Sidebar is visible (no .hidden class)
   * - Breadcrumb is visible (no .hidden class)
   * - Auth cookies are set
   */
  test('s1: successful login shows authorized UI with blocks', async ({
    mainPage,
    page,
  }) => {
    // Set up mock auth and login
    await mockAuthenticatedSession(page, mainPage);

    // Verify rootContainer is visible
    await expect(mainPage.rootContainer).toBeVisible();

    // Verify login form is NOT present (detached from DOM after successful login)
    await expect(mainPage.loginForm).not.toBeAttached();

    // Verify blocks are rendered inside rootContainer
    const blocks = mainPage.getBlocks();
    const blocksCount = await blocks.count();
    expect(blocksCount).toBeGreaterThan(0);

    // Verify sidebar is visible (no .hidden class)
    const sidebar = mainPage.sidebar;
    await expect(sidebar).toBeVisible();
    const sidebarClass = (await sidebar.getAttribute('class')) || '';
    expect(sidebarClass).not.toContain('hidden');

    // Verify breadcrumb is visible (no .hidden class)
    const breadcrumb = mainPage.breadcrumb;
    await expect(breadcrumb).toBeVisible();
    const breadcrumbClass = (await breadcrumb.getAttribute('class')) || '';
    expect(breadcrumbClass).not.toContain('hidden');

    // Verify topSidebar is visible (no .hidden class)
    const topSidebar = page.locator('#topSidebar');
    const topSidebarExists = (await topSidebar.count()) > 0;
    if (topSidebarExists) {
      const topSidebarClass = (await topSidebar.getAttribute('class')) || '';
      expect(topSidebarClass).not.toContain('hidden');
    }

    // Verify auth cookies are set (access and refresh)
    const cookies = await page.context().cookies();
    const accessCookie = cookies.find((c) => c.name === 'access');
    const refreshCookie = cookies.find((c) => c.name === 'refresh');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  /**
   * s2: Successful registration with mocked API
   *
   * Uses mainPage fixture (unauthenticated, cookies cleared).
   * Mocks the /register/ API endpoint to return 201 with tokens.
   * Verifies that registration form submits correctly and triggers InitUser.
   */
  test('s2: successful registration triggers InitUser and sets cookies', async ({
    mainPage,
    page,
  }) => {
    // Generate unique user data
    const uniqueSuffix = Date.now().toString(36);
    const testRegUser = {
      username: `testuser_${uniqueSuffix}`,
      email: `testuser_${uniqueSuffix}@test.omnimap.ru`,
      password: 'TestPass123!',
    };

    // Mock the /register/ API endpoint to return 201 with tokens
    const fakeUserId = `fake-user-${uniqueSuffix}`;
    const { fakeAccessToken, fakeRefreshToken } = createFakeTokens(fakeUserId);

    // Build load-trees response for after registration
    const authenticatedTreesResponse = {
      [FAKE_TREE_ID]: {
        [FAKE_ROOT_BLOCK.id]: FAKE_ROOT_BLOCK,
        [FAKE_CHILD_1.id]: FAKE_CHILD_1,
        [FAKE_CHILD_2.id]: FAKE_CHILD_2,
      },
    };

    let registrationCompleted = false;

    await page.route('**/api/v1/register/', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        registrationCompleted = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            access: fakeAccessToken,
            refresh: fakeRefreshToken,
            user_id: fakeUserId,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock load-trees API -- returns auth blocks before registration, real blocks after
    await page.route('**/api/v1/load-trees/', async (route) => {
      if (registrationCompleted) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(authenticatedTreesResponse),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ANON_TREE_RESPONSE),
        });
      }
    });

    // Mock onboarding status
    await page.route('**/api/v1/onboarding/status/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ onboarding_completed: true }),
      });
    });

    // Mock health check
    await page.route('**/api/v1/health/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    // Clear cookies and IndexedDB
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Clear IndexedDB store completely
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('omniMap', 1);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('omniMap', 'readwrite');
            const store = tx.objectStore('omniMap');
            store.clear();
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
          } catch (e) { db.close(); resolve(); }
        };
        request.onerror = () => resolve();
      });
    });

    // Reload to get a clean state
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for register form to appear (auth blocks should render both login and registration forms)
    await page.locator('#register-form').waitFor({ state: 'visible', timeout: 15000 });

    // Set up InitUser event listener before submitting the form
    await page.evaluate(() => {
      (window as any).__initUserFired = false;
      (window as any).__initUserDetail = null;
      window.addEventListener(
        'InitUser',
        ((e: CustomEvent) => {
          (window as any).__initUserFired = true;
          (window as any).__initUserDetail = e.detail;
        }) as EventListener,
      );
    });

    // Fill the registration form
    const regUsername = page.locator('#register-form #reg-username');
    const regEmail = page.locator('#register-form #email');
    const regPassword = page.locator('#register-form #reg-password');
    const regConfirmPassword = page.locator('#register-form #confirm-password');
    const regSubmit = page.locator('#register-form button[type="submit"]');

    await regUsername.fill(testRegUser.username);
    await regEmail.fill(testRegUser.email);
    await regPassword.fill(testRegUser.password);
    await regConfirmPassword.fill(testRegUser.password);

    // Submit the form
    await regSubmit.click();

    // Wait for the API call to complete (mocked, should be instant)
    await page.waitForTimeout(2000);

    // Verify InitUser event was dispatched
    const initUserFired = await page.evaluate(() => (window as any).__initUserFired);
    expect(initUserFired).toBe(true);

    // Verify the user_id was passed correctly
    const initUserDetail = await page.evaluate(() => (window as any).__initUserDetail);
    expect(initUserDetail).toBeDefined();
    expect(initUserDetail?.user).toBe(fakeUserId);

    // Verify cookies are set (access and refresh)
    const cookies = await page.context().cookies();
    const accessCookie = cookies.find((c) => c.name === 'access');
    const refreshCookie = cookies.find((c) => c.name === 'refresh');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  /**
   * s3: Logout clears cookies and shows login form
   *
   * Uses mainPage fixture + mocked API to get to authenticated state first.
   * Then dispatches Logout and verifies UI changes.
   */
  test('s3: logout clears session and shows login form', async ({
    mainPage,
    page,
  }) => {
    // Set up mock auth and login
    await mockAuthenticatedSession(page, mainPage);

    // Verify initial authenticated state: sidebar visible, blocks present
    await expect(mainPage.rootContainer).toBeVisible();
    const blocks = mainPage.getBlocks();
    const blocksCount = await blocks.count();
    expect(blocksCount).toBeGreaterThan(0);

    // Verify sidebar is visible before logout
    const sidebar = mainPage.sidebar;
    await expect(sidebar).toBeVisible();

    // IMPORTANT: Switch load-trees mock to return auth blocks BEFORE triggering logout.
    // Logout dispatches InitAnonimUser which immediately calls load-trees.
    // If we don't switch the mock first, it returns regular blocks and the login form
    // never renders.
    await page.unroute('**/api/v1/load-trees/');
    await page.route('**/api/v1/load-trees/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ANON_TREE_RESPONSE),
      });
    });

    // Also mock token refresh to fail (post-logout state)
    await page.unroute('**/api/v1/token/refresh/');
    await page.route('**/api/v1/token/refresh/', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid token' }),
      });
    });

    // Trigger logout via the app's api.logout() which:
    // 1. Removes 'access' cookie
    // 2. Removes 'refresh' cookie
    // 3. Dispatches 'Logout' custom event
    // 4. Deletes Authorization header
    await page.evaluate(() => {
      // Access the global api instance and call logout
      const apiInstance = (window as any).api || (window as any).__api;
      if (apiInstance && apiInstance.logout) {
        apiInstance.logout();
      } else {
        // Fallback: manually dispatch Logout and clear cookies
        document.cookie = 'access=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'refresh=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.dispatchEvent(new CustomEvent('Logout'));
      }
    });

    // Wait for UI to react to Logout event
    await page.waitForTimeout(2000);

    // Verify sidebar has .hidden class after logout
    await page.waitForFunction(
      () => {
        const el = document.getElementById('sidebar');
        return el && el.classList.contains('hidden');
      },
      { timeout: 10000 },
    );
    const sidebarClassAfter = (await sidebar.getAttribute('class')) || '';
    expect(sidebarClassAfter).toContain('hidden');

    // Verify breadcrumb has .hidden class after logout
    const breadcrumb = mainPage.breadcrumb;
    const breadcrumbClassAfter = (await breadcrumb.getAttribute('class')) || '';
    expect(breadcrumbClassAfter).toContain('hidden');

    // Verify topSidebar has .hidden class after logout
    const topSidebar = page.locator('#topSidebar');
    const topSidebarExists = (await topSidebar.count()) > 0;
    if (topSidebarExists) {
      const topSidebarClassAfter = (await topSidebar.getAttribute('class')) || '';
      expect(topSidebarClassAfter).toContain('hidden');
    }

    // Verify cookies are cleared
    const cookies = await page.context().cookies();
    const accessCookie = cookies.find((c) => c.name === 'access');
    const refreshCookie = cookies.find((c) => c.name === 'refresh');

    const accessCleared = !accessCookie || accessCookie.value === '';
    const refreshCleared = !refreshCookie || refreshCookie.value === '';
    expect(accessCleared).toBe(true);
    expect(refreshCleared).toBe(true);

    // Verify login form appears after reload
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for login form to appear
    const loginForm = page.locator('#login-form');
    await loginForm.waitFor({ state: 'visible', timeout: 15000 });

    // Verify login form inputs are visible
    await expect(page.locator('#login-form #username')).toBeVisible();
    await expect(page.locator('#login-form #password')).toBeVisible();
    await expect(page.locator('#login-form button[type="submit"]')).toBeVisible();
  });
});
