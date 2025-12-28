import api from '../api/api.js';
import { NotificationSettingsPopup } from './popups/notificationSettingsPopup.js';

const LOG_PREFIX = '[TelegramLink]';
const STORAGE_KEY = 'telegram_link_code';

// Максимальная длина кода привязки (защита от overflow атак)
const MAX_LINK_CODE_LENGTH = 64;
// Разрешённые символы в коде привязки (только цифры)
const LINK_CODE_PATTERN = /^\d+$/;

/**
 * Валидирует и санитизирует код привязки
 * @param {string} code - Код привязки
 * @returns {string|null} - Валидный код или null если невалидный
 */
export function validateLinkCode(code) {
    if (!code || typeof code !== 'string') {
        console.warn(LOG_PREFIX, 'Invalid link code: empty or not a string');
        return null;
    }

    // Обрезаем пробелы
    const trimmed = code.trim();

    // Проверяем длину
    if (trimmed.length === 0 || trimmed.length > MAX_LINK_CODE_LENGTH) {
        console.warn(LOG_PREFIX, 'Invalid link code: length out of bounds', {
            length: trimmed.length,
            maxLength: MAX_LINK_CODE_LENGTH
        });
        return null;
    }

    // Проверяем формат (только цифры)
    if (!LINK_CODE_PATTERN.test(trimmed)) {
        console.warn(LOG_PREFIX, 'Invalid link code: contains non-digit characters');
        return null;
    }

    return trimmed;
}

/**
 * Получает текущий URL (выделено для тестируемости)
 */
export function getCurrentUrl() {
    return new URL(window.location.href);
}

/**
 * Выполняет редирект (выделено для тестируемости)
 */
export function redirectTo(url) {
    window.location.href = url;
}

/**
 * Обработчик callback URL для привязки Telegram
 * Обрабатывает URL вида /settings/telegram?link=CODE
 *
 * Логика:
 * 1. Если URL содержит /settings/telegram - сохраняем код в sessionStorage и редиректим на /
 * 2. На главной странице проверяем sessionStorage и обрабатываем код
 *
 * @param {URL} [urlOverride] - Опциональный URL для тестирования
 * @param {Function} [redirectFn] - Опциональная функция редиректа для тестирования
 */
export function handleTelegramLinkCallback(urlOverride, redirectFn) {
    const url = urlOverride || getCurrentUrl();
    const path = url.pathname;
    const doRedirect = redirectFn || redirectTo;

    // Проверяем, что это URL привязки Telegram - сохраняем и редиректим
    if (path === '/settings/telegram' || path === '/settings/telegram/') {
        const rawLinkCode = url.searchParams.get('link');
        const linkCode = rawLinkCode ? validateLinkCode(rawLinkCode) : null;

        console.log(LOG_PREFIX, 'Detected telegram settings URL, redirecting to home', {
            hasLinkCode: !!linkCode,
            rawCodeLength: rawLinkCode?.length,
            validatedCode: linkCode ? 'valid' : 'invalid_or_missing'
        });

        if (linkCode) {
            // Сохраняем валидный код для обработки после редиректа
            sessionStorage.setItem(STORAGE_KEY, linkCode);
        } else if (rawLinkCode) {
            // Код был передан, но невалиден - логируем и открываем настройки
            console.warn(LOG_PREFIX, 'Link code validation failed, opening settings without confirmation');
            sessionStorage.setItem(STORAGE_KEY, 'open_settings');
        } else {
            // Просто пометим что нужно открыть настройки
            sessionStorage.setItem(STORAGE_KEY, 'open_settings');
        }

        // Редирект на главную
        doRedirect('/');
        return;
    }

    // На главной странице проверяем сохранённый код
    const savedCode = sessionStorage.getItem(STORAGE_KEY);
    if (savedCode) {
        sessionStorage.removeItem(STORAGE_KEY);

        console.log(LOG_PREFIX, 'Processing saved telegram link code');

        if (savedCode === 'open_settings') {
            // Просто открываем настройки
            openNotificationSettings();
        } else {
            // Подтверждаем привязку
            confirmTelegramLink(savedCode);
        }
    }
}

/**
 * Подтверждает привязку Telegram по коду
 */
async function confirmTelegramLink(linkCode) {
    const startTime = Date.now();
    console.log(LOG_PREFIX, 'Starting link confirmation', {
        codeLength: linkCode.length,
        timestamp: new Date().toISOString()
    });

    try {
        // Показываем индикатор загрузки
        showLinkingStatus('Привязка Telegram...');

        const response = await api.confirmTelegramLink(linkCode);
        const duration = Date.now() - startTime;

        // Успешно привязали
        console.log(LOG_PREFIX, 'Link confirmed successfully', {
            response: response?.data,
            durationMs: duration,
            timestamp: new Date().toISOString()
        });
        showLinkingStatus('Telegram успешно привязан!', 'success');

        // Открываем попап настроек через небольшую задержку
        setTimeout(() => {
            hideLinkingStatus();
            openNotificationSettings();
        }, 1500);

    } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
        const errorCode = error.response?.data?.code || error.code || 'UNKNOWN';

        console.error(LOG_PREFIX, 'Link confirmation failed', {
            status: error.response?.status,
            errorCode,
            detail: errorMessage,
            durationMs: duration,
            timestamp: new Date().toISOString(),
            // Дополнительная информация для отладки
            hasResponse: !!error.response,
            isNetworkError: !error.response && error.message === 'Network Error'
        });

        const message = error.response?.data?.detail || 'Не удалось привязать Telegram. Попробуйте ещё раз.';
        showLinkingStatus(message, 'error');

        // Скрываем через 3 секунды
        setTimeout(() => {
            hideLinkingStatus();
        }, 3000);
    }
}

/**
 * Открывает попап настроек уведомлений
 */
function openNotificationSettings() {
    new NotificationSettingsPopup();
}

/**
 * Показывает статус привязки
 */
function showLinkingStatus(message, type = 'info') {
    let statusEl = document.getElementById('telegram-link-status');

    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'telegram-link-status';
        statusEl.className = 'telegram-link-status';
        document.body.appendChild(statusEl);
    }

    // Устанавливаем класс типа
    statusEl.className = `telegram-link-status telegram-link-status--${type}`;

    // Иконки
    const icons = {
        info: '<div class="telegram-link-spinner"></div>',
        success: '<span class="telegram-link-icon">✅</span>',
        error: '<span class="telegram-link-icon">❌</span>'
    };

    statusEl.innerHTML = `${icons[type] || ''}<span class="telegram-link-message">${message}</span>`;
}

/**
 * Скрывает статус привязки
 */
function hideLinkingStatus() {
    const statusEl = document.getElementById('telegram-link-status');
    if (statusEl) {
        statusEl.remove();
    }
}
