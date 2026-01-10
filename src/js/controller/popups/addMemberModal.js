/**
 * AddMemberModal - модальное окно для добавления участника в группу
 *
 * Заменяет prompt() на полноценный UI с автокомплитом:
 * - Поле поиска с debounce (300ms)
 * - Fuzzy match для поиска
 * - Фильтрация уже добавленных участников
 * - Навигация стрелками + Enter
 */

import chatApi from '../../api/chatApi';
import api from '../../api/api';
import { featureFlags } from '../../config/featureFlags';

export class AddMemberModal {
    /**
     * @param {Object} options
     * @param {string} options.groupId - ID группы
     * @param {Array} options.existingMembers - Уже добавленные участники [{user_id, username}]
     * @param {Function} options.onAdd - Callback при добавлении (user) => void
     * @param {Function} options.onClose - Callback при закрытии
     */
    constructor(options = {}) {
        this.groupId = options.groupId;
        this.existingMembers = options.existingMembers || [];
        this.onAdd = options.onAdd;
        this.onClose = options.onClose;

        this.searchResults = [];
        this.selectedIndex = -1;
        this.debounceTimer = null;
        this.isLoading = false;

        this.element = null;
        this.overlay = null;
        this.input = null;
        this.resultsList = null;

        this.render();
        this.bindEvents();
    }

    render() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'add-member-modal-overlay';

        // Modal container
        this.element = document.createElement('div');
        this.element.className = 'add-member-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'add-member-modal__header';
        header.innerHTML = `
            <h3>Добавить участника</h3>
            <button class="add-member-modal__close" type="button" aria-label="Закрыть">&times;</button>
        `;

        // Content
        const content = document.createElement('div');
        content.className = 'add-member-modal__content';

        // Search input
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'add-member-modal__input-wrapper';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'add-member-modal__input';
        this.input.placeholder = 'Начните вводить имя пользователя...';
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;

        this.loadingIndicator = document.createElement('span');
        this.loadingIndicator.className = 'add-member-modal__loading';
        this.loadingIndicator.textContent = '';
        this.loadingIndicator.style.display = 'none';

        inputWrapper.appendChild(this.input);
        inputWrapper.appendChild(this.loadingIndicator);

        // Results list
        this.resultsList = document.createElement('ul');
        this.resultsList.className = 'add-member-modal__results';

        // Message container
        this.messageEl = document.createElement('div');
        this.messageEl.className = 'add-member-modal__message';

        content.appendChild(inputWrapper);
        content.appendChild(this.resultsList);
        content.appendChild(this.messageEl);

