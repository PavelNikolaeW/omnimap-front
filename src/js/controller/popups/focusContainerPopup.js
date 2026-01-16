/**
 * FocusContainerPopup
 *
 * Popup для выбора контейнера фокуса при добавлении блока.
 * Показывает список доступных контейнеров:
 * - Пользовательские контейнеры фокуса
 * - Дефолтный Home Focus (с текущей неделей)
 */

import { Popup } from './popup.js';
import { focusManager } from '../../services/focusManager.js';

export class FocusContainerPopup extends Popup {
    /**
     * @param {Object} options
     * @param {string} options.blockId - ID блока для добавления в фокус
     * @param {string} options.blockTitle - Название блока (для отображения)
     * @param {Function} options.onSelect - Callback при выборе контейнера (containerId)
     * @param {Function} options.onCancel - Callback при отмене
     */
    constructor(options) {
        super({
            title: 'Добавить в фокус',
            size: 'sm',
            modal: true,
            closeOnOverlay: true,
            closeOnEsc: true,
            ...options
        });

        this.blockId = options.blockId;
        this.blockTitle = options.blockTitle || 'Блок';
        this.onSelect = options.onSelect;
        this.onCancelCallback = options.onCancel;

        // Хранилище для cleanup event listeners
        this._buttonHandlers = [];
        this._cancelHandler = null;

        this.renderContent();
    }

    /**
     * Отрисовывает содержимое popup
     */
    renderContent() {
        // Очищаем контент
        this.contentArea.innerHTML = '';

        // Заголовок с названием блока
        const header = document.createElement('div');
        header.className = 'popup-section';
        header.innerHTML = `
            <p class="popup-text">Выберите контейнер для блока:</p>
            <p class="popup-text popup-text--muted">"${this.truncateTitle(this.blockTitle, 40)}"</p>
        `;
        this.contentArea.appendChild(header);

        // Список контейнеров
        const containersList = document.createElement('div');
        containersList.className = 'focus-containers-list';

        const containers = focusManager.getAllAvailableContainers();

        if (containers.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'popup-text popup-text--muted';
            emptyMessage.textContent = 'Нет доступных контейнеров фокуса';
            containersList.appendChild(emptyMessage);
        } else {
            for (const container of containers) {
                const button = this.createContainerButton(container);
                containersList.appendChild(button);
            }
        }

        this.contentArea.appendChild(containersList);

        // Подсказка
        const hint = document.createElement('div');
        hint.className = 'popup-section popup-section--hint';
        hint.innerHTML = `
            <p class="popup-text popup-text--small popup-text--muted">
                Shift+Ctrl+K - сделать текущий блок контейнером фокуса
            </p>
        `;
        this.contentArea.appendChild(hint);
    }

    /**
     * Создаёт кнопку контейнера
     * @param {Object} container - {id, title, isHomeFocus}
     * @returns {HTMLElement}
     */
    createContainerButton(container) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'focus-container-btn';
        if (container.isHomeFocus) {
            button.classList.add('focus-container-btn--home');
        }
        button.setAttribute('data-container-id', container.id);
        button.setAttribute('data-testid', `focus-container-${container.id}`);

        // Иконка
        const icon = document.createElement('i');
        icon.className = container.isHomeFocus
            ? 'fas fa-home focus-container-icon'
            : 'fas fa-bullseye focus-container-icon';
        button.appendChild(icon);

        // Название
        const title = document.createElement('span');
        title.className = 'focus-container-title';
        title.textContent = container.title;
        button.appendChild(title);

        // Обработчик клика с сохранением ссылки для cleanup
        const handler = () => this.handleContainerSelect(container.id);
        button.addEventListener('click', handler);
        this._buttonHandlers.push({ button, handler });

        return button;
    }

    /**
     * Обработчик выбора контейнера
     * @param {string} containerId
     */
    handleContainerSelect(containerId) {
        if (typeof this.onSelect === 'function') {
            this.onSelect(containerId);
        }
        this.close();
    }

    /**
     * Переопределяем кнопки - нам нужна только кнопка отмены
     */
    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons popup-buttons--center';

        this.cancelButton = this.createCancelButton();
        this.cancelButton.textContent = 'Отмена';
        this._cancelHandler = () => this.handleCancel();
        this.cancelButton.addEventListener('click', this._cancelHandler);

        container.appendChild(this.cancelButton);
        this.popupEl.appendChild(container);
    }

    /**
     * Переопределяем создание кнопки submit - она не нужна
     */
    createSubmitButton() {
        // Не создаём submit кнопку
        return document.createElement('span');
    }

    /**
     * Обработчик отмены
     */
    handleCancel() {
        if (typeof this.onCancelCallback === 'function') {
            this.onCancelCallback();
        }
        this.close();
    }

    /**
     * Обрезает строку до указанной длины
     * @param {string} str
     * @param {number} maxLength
     * @returns {string}
     */
    truncateTitle(str, maxLength) {
        if (!str) return '';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    }

    /**
     * Очистка event listeners при закрытии popup
     */
    close() {
        // Cleanup button handlers
        for (const { button, handler } of this._buttonHandlers) {
            button.removeEventListener('click', handler);
        }
        this._buttonHandlers = [];

        // Cleanup cancel handler
        if (this._cancelHandler && this.cancelButton) {
            this.cancelButton.removeEventListener('click', this._cancelHandler);
            this._cancelHandler = null;
        }

        // Call parent close
        super.close();
    }
}
