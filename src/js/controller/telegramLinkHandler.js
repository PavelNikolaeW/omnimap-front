import api from '../api/api.js';
import { NotificationSettingsPopup } from './popups/notificationSettingsPopup.js';

/**
 * Обработчик callback URL для привязки Telegram
 * Обрабатывает URL вида /settings/telegram?link=CODE
 */
export function handleTelegramLinkCallback() {
    const url = new URL(window.location.href);
    const path = url.pathname;

    // Проверяем, что это URL привязки Telegram
    if (path === '/settings/telegram' || path === '/settings/telegram/') {
        const linkCode = url.searchParams.get('link');

        if (linkCode) {
            confirmTelegramLink(linkCode);
        } else {
            // Просто открываем настройки уведомлений
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
    try {
        // Показываем индикатор загрузки
        showLinkingStatus('Привязка Telegram...');

        await api.confirmTelegramLink(linkCode);

        // Успешно привязали
        showLinkingStatus('Telegram успешно привязан!', 'success');

        // Открываем попап настроек через небольшую задержку
        setTimeout(() => {
            hideLinkingStatus();
            openNotificationSettings();
        }, 1500);

    } catch (error) {
        console.error('Failed to confirm telegram link:', error);

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
        statusEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        document.body.appendChild(statusEl);
    }

    // Стили в зависимости от типа
    const styles = {
        info: {
            background: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #bfdbfe'
        },
        success: {
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0'
        },
        error: {
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca'
        }
    };

    const style = styles[type] || styles.info;
    statusEl.style.background = style.background;
    statusEl.style.color = style.color;
    statusEl.style.border = style.border;

    // Иконки
    const icons = {
        info: '<div style="width: 20px; height: 20px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>',
        success: '✅',
        error: '❌'
    };

    statusEl.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
    statusEl.style.display = 'flex';

    // Добавляем анимацию спиннера
    if (type === 'info') {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(styleSheet);
    }
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
