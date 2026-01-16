import { test as base, expect, BrowserContext, Page } from '@playwright/test';
import { MainPage } from '../pages/main.page';
import { ApiHelper, createApiHelper } from '../helpers/api.helper';
import { OfflineHelper } from './offline.fixture';
import * as fs from 'fs';

/**
 * Конфигурация тестовых пользователей
 *
 * Для cloud окружения (omnimap.cloud.ru):
 * - Тесты автоматически регистрируют/используют тестовых пользователей
 * - Учётные данные берутся из env variables или defaults
 *
 * Структура пользователей:
 * - e2e_admin (owner) - основной тестовый пользователь
 * - e2e_editor - пользователь с правами редактирования
 * - e2e_viewer - пользователь только для просмотра
 */
export const TEST_USERS = {
  admin: {
    username: process.env.E2E_TEST_USERNAME || 'e2e_admin',
    password: process.env.E2E_TEST_PASSWORD || 'e2e_admin_password',
    email: process.env.E2E_TEST_EMAIL || 'e2e_admin@test.omnimap.ru',
  },
  editor: {
    username: process.env.E2E_EDITOR_USERNAME || 'e2e_editor',
    password: process.env.E2E_EDITOR_PASSWORD || 'e2e_editor_password',
    email: process.env.E2E_EDITOR_EMAIL || 'e2e_editor@test.omnimap.ru',
  },
  viewer: {
    username: process.env.E2E_VIEWER_USERNAME || 'e2e_viewer',
    password: process.env.E2E_VIEWER_PASSWORD || 'e2e_viewer_password',
    email: process.env.E2E_VIEWER_EMAIL || 'e2e_viewer@test.omnimap.ru',
  },
};

// Пути к файлам авторизации
const AUTH_FILE = 'e2e/.auth/user.json';
const AUTH_FILE_CLOUD = 'e2e/.auth/cloud-user.json';

/**
 * Определяем окружение
 */
export const isCloudEnv = () =>
  process.env.E2E_ENV === 'cloud' ||
  process.env.PLAYWRIGHT_BASE_URL?.includes('omnimap.cloud.ru');

/**
 * Получить путь к файлу авторизации
 */
export const getAuthFile = () => isCloudEnv() ? AUTH_FILE_CLOUD : AUTH_FILE;

/**
 * Интерфейс для отслеживания созданных тестовых данных
 */
interface TestDataTracker {
  createdBlockIds: string[];
  createdTreeIds: string[];
  testTreeId: string | null;
}

/**
 * Хелпер для работы с IndexedDB
 */
export class IndexedDBHelper {
  constructor(private page: Page) {}

  /**
   * Получить значение из IndexedDB через localforage
   */
  async get<T>(key: string): Promise<T | null> {
    return await this.page.evaluate(async (k) => {
      const localforage = (window as any).localforage;
      if (!localforage) return null;
      return await localforage.getItem(k);
    }, key);
  }

  /**
   * Установить значение в IndexedDB через localforage
   */
  async set(key: string, value: any): Promise<void> {
    await this.page.evaluate(
      async ({ k, v }) => {
        const localforage = (window as any).localforage;
        if (!localforage) return;
        await localforage.setItem(k, v);
      },
      { k: key, v: value }
    );
  }

  /**
   * Удалить значение из IndexedDB
   */
  async remove(key: string): Promise<void> {
    await this.page.evaluate(async (k) => {
      const localforage = (window as any).localforage;
      if (!localforage) return;
      await localforage.removeItem(k);
    }, key);
  }