        this.element.appendChild(header);
        this.element.appendChild(content);

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        // Focus input after render
        requestAnimationFrame(() => {
            this.input.focus();
        });
    }

    bindEvents() {
        // Close button
        this.element.querySelector('.add-member-modal__close').addEventListener('click', () => {
            this.close();
        });

        // Overlay click
        this.overlay.addEventListener('click', () => {
            this.close();
        });

        // Escape key
        this.handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this.handleKeyDown);

        // Input events
        this.input.addEventListener('input', () => {
            this.handleInput();
        });

        this.input.addEventListener('keydown', (e) => {
            this.handleInputKeydown(e);
        });

        // Results list click
        this.resultsList.addEventListener('click', (e) => {
            const item = e.target.closest('.add-member-modal__result-item');
            if (item) {
                const index = parseInt(item.dataset.index, 10);
                if (!isNaN(index)) {
                    this.selectUser(index);
                }
            }
        });
    }

    handleInput() {
        const query = this.input.value.trim();

        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Clear message
        this.messageEl.textContent = '';
        this.messageEl.className = 'add-member-modal__message';

        if (query.length < 2) {
            this.searchResults = [];
            this.renderResults();
            return;
        }

        // Debounce search (300ms)
        this.debounceTimer = setTimeout(() => {
            this.searchUsers(query);
        }, 300);
    }

    async searchUsers(query) {
        this.isLoading = true;
        this.loadingIndicator.style.display = 'inline';

        try {
            const response = await chatApi.searchUsers(query);
            const users = response.data || [];

            // Filter out existing members
            const existingIds = new Set(this.existingMembers.map(m => m.user_id));
            this.searchResults = users.filter(user => !existingIds.has(user.id));

            // Sort by fuzzy match relevance
            this.searchResults = this.sortByRelevance(this.searchResults, query);

            this.selectedIndex = this.searchResults.length > 0 ? 0 : -1;
            this.renderResults();
        } catch (error) {
            console.error('Failed to search users:', error);
            this.searchResults = [];
            this.showMessage('Ошибка поиска', 'error');
        } finally {
            this.isLoading = false;
            this.loadingIndicator.style.display = 'none';
        }
    }

    /**
     * Sort users by relevance to query (fuzzy match)
     */
    sortByRelevance(users, query) {
        const lowerQuery = query.toLowerCase();

        return users
            .map(user => {
                const username = user.username.toLowerCase();
                let score = 0;

                // Exact match - highest priority
                if (username === lowerQuery) {
                    score = 100;
                }
                // Starts with query - high priority
                else if (username.startsWith(lowerQuery)) {
                    score = 80;
                }
                // Contains query - medium priority
                else if (username.includes(lowerQuery)) {
                    score = 60;
                }
                // Fuzzy match - calculate character matches
                else {
                    let matchCount = 0;
                    let lastIndex = -1;
                    for (const char of lowerQuery) {
                        const index = username.indexOf(char, lastIndex + 1);
                        if (index > lastIndex) {
                            matchCount++;
                            lastIndex = index;
                        }
                    }
                    score = (matchCount / lowerQuery.length) * 40;
                }

                return { user, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.user);
    }

    renderResults() {
        this.resultsList.innerHTML = '';

        if (this.searchResults.length === 0) {
            if (this.input.value.trim().length >= 2 && !this.isLoading) {
                const empty = document.createElement('li');
                empty.className = 'add-member-modal__result-empty';
                empty.textContent = 'Пользователи не найдены';
                this.resultsList.appendChild(empty);
            }
            return;
        }

        this.searchResults.forEach((user, index) => {
            const item = document.createElement('li');
            item.className = 'add-member-modal__result-item';
            item.dataset.index = index;

            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }

            const avatar = document.createElement('span');
            avatar.className = 'add-member-modal__result-avatar';
            avatar.textContent = user.username.charAt(0).toUpperCase();

            const info = document.createElement('div');
            info.className = 'add-member-modal__result-info';

            const username = document.createElement('span');
            username.className = 'add-member-modal__result-username';
            username.textContent = user.username;

            if (user.email) {
                const email = document.createElement('span');
                email.className = 'add-member-modal__result-email';
                email.textContent = user.email;
                info.appendChild(username);
                info.appendChild(email);
            } else {
                info.appendChild(username);
            }

            item.appendChild(avatar);
            item.appendChild(info);
            this.resultsList.appendChild(item);
        });
    }

    handleInputKeydown(e) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.moveSelection(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.moveSelection(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectUser(this.selectedIndex);
                }
                break;
        }
    }

    moveSelection(direction) {
        if (this.searchResults.length === 0) return;

        let newIndex = this.selectedIndex + direction;

        if (newIndex < 0) {
            newIndex = this.searchResults.length - 1;
        } else if (newIndex >= this.searchResults.length) {
            newIndex = 0;
        }

        this.selectedIndex = newIndex;
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const items = this.resultsList.querySelectorAll('.add-member-modal__result-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });

        // Scroll into view
        const selectedItem = items[this.selectedIndex];
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    async selectUser(index) {
        const user = this.searchResults[index];
        if (!user) return;

        this.isLoading = true;
        this.showMessage('Добавление...', 'info');

        try {
            // Выбираем API в зависимости от feature flag
            if (featureFlags.UNIFIED_GROUPS) {
                await api.addUserToGroup(this.groupId, { username: user.username });
            } else {
                await chatApi.addChatGroupMember(this.groupId, user.id);
            }

            if (this.onAdd) {
                this.onAdd(user);
            }

            this.close();
        } catch (error) {
            console.error('Failed to add member:', error);
            this.showMessage('Не удалось добавить участника', 'error');
            this.isLoading = false;
        }
    }

    showMessage(text, type = 'info') {
        this.messageEl.textContent = text;
        this.messageEl.className = `add-member-modal__message add-member-modal__message--${type}`;
    }

    close() {
        // Cleanup
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        document.removeEventListener('keydown', this.handleKeyDown);

        // Remove elements
        if (this.element) {
            this.element.remove();
        }
        if (this.overlay) {
            this.overlay.remove();
        }

        if (this.onClose) {
            this.onClose();
        }
    }
}

/**
 * Helper function to show AddMemberModal
 * @param {Object} options
 * @returns {AddMemberModal}
 */
export function showAddMemberModal(options) {
    return new AddMemberModal(options);
}
