import { Page, Request, Response, expect } from '@playwright/test';

/**
 * Тип для API запроса
 */
export interface CapturedApiRequest {
  url: string;
  method: string;
  postData: any;
  headers: Record<string, string>;
  timestamp: number;
}

/**
 * Тип для API ответа
 */
export interface CapturedApiResponse {
  url: string;
  status: number;
  body: any;
  headers: Record<string, string>;
  timestamp: number;
}

/**
 * Хелпер для работы с API в E2E тестах
 *
 * Позволяет:
 * - Перехватывать исходящие API запросы
 * - Проверять, что определённый запрос был отправлен
 * - Ожидать ответ от API (используя native Playwright waitForResponse)
 * - Проверять payload запросов
 */
export class ApiHelper {
  private capturedRequests: CapturedApiRequest[] = [];
  private capturedResponses: CapturedApiResponse[] = [];
  private requestHandler: ((request: Request) => void) | null = null;
  private responseHandler: ((response: Response) => void) | null = null;
  private isListening = false;

  constructor(private page: Page) {}

  /**
   * Начинает перехват API запросов
   * @param pathPattern - Паттерн URL для фильтрации (regex или строка)
   */
  async startCapturing(pathPattern?: string | RegExp): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;
    this.capturedRequests = [];
    this.capturedResponses = [];

    this.requestHandler = (request: Request) => {
      const url = request.url();

      // Фильтруем только API запросы
      if (!url.includes('/api/v1/')) return;

      // Применяем паттерн если задан
      if (pathPattern) {
        const pattern = typeof pathPattern === 'string'
          ? new RegExp(pathPattern)
          : pathPattern;
        if (!pattern.test(url)) return;
      }

      let postData = null;
      try {
        const rawData = request.postData();
        postData = rawData ? JSON.parse(rawData) : null;
      } catch {
        postData = request.postData();
      }

      this.capturedRequests.push({
        url,
        method: request.method(),
        postData,
        headers: request.headers(),
        timestamp: Date.now(),
      });
    };

    this.responseHandler = async (response: Response) => {
      const url = response.url();

      // Фильтруем только API ответы
      if (!url.includes('/api/v1/')) return;

      // Применяем паттерн если задан
      if (pathPattern) {
        const pattern = typeof pathPattern === 'string'
          ? new RegExp(pathPattern)
          : pathPattern;
        if (!pattern.test(url)) return;
      }

      let body = null;
      try {
        body = await response.json();
      } catch {
        try {
          body = await response.text();
        } catch {
          body = null;
        }
      }

      this.capturedResponses.push({
        url,
        status: response.status(),
        body,
        headers: response.headers(),
        timestamp: Date.now(),
      });
    };