  /**
   * Получить все ключи из IndexedDB
   */
  async keys(): Promise<string[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];
      return await localforage.keys();
    });
  }

  /**
   * Очистить все данные из IndexedDB, кроме авторизации
   */
  async clearAllExceptAuth(): Promise<void> {
    await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return;

      const keys = await localforage.keys();
      const keysToPreserve = ['currentUser'];

      for (const key of keys) {
        // Сохраняем авторизационные данные
        if (keysToPreserve.includes(key)) continue;
        // Сохраняем treeIds (чтобы не потерять структуру деревьев)
        if (key.startsWith('treeIds')) continue;
        // Удаляем всё остальное
        await localforage.removeItem(key);
      }
    });
  }

  /**
   * Получить все блоки из IndexedDB
   */
  async getAllBlocks(): Promise<any[]> {
    return await this.page.evaluate(async () => {
      const localforage = (window as any).localforage;
      if (!localforage) return [];

      const keys = await localforage.keys();
      const blockKeys = keys.filter((k: string) => k.startsWith('Block_'));
      const blocks: any[] = [];

      for (const key of blockKeys) {
        const block = await localforage.getItem(key);
        if (block) blocks.push(block);
      }

      return blocks;
    });
  }

  /**
   * Удалить блок из IndexedDB по ID
   */
  async removeBlock(blockId: string): Promise<void> {
    await this.remove(`Block_${blockId}`);
  }

  /**
   * Получить текущего пользователя
   */
  async getCurrentUser(): Promise<string | null> {
    return await this.get<string>('currentUser');
  }

  /**
   * Получить treeIds текущего пользователя
   */
  async getTreeIds(): Promise<string[] | null> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) return null;
    return await this.get<string[]>(`treeIds${currentUser}`);
  }
}

/**
 * Хелпер для очистки тестовых данных
 */
export class TestCleanupHelper {
  constructor(
    private page: Page,
    private indexedDB: IndexedDBHelper,
    private apiHelper: ApiHelper
  ) {}

  /**
   * Создать новое тестовое дерево для изоляции тестов
   */
  async createTestTree(name: string): Promise<string> {
    // Нажимаем кнопку добавления дерева
    const addButton = this.page.locator('[data-testid="tree-add-button"]');

    if (await addButton.isVisible()) {
      await addButton.click();

      // Ждём диалога ввода названия
      const dialogInput = this.page.locator('[data-testid="custom-dialog-input"]');
      await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
      await dialogInput.fill(name);
      await this.page.locator('[data-testid="custom-dialog-ok-btn"]').click();

      // Ждём создания дерева
      await this.page.waitForTimeout(1000);

      // Получаем ID созданного дерева из IndexedDB
      const treeIds = await this.indexedDB.getTreeIds();
      if (treeIds && treeIds.length > 0) {
        return treeIds[treeIds.length - 1];
      }
    }

    return '';
  }

