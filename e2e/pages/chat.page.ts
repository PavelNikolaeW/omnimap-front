import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object для чата и групповых чатов
 *
 * Функции чата:
 * - Открытие/закрытие чата
 * - Отправка сообщений
 * - Получение ответов от LLM
 * - Создание групповых чатов
 * - Приглашение участников
 */
export class ChatPage extends BasePage {
  // Основные элементы
  readonly chatRoot: Locator;
  readonly chatContainer: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messagesList: Locator;
  readonly closeButton: Locator;

  // Групповой чат
  readonly groupChatButton: Locator;
  readonly participantsList: Locator;
  readonly inviteButton: Locator;
  readonly inviteInput: Locator;

  // Индикаторы
  readonly typingIndicator: Locator;
  readonly connectionStatus: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);

    // Корневой контейнер чата
    this.chatRoot = page.locator('#fullscreen-chat-root, [data-testid="chat-root"]');
    this.chatContainer = page.locator('.chat-container, [data-testid="chat-container"]');

    // Поле ввода и кнопка отправки
    this.messageInput = page.locator(
      '.chat-input, [data-testid="chat-input"], textarea[placeholder*="сообщение" i]'
    );
    this.sendButton = page.locator('.chat-send-btn, [data-testid="chat-send"], button:has(.fa-paper-plane)');

    // Список сообщений
    this.messagesList = page.locator('.chat-messages, [data-testid="chat-messages"]');

    // Кнопка закрытия
    this.closeButton = page.locator('.chat-close, [data-testid="chat-close"]');

    // Групповой чат
    this.groupChatButton = page.locator('.group-chat-btn, [data-testid="group-chat-btn"]');
    this.participantsList = page.locator('.participants-list, [data-testid="participants-list"]');
    this.inviteButton = page.locator('.invite-btn, [data-testid="invite-btn"]');
    this.inviteInput = page.locator('.invite-input, [data-testid="invite-input"]');

    // Индикаторы
    this.typingIndicator = page.locator('.typing-indicator, [data-testid="typing-indicator"]');
    this.connectionStatus = page.locator('.chat-connection-status');
    this.errorMessage = page.locator('.chat-error, [data-testid="chat-error"]');
  }

  /**
   * Открывает чат через хоткей Shift+H
   */
  async open(): Promise<void> {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.press('h');
    await this.page.keyboard.up('Shift');

    await expect(this.chatRoot).toBeVisible({ timeout: 5000 });
  }

  /**
   * Закрывает чат через хоткей Shift+H
   */
  async close(): Promise<void> {
    await this.page.keyboard.down('Shift');
    await this.page.keyboard.press('h');
    await this.page.keyboard.up('Shift');

    await expect(this.chatRoot).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Закрывает чат через кнопку
   */
  async closeByButton(): Promise<void> {
    if (await this.closeButton.isVisible()) {
      await this.closeButton.click();
      await expect(this.chatRoot).not.toBeVisible({ timeout: 3000 });
    } else {
      await this.close();
    }
  }

  /**
   * Отправляет сообщение
   */
  async sendMessage(message: string): Promise<void> {
    await expect(this.messageInput).toBeVisible();
    await this.messageInput.fill(message);
    await this.sendButton.click();
  }

  /**
   * Отправляет сообщение через Enter
   */
  async sendMessageByEnter(message: string): Promise<void> {
    await expect(this.messageInput).toBeVisible();
    await this.messageInput.fill(message);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Получает все сообщения
   */
  getMessages(): Locator {
    return this.messagesList.locator('.chat-message, [data-testid^="chat-message"]');
  }

  /**
   * Получает количество сообщений
   */
  async getMessagesCount(): Promise<number> {
    return await this.getMessages().count();
  }

  /**
   * Получает последнее сообщение
   */
  getLastMessage(): Locator {
    return this.getMessages().last();
  }

  /**
   * Получает текст последнего сообщения
   */
  async getLastMessageText(): Promise<string> {
    const lastMessage = this.getLastMessage();
    return (await lastMessage.textContent()) || '';
  }

  /**
   * Ожидает ответа от LLM (появления нового сообщения)
   */
  async waitForResponse(timeout = 30000): Promise<void> {
    const initialCount = await this.getMessagesCount();

    await this.page.waitForFunction(
      (count) => {
        const messages = document.querySelectorAll('.chat-message, [data-testid^="chat-message"]');
        return messages.length > count;
      },
      initialCount,
      { timeout }
    );
  }

  /**
   * Ожидает завершения стриминга ответа
   */
  async waitForStreamComplete(timeout = 60000): Promise<void> {
    // Ждём пока индикатор typing исчезнет
    await this.page.waitForFunction(
      () => {
        const indicator = document.querySelector('.typing-indicator, [data-testid="typing-indicator"]');
        return !indicator || (indicator as HTMLElement).style.display === 'none';
      },
      { timeout }
    );
  }

  /**
   * Проверяет, что typing индикатор виден
   */
  async assertTyping(): Promise<void> {
    await expect(this.typingIndicator).toBeVisible();
  }

  /**
   * Проверяет, что чат открыт
   */
  async assertOpen(): Promise<void> {
    await expect(this.chatRoot).toBeVisible();
  }

  /**
   * Проверяет, что чат закрыт
   */
  async assertClosed(): Promise<void> {
    await expect(this.chatRoot).not.toBeVisible();
  }

  // ===================== Групповой чат =====================

  /**
   * Открывает панель группового чата
   */
  async openGroupChat(): Promise<void> {
    if (await this.groupChatButton.isVisible()) {
      await this.groupChatButton.click();
      await expect(this.participantsList).toBeVisible({ timeout: 3000 });
    }
  }

  /**
   * Приглашает участника в групповой чат
   */
  async inviteParticipant(username: string): Promise<void> {
    if (await this.inviteButton.isVisible()) {
      await this.inviteButton.click();
      await expect(this.inviteInput).toBeVisible();
      await this.inviteInput.fill(username);
      await this.page.keyboard.press('Enter');
    }
  }

  /**
   * Получает количество участников
   */
  async getParticipantsCount(): Promise<number> {
    const participants = this.participantsList.locator('.participant, [data-testid^="participant"]');
    return await participants.count();
  }

  /**
   * Проверяет, что участник присутствует
   */
  async assertParticipantExists(username: string): Promise<void> {
    const participant = this.participantsList.locator(`:has-text("${username}")`);
    await expect(participant).toBeVisible();
  }

  // ===================== Ошибки и статус =====================

  /**
   * Проверяет, что показывается ошибка
   */
  async assertErrorVisible(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Получает текст ошибки
   */
  async getErrorText(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }

  /**
   * Очищает историю чата (если доступно)
   */
  async clearHistory(): Promise<void> {
    const clearBtn = this.page.locator('.clear-chat-btn, [data-testid="clear-chat"]');
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await this.page.waitForTimeout(500);
    }
  }
}
