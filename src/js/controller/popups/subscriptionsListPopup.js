import { Popup } from './popup.js';
import api from '../../api/api.js';
import { dispatch } from '../../utils/utils.js';
import { SubscriptionPopup } from './subscriptionPopup.js';

/**
 * Popup для отображения списка всех подписок пользователя
 */
export class SubscriptionsListPopup extends Popup {
    constructor(options = {}) {
        super({
            title: '👁 Мои подписки',
            size: 'lg',
            modal: true,
            closeOnEsc: true,
            closeOnOverlay: true,
            ...options
        });

        this.onOpen = options.onOpen;
        this.subscriptions = [];
        this.limits = { used: 0, max: 50 };

        this.init();
    }

    async init() {
        this.showLoading();
        await this.loadSubscriptions();
        this.renderContent();
    }

    showLoading() {
        this.contentArea.innerHTML = `
            <div class="popup-loading">
                <div class="popup-spinner"></div>
                Загрузка...
            </div>
        `;
    }

    async loadSubscriptions() {
        try {
            const res = await api.getSubscriptions();
            this.subscriptions = res.data?.subscriptions || res.data || [];
            if (res.data?.limits) {
                this.limits = res.data.limits;
            }
        } catch (err) {
            console.error('Failed to load subscriptions:', err);
            this.subscriptions = [];
        }
    }

    renderContent() {
        this.contentArea.innerHTML = '';

        // Лимиты
        const limitsSection = document.createElement('div');
        limitsSection.style.cssText = 'margin-bottom: 16px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 13px;';
        limitsSection.innerHTML = `
            Всего подписок: <strong>${this.subscriptions.length}</strong> из <strong>${this.limits.max}</strong> (лимит)
        `;
        this.contentArea.appendChild(limitsSection);

        // Список подписок
        const list = document.createElement('div');
        list.className = 'popup-list';
        list.style.maxHeight = '400px';
        list.style.overflowY = 'auto';

        if (this.subscriptions.length === 0) {
            list.innerHTML = `
                <div class="popup-list-empty">
                    Нет активных подписок
                </div>
            `;
        } else {
            this.subscriptions.forEach(subscription => {
                list.appendChild(this.createSubscriptionItem(subscription));
            });
        }

        this.contentArea.appendChild(list);
    }

    createSubscriptionItem(subscription) {
        const item = document.createElement('div');
        item.className = 'popup-list-item';
        item.style.cursor = 'pointer';

        const depthLabels = {
            0: 'Только блок',
            1: '1 уровень',
            2: '2 уровня',
            3: '3 уровня',
            '-1': 'Все потомки'
        };

        const depthLabel = depthLabels[subscription.depth] || `${subscription.depth} уровней`;

        item.innerHTML = `
            <div class="popup-list-item__content" style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>📝</span>
                    <span style="font-weight: 500;">${this.escapeHtml(subscription.block_title || 'Без названия')}</span>
                </div>
                <div style="color: #6b7280; font-size: 12px; margin-top: 4px;">
                    Глубина: ${depthLabel}
                </div>
            </div>
            <div class="popup-list-item__actions">
                <button type="button" class="popup-btn popup-btn--sm popup-btn--ghost" data-action="settings" title="Настройки">⚙️</button>
                <button type="button" class="popup-btn popup-btn--sm popup-btn--ghost" data-action="delete" title="Отписаться">🗑</button>
            </div>
        `;

        // Клик на item — переход к блоку
        item.querySelector('.popup-list-item__content').addEventListener('click', () => {
            if (typeof this.onOpen === 'function' && subscription.block_id) {
                this.close();
                this.onOpen(subscription.block_id);
            }
        });

        // Кнопка настроек
        item.querySelector('[data-action="settings"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleEditSubscription(subscription);
        });

        // Кнопка удаления
        item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteSubscription(subscription);
        });

        return item;
    }

    async handleEditSubscription(subscription) {
        this.close();

        new SubscriptionPopup({
            blockId: subscription.block_id,
            blockTitle: subscription.block_title,
            existingSubscription: subscription,
            onSave: () => {
                dispatch('SubscriptionUpdated', { blockId: subscription.block_id });
            },
            onDelete: () => {
                dispatch('SubscriptionUpdated', { blockId: subscription.block_id });
            },
            onCancel: () => {}
        });
    }

    async handleDeleteSubscription(subscription) {
        if (!confirm('Отписаться от этого блока?')) return;

        try {
            await api.deleteSubscription(subscription.id);
            this.subscriptions = this.subscriptions.filter(s => s.id !== subscription.id);
            this.renderContent();
            dispatch('SubscriptionUpdated', { blockId: subscription.block_id });
        } catch (err) {
            console.error('Failed to delete subscription:', err);
            this.showMessage('Не удалось удалить подписку', 'error');
        }
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons';

        const closeBtn = Popup.createButton('Закрыть', 'secondary', () => this.handleCancel());
        container.appendChild(closeBtn);

        this.popupEl.appendChild(container);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