  /**
   * Переключиться на дерево по ID
   */
  async switchToTree(treeId: string): Promise<void> {
    const treeButton = this.page.locator(`[data-testid="tree-button-${treeId}"]`);
    if (await treeButton.isVisible()) {
      await treeButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Удалить дерево по ID через UI (открыть контекстное меню и удалить)
   */
  async deleteTree(treeId: string): Promise<void> {
    const treeButton = this.page.locator(`[data-testid="tree-button-${treeId}"]`);

    if (await treeButton.isVisible()) {
      // Правый клик для контекстного меню
      await treeButton.click({ button: 'right' });

      // Ждём появления контекстного меню
      await this.page.waitForTimeout(300);

      // Находим и кликаем кнопку удаления
      const deleteOption = this.page.locator('text=Удалить').or(this.page.locator('text=Delete'));
      if (await deleteOption.isVisible()) {
        await deleteOption.click();

        // Подтверждаем удаление если есть диалог
        const confirmBtn = this.page.locator('[data-testid="custom-dialog-ok-btn"]');
        if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmBtn.click();
        }

        await this.page.waitForTimeout(500);
      }
    }
  }

  /**
   * Удалить все блоки внутри текущего дерева (кроме корневого)
   * Использует UI для безопасного удаления
   */
  async deleteAllBlocksInCurrentTree(): Promise<void> {
    // Получаем все видимые блоки
    const blocks = this.page.locator('#rootContainer [block]');
    const count = await blocks.count();

    // Удаляем блоки по одному, начиная с последнего
    for (let i = count - 1; i >= 0; i--) {
      const block = blocks.nth(i);

      if (await block.isVisible()) {
        // Кликаем на блок для выделения
        await block.click();
        await this.page.waitForTimeout(200);

        // Удаляем через Shift+D
        await this.page.keyboard.down('Shift');
        await this.page.keyboard.press('d');
        await this.page.keyboard.up('Shift');

        await this.page.waitForTimeout(300);
      }
    }
  }

  /**
   * Полная очистка после тестов
   */
  async fullCleanup(testTreeId?: string): Promise<void> {
    if (testTreeId) {
      await this.deleteTree(testTreeId);
    }

    // Очищаем IndexedDB от тестовых данных
    await this.indexedDB.clearAllExceptAuth();
  }
}

/**
 * Типы для fixtures
 */
type BaseFixtures = {
  /** MainPage без авторизации */
  mainPage: MainPage;
  /** MainPage с авторизацией */
  authenticatedPage: MainPage;
  /** API хелпер */
  apiHelper: ApiHelper;
  /** IndexedDB хелпер */
  indexedDB: IndexedDBHelper;
  /** Offline хелпер */
  offlineHelper: OfflineHelper;
  /** Cleanup хелпер */
  cleanup: TestCleanupHelper;
  /** Трекер тестовых данных */
  testData: TestDataTracker;
};

/**
 * Базовый fixture для всех E2E тестов
 */
export const test = base.extend<BaseFixtures>({
  /**
   * MainPage без авторизации - для тестов формы логина
   */
  mainPage: async ({ page, context }, use) => {
    await context.clearCookies();
    const mainPage = new MainPage(page);
    await use(mainPage);
  },

  /**
   * MainPage с авторизацией
   * Использует storageState или выполняет логин
   */
  authenticatedPage: async ({ page }, use) => {
    const mainPage = new MainPage(page);

    // Переходим на главную
    await mainPage.goto();

    // Ждём начальной загрузки
    const loginFormVisible = await page
      .waitForSelector('#login-form', { state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (loginFormVisible) {
      // Форма логина видна → нужен логин
      await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
      await mainPage.assertLoginSuccess();
    } else {
      // Юзер уже залогинен
      await mainPage.waitForAppLoad();
    }

    // Ждём рендеринга блоков
    await mainPage.waitForShowedBlocks();

    await use(mainPage);
  },

  /**
   * API хелпер
   */
  apiHelper: async ({ page }, use) => {
    const helper = createApiHelper(page);
    await helper.startCapturing();

    await use(helper);

    helper.stopCapturing();
  },

  /**
   * IndexedDB хелпер
   */
  indexedDB: async ({ page }, use) => {
    const helper = new IndexedDBHelper(page);
    await use(helper);
  },

  /**
   * Offline хелпер
   */
  offlineHelper: async ({ page, context }, use) => {
    const helper = new OfflineHelper(page, context);
    await use(helper);
  },

  /**
   * Cleanup хелпер
   */
  cleanup: async ({ page, indexedDB, apiHelper }, use) => {
    const helper = new TestCleanupHelper(page, indexedDB, apiHelper);
    await use(helper);
  },

  /**
   * Трекер тестовых данных
   * Используется для отслеживания созданных данных и очистки после тестов
   */
  testData: async ({}, use) => {
    const tracker: TestDataTracker = {
      createdBlockIds: [],
      createdTreeIds: [],
      testTreeId: null,
    };
    await use(tracker);
  },
});

/**
 * Создать состояние сессии для переиспользования
 */
export async function createAuthState(page: Page, storageStatePath: string) {
  const mainPage = new MainPage(page);
  await mainPage.gotoAndLogin(TEST_USERS.admin.username, TEST_USERS.admin.password);
  await page.context().storageState({ path: storageStatePath });
}

/**
 * Хелпер для получения тестовых учётных данных
 */
export function getTestCredentials(userType: 'admin' | 'editor' | 'viewer' = 'admin') {
  return TEST_USERS[userType];
}

/**
 * Генератор уникальных идентификаторов для тестов
 */
export function uniqueId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Генератор уникальных названий для тестовых блоков
 */
export function uniqueBlockTitle(prefix: string = 'Test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Генератор уникальных названий для тестовых деревьев
 */
export function uniqueTreeName(prefix: string = 'TestTree'): string {
  return `${prefix}_${Date.now().toString(36)}`;
}

export { expect };
