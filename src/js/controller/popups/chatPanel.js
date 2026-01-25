/**
 * ChatPanel - Панель P2P и групповых чатов
 *
 * Включает:
 * - Вкладки: "Личные" / "Группы"
 * - Список диалогов/групп
 * - Поиск контактов
 * - Индикатор непрочитанных
 */

import { Popup } from './popup.js';
import { dispatch } from '../../utils/utils.js';
import chatApi from '../../api/chatApi.js';
import { ConversationView } from './conversationView.js';
import { GroupChatView } from './groupChatView.js';

export class ChatPanel extends Popup {
    constructor() {
        super({
            title: 'Чаты',
            size: 'lg',
            modal: true,
            draggable: true,
            closeOnOverlay: true,
            closeOnEsc: true
        });

        this.activeTab = 'dm'; // 'dm' | 'groups'
        this.conversations = [];
        this.groups = [];
        this.contacts = [];
        this.unreadCount = { dm: 0, groups: 0 };
        this.searchQuery = '';
        this.isLoading = false;

        this.init();
    }

    async init() {
        this.renderContent();
        this.bindChatEvents();
        await this.loadData();
    }

    renderContent() {
        this.contentArea.innerHTML = '';
        this.contentArea.className = 'popup-content p2p-chat-panel';

        // Tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'p2p-chat-tabs';

        const dmTab = document.createElement('button');
        dmTab.className = `p2p-chat-tab ${this.activeTab === 'dm' ? 'active' : ''}`;
        dmTab.innerHTML = `Личные <span class="p2p-chat-badge" id="dm-badge" style="display: ${this.unreadCount.dm > 0 ? 'inline' : 'none'}">${this.unreadCount.dm}</span>`;
        dmTab.addEventListener('click', () => this.switchTab('dm'));

        const groupsTab = document.createElement('button');
        groupsTab.className = `p2p-chat-tab ${this.activeTab === 'groups' ? 'active' : ''}`;
        groupsTab.innerHTML = `Группы <span class="p2p-chat-badge" id="groups-badge" style="display: ${this.unreadCount.groups > 0 ? 'inline' : 'none'}">${this.unreadCount.groups}</span>`;
        groupsTab.addEventListener('click', () => this.switchTab('groups'));

        tabsContainer.appendChild(dmTab);
        tabsContainer.appendChild(groupsTab);
        this.contentArea.appendChild(tabsContainer);

        // Info hint about shared blocks requirement
        const infoHint = document.createElement('div');
        infoHint.className = 'p2p-chat-info-hint';
        infoHint.innerHTML = `
            <span class="p2p-chat-info-icon">ℹ️</span>
            <span>Чат доступен только с пользователями, у которых есть общие блоки с вами</span>
        `;
        this.contentArea.appendChild(infoHint);

        // Search
        const searchContainer = document.createElement('div');
        searchContainer.className = 'p2p-chat-search';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'p2p-chat-search-input';
        searchInput.placeholder = this.activeTab === 'dm' ? 'Поиск контактов...' : 'Поиск групп...';
        searchInput.value = this.searchQuery;
        searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.searchInput = searchInput;

        searchContainer.appendChild(searchInput);
        this.contentArea.appendChild(searchContainer);

        // List container
        const listContainer = document.createElement('div');
        listContainer.className = 'p2p-chat-list';
        listContainer.id = 'p2p-chat-list';
        this.listContainer = listContainer;
        this.contentArea.appendChild(listContainer);

        // Loading indicator
        const loadingEl = document.createElement('div');
        loadingEl.className = 'p2p-chat-loading';
        loadingEl.textContent = 'Загрузка...';
        loadingEl.style.display = this.isLoading ? 'block' : 'none';
        loadingEl.id = 'p2p-chat-loading';
        this.loadingEl = loadingEl;
        this.contentArea.appendChild(loadingEl);

        // Create group button (only for groups tab)
        if (this.activeTab === 'groups') {
            const createBtn = document.createElement('button');
            createBtn.className = 'p2p-chat-create-btn';
            createBtn.textContent = '+ Создать группу';
            createBtn.addEventListener('click', () => this.showCreateGroupDialog());
            this.contentArea.appendChild(createBtn);
        }

        this.renderList();
    }

