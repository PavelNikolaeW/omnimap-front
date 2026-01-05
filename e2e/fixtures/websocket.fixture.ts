import { Page, test as base, expect } from '@playwright/test';

/**
 * Тип для захваченного WebSocket сообщения
 */
export interface CapturedWsMessage {
  type: string;
  data: any;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
}

/**
 * Хелпер для работы с WebSocket в E2E тестах
 *
 * Позволяет:
 * - Ждать подключения WebSocket
 * - Симулировать входящие сообщения
 * - Отслеживать исходящие сообщения
 * - Захватывать входящие сообщения для проверки
 * - Симулировать disconnect/reconnect
 */
export class WebSocketHelper {
  private capturedMessages: CapturedWsMessage[] = [];
  private isCapturing = false;

  constructor(private page: Page) {}

  /**
   * Ожидает установления WebSocket соединения
   */
  async waitForConnection(timeout = 10000): Promise<boolean> {
    try {
      await this.page.waitForFunction(
        () => {
          const sincManager = (window as any).sincManager;
          if (!sincManager || !sincManager.ws) return false;
          return sincManager.ws.readyState === WebSocket.OPEN;
        },
        { timeout }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Проверяет текущее состояние WebSocket
   */
  async isConnected(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      if (!sincManager || !sincManager.ws) return false;
      return sincManager.ws.readyState === WebSocket.OPEN;
    });
  }

  /**
   * Получает текущее состояние WebSocket (readyState)
   * 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
   */
  async getReadyState(): Promise<number> {
    return await this.page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      if (!sincManager || !sincManager.ws) return -1;
      return sincManager.ws.readyState;
    });
  }

  /**
   * Симулирует входящее сообщение от сервера
   * Полезно для тестирования обработки различных типов сообщений
   */
  async simulateIncomingMessage(message: object): Promise<void> {
    await this.page.evaluate((msg) => {
      const sincManager = (window as any).sincManager;
      if (!sincManager || !sincManager.ws) {
        console.warn('WebSocket not available for message simulation');
        return;
      }

      // Создаём MessageEvent и диспатчим его
      const event = new MessageEvent('message', {
        data: JSON.stringify(msg),
      });

      // Вызываем обработчик onmessage напрямую
      if (sincManager.ws.onmessage) {
        sincManager.ws.onmessage(event);
      }
    }, message);
  }

  /**
   * Симулирует обновление блока от другого клиента
   */
  async simulateBlockUpdate(blockId: string, updates: object): Promise<void> {
    await this.simulateIncomingMessage({
      type: 'block_update',
      block_id: blockId,
      data: updates,
    });
  }

  /**
   * Симулирует создание блока от другого клиента
   */
  async simulateBlockCreated(block: object): Promise<void> {
    await this.simulateIncomingMessage({
      type: 'block_created',
      block,
    });
  }

  /**
   * Симулирует удаление блока от другого клиента
   */
  async simulateBlockDeleted(blockId: string): Promise<void> {
    await this.simulateIncomingMessage({
      type: 'block_deleted',
      block_id: blockId,
    });
  }

  /**
   * Симулирует потерю соединения
   */
  async simulateDisconnect(): Promise<void> {
    await this.page.evaluate(() => {
      const sincManager = (window as any).sincManager;
      if (sincManager && sincManager.ws) {
        sincManager.ws.close();
      }
    });
  }

  /**
   * Ожидает переподключения после disconnect
   */
  async waitForReconnect(timeout = 15000): Promise<boolean> {
    // Сначала ждём disconnect
    await this.page.waitForFunction(
      () => {
        const sincManager = (window as any).sincManager;
        if (!sincManager || !sincManager.ws) return true;
        return sincManager.ws.readyState !== WebSocket.OPEN;
      },
      { timeout: 5000 }
    ).catch(() => {});

    // Затем ждём reconnect
    return await this.waitForConnection(timeout);
  }

  /**
   * Перехватывает исходящие WebSocket сообщения
   * Возвращает промис, который резолвится когда сообщение отправлено
   */
  async waitForOutgoingMessage(
    predicate: (msg: any) => boolean,
    timeout = 5000
  ): Promise<any> {
    return await this.page.evaluate(
      ({ predicateStr, timeout }) => {
        return new Promise((resolve, reject) => {
          const sincManager = (window as any).sincManager;
          if (!sincManager || !sincManager.ws) {
            reject(new Error('WebSocket not available'));
            return;
          }

          const originalSend = sincManager.ws.send.bind(sincManager.ws);
          const predicateFn = new Function('msg', `return (${predicateStr})(msg)`);

          const timeoutId = setTimeout(() => {
            sincManager.ws.send = originalSend;
            reject(new Error('Timeout waiting for outgoing message'));
          }, timeout);

          sincManager.ws.send = (data: string) => {
            originalSend(data);
            try {
              const msg = JSON.parse(data);
              if (predicateFn(msg)) {
                clearTimeout(timeoutId);
                sincManager.ws.send = originalSend;
                resolve(msg);
              }
            } catch {}
          };
        });
      },
      { predicateStr: predicate.toString(), timeout }
    );
  }

  /**
   * Начинает захват входящих WebSocket сообщений
   */
  async startCapturing(): Promise<void> {
    if (this.isCapturing) return;
    this.isCapturing = true;
    this.capturedMessages = [];

    await this.page.evaluate(() => {
      const win = window as any;
      if (win.__wsMessageCapture) return;

      win.__wsMessageCapture = {
        messages: [] as any[],
        originalHandler: null as any,
      };

      // Слушаем события WebSocUpdateBlock
      const captureHandler = (e: CustomEvent) => {
        win.__wsMessageCapture.messages.push({
          type: 'block_updates',
          data: e.detail,
          timestamp: Date.now(),
          direction: 'incoming',
        });
      };

      window.addEventListener('WebSocUpdateBlock', captureHandler as EventListener);
      win.__wsMessageCapture.cleanup = () => {
        window.removeEventListener('WebSocUpdateBlock', captureHandler as EventListener);
      };
    });
  }

  /**
   * Останавливает захват и очищает данные
   */
  async stopCapturing(): Promise<void> {
    this.isCapturing = false;
    this.capturedMessages = [];

    await this.page.evaluate(() => {
      const win = window as any;
      if (win.__wsMessageCapture?.cleanup) {
        win.__wsMessageCapture.cleanup();
      }
      delete win.__wsMessageCapture;
    });
  }

  /**
   * Возвращает все захваченные сообщения
   */
  async getCapturedMessages(): Promise<CapturedWsMessage[]> {
    const messages = await this.page.evaluate(() => {
      const win = window as any;
      return win.__wsMessageCapture?.messages || [];
    });
    return messages;
  }

  /**
   * Очищает захваченные сообщения
   */
  async clearCaptured(): Promise<void> {
    await this.page.evaluate(() => {
      const win = window as any;
      if (win.__wsMessageCapture) {
        win.__wsMessageCapture.messages = [];
      }
    });
    this.capturedMessages = [];
  }

  /**
   * Ожидает входящее сообщение типа block_updates с блоком
   */
  async waitForBlockUpdate(
    blockId: string,
    options: { timeout?: number } = {}
  ): Promise<any> {
    const { timeout = 10000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = await this.getCapturedMessages();
      const found = messages.find((msg) => {
        if (msg.type !== 'block_updates') return false;
        const updates = Array.isArray(msg.data) ? msg.data : [msg.data];
        return updates.some((update: any) => update?.id === blockId);
      });

      if (found) return found;
      await this.page.waitForTimeout(200);
    }

    throw new Error(`WebSocket update for block ${blockId} not received within ${timeout}ms`);
  }

  /**
   * Проверяет, что пришло обновление для блока
   */
  async assertBlockUpdateReceived(blockId: string, timeout = 10000): Promise<void> {
    const message = await this.waitForBlockUpdate(blockId, { timeout });
    expect(message).toBeDefined();
  }

  /**
   * Проверяет, что пришли обновления для нескольких блоков
   */
  async assertBlockUpdatesReceived(blockIds: string[], timeout = 10000): Promise<void> {
    const startTime = Date.now();
    const receivedIds = new Set<string>();

    while (Date.now() - startTime < timeout) {
      const messages = await this.getCapturedMessages();

      for (const msg of messages) {
        if (msg.type !== 'block_updates') continue;
        const updates = Array.isArray(msg.data) ? msg.data : [msg.data];
        for (const update of updates) {
          if (update?.id) receivedIds.add(update.id);
        }
      }

      const allReceived = blockIds.every((id) => receivedIds.has(id));
      if (allReceived) return;

      await this.page.waitForTimeout(200);
    }

    const missing = blockIds.filter((id) => !receivedIds.has(id));
    throw new Error(`WebSocket updates not received for blocks: ${missing.join(', ')}`);
  }
}

/**
 * Fixture с WebSocket хелпером
 */
type WebSocketFixtures = {
  wsHelper: WebSocketHelper;
};

export const test = base.extend<WebSocketFixtures>({
  wsHelper: async ({ page }, use) => {
    const helper = new WebSocketHelper(page);
    await use(helper);
  },
});

export { expect } from '@playwright/test';
