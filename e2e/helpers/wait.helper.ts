import { Page, expect } from '@playwright/test';

/**
 * Вспомогательные функции для ожидания различных условий
 */
export class WaitHelper {
  constructor(private page: Page) {}

  /**
   * Ожидает загрузки приложения
   */
  async forAppLoad(timeout = 10000): Promise<void> {
    const rootContainer = this.page.locator('#rootContainer');
    await expect(rootContainer).toBeVisible({ timeout });

    const controlPanel = this.page.locator('#control-panel');
    await expect(controlPanel).toBeVisible({ timeout: 5000 });
  }

  /**
   * Ожидает завершения сетевых запросов
   */
  async forNetworkIdle(timeout = 5000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Ожидает появления диалога
   */
  async forDialog(timeout = 5000): Promise<void> {
    const dialog = this.page.locator('[data-testid="custom-dialog"]');
    await expect(dialog).toBeVisible({ timeout });
  }

  /**
   * Ожидает закрытия диалога
   */
  async forDialogClosed(timeout = 3000): Promise<void> {
    const dialog = this.page.locator('[data-testid="custom-dialog"]');
    await expect(dialog).not.toBeVisible({ timeout });
  }

  /**
   * Ожидает появления блока с названием
   */
  async forBlockWithTitle(title: string, timeout = 5000): Promise<void> {
    const block = this.page.locator(`[block] titleBlock:has-text("${title}")`);
    await expect(block).toBeVisible({ timeout });
  }

  /**
   * Ожидает обновления UI после действия
   */
  async forUIUpdate(ms = 500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Ожидает WebSocket соединения
   */
  async forWebSocketConnection(timeout = 10000): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        () => {
          const sincManager = (window as any).sincManager;
          return sincManager?.ws?.readyState === WebSocket.OPEN;
        },
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ожидает появления индикатора offline
   */
  async forOfflineIndicator(timeout = 5000): Promise<void> {
    const indicator = this.page.locator('.network-status.offline');
    await expect(indicator).toBeVisible({ timeout });
  }

  /**
   * Ожидает сохранения данных в IndexedDB
   */
  async forIndexedDBSave(key: string, timeout = 5000): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        async (k) => {
          const localforage = (window as any).localforage;
          if (!localforage) return false;
          const value = await localforage.getItem(k);
          return value !== null;
        },
        key,
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ожидает завершения анимации
   */
  async forAnimationEnd(selector: string, timeout = 2000): Promise<void> {
    const element = this.page.locator(selector);
    await element.evaluate((el) => {
      return new Promise<void>((resolve) => {
        const onEnd = () => {
          el.removeEventListener('animationend', onEnd);
          el.removeEventListener('transitionend', onEnd);
          resolve();
        };
        el.addEventListener('animationend', onEnd);
        el.addEventListener('transitionend', onEnd);
        // Fallback timeout
        setTimeout(resolve, 1000);
      });
    });
  }
}

/**
 * Фабрика для создания WaitHelper
 */
export function createWaitHelper(page: Page): WaitHelper {
  return new WaitHelper(page);
}
