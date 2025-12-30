/**
 * UnifiedChatPanel - Единая панель чатов (AI + DM + Groups)
 *
 * Fullscreen модальное окно с тремя вкладками:
 * - AI: Чаты с LLM
 * - Личные: Личные сообщения (DM)
 * - Группы: Групповые чаты
 */

import { dispatch } from '../../utils/utils.js';
import chatApi from '../../api/chatApi.js';
import llmApi from '../../api/llmApi.js';
import localforage from 'localforage';

// Типы чатов
const CHAT_TYPES = {
    AI: 'ai',
    DM: 'dm',
    GROUP: 'group'
};

// Дефолтные настройки AI
const DEFAULT_AI_SETTINGS = {
    model: 'gpt-4-turbo',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
    systemPrompt: ''
};

export class UnifiedChatPanel {
    constructor() {
        this.isOpen = false;
        this.activeTab = CHAT_TYPES.AI;
        this.activeChat = null; // { type, id, data }

        // Списки чатов
        this.aiDialogs = [];
        this.dmConversations = [];
        this.groups = [];

        // Сообщения текущего чата
        this.messages = [];
        this.isLoadingMessages = false;
        this.hasMoreMessages = true;
        this.oldestMessageId = null;

        // AI specific
        this.isStreaming = false;
        this.streamingContent = '';
        this.abortController = null;
        this.availableModels = [];
        this.tokenBalance = null;
        this.aiSettings = { ...DEFAULT_AI_SETTINGS };

        // P2P specific
        this.currentUserId = null;
        this.typingUsers = new Map(); // userId -> timeout

        // UI state
        this.isMobileSidebarOpen = false;
        this.showSettings = false;
        this.unreadCount = { dm: 0, groups: 0 };

        // DOM elements
        this.container = null;
        this.overlay = null;
        this.messagesContainer = null;
        this.messageInput = null;

        this.init();
    }

    async init() {
        this.currentUserId = await localforage.getItem('currentUser');
        this.render();
        this.bindEvents();
        this.open();
    }

    // =====================================================
    // RENDER
    // =====================================================

    render() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'llm-chat-overlay';
        this.overlay.addEventListener('click', () => this.close());

        // Container
        this.container = document.createElement('div');
        this.container.className = 'llm-chat-container unified-chat';

