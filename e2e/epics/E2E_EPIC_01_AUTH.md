# Epic 1: Auth (P0)

## Цель

Тестирование авторизации: логин, регистрация, logout, восстановление сессии.

## Тест-кейсы

| ID | Название | Описание | Приоритет |
|----|----------|----------|-----------|
| AU-01 | Успешный логин | Вход с валидными credentials | P0 |
| AU-02 | Логин с неверным паролем | Показ ошибки при неверном пароле | P0 |
| AU-03 | Логин с несуществующим пользователем | Показ ошибки для неизвестного юзера | P1 |
| AU-04 | Успешная регистрация | Создание нового аккаунта | P0 |
| AU-05 | Регистрация с существующим email | Ошибка при дублирующем email | P1 |
| AU-06 | Logout | Выход из системы | P0 |
| AU-07 | Refresh token | Автоматическое обновление токена | P1 |
| AU-08 | Session persistence | Сохранение сессии после reload | P0 |

## Реализация

### AU-01: Успешный логин

```typescript
test('AU-01: Успешный логин', async ({ mainPage }) => {
  await mainPage.goto();
  await mainPage.waitForLoginForm();
  await mainPage.login(TEST_USERS.admin.username, TEST_USERS.admin.password);
  await mainPage.assertLoginSuccess();
});
```

### AU-02: Логин с неверным паролем

```typescript
test('AU-02: Логин с неверным паролем', async ({ mainPage }) => {
  await mainPage.goto();
  await mainPage.waitForLoginForm();
  await mainPage.login(TEST_USERS.admin.username, 'wrong_password');
  await mainPage.assertLoginError();
});
```

### AU-06: Logout

```typescript
test('AU-06: Logout', async ({ authenticatedPage }) => {
  // Выполняем logout
  await authenticatedPage.pressHotkeyCombo('Shift', 'l');
  // или через UI: await authenticatedPage.clickLogoutButton();

  // Проверяем что показана форма логина
  await authenticatedPage.assertOnLoginForm();
});
```

### AU-08: Session persistence

```typescript
test('AU-08: Session persistence', async ({ authenticatedPage, page }) => {
  // Проверяем что авторизованы
  await authenticatedPage.assertLoginSuccess();

  // Reload страницы
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Проверяем что остались авторизованы (форма логина не показана)
  const loginForm = page.locator('#login-form');
  await expect(loginForm).not.toBeVisible({ timeout: 5000 });

  // Блоки должны быть видны
  await authenticatedPage.waitForShowedBlocks();
});
```

## Файлы

- `e2e/tests/auth/auth.spec.ts` — Основные тесты авторизации
- `e2e/tests/auth.setup.ts` — Setup project для сохранения storageState
- `e2e/tests/auth.setup.dev.ts` — Setup для cloud окружения

## Заметки

- Форма логина находится в `#login-form`
- Поля: `#username`, `#password`
- Ошибка: `.auth-error`
- Авторизация через cookies (JWT: `access`, `refresh`)
- IndexedDB хранит `currentUser` после авторизации
