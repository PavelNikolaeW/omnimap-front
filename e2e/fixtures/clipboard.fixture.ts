import { Page, BrowserContext } from '@playwright/test';

/**
 * ClipboardHelper - работа с буфером обмена в E2E тестах
 *
 * Особенности работы с clipboard в Playwright:
 * - Требуются разрешения: clipboard-read, clipboard-write
 * - Разрешения настраиваются через test.use({ permissions: [...] })
 * - navigator.clipboard API работает только в secure context
 *
 * Форматы данных в OmniMap:
 * - Одиночный блок: просто UUID (string)
 * - Множественный выбор: JSON.stringify(['uuid1', 'uuid2'])
 */
export class ClipboardHelper {
  constructor(private page: Page) {}

  /**
   * Записать текст в буфер обмена через navigator.clipboard
   */
  async writeText(text: string): Promise<boolean> {
    return await this.page.evaluate(async (content) => {
      try {
        await navigator.clipboard.writeText(content);
        return true;
      } catch (error) {
        console.error('Clipboard write failed:', error);
        return false;
      }
    }, text);
  }

  /**
   * Прочитать текст из буфера обмена
   */
  async readText(): Promise<string | null> {
    return await this.page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (error) {
        console.error('Clipboard read failed:', error);
        return null;
      }
    });
  }

  /**
   * Записать один UUID блока
   */
  async writeBlockId(blockId: string): Promise<boolean> {
    // Убираем parent prefix если есть (parentId*blockId -> blockId)
    const cleanId = blockId.split('*').at(-1) || blockId;
    return await this.writeText(cleanId);
  }

  /**
   * Записать массив UUID блоков (для multi-selection)
   */
  async writeBlockIds(blockIds: string[]): Promise<boolean> {
    const cleanIds = blockIds.map(id => id.split('*').at(-1) || id);
    return await this.writeText(JSON.stringify(cleanIds));
  }

  /**
   * Прочитать UUID блока из буфера
   * Поддерживает и одиночный ID и JSON массив
   */
  async readBlockId(): Promise<string | null> {
    const text = await this.readText();
    if (!text) return null;

    // Попробуем распарсить как JSON массив
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0];
      }
    } catch {
      // Не JSON - возвращаем как есть (одиночный ID)
    }

    return text;
  }

  /**
   * Прочитать массив UUID блоков из буфера
   * Если одиночный ID - возвращает массив из одного элемента
   */
  async readBlockIds(): Promise<string[]> {
    const text = await this.readText();
    if (!text) return [];

    // Попробуем распарсить как JSON массив
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // Не JSON - одиночный ID
    }

    return [text];
  }

  /**
   * Очистить буфер обмена
   */
  async clear(): Promise<boolean> {
    return await this.writeText('');
  }

  /**
   * Проверить что буфер пуст
   */
  async isEmpty(): Promise<boolean> {
    const text = await this.readText();
    return !text || text.trim() === '';
  }

  /**
   * Проверить что буфер содержит валидный UUID
   */
  async containsValidUUID(): Promise<boolean> {
    const text = await this.readText();
    if (!text) return false;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Проверяем как одиночный UUID
    if (uuidRegex.test(text)) return true;

    // Проверяем как JSON массив UUID
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.some(id => uuidRegex.test(id));
      }
    } catch {
      // Не JSON
    }

    return false;
  }

  /**
   * Получить количество UUID в буфере
   */
  async getBlockIdCount(): Promise<number> {
    const ids = await this.readBlockIds();
    return ids.length;
  }

  /**
   * Записать невалидные данные (для негативных тестов)
   */
  async writeInvalidData(type: 'empty' | 'random' | 'invalid-json' | 'invalid-uuids'): Promise<boolean> {
    switch (type) {
      case 'empty':
        return await this.writeText('');
      case 'random':
        return await this.writeText('random-text-not-uuid');
      case 'invalid-json':
        return await this.writeText('[invalid json');
      case 'invalid-uuids':
        return await this.writeText(JSON.stringify(['not-a-uuid', 'also-not-uuid']));
      default:
        return false;
    }
  }

  /**
   * Скопировать ID блока через hotkey (shift+c)
   * Предполагает что блок уже активен (hover/select)
   */
  async copyViaHotkey(): Promise<void> {
    await this.page.keyboard.press('Shift+c');
    await this.page.waitForTimeout(300);
  }

  /**
   * Вставить из буфера через hotkey (shift+v)
   */
  async pasteViaHotkey(): Promise<void> {
    await this.page.keyboard.press('Shift+v');
    await this.page.waitForTimeout(500);
  }

  /**
   * Вставить как ссылку через hotkey (shift+g)
   */
  async pasteLinkViaHotkey(): Promise<void> {
    await this.page.keyboard.press('Shift+g');
    await this.page.waitForTimeout(500);
  }

  /**
   * Дождаться пока буфер содержит определённый текст
   */
  async waitForContent(expectedContent: string, timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const content = await this.readText();
      if (content === expectedContent) {
        return true;
      }
      await this.page.waitForTimeout(100);
    }

    return false;
  }

  /**
   * Дождаться пока буфер содержит валидный UUID
   */
  async waitForValidUUID(timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.containsValidUUID()) {
        return true;
      }
      await this.page.waitForTimeout(100);
    }

    return false;
  }

  /**
   * Сравнить содержимое буфера с ожидаемым (с учётом формата)
   */
  async verifyContent(expected: string | string[]): Promise<boolean> {
    const content = await this.readText();
    if (!content) return expected === '' || (Array.isArray(expected) && expected.length === 0);

    if (Array.isArray(expected)) {
      // Ожидаем JSON массив
      const ids = await this.readBlockIds();
      if (ids.length !== expected.length) return false;
      return expected.every((id, i) => ids[i] === id);
    } else {
      // Ожидаем одиночный ID
      return content === expected;
    }
  }
}

/**
 * Настройка разрешений clipboard для контекста браузера
 * Вызывать перед созданием страниц
 */
export async function setupClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}
