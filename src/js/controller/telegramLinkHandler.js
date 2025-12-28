import api from '../api/api.js';
import { NotificationSettingsPopup } from './popups/notificationSettingsPopup.js';

const LOG_PREFIX = '[TelegramLink]';

/**
 * Получает текущий URL (выделено для тестируемости)
 */
export function getCurrentUrl() {
    return new URL(window.location.href);
}

/**
 * Обработчик callback URL для привязки Telegram
 * Обрабатывает URL вида /settings/telegram?link=CODE
 * @param {URL} [urlOverride] - Опциональный URL для тестирования
 */
export function handleTelegramLinkCallback(urlOverride) {
    const url = urlOverride || getCurrentUrl();
    const path = url.pathname;

    // Проверяем, что это URL привязки Telegram
    if (path === '/settings/telegram' || path === '/settings/telegram/') {
        const linkCode = url.searchParams.get('link');

        console.log(LOG_PREFIX, 'Detected telegram settings URL', { path, hasLinkCode: !!linkCode });

        if (linkCode) {
            confirmTelegramLink(linkCode);
        } else {
            // Просто открываем настройки уведомлений
            console.log(LOG_PREFIX, 'Opening notification settings (no link code)');
            openNotificationSettings();
        }

        // Очищаем URL без перезагрузки страницы
        cleanUrl();
    }
}

/**
 * Подтверждает привязку Telegram по коду
 */
async function confirmTelegramLink(linkCode) {
    console.log(LOG_PREFIX, 'Starting link confirmation', { codeLength: linkCode.length });

    try {
        // Показываем индикатор загрузки
        showLinkingStatus('Привязка Telegram...');

        const response = await api.confirmTelegramLink(linkCode);

        // Успешно привязали
        console.log(LOG_PREFIX, 'Link confirmed successfully', { response: response?.data });
        showLinkingStatus('Telegram успешно привязан!', 'success');

        // Открываем попап настроек через небольшую задержку
        setTimeout(() => {
            hideLinkingStatus();
            openNotificationSettings();
        }, 1500);

    } catch (error) {
        const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
        console.error(LOG_PREFIX, 'Link confirmation failed', {
            status: error.response?.status,
            detail: errorMessage
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
 * Очищает URL без перезагрузки страницы
 */
function cleanUrl() {
    const cleanPath = '/';
    window.history.replaceState({}, document.title, cleanPath);
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
