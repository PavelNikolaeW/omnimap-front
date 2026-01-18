/**
 * Welcome Banner для новых пользователей
 *
 * Показывает приветственное сообщение с основными хоткеями
 * и кнопками "Начать" / "Пропустить"
 */

import { onboardingManager } from './OnboardingManager';
import { treeService } from '../services/treeService';

class WelcomeBanner {
    constructor() {
        this._element = null;
        this._isVisible = false;
        this._boundShow = null;
        this._treeBlocks = null; // Кэш данных о деревьях
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
    async show() {
        if (this._isVisible) return;
        this._isVisible = true;

        this._element = await this._createElement();
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
     * Строит HTML для секции деревьев с правильными хоткеями
     * @returns {Promise<string>}
     * @private
     */
    async _buildTreesShortcutsHtml() {
        try {
            this._treeBlocks = await treeService.loadTreeBlocks();
            if (!this._treeBlocks || this._treeBlocks.length === 0) {
                return '';
            }

            // Space+1 = первое дерево, Space+2 = второе и т.д.
            // Показываем максимум первые 9 деревьев (Space+1..9)
            return this._treeBlocks
                .slice(0, 9)
                .map((item, index) => {
                    const title = item.block?.title || 'Без названия';
                    const hotkey = `Space+${index + 1}`;
                    const isTutorial = item.block?.data?.isTutorial;
                    const label = isTutorial ? `${this._escapeHtml(title)} (обучение)` : this._escapeHtml(title);
                    return `
                        <div class="onboarding-welcome__shortcut">
                            <span>${label}</span>
                            <kbd>${hotkey}</kbd>
                        </div>
                    `;
                })
                .join('');
        } catch (error) {
            console.warn('[WelcomeBanner] Failed to load trees:', error);
            return '';
        }
    }

    /**
     * Находит индекс туториального дерева (1-based для хоткея)
     * @returns {number|null}
     * @private
     */
    _findTutorialTreeIndex() {
        if (!this._treeBlocks) return null;
        const index = this._treeBlocks.findIndex(item => item.block?.data?.isTutorial);
        return index >= 0 ? index + 1 : null; // +1 потому что Space+1 = первый элемент
    }

    /**
     * Находит индекс первого не-туториального дерева (1-based для хоткея)
     * @returns {number|null}
     * @private
     */
    _findMainTreeIndex() {
        if (!this._treeBlocks) return null;
        const index = this._treeBlocks.findIndex(item => !item.block?.data?.isTutorial);
        return index >= 0 ? index + 1 : null;
    }

    /**
     * Экранирует HTML-символы в строке
     * @param {string} text
     * @returns {string}
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Создаёт DOM-элемент баннера
     * @returns {Promise<HTMLElement>}
     * @private
     */
    async _createElement() {
        // Получаем список деревьев для динамической генерации хоткеев
        const treesHtml = await this._buildTreesShortcutsHtml();

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
                ${treesHtml}
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

        // Находим туториальное дерево по флагу isTutorial
        const tutorialIndex = this._findTutorialTreeIndex();
        const mainIndex = this._findMainTreeIndex();

        if (tutorialIndex) {
            // Переключаемся на туториальное дерево
            treeService.switchTreeByIndex(tutorialIndex);

            // Формируем подсказку с правильным хоткеем для возврата
            const mainHotkey = mainIndex ? `Space+${mainIndex}` : 'Space+1';
            onboardingManager.showHint(
                `Это обучающее дерево. Изучите разделы и вернитесь назад (${mainHotkey})`,
                5000
            );
        } else {
            // Туториал не найден - просто показываем подсказку
            onboardingManager.showHint(
                'Изучите структуру вашего дерева. Используйте N для создания блоков.',
                5000
            );
        }
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
