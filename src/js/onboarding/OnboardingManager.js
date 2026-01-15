/**
 * OnboardingManager - менеджер онбординга для новых пользователей
 *
 * Управляет:
 * - Туториальным графом блоков для новых пользователей
 * - Контекстными подсказками при первом использовании функций
 * - Хранением состояния онбординга в localStorage
 */

import { dispatch } from '../utils/utils';
import { CONTEXTUAL_HINTS } from './hints';
import { getTutorialBlocks } from './tutorialGraph';

/**
 * Ключи для localStorage
 */
const STORAGE_KEYS = {
    ONBOARDING_COMPLETED: '__omnimap_onboarding_completed__',
    HINTS_SHOWN: '__omnimap_hints_shown__',
    TUTORIAL_DISMISSED: '__omnimap_tutorial_dismissed__'
};

class OnboardingManager {
    constructor() {
        this._initialized = false;
        this._shownHints = new Set();
        this._hintElement = null;
        this._hintTimeout = null;
    }

    /**
     * Инициализация менеджера онбординга
     * Вызывается один раз при старте приложения
     */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        // Загружаем показанные подсказки из localStorage
        this._loadShownHints();

        // Подписываемся на события для контекстных подсказок
        this._subscribeToEvents();

        console.log('[OnboardingManager] initialized');
    }

    /**
     * Проверяет, является ли пользователь новым (нужен ли онбординг)
     * @returns {boolean}
     */
    isNewUser() {
        return !localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED) &&
               !localStorage.getItem(STORAGE_KEYS.TUTORIAL_DISMISSED);
    }

    /**
     * Возвращает туториальные блоки для нового пользователя
     * @returns {{treeIds: string[], blocks: Map}|null}
     */
    getTutorialData() {
        if (this.isNewUser()) {
            return getTutorialBlocks();
        }
        return null;
    }

    /**
     * Помечает онбординг как завершённый
     */
    completeOnboarding() {
        localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
        console.log('[OnboardingManager] onboarding completed');
    }

    /**
     * Пропуск туториала (пользователь отказался)
     */
    dismissTutorial() {
        localStorage.setItem(STORAGE_KEYS.TUTORIAL_DISMISSED, 'true');
        console.log('[OnboardingManager] tutorial dismissed');
    }

    /**
     * Сброс онбординга (для тестирования)
     * Вызывать из консоли: onboardingManager.reset()
     */
    reset() {
        localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
        localStorage.removeItem(STORAGE_KEYS.HINTS_SHOWN);
        localStorage.removeItem(STORAGE_KEYS.TUTORIAL_DISMISSED);
        this._shownHints.clear();
        console.log('[OnboardingManager] reset - reload page to see tutorial');
    }

    /**
     * Показать контекстную подсказку
     * @param {string} message - Текст подсказки
     * @param {number} duration - Длительность показа в мс (по умолчанию 4000)
     */
    showHint(message, duration = 4000) {
        // Очищаем предыдущую подсказку
        if (this._hintTimeout) {
            clearTimeout(this._hintTimeout);
        }

        // Создаём или переиспользуем элемент
        if (!this._hintElement) {
            this._hintElement = document.createElement('div');
            this._hintElement.className = 'onboarding-hint';
            document.body.appendChild(this._hintElement);
        }

        this._hintElement.textContent = message;
        this._hintElement.classList.add('visible');

        // Скрываем через duration
        this._hintTimeout = setTimeout(() => {
            this._hintElement.classList.remove('visible');
        }, duration);
    }

    /**
     * Скрыть подсказку немедленно
     */
    hideHint() {
        if (this._hintElement) {
            this._hintElement.classList.remove('visible');
        }
        if (this._hintTimeout) {
            clearTimeout(this._hintTimeout);
            this._hintTimeout = null;
        }
    }

    // === Приватные методы ===

    /**
     * Загружает показанные подсказки из localStorage
     * @private
     */
    _loadShownHints() {
        const stored = localStorage.getItem(STORAGE_KEYS.HINTS_SHOWN);
        if (stored) {
            try {
                const hints = JSON.parse(stored);
                this._shownHints = new Set(hints);
            } catch (e) {
                this._shownHints = new Set();
            }
        }
    }

    /**
     * Сохраняет показанные подсказки в localStorage
     * @private
     */
    _saveShownHints() {
        localStorage.setItem(
            STORAGE_KEYS.HINTS_SHOWN,
            JSON.stringify([...this._shownHints])
        );
    }

    /**
     * Подписывается на все события из конфигурации подсказок
     * @private
     */
    _subscribeToEvents() {
        Object.entries(CONTEXTUAL_HINTS).forEach(([hintId, config]) => {
            window.addEventListener(config.trigger, (e) => {
                this._handleHintTrigger(hintId, config, e.detail);
            });
        });
    }

    /**
     * Обрабатывает триггер подсказки
     * @private
     */
    _handleHintTrigger(hintId, config, detail) {
        // Проверяем, показывалась ли подсказка (если showOnce)
        if (config.showOnce && this._shownHints.has(hintId)) {
            return;
        }

        // Проверяем условие показа (если есть)
        if (config.condition && !config.condition(detail)) {
            return;
        }

        // Показываем подсказку
        this.showHint(config.message, config.duration || 4000);

        // Помечаем как показанную
        if (config.showOnce) {
            this._shownHints.add(hintId);
            this._saveShownHints();
        }
    }
}

// Singleton экземпляр
export const onboardingManager = new OnboardingManager();

// Экспортируем класс для тестирования
export { OnboardingManager };
