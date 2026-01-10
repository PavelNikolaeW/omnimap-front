/**
 * CreateGroupModal - модальное окно для создания групповых чатов
 *
 * Заменяет prompt() на полноценный UI:
 * - Поле названия группы
 * - Поиск и выбор участников (chips)
 * - Создание группы + добавление выбранных участников
 */

import chatApi from '../../api/chatApi';

export class CreateGroupModal {
    /**
     * @param {Object} options
     * @param {Function} options.onCreate - Callback при создании группы (group) => void
     * @param {Function} options.onClose - Callback при закрытии
     */
    constructor(options = {}) {
        this.onCreate = options.onCreate;
        this.onClose = options.onClose;

        this.selectedUsers = [];
        this.searchResults = [];
        this.selectedIndex = -1;
        this.debounceTimer = null;
        this.isLoading = false;

        this.element = null;
        this.overlay = null;
        this.nameInput = null;
        this.searchInput = null;
        this.resultsList = null;
        this.selectedContainer = null;
        this.createBtn = null;

        this.render();
        this.bindEvents();
    }

    render() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'create-group-modal-overlay';

        // Modal container
        this.element = document.createElement('div');
        this.element.className = 'create-group-modal';

        // Header
        const header = document.createElement('div');
        header.className = 'create-group-modal__header';
        header.innerHTML = `
            <h3>Создать группу</h3>
            <button class="create-group-modal__close" type="button" aria-label="Закрыть">&times;</button>
        `;

        // Content
        const content = document.createElement('div');
        content.className = 'create-group-modal__content';

        // Group name field
        const nameField = document.createElement('div');
        nameField.className = 'create-group-modal__field';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'create-group-modal__label';
        nameLabel.textContent = 'Название группы';

        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.className = 'create-group-modal__name-input';
        this.nameInput.placeholder = 'Введите название...';
        this.nameInput.autocomplete = 'off';
        this.nameInput.spellcheck = false;

        nameField.appendChild(nameLabel);
        nameField.appendChild(this.nameInput);

        // Members field
        const membersField = document.createElement('div');
        membersField.className = 'create-group-modal__field';

        const membersLabel = document.createElement('label');
        membersLabel.className = 'create-group-modal__label';
        membersLabel.textContent = 'Добавить участников (опционально)';

        // Selected members chips
        this.selectedContainer = document.createElement('div');
        this.selectedContainer.className = 'create-group-modal__selected';

        // Search input
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'create-group-modal__search-wrapper';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.className = 'create-group-modal__search-input';
        this.searchInput.placeholder = 'Поиск пользователей...';
        this.searchInput.autocomplete = 'off';
        this.searchInput.spellcheck = false;

        searchWrapper.appendChild(this.searchInput);

        // Results list
        this.resultsList = document.createElement('ul');
        this.resultsList.className = 'create-group-modal__results';

        membersField.appendChild(membersLabel);
        membersField.appendChild(this.selectedContainer);
        membersField.appendChild(searchWrapper);
        membersField.appendChild(this.resultsList);

        // Message container
        this.messageEl = document.createElement('div');
        this.messageEl.className = 'create-group-modal__message';

        content.appendChild(nameField);
        content.appendChild(membersField);
        content.appendChild(this.messageEl);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'create-group-modal__footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'create-group-modal__btn create-group-modal__btn--cancel';
        cancelBtn.textContent = 'Отмена';

        this.createBtn = document.createElement('button');
        this.createBtn.type = 'button';
        this.createBtn.className = 'create-group-modal__btn create-group-modal__btn--create';
        this.createBtn.textContent = 'Создать';

        footer.appendChild(cancelBtn);
        footer.appendChild(this.createBtn);

