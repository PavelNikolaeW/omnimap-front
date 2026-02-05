import { Page, expect } from '@playwright/test';

/**
 * AppModeHelper - управление режимами приложения в E2E тестах
 *
 * Режимы приложения OmniMap:
 * - NORMAL: 'normal' - обычный режим навигации
 * - TEXT_EDIT: 'textEdit' - редактирование текста блока
 * - CONNECT_TO_BLOCK: 'connectToBlock' - создание соединения
 * - CONNECT_SELECT_SOURCE: 'connectSelectSource' - выбор источника соединения
 * - CUT_BLOCK: 'cutBlock' - вырезание блока
 * - DIAGRAM: 'diagram' - режим диаграммы
 * - CHAT: 'chat' - режим чата
 * - ADD_TO_FOCUS: 'addToFocus' - добавление блока в фокус
 *
 * Режим хранится в contextManager.mode
 */

export const MODES = {
  NORMAL: 'normal',
  TEXT_EDIT: 'textEdit',
  CONNECT_TO_BLOCK: 'connectToBlock',
  CONNECT_SELECT_SOURCE: 'connectSelectSource',
  CUT_BLOCK: 'cutBlock',
  DIAGRAM: 'diagram',
  CHAT: 'chat',
  ADD_TO_FOCUS: 'addToFocus'
} as const;

export type AppMode = typeof MODES[keyof typeof MODES];

export class AppModeHelper {
  constructor(private page: Page) {}

  /**
   * Получить текущий режим приложения
   */
  async getCurrentMode(): Promise<AppMode> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      return ctx?.mode || 'normal';
    });
  }

  /**
   * Проверить что приложение в режиме NORMAL
   */
  async isNormalMode(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === MODES.NORMAL;
  }

  /**
   * Проверить что приложение в режиме редактирования текста
   */
  async isTextEditMode(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === MODES.TEXT_EDIT;
  }

  /**
   * Проверить что приложение в режиме диаграммы
   */
  async isDiagramMode(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === MODES.DIAGRAM;
  }

  /**
   * Проверить что приложение в режиме вырезания
   */
  async isCutMode(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === MODES.CUT_BLOCK;
  }

  /**
   * Проверить что приложение в режиме создания соединения
   */
  async isConnectMode(): Promise<boolean> {
    const mode = await this.getCurrentMode();
    return mode === MODES.CONNECT_TO_BLOCK || mode === MODES.CONNECT_SELECT_SOURCE;
  }

  /**
   * Сбросить режим в NORMAL через Escape
   * Делает несколько попыток если первая не сработала
   */
  async resetToNormalMode(maxAttempts: number = 3): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const currentMode = await this.getCurrentMode();

      if (currentMode === MODES.NORMAL) {
        return true;
      }

      // Escape для выхода из режима
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(200);

      // Проверяем результат
      const newMode = await this.getCurrentMode();
      if (newMode === MODES.NORMAL) {
        return true;
      }
    }

    // После всех попыток проверяем финальное состояние
    return await this.isNormalMode();
  }

  /**
   * Принудительно установить режим через contextManager (API-based)
   * Используется когда Escape не работает
   */
  async forceSetMode(mode: AppMode): Promise<void> {
    await this.page.evaluate((targetMode) => {
      const ctx = (window as any).contextManager;
      if (ctx) {
        ctx.mode = targetMode;
      }
    }, mode);
    await this.page.waitForTimeout(100);
  }

  /**
   * Дождаться определённого режима
   */
  async waitForMode(expectedMode: AppMode, timeout: number = 5000): Promise<void> {
    await this.page.waitForFunction(
      (mode) => {
        const ctx = (window as any).contextManager;
        return ctx?.mode === mode;
      },
      expectedMode,
      { timeout }
    );
  }

  /**
   * Дождаться режима NORMAL
   */
  async waitForNormalMode(timeout: number = 5000): Promise<void> {
    await this.waitForMode(MODES.NORMAL, timeout);
  }

  /**
   * Выполнить действие и вернуться в NORMAL режим
   * Полезно для операций типа shift+c, shift+v которые могут оставить приложение в другом режиме
   */
  async executeAndReset<T>(action: () => Promise<T>): Promise<T> {
    const result = await action();

    // Небольшая пауза для завершения action
    await this.page.waitForTimeout(100);

    // Сброс в NORMAL если нужно
    await this.resetToNormalMode();

    return result;
  }

  /**
   * Выполнить хоткей и сбросить режим
   */
  async pressHotkeyAndReset(hotkey: string): Promise<void> {
    await this.executeAndReset(async () => {
      await this.page.keyboard.press(hotkey);
      await this.page.waitForTimeout(300);
    });
  }

  /**
   * Проверить и залогировать текущий режим (для дебага)
   */
  async logCurrentMode(): Promise<AppMode> {
    const mode = await this.getCurrentMode();
    console.log(`[AppModeHelper] Current mode: ${mode}`);
    return mode;
  }

  /**
   * Утверждение что приложение в режиме NORMAL
   */
  async expectNormalMode(): Promise<void> {
    const mode = await this.getCurrentMode();
    expect(mode).toBe(MODES.NORMAL);
  }

  /**
   * Утверждение что приложение в указанном режиме
   */
  async expectMode(expectedMode: AppMode): Promise<void> {
    const mode = await this.getCurrentMode();
    expect(mode).toBe(expectedMode);
  }

  /**
   * Получить информацию о состоянии cut (вырезанного блока)
   */
  async getCutState(): Promise<{ hasCut: boolean; cutId?: string; isMultiple: boolean }> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (!ctx) return { hasCut: false, isMultiple: false };

      return {
        hasCut: !!ctx.cut,
        cutId: ctx.cut?.id,
        isMultiple: ctx.cutIsMultiple || false
      };
    });
  }

  /**
   * Очистить состояние cut
   */
  async clearCutState(): Promise<void> {
    await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      if (ctx) {
        ctx.cut = undefined;
        ctx.cutIsMultiple = false;
      }
    });
  }

  /**
   * Проверить активен ли popup
   */
  async hasActivePopup(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const ctx = (window as any).contextManager;
      return !!ctx?.popup;
    });
  }

  /**
   * Закрыть активный popup
   */
  async closeActivePopup(): Promise<void> {
    const hasPopup = await this.hasActivePopup();
    if (hasPopup) {
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(200);
    }
  }
}