        this.container.innerHTML = `
            <header class="llm-chat-header">
                <div class="llm-chat-header-top">
                    <button class="llm-chat-mobile-menu-btn" id="mobile-menu-btn" title="Menu">☰</button>
                    <span class="llm-chat-title" id="chat-title">Чаты</span>
                    <div class="llm-chat-header-right">
                        <div class="llm-chat-token-balance" id="token-balance" style="display: none;">
                            <span class="llm-chat-token-icon">🪙</span>
                            <span id="token-balance-value">0</span>
                        </div>
                        <button class="llm-chat-settings-btn" id="settings-btn" title="Настройки">⚙️</button>
                        <button class="llm-chat-close-btn" id="close-btn">✕</button>
                    </div>
                </div>
            </header>

            <div class="llm-chat-body">
                <div class="llm-chat-sidebar-overlay" id="sidebar-overlay"></div>

                <aside class="llm-chat-sidebar" id="sidebar">
                    <div class="unified-chat-tabs">
                        <button class="unified-chat-tab active" data-tab="ai">
                            🤖 AI
                        </button>
                        <button class="unified-chat-tab" data-tab="dm">
                            💬 Личные
                            <span class="unified-chat-tab-badge" id="dm-badge" style="display: none;">0</span>
                        </button>
                        <button class="unified-chat-tab" data-tab="group">
                            👥 Группы
                            <span class="unified-chat-tab-badge" id="groups-badge" style="display: none;">0</span>
                        </button>
                    </div>

                    <div class="llm-chat-sidebar-header">
                        <span id="sidebar-title">AI Чаты</span>
                        <button class="llm-chat-newchat-btn" id="new-chat-btn">+ Новый</button>
                    </div>

                    <div class="llm-chat-conversation-list" id="chat-list">
                        <!-- Chat items will be rendered here -->
                    </div>
                </aside>

                <div class="llm-chat-settings-panel" id="settings-panel" style="display: none;">
                    <div class="llm-chat-settings-header">
                        <h3>Настройки AI</h3>
                        <button id="close-settings-btn">✕</button>
                    </div>
                    <div class="llm-chat-settings-content">
                        <div class="llm-chat-setting-group">
                            <label>Модель</label>
                            <select id="model-select"></select>
                        </div>
                        <div class="llm-chat-setting-group">
                            <label>Temperature: <span id="temp-value">0.7</span></label>
                            <input type="range" id="temperature" min="0" max="1" step="0.1" value="0.7">
                        </div>
                        <div class="llm-chat-setting-group">
                            <label>Max Tokens: <span id="tokens-value">4096</span></label>
                            <input type="range" id="max-tokens" min="256" max="16384" step="256" value="4096">
                        </div>
                        <div class="llm-chat-setting-group">
                            <label>System Prompt</label>
                            <textarea id="system-prompt" placeholder="Вы - полезный ассистент..." rows="4"></textarea>
                        </div>
                    </div>
                </div>

                <main class="llm-chat-main">
                    <div class="llm-chat-messages" id="messages-container">
                        <div class="llm-chat-welcome" id="welcome-message">
                            <h3>Добро пожаловать в чаты</h3>
                            <p>Выберите чат из списка слева или создайте новый</p>
                        </div>
                    </div>

                    <div class="llm-chat-typing-indicator" id="typing-indicator" style="display: none;">
                        <span id="typing-text">печатает...</span>
                    </div>

                    <div class="llm-chat-input-area" id="input-area">
                        <div class="llm-chat-input-row">
                            <textarea
                                class="llm-chat-textarea"
                                id="message-input"
                                placeholder="Введите сообщение..."
                                rows="2"
                            ></textarea>
                            <button class="llm-chat-send-btn" id="send-btn">
                                ➤ Отправить
                            </button>
                        </div>
                        <div class="llm-chat-footer-row">
                            <span>Enter - отправить, Shift+Enter - новая строка</span>
                            <span class="llm-chat-model-hint" id="model-hint"></span>
                        </div>
                    </div>
                </main>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.container);

        // Cache DOM elements
        this.messagesContainer = this.container.querySelector('#messages-container');
        this.messageInput = this.container.querySelector('#message-input');
        this.chatList = this.container.querySelector('#chat-list');
    }

    // =====================================================
    // EVENTS
    // =====================================================

    bindEvents() {
        // Close buttons
        this.container.querySelector('#close-btn').addEventListener('click', () => this.close());

        // Mobile menu
        this.container.querySelector('#mobile-menu-btn').addEventListener('click', () => this.toggleMobileSidebar());
        this.container.querySelector('#sidebar-overlay').addEventListener('click', () => this.toggleMobileSidebar(false));

        // Tabs
        this.container.querySelectorAll('.unified-chat-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // New chat button
        this.container.querySelector('#new-chat-btn').addEventListener('click', () => this.createNewChat());

        // Settings
        this.container.querySelector('#settings-btn').addEventListener('click', () => this.toggleSettings());
        this.container.querySelector('#close-settings-btn').addEventListener('click', () => this.toggleSettings(false));

        // Settings inputs
        this.container.querySelector('#model-select').addEventListener('change', (e) => {
            this.aiSettings.model = e.target.value;
            this.updateModelHint();
        });
        this.container.querySelector('#temperature').addEventListener('input', (e) => {
            this.aiSettings.temperature = parseFloat(e.target.value);
            this.container.querySelector('#temp-value').textContent = e.target.value;
        });
        this.container.querySelector('#max-tokens').addEventListener('input', (e) => {
            this.aiSettings.maxTokens = parseInt(e.target.value);
            this.container.querySelector('#tokens-value').textContent = e.target.value;
        });
        this.container.querySelector('#system-prompt').addEventListener('change', (e) => {
            this.aiSettings.systemPrompt = e.target.value;
        });

        // Message input
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.messageInput.addEventListener('input', () => this.handleInputChange());

        // Send button
        this.container.querySelector('#send-btn').addEventListener('click', () => this.sendMessage());

        // Scroll for infinite loading
        this.messagesContainer.addEventListener('scroll', () => this.handleScroll());

        // Escape to close
        this.escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.escHandler);

        // Chat events (WebSocket)
        this.chatEventHandler = (e) => this.handleChatEvent(e.detail);
        window.addEventListener('ChatEvent', this.chatEventHandler);

        this.typingHandler = (e) => this.handleTypingEvent(e.detail);
        window.addEventListener('TypingIndicator', this.typingHandler);
        window.addEventListener('GroupTypingIndicator', this.typingHandler);

        this.unreadHandler = (e) => this.updateUnreadBadges(e.detail);
        window.addEventListener('ChatUnreadCountUpdate', this.unreadHandler);
    }

    unbindEvents() {
        document.removeEventListener('keydown', this.escHandler);
        window.removeEventListener('ChatEvent', this.chatEventHandler);
        window.removeEventListener('TypingIndicator', this.typingHandler);
        window.removeEventListener('GroupTypingIndicator', this.typingHandler);
        window.removeEventListener('ChatUnreadCountUpdate', this.unreadHandler);
    }

    // =====================================================
    // OPEN / CLOSE
    // =====================================================

    async open() {
        this.isOpen = true;
        this.overlay.classList.add('open');
        this.container.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Load data
        await this.loadData();
    }

    close() {
        if (this.abortController) {
            this.abortController.abort();
        }

        this.isOpen = false;
        this.overlay.classList.remove('open');
        this.container.classList.remove('open');
        document.body.style.overflow = '';

        // Cleanup
        setTimeout(() => {
            this.unbindEvents();
            this.overlay.remove();
            this.container.remove();
            unifiedChatInstance = null;
        }, 300);
    }

    // =====================================================
    // DATA LOADING
    // =====================================================

    async loadData() {
        try {
            // Load all data in parallel
            const [aiDialogs, conversations, groups, unread, models, balance] = await Promise.allSettled([
                llmApi.getDialogs(),
                chatApi.getConversations(),
                chatApi.getChatGroups(),
                chatApi.getUnreadCount(),
                llmApi.getModels(),
                llmApi.getTokenBalance()
            ]);

            if (aiDialogs.status === 'fulfilled') {
                this.aiDialogs = aiDialogs.value || [];
            }
            if (conversations.status === 'fulfilled') {
                this.dmConversations = conversations.value.data || [];
            }
            if (groups.status === 'fulfilled') {
                this.groups = groups.value.data || [];
            }
            if (unread.status === 'fulfilled') {
                this.unreadCount = unread.value.data || { dm: 0, groups: 0 };
                this.updateUnreadBadges(this.unreadCount);
            }
            if (models.status === 'fulfilled') {
                this.availableModels = models.value || [];
                this.populateModelSelect();
            }
            if (balance.status === 'fulfilled' && balance.value) {
                this.tokenBalance = balance.value;
                this.updateTokenBalance();
            }

            this.renderChatList();
        } catch (error) {
            console.error('Failed to load chat data:', error);
        }
    }

    populateModelSelect() {
        const select = this.container.querySelector('#model-select');
        select.innerHTML = '';

        this.availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = `${model.name} (${this.formatContext(model.context_window)}) - ${model.provider}`;
            if (model.name === this.aiSettings.model) option.selected = true;
            select.appendChild(option);
        });

        this.updateModelHint();
    }

    formatContext(contextWindow) {
        if (!contextWindow) return '';
        if (contextWindow >= 1000000) return `${Math.round(contextWindow / 1000000)}M`;
        if (contextWindow >= 1000) return `${Math.round(contextWindow / 1000)}k`;
        return contextWindow.toString();
    }

    updateModelHint() {
        const hint = this.container.querySelector('#model-hint');
        if (this.activeTab === CHAT_TYPES.AI) {
            hint.textContent = this.aiSettings.model;
            hint.style.display = '';
        } else {
            hint.style.display = 'none';
        }
    }

    updateTokenBalance() {
        const balanceEl = this.container.querySelector('#token-balance');
        const valueEl = this.container.querySelector('#token-balance-value');

        if (this.tokenBalance && this.activeTab === CHAT_TYPES.AI) {
            valueEl.textContent = (this.tokenBalance.balance || 0).toLocaleString();
            balanceEl.style.display = '';
        } else {
            balanceEl.style.display = 'none';
        }
    }

    updateUnreadBadges(counts) {
        const dmBadge = this.container.querySelector('#dm-badge');
        const groupsBadge = this.container.querySelector('#groups-badge');

        if (counts.dm > 0) {
            dmBadge.textContent = counts.dm;
            dmBadge.style.display = '';
        } else {
            dmBadge.style.display = 'none';
        }

        if (counts.groups > 0) {
            groupsBadge.textContent = counts.groups;
            groupsBadge.style.display = '';
        } else {
            groupsBadge.style.display = 'none';
        }
    }

    // =====================================================
    // TABS
    // =====================================================

    switchTab(tab) {
        this.activeTab = tab;
        this.activeChat = null;
        this.messages = [];

        // Update tab buttons
        this.container.querySelectorAll('.unified-chat-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        // Update sidebar title
        const titles = {
            [CHAT_TYPES.AI]: 'AI Чаты',
            [CHAT_TYPES.DM]: 'Личные сообщения',
            [CHAT_TYPES.GROUP]: 'Групповые чаты'
        };
        this.container.querySelector('#sidebar-title').textContent = titles[tab];

        // Update new chat button text
        const newBtnTexts = {
            [CHAT_TYPES.AI]: '+ Новый',
            [CHAT_TYPES.DM]: '+ Найти',
            [CHAT_TYPES.GROUP]: '+ Создать'
        };
        this.container.querySelector('#new-chat-btn').textContent = newBtnTexts[tab];

        // Update UI
        this.updateTokenBalance();
        this.updateModelHint();
        this.renderChatList();
        this.renderWelcomeMessage();

        // Close mobile sidebar
        this.toggleMobileSidebar(false);
    }

    // =====================================================
    // CHAT LIST
    // =====================================================

    renderChatList() {
        this.chatList.innerHTML = '';

        let items = [];
        switch (this.activeTab) {
            case CHAT_TYPES.AI:
                items = this.aiDialogs.map(d => ({
                    type: CHAT_TYPES.AI,
                    id: d.id,
                    title: d.title || 'Новый чат',
                    subtitle: d.model_name || '',
                    time: d.created_at,
                    data: d
                }));
                break;
            case CHAT_TYPES.DM:
                items = this.dmConversations.map(c => ({
                    type: CHAT_TYPES.DM,
                    id: c.user_id,
                    title: c.username || `User ${c.user_id}`,
                    subtitle: c.last_message?.content || '',
                    time: c.last_message?.created_at,
                    unread: c.unread_count,
                    data: c
                }));
                break;
            case CHAT_TYPES.GROUP:
                items = this.groups.map(g => ({
                    type: CHAT_TYPES.GROUP,
                    id: g.id,
                    title: g.name,
                    subtitle: g.last_message ? `${g.last_message.sender_username}: ${g.last_message.content}` : `${g.members_count || 0} участников`,
                    time: g.last_message?.created_at,
                    unread: g.unread_count,
                    data: g
                }));
                break;
        }

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'llm-chat-empty-list';
            empty.textContent = this.getEmptyListText();
            this.chatList.appendChild(empty);
            return;
        }

        items.forEach(item => {
            const el = this.createChatItem(item);
            this.chatList.appendChild(el);
        });
    }

    getEmptyListText() {
        switch (this.activeTab) {
            case CHAT_TYPES.AI: return 'Нет AI чатов. Создайте новый!';
            case CHAT_TYPES.DM: return 'Нет диалогов. Найдите собеседника!';
            case CHAT_TYPES.GROUP: return 'Нет групп. Создайте группу!';
        }
    }

    createChatItem(item) {
        const el = document.createElement('div');
        el.className = 'llm-chat-conversation-item';
        if (this.activeChat?.id === item.id && this.activeChat?.type === item.type) {
            el.classList.add('active');
        }

        const avatarClass = item.type === CHAT_TYPES.GROUP ? 'unified-chat-avatar unified-chat-avatar--group' :
                           item.type === CHAT_TYPES.AI ? 'unified-chat-avatar unified-chat-avatar--ai' :
                           'unified-chat-avatar';

        const avatarIcon = item.type === CHAT_TYPES.AI ? '🤖' :
                          item.type === CHAT_TYPES.GROUP ? '👥' :
                          item.title.charAt(0).toUpperCase();

        el.innerHTML = `
            <div class="${avatarClass}">${avatarIcon}</div>
            <div class="llm-chat-conversation-info">
                <div class="llm-chat-conversation-title">${this.escapeHtml(item.title)}</div>
                <div class="llm-chat-conversation-meta">
                    ${item.subtitle ? `<span class="llm-chat-conv-subtitle">${this.escapeHtml(item.subtitle.slice(0, 50))}</span>` : ''}
                </div>
            </div>
            ${item.unread > 0 ? `<span class="unified-chat-unread-badge">${item.unread}</span>` : ''}
            <button class="llm-chat-conv-delete-btn" title="Удалить">✕</button>
        `;

        el.addEventListener('click', (e) => {
            if (!e.target.classList.contains('llm-chat-conv-delete-btn')) {
                this.selectChat(item);
            }
        });

        el.querySelector('.llm-chat-conv-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteChat(item);
        });

        return el;
    }

    // =====================================================
    // SELECT CHAT
    // =====================================================

    async selectChat(item) {
        this.activeChat = item;
        this.messages = [];
        this.hasMoreMessages = true;
        this.oldestMessageId = null;

        // Update UI
        this.renderChatList();
        this.container.querySelector('#chat-title').textContent = item.title;
        this.container.querySelector('#welcome-message').style.display = 'none';
        this.toggleMobileSidebar(false);

        // Load messages
        await this.loadMessages();

        // Mark as read for P2P chats
        if (item.type === CHAT_TYPES.DM) {
            await chatApi.markAsRead(item.id);
        } else if (item.type === CHAT_TYPES.GROUP) {
            await chatApi.markGroupAsRead(item.id);
        }

        // Load AI settings if applicable
        if (item.type === CHAT_TYPES.AI && item.data) {
            this.aiSettings.model = item.data.model_name || DEFAULT_AI_SETTINGS.model;
            this.aiSettings.systemPrompt = item.data.system_prompt || '';
            if (item.data.agent_config) {
                this.aiSettings.temperature = item.data.agent_config.temperature ?? DEFAULT_AI_SETTINGS.temperature;
                this.aiSettings.maxTokens = item.data.agent_config.max_tokens ?? DEFAULT_AI_SETTINGS.maxTokens;
                this.aiSettings.topP = item.data.agent_config.top_p ?? DEFAULT_AI_SETTINGS.topP;
            }
            this.updateSettingsUI();
        }
    }

    updateSettingsUI() {
        this.container.querySelector('#model-select').value = this.aiSettings.model;
        this.container.querySelector('#temperature').value = this.aiSettings.temperature;
        this.container.querySelector('#temp-value').textContent = this.aiSettings.temperature;
        this.container.querySelector('#max-tokens').value = this.aiSettings.maxTokens;
        this.container.querySelector('#tokens-value').textContent = this.aiSettings.maxTokens;
        this.container.querySelector('#system-prompt').value = this.aiSettings.systemPrompt;
        this.updateModelHint();
    }

    // =====================================================
    // MESSAGES
    // =====================================================

    async loadMessages(loadMore = false) {
        if (this.isLoadingMessages || !this.activeChat) return;
        if (loadMore && !this.hasMoreMessages) return;

        this.isLoadingMessages = true;

        try {
            let newMessages = [];

            switch (this.activeChat.type) {
                case CHAT_TYPES.AI:
                    if (!loadMore) {
                        newMessages = await llmApi.getMessages(this.activeChat.id);
                    }
                    this.hasMoreMessages = false; // AI doesn't support pagination
                    break;

                case CHAT_TYPES.DM:
                    const dmOptions = { limit: 50 };
                    if (loadMore && this.oldestMessageId) {
                        dmOptions.before = this.oldestMessageId;
                    }
                    const dmResponse = await chatApi.getMessages(this.activeChat.id, dmOptions);
                    newMessages = dmResponse.data || [];
                    if (newMessages.length < 50) this.hasMoreMessages = false;
                    break;

                case CHAT_TYPES.GROUP:
                    const groupOptions = { limit: 50 };
                    if (loadMore && this.oldestMessageId) {
                        groupOptions.before = this.oldestMessageId;
                    }
                    const groupResponse = await chatApi.getGroupMessages(this.activeChat.id, groupOptions);
                    newMessages = groupResponse.data || [];
                    if (newMessages.length < 50) this.hasMoreMessages = false;
                    break;
            }

            if (newMessages.length > 0) {
                this.oldestMessageId = newMessages[newMessages.length - 1].id;

                if (loadMore) {
                    // P2P messages come newest first, need to reverse and prepend
                    if (this.activeChat.type !== CHAT_TYPES.AI) {
                        this.messages = [...newMessages.reverse(), ...this.messages];
                    }
                } else {
                    // Initial load
                    if (this.activeChat.type === CHAT_TYPES.AI) {
                        this.messages = newMessages; // AI messages are already in order
                    } else {
                        this.messages = newMessages.reverse(); // P2P needs reverse
                    }
                }
            }

            this.renderMessages();

            if (!loadMore) {
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            this.isLoadingMessages = false;
        }
    }

    renderMessages() {
        this.messagesContainer.innerHTML = '';

        if (this.messages.length === 0) {
            this.renderWelcomeMessage();
            return;
        }

        // Group messages by date for P2P
        if (this.activeChat.type !== CHAT_TYPES.AI) {
            const grouped = this.groupMessagesByDate(this.messages);
            grouped.forEach(group => {
                // Date separator
                const separator = document.createElement('div');
                separator.className = 'unified-chat-date-separator';
                separator.textContent = group.dateLabel;
                this.messagesContainer.appendChild(separator);

                group.messages.forEach(msg => {
                    this.messagesContainer.appendChild(this.createMessageElement(msg));
                });
            });
        } else {
            // AI messages - no date grouping
            this.messages.forEach(msg => {
                this.messagesContainer.appendChild(this.createMessageElement(msg));
            });
        }
    }

    createMessageElement(message) {
        const el = document.createElement('div');

        if (this.activeChat.type === CHAT_TYPES.AI) {
            // AI message
            const isUser = message.role === 'user';
            el.className = `llm-chat-message ${isUser ? 'llm-chat-message-user' : 'llm-chat-message-assistant'}`;
            el.innerHTML = `
                <div class="llm-chat-message-content">${isUser ? this.escapeHtml(message.content) : this.formatMarkdown(message.content)}</div>
                <div class="llm-chat-message-meta">
                    <span>${this.formatTime(message.created_at)}</span>
                    ${message.prompt_tokens ? `<span class="llm-chat-tokens-used">${message.prompt_tokens + message.completion_tokens} tokens</span>` : ''}
                </div>
            `;
        } else {
            // P2P message
            const isOwn = Number(message.sender_id) === Number(this.currentUserId);
            const isGroup = this.activeChat.type === CHAT_TYPES.GROUP;

            el.className = `llm-chat-message ${isOwn ? 'llm-chat-message-user' : 'llm-chat-message-assistant'}`;

            let senderName = '';
            if (isGroup && !isOwn) {
                senderName = `<div class="llm-chat-message-sender">${this.escapeHtml(message.sender_username || 'Участник')}</div>`;
            }

            el.innerHTML = `
                ${senderName}
                <div class="llm-chat-message-content">${this.escapeHtml(message.content)}</div>
                <div class="llm-chat-message-meta">
                    <span>${this.formatTime(message.created_at)}</span>
                    ${isOwn && this.activeChat.type === CHAT_TYPES.DM ? `<span class="llm-chat-message-status ${message.read ? 'read' : ''}">${message.read ? '✓✓' : '✓'}</span>` : ''}
                </div>
            `;
        }

        el.setAttribute('data-message-id', message.id);
        return el;
    }

    renderWelcomeMessage() {
        const welcome = this.container.querySelector('#welcome-message');
        welcome.style.display = '';

        if (!this.activeChat) {
            welcome.innerHTML = `
                <h3>Добро пожаловать в чаты</h3>
                <p>Выберите чат из списка слева или создайте новый</p>
            `;
        } else {
            const texts = {
                [CHAT_TYPES.AI]: '<h3>Начните диалог с AI</h3><p>Задайте вопрос или опишите задачу</p>',
                [CHAT_TYPES.DM]: '<h3>Начните диалог</h3><p>Отправьте первое сообщение</p>',
                [CHAT_TYPES.GROUP]: '<h3>Групповой чат</h3><p>Отправьте сообщение участникам группы</p>'
            };
            welcome.innerHTML = texts[this.activeChat.type];
        }
    }

    groupMessagesByDate(messages) {
        const groups = [];
        let currentGroup = null;

        messages.forEach(msg => {
            const date = new Date(msg.created_at);
            const dateKey = date.toDateString();
            const dateLabel = this.formatDateLabel(date);

            if (!currentGroup || currentGroup.dateKey !== dateKey) {
                currentGroup = { dateKey, dateLabel, messages: [] };
                groups.push(currentGroup);
            }
            currentGroup.messages.push(msg);
        });

        return groups;
    }

    formatDateLabel(date) {
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Сегодня';
        if (diffDays === 1) return 'Вчера';
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }

    formatTime(isoDate) {
        if (!isoDate) return '';
        return new Date(isoDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    // =====================================================
    // SEND MESSAGE
    // =====================================================

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || this.isStreaming) return;

        this.messageInput.value = '';
        this.autoResizeInput();

        // Create chat if needed
        if (!this.activeChat) {
            if (this.activeTab === CHAT_TYPES.AI) {
                await this.createAIChat(content);
            }
            return;
        }

        switch (this.activeChat.type) {
            case CHAT_TYPES.AI:
                await this.sendAIMessage(content);
                break;
            case CHAT_TYPES.DM:
                await this.sendDMMessage(content);
                break;
            case CHAT_TYPES.GROUP:
                await this.sendGroupMessage(content);
                break;
        }
    }

    async sendAIMessage(content) {
        // Add user message
        const userMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content,
            created_at: new Date().toISOString()
        };
        this.messages.push(userMessage);

        // Add placeholder for assistant
        const assistantMessage = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString()
        };
        this.messages.push(assistantMessage);

        this.renderMessages();
        this.scrollToBottom();

        this.isStreaming = true;
        this.updateSendButton();
        this.abortController = new AbortController();

        try {
            const result = await llmApi.sendMessageStream(
                this.activeChat.id,
                content,
                (chunk, accumulated) => {
                    // Update assistant message content
                    assistantMessage.content = accumulated;
                    const msgEl = this.messagesContainer.querySelector(`[data-message-id="${assistantMessage.id}"]`);
                    if (msgEl) {
                        msgEl.querySelector('.llm-chat-message-content').innerHTML = this.formatMarkdown(accumulated);
                        this.scrollToBottom();
                    }
                },
                this.abortController.signal
            );

            // Update with final result
            assistantMessage.content = result.content;
            assistantMessage.prompt_tokens = result.promptTokens;
            assistantMessage.completion_tokens = result.completionTokens;

            // Update token balance
            if (this.tokenBalance && (result.promptTokens || result.completionTokens)) {
                this.tokenBalance.balance -= (result.promptTokens + result.completionTokens);
                this.updateTokenBalance();
            }

            this.renderMessages();
            this.scrollToBottom();

        } catch (error) {
            if (error.name === 'AbortError') return;

            assistantMessage.content = 'Произошла ошибка. Попробуйте снова.';
            assistantMessage.error = true;
            this.renderMessages();
            console.error('AI message error:', error);
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            this.updateSendButton();
        }
    }

    async sendDMMessage(content) {
        // Optimistic update
        const tempMessage = {
            id: 'temp-' + Date.now(),
            content,
            sender_id: Number(this.currentUserId),
            created_at: new Date().toISOString(),
            read: false
        };
        this.messages.push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        try {
            const response = await chatApi.sendMessage(this.activeChat.id, content);
            const sentMessage = response.data;

            // Replace temp with real
            const idx = this.messages.findIndex(m => m.id === tempMessage.id);
            if (idx >= 0) {
                this.messages[idx] = sentMessage;
                this.renderMessages();
            }
        } catch (error) {
            console.error('Failed to send DM:', error);
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            this.renderMessages();
            this.messageInput.value = content;
        }
    }

    async sendGroupMessage(content) {
        // Optimistic update
        const tempMessage = {
            id: 'temp-' + Date.now(),
            content,
            sender_id: Number(this.currentUserId),
            sender_username: 'Вы',
            created_at: new Date().toISOString()
        };
        this.messages.push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        try {
            const response = await chatApi.sendGroupMessage(this.activeChat.id, content);
            const sentMessage = response.data;

            const idx = this.messages.findIndex(m => m.id === tempMessage.id);
            if (idx >= 0) {
                this.messages[idx] = sentMessage;
                this.renderMessages();
            }
        } catch (error) {
            console.error('Failed to send group message:', error);
            this.messages = this.messages.filter(m => m.id !== tempMessage.id);
            this.renderMessages();
            this.messageInput.value = content;
        }
    }

    updateSendButton() {
        const btn = this.container.querySelector('#send-btn');
        if (this.isStreaming) {
            btn.textContent = '⏹ Стоп';
            btn.onclick = () => this.abortController?.abort();
        } else {
            btn.textContent = '➤ Отправить';
            btn.onclick = () => this.sendMessage();
        }
    }

    // =====================================================
    // CREATE / DELETE CHAT
    // =====================================================

    async createNewChat() {
        switch (this.activeTab) {
            case CHAT_TYPES.AI:
                await this.createAIChat();
                break;
            case CHAT_TYPES.DM:
                this.showSearchUserDialog();
                break;
            case CHAT_TYPES.GROUP:
                this.showCreateGroupDialog();
                break;
        }
    }

    async createAIChat(initialMessage = null) {
        try {
            const title = initialMessage ?
                initialMessage.slice(0, 30) + (initialMessage.length > 30 ? '...' : '') :
                'Новый чат';

            const dialog = await llmApi.createDialog({
                title,
                model: this.aiSettings.model,
                systemPrompt: this.aiSettings.systemPrompt,
                agentConfig: {
                    temperature: this.aiSettings.temperature,
                    maxTokens: this.aiSettings.maxTokens,
                    topP: this.aiSettings.topP
                }
            });

            this.aiDialogs.unshift(dialog);
            this.renderChatList();

            await this.selectChat({
                type: CHAT_TYPES.AI,
                id: dialog.id,
                title: dialog.title,
                data: dialog
            });

            // Send initial message if provided
            if (initialMessage) {
                await this.sendAIMessage(initialMessage);
            }
        } catch (error) {
            console.error('Failed to create AI chat:', error);
        }
    }

    showSearchUserDialog() {
        const username = prompt('Введите имя пользователя:');
        if (username && username.trim()) {
            this.searchAndOpenDM(username.trim());
        }
    }

    async searchAndOpenDM(username) {
        try {
            const response = await chatApi.searchUsers(username);
            const users = response.data || [];

            if (users.length === 0) {
                alert('Пользователь не найден');
                return;
            }

            const user = users[0];

            // Check if conversation exists
            let conv = this.dmConversations.find(c => c.user_id === user.id);
            if (!conv) {
                conv = {
                    user_id: user.id,
                    username: user.username
                };
                this.dmConversations.unshift(conv);
            }

            this.renderChatList();
            await this.selectChat({
                type: CHAT_TYPES.DM,
                id: user.id,
                title: user.username,
                data: conv
            });
        } catch (error) {
            console.error('Failed to search user:', error);
            alert('Ошибка поиска пользователя');
        }
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
            const group = response.data;

            this.groups.unshift(group);
            this.renderChatList();

            await this.selectChat({
                type: CHAT_TYPES.GROUP,
                id: group.id,
                title: group.name,
                data: group
            });
        } catch (error) {
            console.error('Failed to create group:', error);
            alert('Не удалось создать группу');
        }
    }

    async deleteChat(item) {
        if (!confirm(`Удалить "${item.title}"?`)) return;

        try {
            switch (item.type) {
                case CHAT_TYPES.AI:
                    await llmApi.deleteDialog(item.id);
                    this.aiDialogs = this.aiDialogs.filter(d => d.id !== item.id);
                    break;
                case CHAT_TYPES.DM:
                    // DM conversations can't be deleted, just remove from list
                    this.dmConversations = this.dmConversations.filter(c => c.user_id !== item.id);
                    break;
                case CHAT_TYPES.GROUP:
                    await chatApi.deleteChatGroup(item.id);
                    this.groups = this.groups.filter(g => g.id !== item.id);
                    break;
            }

            if (this.activeChat?.id === item.id) {
                this.activeChat = null;
                this.messages = [];
                this.renderWelcomeMessage();
                this.container.querySelector('#chat-title').textContent = 'Чаты';
            }

            this.renderChatList();
        } catch (error) {
            console.error('Failed to delete chat:', error);
            alert('Не удалось удалить чат');
        }
    }

    // =====================================================
    // WEBSOCKET EVENTS
    // =====================================================

    handleChatEvent(detail) {
        const { type, data } = detail || {};

        if (type === 'dm' && this.activeChat?.type === CHAT_TYPES.DM && data.sender_id === this.activeChat.id) {
            this.messages.push(data.message);
            this.renderMessages();
            this.scrollToBottom();
            chatApi.markAsRead(this.activeChat.id);
        }

        if (type === 'group_message' && this.activeChat?.type === CHAT_TYPES.GROUP && data.group_id === this.activeChat.id) {
            this.messages.push(data.message);
            this.renderMessages();
            this.scrollToBottom();
            chatApi.markGroupAsRead(this.activeChat.id);
        }
    }

    handleTypingEvent(detail) {
        const { userId, groupId, isTyping, username } = detail || {};

        if (this.activeChat?.type === CHAT_TYPES.DM && userId === this.activeChat.id) {
            this.showTypingIndicator(isTyping ? username || 'Собеседник' : null);
        }

        if (this.activeChat?.type === CHAT_TYPES.GROUP && groupId === this.activeChat.id) {
            this.showTypingIndicator(isTyping ? username : null);
        }
    }

    showTypingIndicator(username) {
        const indicator = this.container.querySelector('#typing-indicator');
        const text = this.container.querySelector('#typing-text');

        if (username) {
            text.textContent = `${username} печатает...`;
            indicator.style.display = '';
        } else {
            indicator.style.display = 'none';
        }
    }

    // =====================================================
    // UI HELPERS
    // =====================================================

    toggleMobileSidebar(open = !this.isMobileSidebarOpen) {
        this.isMobileSidebarOpen = open;
        const sidebar = this.container.querySelector('#sidebar');
        const overlay = this.container.querySelector('#sidebar-overlay');

        sidebar.classList.toggle('mobile-open', open);
        overlay.classList.toggle('visible', open);
    }

    toggleSettings(show = !this.showSettings) {
        this.showSettings = show;
        this.container.querySelector('#settings-panel').style.display = show ? '' : 'none';
    }

    handleScroll() {
        if (this.messagesContainer.scrollTop < 100 && this.hasMoreMessages && !this.isLoadingMessages) {
            this.loadMessages(true);
        }
    }

    handleInputChange() {
        this.autoResizeInput();

        // Send typing indicator for P2P
        if (this.activeChat?.type === CHAT_TYPES.DM) {
            dispatch('ChatTyping', {
                type: 'dm',
                recipientId: this.activeChat.id,
                isTyping: true
            });

            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                dispatch('ChatTyping', {
                    type: 'dm',
                    recipientId: this.activeChat.id,
                    isTyping: false
                });
            }, 2000);
        }
    }

    autoResizeInput() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatMarkdown(content) {
        if (!content) return '';

        let html = this.escapeHtml(content);

        // Code blocks
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }
}

// Singleton
let unifiedChatInstance = null;

export function openUnifiedChat() {
    if (unifiedChatInstance) {
        unifiedChatInstance.close();
        unifiedChatInstance = null;
    }
    unifiedChatInstance = new UnifiedChatPanel();
    return unifiedChatInstance;
}

export function closeUnifiedChat() {
    if (unifiedChatInstance) {
        unifiedChatInstance.close();
        unifiedChatInstance = null;
    }
}
