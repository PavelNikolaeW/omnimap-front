import { Page, Locator, expect } from '@playwright/test';
import path from 'path';

/**
 * Page Object для попапа загрузки изображений (ImageUploadPopup)
 *
 * Инкапсулирует логику работы с загрузкой изображений:
 * - Drag & Drop
 * - Выбор файла
 * - Превью
 * - Удаление
 */
export class ImageUploadPopup {
  readonly page: Page;
  readonly popup: Locator;
  readonly dropzone: Locator;
  readonly fileInput: Locator;
  readonly preview: Locator;
  readonly thumbnail: Locator;
  readonly progressBar: Locator;
  readonly deleteButton: Locator;
  readonly errorMessage: Locator;
  readonly fullsizeOverlay: Locator;

  constructor(page: Page) {
    this.page = page;

    // Контейнер попапа
    this.popup = page.locator('.image-upload-container, [data-testid="image-upload-popup"]');

    // Dropzone для drag & drop
    this.dropzone = page.locator(
      '[data-testid="image-upload-dropzone"], .image-upload-dropzone, .dropzone'
    );

    // Скрытый input для файлов
    this.fileInput = page.locator('input[type="file"]');

    // Превью загруженного изображения
    this.preview = page.locator(
      '[data-testid="image-upload-preview"], .image-upload-preview, .image-preview'
    );

    // Thumbnail изображения
    this.thumbnail = page.locator('.image-upload-thumbnail, .thumbnail');

    // Прогресс-бар загрузки
    this.progressBar = page.locator('.image-upload-progress, .upload-progress');

    // Кнопка удаления
    this.deleteButton = page.locator('.delete-image-btn, .remove-image, button:has-text("Удалить")');

    // Сообщение об ошибке
    this.errorMessage = page.locator('.popup-message--error, .error-message');

    // Оверлей полноэкранного просмотра
    this.fullsizeOverlay = page.locator('.image-fullsize-overlay, .fullscreen-image');
  }

  /**
   * Открывает попап загрузки изображения
   */
  async open(): Promise<void> {
    const uploadBtn = this.page.locator(
      '#uploadBlockImage, .fa-image, [data-testid="command-btn-uploadBlockImage"]'
    );
    if (await uploadBtn.isVisible()) {
      await uploadBtn.click();
      await expect(this.popup).toBeVisible({ timeout: 5000 });
    }
  }

  /**
   * Закрывает попап
   */
  async close(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.popup).not.toBeVisible({ timeout: 3000 });
  }

  /**
   * Загружает файл через input
   * @param filePath - путь к файлу
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
    await this.page.waitForTimeout(500);
  }

  /**
   * Загружает тестовое изображение (buffer)
   */
  async uploadTestImage(): Promise<void> {
    // Создаём минимальный PNG buffer
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // bit depth, color type, etc
      0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff, 0x00, // compressed data
      0x05, 0xfe, 0x02, 0xfe, // CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
      0xae, 0x42, 0x60, 0x82, // CRC
    ]);

    await this.fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });

    await this.page.waitForTimeout(500);
  }

  /**
   * Симулирует начало drag операции
   */
  async simulateDragEnter(): Promise<void> {
    await this.dropzone.dispatchEvent('dragenter');
  }

  /**
   * Симулирует окончание drag операции
   */
  async simulateDragLeave(): Promise<void> {
    await this.dropzone.dispatchEvent('dragleave');
  }

  /**
   * Проверяет, что dropzone подсвечена (dragover)
   */
  async assertDropzoneHighlighted(): Promise<void> {
    await expect(this.dropzone).toHaveClass(/dragover/);
  }

  /**
   * Проверяет, что превью отображается
   */
  async assertPreviewVisible(): Promise<void> {
    await expect(this.preview).toBeVisible();
  }

  /**
   * Проверяет, что показывается прогресс-бар
   */
  async assertProgressVisible(): Promise<void> {
    await expect(this.progressBar).toBeVisible();
  }

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
   * Удаляет загруженное изображение
   */
  async deleteImage(): Promise<void> {
    if (await this.deleteButton.isVisible()) {
      await this.deleteButton.click();
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Открывает изображение в полноэкранном режиме
   */
  async openFullsize(): Promise<void> {
    if (await this.thumbnail.isVisible()) {
      await this.thumbnail.click();
      await expect(this.fullsizeOverlay).toBeVisible({ timeout: 3000 });
    }
  }

  /**
   * Закрывает полноэкранный просмотр
   */
  async closeFullsize(): Promise<void> {
    if (await this.fullsizeOverlay.isVisible()) {
      await this.fullsizeOverlay.click();
      await expect(this.fullsizeOverlay).not.toBeVisible({ timeout: 3000 });
    }
  }

  /**
   * Проверяет, что попап открыт
   */
  async assertOpen(): Promise<void> {
    await expect(this.popup).toBeVisible();
  }

  /**
   * Проверяет, что попап закрыт
   */
  async assertClosed(): Promise<void> {
    await expect(this.popup).not.toBeVisible();
  }

  /**
   * Ожидает завершения загрузки
   */
  async waitForUploadComplete(timeout = 10000): Promise<void> {
    // Ждём пока прогресс-бар исчезнет и появится превью или ошибка
    await this.page.waitForFunction(
      () => {
        const progress = document.querySelector('.image-upload-progress, .upload-progress');
        const preview = document.querySelector('.image-upload-preview, .image-preview');
        const error = document.querySelector('.popup-message--error, .error-message');

        return !progress || preview || error;
      },
      { timeout }
    );
  }
}