    renderList() {
        if (!this.listContainer) return;

        this.listContainer.innerHTML = '';

        const items = this.activeTab === 'dm' ? this.getFilteredConversations() : this.getFilteredGroups();

        if (items.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'p2p-chat-empty';
            emptyEl.textContent = this.activeTab === 'dm'
                ? 'Нет диалогов. Поделитесь блоками с другими пользователями, чтобы начать общение.'
                : 'Нет групп. Создайте группу или присоединитесь к существующей.';
            this.listContainer.appendChild(emptyEl);
            return;
        }

        items.forEach(item => {
            const itemEl = this.activeTab === 'dm'
                ? this.createConversationItem(item)
                : this.createGroupItem(item);
            this.listContainer.appendChild(itemEl);
        });
    }

    createConversationItem(conversation) {
        const item = document.createElement('div');
        item.className = 'p2p-chat-item';
        item.setAttribute('data-user-id', conversation.user_id);

        const avatar = document.createElement('div');
        avatar.className = 'p2p-chat-avatar';

        // Show avatar image if available
        if (conversation.avatar_url) {
            const img = document.createElement('img');
            img.className = 'p2p-avatar-img';
            img.src = conversation.avatar_url;
            img.alt = '';
            // Fallback to initials on error
            img.onerror = () => {
                img.remove();
                avatar.textContent = (conversation.username || 'U').charAt(0).toUpperCase();
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = (conversation.username || 'U').charAt(0).toUpperCase();
        }

        const content = document.createElement('div');
        content.className = 'p2p-chat-item-content';

        const header = document.createElement('div');
        header.className = 'p2p-chat-item-header';

        const name = document.createElement('span');
        name.className = 'p2p-chat-item-name';
        name.textContent = conversation.username || `User ${conversation.user_id}`;

        const time = document.createElement('span');
        time.className = 'p2p-chat-item-time';
        time.textContent = this.formatTime(conversation.last_message?.created_at);

        header.appendChild(name);
        header.appendChild(time);

        const preview = document.createElement('div');
        preview.className = 'p2p-chat-item-preview';
        preview.textContent = conversation.last_message?.content || 'Нет сообщений';

        content.appendChild(header);
        content.appendChild(preview);

        item.appendChild(avatar);
        item.appendChild(content);

        if (conversation.unread_count > 0) {
            const badge = document.createElement('span');
            badge.className = 'p2p-chat-unread-badge';
            badge.textContent = conversation.unread_count;
            item.appendChild(badge);
        }

        item.addEventListener('click', () => this.openConversation(conversation));

        return item;
    }

    createGroupItem(group) {
        const item = document.createElement('div');
        item.className = 'p2p-chat-item';
        item.setAttribute('data-group-id', group.id);

        const avatar = document.createElement('div');
        avatar.className = 'p2p-chat-avatar p2p-chat-avatar--group';

        // Show avatar image if available
        if (group.avatar_url) {
            const img = document.createElement('img');
            img.className = 'p2p-avatar-img';
            img.src = group.avatar_url;
            img.alt = '';
            // Fallback to initials on error
            img.onerror = () => {
                img.remove();
                avatar.textContent = (group.name || 'G').charAt(0).toUpperCase();
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = (group.name || 'G').charAt(0).toUpperCase();
        }

        const content = document.createElement('div');
        content.className = 'p2p-chat-item-content';

        const header = document.createElement('div');
        header.className = 'p2p-chat-item-header';

        const name = document.createElement('span');
        name.className = 'p2p-chat-item-name';
        name.textContent = group.name;

        const time = document.createElement('span');
        time.className = 'p2p-chat-item-time';
        time.textContent = this.formatTime(group.last_message?.created_at);

        header.appendChild(name);
        header.appendChild(time);

        const preview = document.createElement('div');
        preview.className = 'p2p-chat-item-preview';

        if (group.last_message) {
            const sender = group.last_message.sender_username || 'Участник';
            preview.textContent = `${sender}: ${group.last_message.content}`;
        } else {
            preview.textContent = `${group.members_count || 0} участников`;
        }

        content.appendChild(header);
        content.appendChild(preview);

        item.appendChild(avatar);
        item.appendChild(content);

        if (group.unread_count > 0) {
            const badge = document.createElement('span');
            badge.className = 'p2p-chat-unread-badge';
            badge.textContent = group.unread_count;
            item.appendChild(badge);
        }

        item.addEventListener('click', () => this.openGroup(group));

        return item;
    }

    getFilteredConversations() {
        if (!this.searchQuery) return this.conversations;

        const query = this.searchQuery.toLowerCase();
        return this.conversations.filter(c =>
            (c.username || '').toLowerCase().includes(query)
        );
    }

    getFilteredGroups() {
        if (!this.searchQuery) return this.groups;

        const query = this.searchQuery.toLowerCase();
        return this.groups.filter(g =>
            (g.name || '').toLowerCase().includes(query)
        );
    }

    async loadData() {
        this.setLoading(true);

        try {
            const [unreadRes, conversationsRes, groupsRes] = await Promise.allSettled([
                chatApi.getUnreadCount(),
                chatApi.getConversations(),
                chatApi.getChatGroups()
            ]);

            if (unreadRes.status === 'fulfilled') {
                this.unreadCount = unreadRes.value.data || { dm: 0, groups: 0 };
                this.updateBadges();
            }

            if (conversationsRes.status === 'fulfilled') {
                this.conversations = conversationsRes.value.data || [];
            }

            if (groupsRes.status === 'fulfilled') {
                this.groups = groupsRes.value.data || [];
            }

            this.renderList();
        } catch (error) {
            console.error('Failed to load chat data:', error);
            this.showMessage('Не удалось загрузить чаты', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(value) {
        this.isLoading = value;
        if (this.loadingEl) {
            this.loadingEl.style.display = value ? 'block' : 'none';
        }
    }

    updateBadges() {
        const dmBadge = document.getElementById('dm-badge');
        const groupsBadge = document.getElementById('groups-badge');

        if (dmBadge) {
            dmBadge.textContent = this.unreadCount.dm || 0;
            dmBadge.style.display = this.unreadCount.dm > 0 ? 'inline' : 'none';
        }

        if (groupsBadge) {
            groupsBadge.textContent = this.unreadCount.groups || 0;
            groupsBadge.style.display = this.unreadCount.groups > 0 ? 'inline' : 'none';
        }

        // Dispatch global event for sidebar badge update
        dispatch('ChatUnreadUpdated', {
            dm: this.unreadCount.dm,
            groups: this.unreadCount.groups,
            total: (this.unreadCount.dm || 0) + (this.unreadCount.groups || 0)
        });
    }

    switchTab(tab) {
        if (this.activeTab === tab) return;

        this.activeTab = tab;
        this.searchQuery = '';
        this.renderContent();
    }

    handleSearch(query) {
        this.searchQuery = query;
        this.renderList();
    }

    formatTime(isoDate) {
        if (!isoDate) return '';

        const date = new Date(isoDate);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Вчера';
        } else if (diffDays < 7) {
            return date.toLocaleDateString('ru-RU', { weekday: 'short' });
        } else {
            return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        }
    }

    openConversation(conversation) {
        this.close();
        new ConversationView(conversation);
    }

    openGroup(group) {
        this.close();
        new GroupChatView(group);
    }

    showCreateGroupDialog() {
        const name = prompt('Введите название группы:');
        if (name && name.trim()) {
            this.createGroup(name.trim());
        }
    }

    async createGroup(name) {
        try {
            const response = await chatApi.createChatGroup(name);
            const newGroup = response.data;
            this.groups.unshift(newGroup);
            this.renderList();
            dispatch('ChatGroupCreated', newGroup);
        } catch (error) {
            console.error('Failed to create group:', error);
            this.showMessage('Не удалось создать группу', 'error');
        }
    }

    bindChatEvents() {
        // Listen for new messages
        this.newMessageHandler = (e) => {
            const { type, data } = e.detail || {};
            if (type === 'dm') {
                this.handleNewDirectMessage(data);
            } else if (type === 'group_message') {
                this.handleNewGroupMessage(data);
            }
        };
        window.addEventListener('ChatEvent', this.newMessageHandler);

        // Listen for unread count updates
        this.unreadUpdateHandler = (e) => {
            this.unreadCount = e.detail;
            this.updateBadges();
        };
        window.addEventListener('ChatUnreadCountUpdate', this.unreadUpdateHandler);

        // Listen for messages marked as read
        this.messagesReadHandler = (e) => {
            const { type, userId, groupId, id } = e.detail || {};
            // Support both userId/groupId and generic id for backwards compatibility
            if (type === 'dm' && (userId || id)) {
                this.handleMessagesRead('dm', userId || id);
            } else if (type === 'group' && (groupId || id)) {
                this.handleMessagesRead('group', groupId || id);
            }
        };
        window.addEventListener('ChatMessagesRead', this.messagesReadHandler);
    }

    handleMessagesRead(type, id) {
        if (type === 'dm') {
            // eslint-disable-next-line eqeqeq
            const conv = this.conversations.find(c => c.user_id == id);
            if (conv) {
                conv.unread_count = 0;
                this.renderList();
            }
        } else if (type === 'group') {
            // eslint-disable-next-line eqeqeq
            const group = this.groups.find(g => g.id == id);
            if (group) {
                group.unread_count = 0;
                this.renderList();
            }
        }
    }

    handleNewDirectMessage(data) {
        // Find or create conversation
        // eslint-disable-next-line eqeqeq
        const existingIndex = this.conversations.findIndex(c => c.user_id == data.sender_id);
        if (existingIndex >= 0) {
            const conv = this.conversations[existingIndex];
            conv.last_message = data.message;
            conv.unread_count = (conv.unread_count || 0) + 1;
            // Move to top
            this.conversations.splice(existingIndex, 1);
            this.conversations.unshift(conv);
        }
        this.renderList();
    }

    handleNewGroupMessage(data) {
        // eslint-disable-next-line eqeqeq
        const existingIndex = this.groups.findIndex(g => g.id == data.group_id);
        if (existingIndex >= 0) {
            const group = this.groups[existingIndex];
            group.last_message = data.message;
            group.unread_count = (group.unread_count || 0) + 1;
            // Move to top
            this.groups.splice(existingIndex, 1);
            this.groups.unshift(group);
        }
        this.renderList();
    }

    close() {
        // Cleanup event listeners
        if (this.newMessageHandler) {
            window.removeEventListener('ChatEvent', this.newMessageHandler);
        }
        if (this.unreadUpdateHandler) {
            window.removeEventListener('ChatUnreadCountUpdate', this.unreadUpdateHandler);
        }
        if (this.messagesReadHandler) {
            window.removeEventListener('ChatMessagesRead', this.messagesReadHandler);
        }
        super.close();
    }

    // Override buttons - we don't need OK/Cancel
    createButtons() {
        // No buttons for chat panel
    }
}

// Singleton instance
let chatPanelInstance = null;

export function openChatPanel() {
    if (chatPanelInstance) {
        chatPanelInstance.close();
        chatPanelInstance = null;
    }
    chatPanelInstance = new ChatPanel();
    return chatPanelInstance;
}

export function closeChatPanel() {
    if (chatPanelInstance) {
        chatPanelInstance.close();
        chatPanelInstance = null;
    }
}

// Сброс инстанса при закрытии попапа (вызывается из метода close класса Popup)
export function resetChatPanelInstance() {
    chatPanelInstance = null;
}