        this.element.appendChild(header);
        this.element.appendChild(content);
        this.element.appendChild(footer);

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        // Focus name input after render
        requestAnimationFrame(() => {
            this.nameInput.focus();
        });
    }

    bindEvents() {
        // Close button
        this.element.querySelector('.create-group-modal__close').addEventListener('click', () => {
            this.close();
        });

        // Cancel button
        this.element.querySelector('.create-group-modal__btn--cancel').addEventListener('click', () => {
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

        // Create button
        this.createBtn.addEventListener('click', () => {
            this.createGroup();
        });

        // Name input - Enter to create
        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createGroup();
            }
        });

        // Search input
        this.searchInput.addEventListener('input', () => {
            this.handleSearch();
        });

        this.searchInput.addEventListener('keydown', (e) => {
            this.handleSearchKeydown(e);
        });

        // Results list click
        this.resultsList.addEventListener('click', (e) => {
            const item = e.target.closest('.create-group-modal__result-item');
            if (item) {
                const index = parseInt(item.dataset.index, 10);
                if (!isNaN(index)) {
                    this.addUser(index);
                }
            }
        });

        // Selected chips click (remove)
        this.selectedContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.create-group-modal__chip-remove');
            if (removeBtn) {
                const userId = parseInt(removeBtn.dataset.userId, 10);
                this.removeUser(userId);
            }
        });
    }

    handleSearch() {
        const query = this.searchInput.value.trim();

        // Clear previous timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

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

        try {
            const response = await chatApi.searchUsers(query);
            const users = response.data || [];

            // Filter out already selected users
            const selectedIds = new Set(this.selectedUsers.map(u => u.id));
            this.searchResults = users.filter(user => !selectedIds.has(user.id));

            this.selectedIndex = this.searchResults.length > 0 ? 0 : -1;
            this.renderResults();
        } catch (error) {
            console.error('Failed to search users:', error);
            this.searchResults = [];
        } finally {
            this.isLoading = false;
        }
    }

    renderResults() {
        this.resultsList.innerHTML = '';

        if (this.searchResults.length === 0) {
            if (this.searchInput.value.trim().length >= 2 && !this.isLoading) {
                const empty = document.createElement('li');
                empty.className = 'create-group-modal__result-empty';
                empty.textContent = 'Пользователи не найдены';
                this.resultsList.appendChild(empty);
            }
            return;
        }

        this.searchResults.forEach((user, index) => {
            const item = document.createElement('li');
            item.className = 'create-group-modal__result-item';
            item.dataset.index = index;

            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }

            const avatar = document.createElement('span');
            avatar.className = 'create-group-modal__result-avatar';
            avatar.textContent = user.username.charAt(0).toUpperCase();

            const username = document.createElement('span');
            username.className = 'create-group-modal__result-username';
            username.textContent = user.username;

            item.appendChild(avatar);
            item.appendChild(username);
            this.resultsList.appendChild(item);
        });
    }

    handleSearchKeydown(e) {
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
                    this.addUser(this.selectedIndex);
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
        const items = this.resultsList.querySelectorAll('.create-group-modal__result-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });

        // Scroll into view
        const selectedItem = items[this.selectedIndex];
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'nearest' });
        }
    }

    addUser(index) {
        const user = this.searchResults[index];
        if (!user) return;

        this.selectedUsers.push(user);
        this.renderSelectedChips();

        // Clear search
        this.searchInput.value = '';
        this.searchResults = [];
        this.renderResults();
        this.searchInput.focus();
    }

    removeUser(userId) {
        this.selectedUsers = this.selectedUsers.filter(u => u.id !== userId);
        this.renderSelectedChips();
    }

    renderSelectedChips() {
        this.selectedContainer.innerHTML = '';

        this.selectedUsers.forEach(user => {
            const chip = document.createElement('span');
            chip.className = 'create-group-modal__chip';

            const name = document.createElement('span');
            name.textContent = user.username;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'create-group-modal__chip-remove';
            removeBtn.dataset.userId = user.id;
            removeBtn.textContent = '\u00d7';

            chip.appendChild(name);
            chip.appendChild(removeBtn);
            this.selectedContainer.appendChild(chip);
        });
    }

    async createGroup() {
        const name = this.nameInput.value.trim();

        if (!name) {
            this.showMessage('Введите название группы', 'error');
            this.nameInput.focus();
            return;
        }

        this.isLoading = true;
        this.createBtn.disabled = true;
        this.showMessage('Создание группы...', 'info');

        try {
            // Create the group
            const response = await chatApi.createChatGroup(name);
            const group = response.data;

            // Add selected members in parallel using Promise.allSettled
            if (this.selectedUsers.length > 0) {
                const results = await Promise.allSettled(
                    this.selectedUsers.map(user =>
                        chatApi.addChatGroupMember(group.id, user.id)
                    )
                );

                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length > 0) {
                    console.warn(`Failed to add ${failed.length} of ${this.selectedUsers.length} members`);
                }
            }

            if (this.onCreate) {
                this.onCreate(group);
            }

            this.close();
        } catch (error) {
            console.error('Failed to create group:', error);
            this.showMessage('Не удалось создать группу', 'error');
            this.isLoading = false;
            this.createBtn.disabled = false;
        }
    }

    showMessage(text, type = 'info') {
        this.messageEl.textContent = text;
        this.messageEl.className = `create-group-modal__message create-group-modal__message--${type}`;
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
 * Helper function to show CreateGroupModal
 * @param {Object} options
 * @returns {CreateGroupModal}
 */
export function showCreateGroupModal(options) {
    return new CreateGroupModal(options);
}
