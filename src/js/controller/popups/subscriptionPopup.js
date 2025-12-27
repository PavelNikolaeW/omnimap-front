import { Popup } from './popup.js';
import api from '../../api/api.js';
import { dispatch } from '../../utils/utils.js';

/**
 * Popup для настройки подписки на изменения блока
 */
export class SubscriptionPopup extends Popup {
    /**
     * @param {Object} options
     * @param {string} options.blockId - ID блока
     * @param {string} options.blockTitle - Название блока
     * @param {Object} options.existingSubscription - Существующая подписка (для редактирования)
     * @param {Function} options.onSave - Callback при сохранении
     * @param {Function} options.onDelete - Callback при удалении
     * @param {Function} options.onCancel - Callback при отмене
     */
    constructor(options = {}) {
        super({
            title: '👁 Отслеживание изменений',
            size: 'md',
            modal: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            ...options
        });

        this.blockId = options.blockId;
        this.blockTitle = options.blockTitle || '';
        this.existingSubscription = options.existingSubscription;
        this.onSave = options.onSave;
        this.onDelete = options.onDelete;

        this.renderContent();
    }

    renderContent() {
        this.contentArea.innerHTML = '';

        // Блок информация
        const blockInfo = document.createElement('div');
        blockInfo.className = 'popup-form-field';
        blockInfo.innerHTML = `
            <label class="popup-form-label">Блок</label>
            <div style="padding: 8px 12px; background: #f3f4f6; border-radius: 6px; font-size: 14px; color: #374151;">
                ${this.escapeHtml(this.blockTitle || 'Без названия')}
            </div>
        `;
        this.contentArea.appendChild(blockInfo);

        // Форма
        const form = document.createElement('div');
        form.className = 'popup-form';
        form.style.marginTop = '16px';

        // Глубина отслеживания
        const depthSection = document.createElement('div');
        depthSection.className = 'popup-section';
        depthSection.innerHTML = `
            <div class="popup-section__title">Глубина отслеживания</div>
        `;

        const depthOptions = [
            { value: 0, label: 'Только этот блок' },
            { value: 1, label: '+ Дочерние (1 уровень)' },
            { value: 2, label: '+ Дочерние (2 уровня)' },
            { value: 3, label: '+ Дочерние (3 уровня)' },
            { value: -1, label: 'Все потомки' }
        ];

        const currentDepth = this.existingSubscription?.depth ?? 1;

        const depthFieldset = document.createElement('div');
        depthFieldset.style.display = 'flex';
        depthFieldset.style.flexDirection = 'column';
        depthFieldset.style.gap = '8px';

        depthOptions.forEach(opt => {
            const label = document.createElement('label');
            label.className = 'popup-radio-label';
            label.innerHTML = `
                <input type="radio" class="popup-radio" name="subscription-depth" value="${opt.value}"
                    ${currentDepth === opt.value ? 'checked' : ''}>
                ${opt.label}
            `;
            depthFieldset.appendChild(label);
        });

        depthSection.appendChild(depthFieldset);
        form.appendChild(depthSection);

        // Типы изменений
        const typesSection = document.createElement('div');
        typesSection.className = 'popup-section';
        typesSection.innerHTML = `
            <div class="popup-section__title">Типы изменений</div>
        `;

        const changeTypes = [
            { name: 'on_text_change', label: 'Изменение текста', default: true },
            { name: 'on_data_change', label: 'Изменение свойств (стили, размеры)', default: true },
            { name: 'on_move', label: 'Перемещение блока', default: true },
            { name: 'on_child_add', label: 'Добавление дочерних блоков', default: true },
            { name: 'on_child_delete', label: 'Удаление дочерних блоков', default: true }
        ];

        const typesFieldset = document.createElement('div');
        typesFieldset.style.display = 'flex';
        typesFieldset.style.flexDirection = 'column';
        typesFieldset.style.gap = '8px';

        changeTypes.forEach(type => {
            const isChecked = this.existingSubscription
                ? this.existingSubscription[type.name]
                : type.default;

            const label = document.createElement('label');
            label.className = 'popup-checkbox-label';
            label.innerHTML = `
                <input type="checkbox" class="popup-checkbox" name="${type.name}"
                    ${isChecked ? 'checked' : ''}>
                ${type.label}
            `;
            typesFieldset.appendChild(label);
        });

        typesSection.appendChild(typesFieldset);
        form.appendChild(typesSection);

        this.contentArea.appendChild(form);
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons popup-buttons--space-between';

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.gap = '8px';

        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.gap = '8px';

        // Кнопка отписки (только для редактирования)
        if (this.existingSubscription) {
            const deleteBtn = Popup.createButton('🗑 Отписаться', 'danger', () => this.handleDelete());
            leftGroup.appendChild(deleteBtn);
        }

        // Кнопки справа
        const cancelBtn = Popup.createButton('Отмена', 'secondary', () => this.handleCancel());
        const saveBtn = Popup.createButton('Сохранить', 'primary', () => this.handleSubmit());

        rightGroup.appendChild(cancelBtn);
        rightGroup.appendChild(saveBtn);

        container.appendChild(leftGroup);
        container.appendChild(rightGroup);
        this.popupEl.appendChild(container);
    }

    async handleSubmit() {
        const depthRadio = this.contentArea.querySelector('input[name="subscription-depth"]:checked');
        const depth = depthRadio ? parseInt(depthRadio.value, 10) : 1;

        const data = {
            block_id: this.blockId,
            depth,
            on_text_change: this.contentArea.querySelector('input[name="on_text_change"]').checked,
            on_data_change: this.contentArea.querySelector('input[name="on_data_change"]').checked,
            on_move: this.contentArea.querySelector('input[name="on_move"]').checked,
            on_child_add: this.contentArea.querySelector('input[name="on_child_add"]').checked,
            on_child_delete: this.contentArea.querySelector('input[name="on_child_delete"]').checked
        };

        try {
            if (this.existingSubscription) {
                await api.updateSubscription(this.existingSubscription.id, data);
            } else {
                await api.createSubscription(data);
            }

            if (typeof this.onSave === 'function') {
                this.onSave(data);
            }
            dispatch('SubscriptionUpdated', { blockId: this.blockId });
            this.close();
        } catch (error) {
            console.error('Failed to save subscription:', error);
            const message = error.response?.data?.detail || 'Не удалось сохранить подписку';
            this.showMessage(message, 'error');
        }
    }

    async handleDelete() {
        if (!this.existingSubscription) return;

        try {
            await api.deleteSubscription(this.existingSubscription.id);
            if (typeof this.onDelete === 'function') {
                this.onDelete(this.existingSubscription.id);
            }
            dispatch('SubscriptionUpdated', { blockId: this.blockId });
            this.close();
        } catch (error) {
            console.error('Failed to delete subscription:', error);
            this.showMessage('Не удалось удалить подписку', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