    this.page.on('request', this.requestHandler);
    this.page.on('response', this.responseHandler);
  }

  /**
   * Останавливает перехват и очищает данные
   */
  stopCapturing(): void {
    this.isListening = false;
    if (this.requestHandler) {
      this.page.removeListener('request', this.requestHandler);
      this.requestHandler = null;
    }
    if (this.responseHandler) {
      this.page.removeListener('response', this.responseHandler);
      this.responseHandler = null;
    }
    this.capturedRequests = [];
    this.capturedResponses = [];
  }

  /**
   * Возвращает все захваченные запросы
   */
  getRequests(): CapturedApiRequest[] {
    return [...this.capturedRequests];
  }

  /**
   * Возвращает все захваченные ответы
   */
  getResponses(): CapturedApiResponse[] {
    return [...this.capturedResponses];
  }

  /**
   * Очищает захваченные данные (без остановки перехвата)
   */
  clear(): void {
    this.capturedRequests = [];
    this.capturedResponses = [];
  }

  /**
   * Ищет запрос по URL паттерну
   */
  findRequest(urlPattern: string | RegExp): CapturedApiRequest | undefined {
    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;
    return this.capturedRequests.find(req => pattern.test(req.url));
  }

  /**
   * Ищет все запросы по URL паттерну
   */
  findAllRequests(urlPattern: string | RegExp): CapturedApiRequest[] {
    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;
    return this.capturedRequests.filter(req => pattern.test(req.url));
  }

  /**
   * Ищет ответ по URL паттерну
   */
  findResponse(urlPattern: string | RegExp): CapturedApiResponse | undefined {
    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;
    return this.capturedResponses.find(res => pattern.test(res.url));
  }

  /**
   * Проверяет, был ли отправлен запрос по паттерну
   */
  hasRequest(urlPattern: string | RegExp): boolean {
    return !!this.findRequest(urlPattern);
  }

  /**
   * Ожидает появления запроса по паттерну (использует polling по захваченным запросам)
   */
  async waitForRequest(
    urlPattern: string | RegExp,
    options: { timeout?: number; method?: string } = {}
  ): Promise<CapturedApiRequest> {
    const { timeout = 10000, method } = options;
    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const found = this.capturedRequests.find(req => {
        const urlMatch = pattern.test(req.url);
        const methodMatch = !method || req.method === method;
        return urlMatch && methodMatch;
      });

      if (found) return found;
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Request matching ${urlPattern} not found within ${timeout}ms. Captured ${this.capturedRequests.length} requests.`);
  }

  /**
   * Ожидает ответ от API (использует polling по захваченным ответам)
   */
  async waitForResponse(
    urlPattern: string | RegExp,
    options: { timeout?: number; status?: number } = {}
  ): Promise<CapturedApiResponse> {
    const { timeout = 10000, status } = options;
    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const found = this.capturedResponses.find(res => {
        const urlMatch = pattern.test(res.url);
        const statusMatch = !status || res.status === status;
        return urlMatch && statusMatch;
      });

      if (found) return found;
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Response matching ${urlPattern} not found within ${timeout}ms. Captured ${this.capturedResponses.length} responses.`);
  }

  /**
   * Использует native Playwright waitForResponse для более надёжного перехвата
   * Запускает действие и ждёт API ответ
   * ВАЖНО: responsePromise создаётся ДО выполнения action, чтобы не пропустить ответ
   */
  async expectApiCall<T>(
    urlPattern: string | RegExp,
    action: () => Promise<T>,
    options: { timeout?: number; method?: string } = {}
  ): Promise<{ result: T; request: Request; response: Response; body: any }> {
    const { timeout = 15000, method } = options;

    const pattern = typeof urlPattern === 'string'
      ? new RegExp(urlPattern)
      : urlPattern;

    // ВАЖНО: создаём promise ДО выполнения действия
    const responsePromise = this.page.waitForResponse(
      (response) => {
        const url = response.url();
        const req = response.request();
        const urlMatch = url.includes('/api/v1/') && pattern.test(url);
        const methodMatch = !method || req.method() === method;
        console.log(`[API] Response: ${req.method()} ${url} - match: ${urlMatch && methodMatch}`);
        return urlMatch && methodMatch;
      },
      { timeout }
    );

    // Выполняем действие в Promise.all чтобы гарантировать параллельное ожидание
    const [response, result] = await Promise.all([
      responsePromise,
      action()
    ]);

    const request = response.request();

    let body = null;
    try {
      body = await response.json();
    } catch {
      try {
        body = await response.text();
      } catch {
        body = null;
      }
    }

    return { result, request, response, body };
  }

  /**
   * Ожидает запрос на создание блока и возвращает данные
   * Использует native Playwright API для надёжности
   *
   * ВАЖНО: Приложение использует import API для создания блоков (batch операции через offlineQueue),
   * а не отдельные new-block запросы. Поэтому ждём либо import, либо new-block.
   */
  async waitForBlockCreate(
    action: () => Promise<void>,
    options: { timeout?: number } = {}
  ): Promise<{
    parentId: string;
    title: string;
    blockId: string;
    status: number;
  }> {
    const { timeout = 15000 } = options; // Увеличен таймаут

    // Приложение может использовать либо new-block/ напрямую, либо import/ для batch операций
    const { request, response, body } = await this.expectApiCall(
      /new-block\/|import\//,
      action,
      { timeout, method: 'POST' }
    );

    const url = request.url();

    // Для new-block извлекаем parentId из URL
    if (url.includes('new-block')) {
      const urlMatch = url.match(/new-block\/([^/]+)\//);
      const parentId = urlMatch ? urlMatch[1] : '';

      let postData = null;
      try {
        const rawData = request.postData();
        postData = rawData ? JSON.parse(rawData) : null;
      } catch {
        postData = null;
      }

      return {
        parentId,
        title: postData?.title || '',
        blockId: body?.id || '',
        status: response.status(),
      };
    }

    // Для import API извлекаем данные из payload
    let postData = null;
    try {
      const rawData = request.postData();
      postData = rawData ? JSON.parse(rawData) : null;
    } catch {
      postData = null;
    }

    // Import API возвращает task_id, блоки создаются асинхронно
    const firstBlock = postData?.payload?.[0];

    return {
      parentId: firstBlock?.parent_id || '',
      title: firstBlock?.title || '',
      blockId: firstBlock?.id || body?.task_id || '',
      status: response.status(),
    };
  }

  /**
   * Ожидает запрос на обновление блока
   * Приложение может использовать edit-block/ напрямую или import/ для batch операций
   */
  async waitForBlockUpdate(
    action: () => Promise<void>,
    options: { timeout?: number } = {}
  ): Promise<{
    blockId: string;
    data: any;
    status: number;
  }> {
    const { timeout = 15000 } = options;

    const { request, response } = await this.expectApiCall(
      /edit-block\/|import\//,
      action,
      { timeout, method: 'POST' }
    );

    const url = request.url();

    let postData = null;
    try {
      const rawData = request.postData();
      postData = rawData ? JSON.parse(rawData) : null;
    } catch {
      postData = null;
    }

    // Для edit-block извлекаем blockId из URL
    if (url.includes('edit-block')) {
      const urlMatch = url.match(/edit-block\/([^/]+)\//);
      const blockId = urlMatch ? urlMatch[1] : '';

      return {
        blockId,
        data: postData,
        status: response.status(),
      };
    }

    // Для import API извлекаем данные из payload
    const firstBlock = postData?.payload?.[0];

    return {
      blockId: firstBlock?.id || '',
      data: firstBlock || postData,
      status: response.status(),
    };
  }

  /**
   * Ожидает запрос на удаление блока/дерева
   */
  async waitForBlockDelete(
    action: () => Promise<void>,
    options: { timeout?: number } = {}
  ): Promise<{
    blockId: string;
    status: number;
  }> {
    const { timeout = 10000 } = options;

    const { request, response } = await this.expectApiCall(
      /delete-tree\//,
      action,
      { timeout, method: 'DELETE' }
    );

    // Извлекаем blockId из URL (delete-tree/{blockId}/)
    const urlMatch = request.url().match(/delete-tree\/([^/]+)\//);
    const blockId = urlMatch ? urlMatch[1] : '';

    return {
      blockId,
      status: response.status(),
    };
  }

  /**
   * Ожидает запрос на копирование блока
   */
  async waitForBlockCopy(
    action: () => Promise<void>,
    options: { timeout?: number } = {}
  ): Promise<{
    src: string[];
    dest: string;
    status: number;
  }> {
    const { timeout = 10000 } = options;

    const { request, response } = await this.expectApiCall(
      /copy-block/,
      action,
      { timeout, method: 'POST' }
    );

    let postData = null;
    try {
      const rawData = request.postData();
      postData = rawData ? JSON.parse(rawData) : null;
    } catch {
      postData = null;
    }

    return {
      src: postData?.src || [],
      dest: postData?.dest || '',
      status: response.status(),
    };
  }

  // === Backward compatible methods ===

  /**
   * Ожидает запрос на создание блока и возвращает данные (polling version)
   */
  async waitForBlockCreateRequest(timeout = 10000): Promise<{
    parentId: string;
    title: string;
    response: CapturedApiResponse;
  }> {
    const request = await this.waitForRequest(/new-block\//, { timeout, method: 'POST' });
    const response = await this.waitForResponse(/new-block\//, { timeout });

    // Извлекаем parentId из URL (new-block/{parentId}/)
    const urlMatch = request.url.match(/new-block\/([^/]+)\//);
    const parentId = urlMatch ? urlMatch[1] : '';

    return {
      parentId,
      title: request.postData?.title || '',
      response,
    };
  }

  /**
   * Ожидает запрос на обновление блока (polling version)
   */
  async waitForBlockUpdateRequest(timeout = 10000): Promise<{
    blockId: string;
    data: any;
    response: CapturedApiResponse;
  }> {
    const request = await this.waitForRequest(/edit-block\//, { timeout, method: 'POST' });
    const response = await this.waitForResponse(/edit-block\//, { timeout });

    // Извлекаем blockId из URL (edit-block/{blockId}/)
    const urlMatch = request.url.match(/edit-block\/([^/]+)\//);
    const blockId = urlMatch ? urlMatch[1] : '';

    return {
      blockId,
      data: request.postData,
      response,
    };
  }

  /**
   * Ожидает запрос на удаление блока/дерева (polling version)
   */
  async waitForBlockDeleteRequest(timeout = 10000): Promise<{
    blockId: string;
    response: CapturedApiResponse;
  }> {
    const request = await this.waitForRequest(/delete-tree\//, { timeout, method: 'DELETE' });
    const response = await this.waitForResponse(/delete-tree\//, { timeout });

    // Извлекаем blockId из URL (delete-tree/{blockId}/)
    const urlMatch = request.url.match(/delete-tree\/([^/]+)\//);
    const blockId = urlMatch ? urlMatch[1] : '';

    return {
      blockId,
      response,
    };
  }

  /**
   * Ожидает запрос на копирование блока (polling version)
   */
  async waitForBlockCopyRequest(timeout = 10000): Promise<{
    src: string[];
    dest: string;
    response: CapturedApiResponse;
  }> {
    const request = await this.waitForRequest(/copy-block/, { timeout, method: 'POST' });
    const response = await this.waitForResponse(/copy-block/, { timeout });

    return {
      src: request.postData?.src || [],
      dest: request.postData?.dest || '',
      response,
    };
  }

  /**
   * Проверяет, что запрос на создание блока был отправлен с правильными данными
   */
  async assertBlockCreated(expectedTitle: string, timeout = 10000): Promise<void> {
    const { title, response } = await this.waitForBlockCreateRequest(timeout);

    expect(title).toBe(expectedTitle);
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
  }

  /**
   * Проверяет, что блок был обновлён
   */
  async assertBlockUpdated(expectedBlockId: string, timeout = 10000): Promise<void> {
    const { blockId, response } = await this.waitForBlockUpdateRequest(timeout);

    expect(blockId).toBe(expectedBlockId);
    expect(response.status).toBe(200);
  }

  /**
   * Проверяет, что блок был удалён
   */
  async assertBlockDeleted(expectedBlockId: string, timeout = 10000): Promise<void> {
    const { blockId, response } = await this.waitForBlockDeleteRequest(timeout);

    expect(blockId).toBe(expectedBlockId);
    expect(response.status).toBe(200);
  }
}

/**
 * Фабрика для создания ApiHelper
 */
export function createApiHelper(page: Page): ApiHelper {
  return new ApiHelper(page);
}
