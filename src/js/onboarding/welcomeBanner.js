/**
 * Welcome Banner для новых пользователей
 *
 * Показывает приветственное сообщение с основными хоткеями
 * и кнопками "Начать" / "Пропустить"
 */

import { onboardingManager } from './OnboardingManager';
import { dispatch } from '../utils/utils';

class WelcomeBanner {
    constructor() {
        this._element = null;
        this._isVisible = false;
        this._boundShow = null;
    }

    /**
     * Инициализация: подписка на событие показа баннера
     * Вызывается из OnboardingManager.init()
     */
    init() {
        if (this._boundShow) return; // уже инициализирован
        this._boundShow = () => this.show();
        window.addEventListener('ShowOnboardingWelcome', this._boundShow);
    }

    /**
     * Очистка ресурсов
     */
    destroy() {
        if (this._boundShow) {
            window.removeEventListener('ShowOnboardingWelcome', this._boundShow);
            this._boundShow = null;
        }
        this.hide();
    }

    /**
     * Показать баннер
     */
    show() {
        if (this._isVisible) return;
        this._isVisible = true;

        this._element = this._createElement();
        document.body.appendChild(this._element);

        // Добавляем обработчики
        this._attachEventListeners();
    }

    /**
     * Скрыть баннер
     */
    hide() {
        if (!this._isVisible || !this._element) return;
        this._isVisible = false;

        // Анимация исчезновения
        this._element.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => {
            if (this._element && this._element.parentNode) {
                this._element.parentNode.removeChild(this._element);
            }
            this._element = null;
        }, 300);
    }

    /**
     * Создаёт DOM-элемент баннера
     * @returns {HTMLElement}
     * @private
     */
    _createElement() {
        const banner = document.createElement('div');
        banner.className = 'onboarding-welcome';
        banner.innerHTML = `
            <button class="onboarding-welcome__close" aria-label="Закрыть">&times;</button>
            <div class="onboarding-welcome__icon">&#x1F44B;</div>
            <div class="onboarding-welcome__title">Добро пожаловать в OmniMap!</div>
            <div class="onboarding-welcome__text">
                Это ваш персональный экзокортекс для организации знаний, идей и проектов.
            </div>
            <div class="onboarding-welcome__shortcuts">
                <div class="onboarding-welcome__shortcuts-title">Основные клавиши</div>
                <div class="onboarding-welcome__shortcut">
                    <span>Создать блок</span>
                    <kbd>N</kbd>
                </div>
                <div class="onboarding-welcome__shortcut">
                    <span>Войти в блок</span>
                    <kbd>Enter</kbd>
                </div>
                <div class="onboarding-welcome__shortcut">
                    <span>Вернуться</span>
                    <kbd>Backspace</kbd>
                </div>
                <div class="onboarding-welcome__shortcut">
                    <span>Поиск</span>
                    <kbd>F</kbd>
                </div>
            </div>
            <div class="onboarding-welcome__shortcuts" style="margin-top: 8px; background: #ecfdf5;">
                <div class="onboarding-welcome__shortcuts-title">Ваши деревья</div>
                <div class="onboarding-welcome__shortcut">
                    <span>Мои заметки</span>
                    <kbd>Space+0</kbd>
                </div>
                <div class="onboarding-welcome__shortcut">
                    <span>Обучение</span>
                    <kbd>Space+1</kbd>
                </div>
            </div>
            <div class="onboarding-welcome__actions">
                <button class="onboarding-welcome__btn onboarding-welcome__btn--primary" data-action="start">
                    Начать обзор
                </button>
                <button class="onboarding-welcome__btn onboarding-welcome__btn--secondary" data-action="skip">
                    Понятно
                </button>
            </div>
        `;

        // Добавляем стили для анимации исчезновения
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
        `;
        if (!document.querySelector('style[data-onboarding-anim]')) {
            style.setAttribute('data-onboarding-anim', 'true');
            document.head.appendChild(style);
        }

        return banner;
    }

    /**
     * Добавляет обработчики событий
     * @private
     */
    _attachEventListeners() {
        if (!this._element) return;

        // Кнопка закрытия
        const closeBtn = this._element.querySelector('.onboarding-welcome__close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this._handleSkip();
            });
        }

        // Кнопка "Начать"
        const startBtn = this._element.querySelector('[data-action="start"]');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this._handleStart();
            });
        }

        // Кнопка "Пропустить"
        const skipBtn = this._element.querySelector('[data-action="skip"]');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this._handleSkip();
            });
        }
    }

    /**
     * Обработчик "Начать обзор"
     * @private
     */
    _handleStart() {
        this.hide();
        // Переключаемся на туториальное дерево по treeId
        // tutorialGraph генерирует корень с ID 'tutorial-root'
        dispatch('SwitchTree', { treeId: 'tutorial-root' });
        // Показываем подсказку
        onboardingManager.showHint(
            'Это обучающее дерево. Изучите разделы и вернитесь в "Мои заметки" (Space+0)',
            5000
        );
    }

    /**
     * Обработчик "Пропустить"
     * @private
     */
    _handleSkip() {
        onboardingManager.dismissTutorial();
        this.hide();
    }
}

// Singleton экземпляр
export const welcomeBanner = new WelcomeBanner();
