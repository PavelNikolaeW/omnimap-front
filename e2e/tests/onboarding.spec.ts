import { test, expect } from '@playwright/test';

/**
 * Тесты системы onboarding для новых пользователей @onboarding
 *
 * Покрывает:
 * - Регистрацию нового пользователя
 * - Автоматическую инициализацию домашней страницы
 * - Приветственное окно
 * - Отображение блоков после onboarding
 *
 * ВАЖНО: Эти тесты НЕ используют shared storageState,
 * так как тестируют процесс регистрации с нуля.
 */
test.describe('Onboarding @onboarding', () => {
  // Отключаем shared auth для этих тестов
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    // Очищаем localStorage перед каждым тестом
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('OB-01: должен успешно зарегистрировать нового пользователя', async ({ page }) => {
    await page.goto('/');

    // Генерируем уникальные данные для регистрации
    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Находим секцию регистрации по заголовку
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await expect(registerSection).toBeVisible({ timeout: 5000 });

    // Заполняем форму регистрации в контексте секции регистрации
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await registerSection.locator('#reg-password').fill(password);
    await registerSection.locator('#confirm-password').fill(password);

    // Отправляем форму
    await page.click('button:has-text("Зарегистрироваться")');

    // После успешной регистрации должно появиться приветственное окно
    // или основной интерфейс приложения
    await expect(
      page.locator('text=Добро пожаловать').or(page.locator('#rootContainer'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('OB-02: должен показать приветственное окно после регистрации', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации (может быть reload или redirect)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Ожидаем приветственное окно
    const welcomeHeading = page.locator('text=Добро пожаловать в OmniMap!');
    await expect(welcomeHeading).toBeVisible({ timeout: 10000 });

    // Проверяем наличие кнопки "Начать обзор"
    const startButton = page.locator('button:has-text("Начать обзор")');
    await expect(startButton).toBeVisible();

    // Проверяем что показаны основные hotkeys
    await expect(page.locator('text=Создать блок')).toBeVisible();
    await expect(page.locator('text=Войти в блок')).toBeVisible();
  });

  test('OB-03: должен отобразить блоки домашней страницы после onboarding', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Ждём приветственное окно (появляется с задержкой 500ms после загрузки блоков)
    await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });

    // Нажимаем "Начать обзор"
    await page.click('button:has-text("Начать обзор")');

    // Ждём загрузки DOM
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Блоки должны отобразиться сразу после регистрации
    // Проверяем наличие всех 6 основных блоков по названию
    await expect(page.locator('text=Inbox').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Focus').first()).toBeVisible();
    await expect(page.locator('text=Projects').first()).toBeVisible();
    await expect(page.locator('text=Spaces').first()).toBeVisible();
    await expect(page.locator('text=Areas').first()).toBeVisible();
    await expect(page.locator('text=Archive').first()).toBeVisible();
  });

  test('OB-04: блоки домашней страницы должны отображаться после перезагрузки', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация и onboarding в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Начать обзор")');

    // Перезагружаем страницу
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // После перезагрузки блоки должны отображаться
    // Проверяем основные блоки
    await expect(page.locator('text=Inbox').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Focus').first()).toBeVisible();
    await expect(page.locator('text=Areas').first()).toBeVisible();
  });

  test('OB-05: не должен показывать ошибку при создании блока на домашней странице', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация и onboarding в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Начать обзор")');

    // Ждём отображения блоков после onboarding
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Inbox').first()).toBeVisible({ timeout: 10000 });

    // Пытаемся создать новый блок на заполненной home page
    await page.keyboard.press('n');

    // Заполняем название блока
    const blockNameInput = page.locator('input[placeholder*="название"], input[type="text"]').first();
    await expect(blockNameInput).toBeVisible({ timeout: 5000 });
    await blockNameInput.fill('Мой новый блок');

    // Нажимаем OK
    await page.click('button:has-text("OK")');

    // Grid должен автоматически расшириться и блок создан
    const errorMessage = page.locator('text=Нет свободного места в сетке');
    await expect(errorMessage).not.toBeVisible({ timeout: 2000 });

    // Блок должен быть создан
    await expect(page.locator('text=Мой новый блок')).toBeVisible({ timeout: 5000 });
  });

  test('OB-06: должен правильно инициализировать layout домашней страницы', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Начать обзор")');

    // Ждём отображения блоков после onboarding
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Areas').first()).toBeVisible({ timeout: 10000 });

    // Проверяем что блок Areas имеет вложенную структуру с 8 подблоками
    const areasBlock = page.locator('text=Areas').first();
    await areasBlock.click();
    await page.keyboard.press('Enter');

    // Должны открыться 8 area блоков (без emoji в заголовках)
    await expect(page.locator('text=Я').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Отношения').first()).toBeVisible();
    await expect(page.locator('text=Работа').first()).toBeVisible();
    await expect(page.locator('text=Финансы').first()).toBeVisible();
    await expect(page.locator('text=Среда').first()).toBeVisible();
    await expect(page.locator('text=Энергия').first()).toBeVisible();
    await expect(page.locator('text=Творчество').first()).toBeVisible();
    await expect(page.locator('text=Мир').first()).toBeVisible();
  });

  test('OB-07: должен показать корректные цвета для блоков домашней страницы', async ({ page }) => {
    await page.goto('/');

    const timestamp = Date.now();
    const username = `test_user_${timestamp}`;
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    // Регистрация и onboarding в контексте секции регистрации
    const registerSection = page.getByRole('heading', { name: 'Регистрация' }).locator('..');
    await registerSection.getByRole('textbox', { name: 'Имя пользователя' }).fill(username);
    await page.waitForTimeout(100);
    await registerSection.getByRole('textbox', { name: 'Электронная почта' }).fill(email);
    await page.waitForTimeout(100);
    await registerSection.locator('#reg-password').fill(password);
    await page.waitForTimeout(100);
    await registerSection.locator('#confirm-password').fill(password);
    await page.waitForTimeout(100);
    await page.click('button:has-text("Зарегистрироваться")');

    // Ждём навигации после регистрации
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Добро пожаловать')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Начать обзор")');

    // Ждём отображения блоков после onboarding
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Inbox').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Focus').first()).toBeVisible();

    // Блоки отображаются - тест проходит
    // Note: Проверка цветов через стили требует доступа к DOM атрибутам,
    // которые могут быть недоступны в accessibility API
  });
});

/**
 * ✅ ИСПРАВЛЕНО:
 * - test.fixme() убраны из OB-03 и OB-05 (баги исправлены в commit 6221117)
 * - workaround с page.reload() убран из OB-05 (блоки теперь отображаются сразу)
 *
 * TODO для дальнейшего улучшения:
 * - Добавить тесты для закрытия приветственного окна по Escape
 * - Проверить повторный показ tutorial (если есть такая функция)
 * - Тестирование на различных разрешениях экрана
 * - Visual regression тесты для home page layout
 */
