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
        this.pendingFiles = []; // Files to be attached to next message
        this.maxFiles = 5; // Max files per message (backend constraint)
        this.maxFileSize = 5 * 1024 * 1024; // 5MB per file (backend constraint)
        this.allowedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        this.isUploading = false; // Track upload state for loading indicator

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
                        <h3 id="settings-title">Настройки AI</h3>
                        <button id="close-settings-btn">✕</button>
                    </div>
                    <div class="llm-chat-settings-content">
                        <!-- Profile section (shown for P2P chats) -->
                        <div id="profile-settings" style="display: none;">
                            <div class="llm-chat-setting-group chat-avatar-section">
                                <label>Ваш аватар</label>
                                <div class="chat-avatar-editor">
                                    <div class="chat-avatar-preview" id="avatar-preview">
                                        <span class="chat-avatar-placeholder">👤</span>
                                    </div>
                                    <div class="chat-avatar-actions">
                                        <button class="chat-avatar-upload-btn" id="avatar-upload-btn">Загрузить</button>
                                        <button class="chat-avatar-delete-btn" id="avatar-delete-btn" style="display: none;">Удалить</button>
                                        <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display: none;" />
                                    </div>
                                    <p class="chat-avatar-hint">JPEG, PNG, GIF или WebP. Макс. 5 MB</p>
                                </div>
                            </div>
                        </div>
                        <!-- AI settings (shown for AI chats) -->
                        <div id="ai-settings">
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
                        <div class="chat-drop-zone" id="drop-zone" style="display: none;">
                            <span class="chat-drop-zone-text">Перетащите изображения сюда</span>
                        </div>
                        <div class="chat-attachments-preview" id="attachments-preview" style="display: none;"></div>
                        <div class="chat-upload-progress" id="upload-progress" style="display: none;">
                            <span class="chat-upload-spinner"></span>
                            <span class="chat-upload-text">Загрузка...</span>
                        </div>
                        <div class="llm-chat-input-row">
                            <button class="chat-attach-btn" id="attach-btn" title="Прикрепить изображение (JPEG, PNG, GIF, WebP до 5MB)" aria-label="Прикрепить изображение" style="display: none;">
                                <span aria-hidden="true">📎</span>
                            </button>
                            <input type="file" id="file-input" accept="image/jpeg,image/png,image/gif,image/webp" multiple style="display: none;" aria-label="Выбрать файлы для загрузки" />
                            <textarea
                                class="llm-chat-textarea"
                                id="message-input"
                                placeholder="Сообщение..."
                                rows="1"
                                aria-label="Текст сообщения"
                            ></textarea>
                            <button class="llm-chat-send-btn" id="send-btn" title="Отправить сообщение" aria-label="Отправить сообщение">
                                <span class="send-btn-icon" aria-hidden="true">➤</span>
                                <span class="send-btn-text">Отправить</span>
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

        // Avatar settings
        this.avatarInput = this.container.querySelector('#avatar-input');
        this.avatarPreview = this.container.querySelector('#avatar-preview');
        this.avatarUploadBtn = this.container.querySelector('#avatar-upload-btn');
        this.avatarDeleteBtn = this.container.querySelector('#avatar-delete-btn');

        this.avatarUploadBtn.addEventListener('click', () => this.avatarInput.click());
        this.avatarInput.addEventListener('change', (e) => this.handleAvatarSelect(e));
        this.avatarDeleteBtn.addEventListener('click', () => this.deleteAvatar());

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

        // File attachment (only for P2P chats)
        this.attachBtn = this.container.querySelector('#attach-btn');
        this.fileInput = this.container.querySelector('#file-input');
        this.attachmentsPreview = this.container.querySelector('#attachments-preview');
        this.dropZone = this.container.querySelector('#drop-zone');
        this.uploadProgress = this.container.querySelector('#upload-progress');

        this.attachBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop support
        this.setupDragAndDrop();

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

        // Mobile keyboard handling
        this.setupMobileKeyboardHandling();
    }

    setupMobileKeyboardHandling() {
        // Handle virtual keyboard on iOS/Android
        if (window.visualViewport) {
            this.viewportHandler = () => {
                const viewport = window.visualViewport;
                const keyboardHeight = window.innerHeight - viewport.height;

                if (keyboardHeight > 100) {
                    // Keyboard is open
                    this.container.style.height = `${viewport.height}px`;
                    this.scrollToBottom();
                } else {
                    // Keyboard is closed
                    this.container.style.height = '';
                }
            };
            window.visualViewport.addEventListener('resize', this.viewportHandler);
        }

        // Focus/blur handlers for input
        this.inputFocusHandler = () => {
            setTimeout(() => this.scrollToBottom(), 300);
        };
        this.messageInput.addEventListener('focus', this.inputFocusHandler);
    }

    unbindEvents() {
        document.removeEventListener('keydown', this.escHandler);
        window.removeEventListener('ChatEvent', this.chatEventHandler);
        window.removeEventListener('TypingIndicator', this.typingHandler);
        window.removeEventListener('GroupTypingIndicator', this.typingHandler);
        window.removeEventListener('ChatUnreadCountUpdate', this.unreadHandler);

        // Mobile keyboard cleanup
        if (window.visualViewport && this.viewportHandler) {
            window.visualViewport.removeEventListener('resize', this.viewportHandler);
        }
        if (this.messageInput && this.inputFocusHandler) {
            this.messageInput.removeEventListener('focus', this.inputFocusHandler);
        }
    }

    // =====================================================
    // OPEN / CLOSE
    // =====================================================

    async open() {
        this.isOpen = true;
        this.overlay.classList.add('open');
        this.container.classList.add('open');

        // Lock body scroll (mobile fix)
        this.savedBodyStyles = {
            overflow: document.body.style.overflow,
            position: document.body.style.position,
            top: document.body.style.top,
            width: document.body.style.width
        };
        this.savedScrollY = window.scrollY;

        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this.savedScrollY}px`;
        document.body.style.width = '100%';

        // Load data
        await this.loadData();
    }

    close() {
        if (this.abortController) {
            this.abortController.abort();
        }

        this.isOpen = false;

        if (this.overlay) {
            this.overlay.classList.remove('open');
        }
        if (this.container) {
            this.container.classList.remove('open');
        }

        // Restore body scroll (mobile fix)
        if (this.savedBodyStyles) {
            document.body.style.overflow = this.savedBodyStyles.overflow;
            document.body.style.position = this.savedBodyStyles.position;
            document.body.style.top = this.savedBodyStyles.top;
            document.body.style.width = this.savedBodyStyles.width;
            window.scrollTo(0, this.savedScrollY || 0);
        } else {
            document.body.style.overflow = '';
        }

        // Cleanup
        setTimeout(() => {
            this.unbindEvents();
            this.overlay?.remove();
            this.container?.remove();
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
                // Handle both array response and paginated response
                const convData = conversations.value.data;
                this.dmConversations = Array.isArray(convData)
                    ? convData
                    : (convData?.results || convData?.conversations || []);
            }
            if (groups.status === 'fulfilled') {
                // Handle both array response and paginated response
                const groupsData = groups.value.data;
                this.groups = Array.isArray(groupsData)
                    ? groupsData
                    : (groupsData?.results || groupsData?.groups || []);
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

        // Show/hide attach button (only for P2P chats)
        this.updateAttachButtonVisibility();

        // Clear pending files when switching tabs
        this.clearPendingFiles();

        // Update UI
        this.updateTokenBalance();
        this.updateModelHint();
        this.renderChatList();
        this.renderWelcomeMessage();

        // Close mobile sidebar
        this.toggleMobileSidebar(false);
    }

    /**
     * Update visibility of attach button based on current tab
     */
    updateAttachButtonVisibility() {
        const isP2P = this.activeTab === CHAT_TYPES.DM || this.activeTab === CHAT_TYPES.GROUP;
        if (this.attachBtn) {
            this.attachBtn.style.display = isP2P ? '' : 'none';
        }
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
                items = this.dmConversations.map(c => {
                    // Handle different API response formats
                    // Backend may return user_id, id, or nested user.id
                    const userId = c.user_id || c.id || c.user?.id;
                    const username = c.username || c.user?.username || `User ${userId}`;
                    return {
                        type: CHAT_TYPES.DM,
                        id: userId,
                        title: username,
                        subtitle: c.last_message?.content || '',
                        time: c.last_message?.created_at,
                        unread: c.unread_count,
                        avatarUrl: c.avatar_url || c.avatar || c.user?.avatar_url || c.user?.avatar || null,
                        data: c
                    };
                });
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

        // Filter out items with invalid ids
        items = items.filter(item => item.id !== null && item.id !== undefined);

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

        // Use image avatar if available, otherwise fallback to icon/letter
        let avatarContent;
        if (item.avatarUrl) {
            avatarContent = `<img src="${this.escapeHtml(item.avatarUrl)}" alt="" class="unified-chat-avatar-img" />`;
        } else {
            const avatarIcon = item.type === CHAT_TYPES.AI ? '🤖' :
                              item.type === CHAT_TYPES.GROUP ? '👥' :
                              item.title.charAt(0).toUpperCase();
            avatarContent = avatarIcon;
        }

        el.innerHTML = `
            <div class="${avatarClass}">${avatarContent}</div>
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
        // Validate item has required id
        if (!item || item.id === null || item.id === undefined) {
            console.error('selectChat: Invalid item or missing id', item);
            return;
        }

        // Skip if already selected (same chat)
        if (this.activeChat?.id === item.id && this.activeChat?.type === item.type) {
            return;
        }

        // Don't abort ongoing AI stream - let it finish in background
        // so the message is saved on the server
        if (this.isStreaming) {
            this.isStreaming = false;
            this.updateSendButton();
        }

        this.activeChat = item;
        this.messages = [];
        this.hasMoreMessages = true;
        this.oldestMessageId = null;

        // Update UI
        this.renderChatList();
        const titleEl = this.container?.querySelector('#chat-title');
        if (titleEl) titleEl.textContent = item.title;
        const welcomeEl = this.container?.querySelector('#welcome-message');
        if (welcomeEl) welcomeEl.style.display = 'none';
        this.toggleMobileSidebar(false);

        // Load messages (force reload)
        await this.loadMessages();

        // Mark as read for P2P chats (silently ignore errors)
        try {
            if (item.type === CHAT_TYPES.DM) {
                await chatApi.markAsRead(item.id);
                // Update unread count in local data and re-render list
                this._clearUnreadForChat(item.type, item.id);
                dispatch('ChatMessagesRead', { type: 'dm', id: item.id, userId: item.id });
            } else if (item.type === CHAT_TYPES.GROUP) {
                await chatApi.markGroupAsRead(item.id);
                // Update unread count in local data and re-render list
                this._clearUnreadForChat(item.type, item.id);
                dispatch('ChatMessagesRead', { type: 'group', id: item.id, groupId: item.id });
            }
        } catch (err) {
            console.warn('Failed to mark as read:', err);
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
                    // Handle both array response and paginated response
                    newMessages = Array.isArray(dmResponse.data)
                        ? dmResponse.data
                        : (dmResponse.data?.results || dmResponse.data?.messages || []);
                    if (newMessages.length < 50) this.hasMoreMessages = false;
                    break;

                case CHAT_TYPES.GROUP:
                    const groupOptions = { limit: 50 };
                    if (loadMore && this.oldestMessageId) {
                        groupOptions.before = this.oldestMessageId;
                    }
                    const groupResponse = await chatApi.getGroupMessages(this.activeChat.id, groupOptions);
                    // Handle both array response and paginated response
                    newMessages = Array.isArray(groupResponse.data)
                        ? groupResponse.data
                        : (groupResponse.data?.results || groupResponse.data?.messages || []);
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
        if (!this.messagesContainer) return;
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

            // Render attachments if present
            const attachmentsHtml = this.renderAttachments(message.attachments);

            el.innerHTML = `
                ${senderName}
                ${message.content ? `<div class="llm-chat-message-content">${this.escapeHtml(message.content)}</div>` : ''}
                ${attachmentsHtml}
                <div class="llm-chat-message-meta">
                    <span>${this.formatTime(message.created_at)}</span>
                    ${isOwn && this.activeChat.type === CHAT_TYPES.DM ? `<span class="llm-chat-message-status ${message.is_read || message.read ? 'read' : ''}">${message.is_read || message.read ? '✓✓' : '✓'}</span>` : ''}
                </div>
            `;
        }

        el.setAttribute('data-message-id', message.id);
        return el;
    }

    /**
     * Render attachments (images) for a message
     * @param {Array} attachments - Array of attachment objects
     * @returns {string} HTML string
     */
    renderAttachments(attachments) {
        if (!attachments || attachments.length === 0) return '';

        const images = attachments.map(att => {
            const url = att.file_url || att.url;
            const thumbUrl = att.thumbnail_url || url;
            const filename = att.filename || 'image';
            const size = att.size ? this.formatFileSize(att.size) : '';
            const dimensions = att.width && att.height ? `${att.width}x${att.height}` : '';

            return `
                <div class="chat-attachment" data-id="${att.id || ''}">
                    <a href="${this.escapeHtml(url)}" target="_blank" class="chat-attachment-link">
                        <img src="${this.escapeHtml(thumbUrl)}" alt="${this.escapeHtml(filename)}" class="chat-attachment-image" loading="lazy" />
                    </a>
                    ${size || dimensions ? `<div class="chat-attachment-info">${size}${size && dimensions ? ' • ' : ''}${dimensions}</div>` : ''}
                </div>
            `;
        }).join('');

        return `<div class="chat-attachments">${images}</div>`;
    }

    /**
     * Format file size in human readable format
     * @param {number} bytes - File size in bytes
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    renderWelcomeMessage() {
        const welcome = this.container?.querySelector('#welcome-message');
        if (!welcome) return;

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
        // Get pending files
        const files = [...this.pendingFiles];
        this.clearPendingFiles();

        // Show upload progress if files attached
        if (files.length > 0) {
            this.showUploadProgress(true, `Загрузка ${files.length} файл(ов)...`);
        }

        // Optimistic update
        const tempMessage = {
            id: 'temp-' + Date.now(),
            content,
            sender_id: Number(this.currentUserId),
            created_at: new Date().toISOString(),
            read: false,
            attachments: files.map((f, i) => ({
                id: `temp-att-${i}`,
                filename: f.name,
                file_url: URL.createObjectURL(f),
                thumbnail_url: URL.createObjectURL(f)
            }))
        };
        this.messages.push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        try {
            const response = await chatApi.sendMessage(this.activeChat.id, content, files.length > 0 ? files : null);
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
            // Restore files on error
            this.pendingFiles = files;
            this.renderAttachmentsPreview();

            // Show detailed error message
            this.showUploadError(error, 'личное сообщение');
        } finally {
            this.showUploadProgress(false);
        }
    }

    async sendGroupMessage(content) {
        // Get pending files
        const files = [...this.pendingFiles];
        this.clearPendingFiles();

        // Show upload progress if files attached
        if (files.length > 0) {
            this.showUploadProgress(true, `Загрузка ${files.length} файл(ов)...`);
        }

        // Optimistic update
        const tempMessage = {
            id: 'temp-' + Date.now(),
            content,
            sender_id: Number(this.currentUserId),
            sender_username: 'Вы',
            created_at: new Date().toISOString(),
            attachments: files.map((f, i) => ({
                id: `temp-att-${i}`,
                filename: f.name,
                file_url: URL.createObjectURL(f),
                thumbnail_url: URL.createObjectURL(f)
            }))
        };
        this.messages.push(tempMessage);
        this.renderMessages();
        this.scrollToBottom();

        try {
            const response = await chatApi.sendGroupMessage(this.activeChat.id, content, files.length > 0 ? files : null);
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
            // Restore files on error
            this.pendingFiles = files;
            this.renderAttachmentsPreview();

            // Show detailed error message
            this.showUploadError(error, 'сообщение в группу');
        } finally {
            this.showUploadProgress(false);
        }
    }

    /**
     * Show detailed upload error message
     * @param {Error} error - The error object
     * @param {string} context - Context description (e.g., 'личное сообщение')
     */
    showUploadError(error, context) {
        let message = `Не удалось отправить ${context}.`;

        // Parse error for more details
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            if (status === 413) {
                message = 'Файл слишком большой. Максимальный размер: 5 MB.';
            } else if (status === 415) {
                message = 'Неподдерживаемый формат файла. Допустимые: JPEG, PNG, GIF, WebP.';
            } else if (status === 400 && data?.files) {
                message = `Ошибка загрузки файлов: ${data.files.join(', ')}`;
            } else if (status === 400 && data?.detail) {
                message = data.detail;
            } else if (status >= 500) {
                message = 'Ошибка сервера. Попробуйте позже.';
            }
        } else if (error.message === 'Network Error') {
            message = 'Ошибка сети. Проверьте подключение к интернету.';
        }

        alert(message);
    }

    updateSendButton() {
        const btn = this.container.querySelector('#send-btn');
        const iconEl = btn.querySelector('.send-btn-icon');
        const textEl = btn.querySelector('.send-btn-text');

        if (this.isStreaming) {
            if (iconEl) iconEl.textContent = '⏹';
            if (textEl) textEl.textContent = 'Стоп';
            btn.onclick = () => this.abortController?.abort();
        } else {
            if (iconEl) iconEl.textContent = '➤';
            if (textEl) textEl.textContent = 'Отправить';
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

        if (type === 'dm' && this.activeChat?.type === CHAT_TYPES.DM) {
            // Check if message is for current chat:
            // 1. Received from the person we're chatting with (sender_id == activeChat.id)
            // 2. Sent by us from another client (sender_id == currentUserId AND recipient matches)
            const isFromPeer = data?.sender_id == this.activeChat.id; // eslint-disable-line eqeqeq
            const recipientId = data?.message?.recipient_id || data?.recipient_id;
            const isOwnMessage = data?.sender_id == this.currentUserId && recipientId == this.activeChat.id; // eslint-disable-line eqeqeq

            if (isFromPeer || isOwnMessage) {
                // Avoid duplicate messages (check by ID)
                const messageId = data.message?.id;
                if (messageId && this.messages.some(m => m.id === messageId)) {
                    return;
                }

                // For own messages: check if there's a temp message with same content (race condition with optimistic update)
                if (isOwnMessage) {
                    const hasTempDuplicate = this.messages.some(m =>
                        String(m.id).startsWith('temp-') &&
                        m.content === data.message?.content
                    );
                    if (hasTempDuplicate) {
                        // Replace temp message with real one
                        const tempIdx = this.messages.findIndex(m =>
                            String(m.id).startsWith('temp-') &&
                            m.content === data.message?.content
                        );
                        if (tempIdx >= 0) {
                            this.messages[tempIdx] = { ...data.message, sender_id: data.sender_id };
                            this.renderMessages();
                        }
                        return;
                    }
                }

                // Ensure sender_id is in message (WebSocket sends it separately)
                const message = { ...data.message, sender_id: data.sender_id };
                this.messages.push(message);
                this.renderMessages();
                this.scrollToBottom();

                // Only mark as read if received from peer (not our own message)
                if (isFromPeer) {
                    chatApi.markAsRead(this.activeChat.id)
                        .then(() => dispatch('ChatMessagesRead', { type: 'dm', id: this.activeChat.id, userId: this.activeChat.id }))
                        .catch(() => {});
                }
            }
        }

        if (type === 'group_message' && this.activeChat?.type === CHAT_TYPES.GROUP && data?.group_id == this.activeChat.id) { // eslint-disable-line eqeqeq
            // Avoid duplicate messages (check by ID)
            const messageId = data.message?.id;
            if (messageId && this.messages.some(m => m.id === messageId)) {
                return;
            }

            // For own messages: check if there's a temp message with same content (race condition with optimistic update)
            const isOwnGroupMessage = data?.sender_id == this.currentUserId; // eslint-disable-line eqeqeq
            if (isOwnGroupMessage) {
                const hasTempDuplicate = this.messages.some(m =>
                    String(m.id).startsWith('temp-') &&
                    m.content === data.message?.content
                );
                if (hasTempDuplicate) {
                    // Replace temp message with real one
                    const tempIdx = this.messages.findIndex(m =>
                        String(m.id).startsWith('temp-') &&
                        m.content === data.message?.content
                    );
                    if (tempIdx >= 0) {
                        this.messages[tempIdx] = { ...data.message, sender_id: data.sender_id };
                        this.renderMessages();
                    }
                    return;
                }
            }

            // Ensure sender_id is in message (WebSocket sends it separately)
            const message = { ...data.message, sender_id: data.sender_id };
            this.messages.push(message);
            this.renderMessages();
            this.scrollToBottom();

            // Only mark as read if not our own message
            if (data?.sender_id != this.currentUserId) { // eslint-disable-line eqeqeq
                chatApi.markGroupAsRead(this.activeChat.id)
                    .then(() => dispatch('ChatMessagesRead', { type: 'group', id: this.activeChat.id, groupId: this.activeChat.id }))
                    .catch(() => {});
            }
        }
    }

    handleTypingEvent(detail) {
        const { userId, groupId, isTyping, username } = detail || {};

        // eslint-disable-next-line eqeqeq
        if (this.activeChat?.type === CHAT_TYPES.DM && userId == this.activeChat.id) {
            this.showTypingIndicator(isTyping ? username || 'Собеседник' : null);
        }

        // eslint-disable-next-line eqeqeq
        if (this.activeChat?.type === CHAT_TYPES.GROUP && groupId == this.activeChat.id) {
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

    /**
     * Clear unread count for a specific chat and re-render the list
     * @param {string} type - Chat type (CHAT_TYPES.DM or CHAT_TYPES.GROUP)
     * @param {number|string} id - Chat ID
     */
    _clearUnreadForChat(type, id) {
        if (type === CHAT_TYPES.DM) {
            const conv = this.dmConversations.find(c => (c.user_id || c.id) == id); // eslint-disable-line eqeqeq
            if (conv) {
                conv.unread_count = 0;
            }
            // Also update unreadCount state
            if (this.unreadCount.dm > 0) {
                this.unreadCount.dm = Math.max(0, this.unreadCount.dm - 1);
            }
        } else if (type === CHAT_TYPES.GROUP) {
            const group = this.groups.find(g => g.id == id); // eslint-disable-line eqeqeq
            if (group) {
                group.unread_count = 0;
            }
            // Also update unreadCount state
            if (this.unreadCount.groups > 0) {
                this.unreadCount.groups = Math.max(0, this.unreadCount.groups - 1);
            }
        }

        // Re-render the chat list to update the badge
        this.renderChatList();
        // Update tab badges
        this.updateUnreadBadges(this.unreadCount);
    }

    toggleMobileSidebar(open = !this.isMobileSidebarOpen) {
        this.isMobileSidebarOpen = open;
        const sidebar = this.container.querySelector('#sidebar');
        const overlay = this.container.querySelector('#sidebar-overlay');

        sidebar.classList.toggle('mobile-open', open);
        overlay.classList.toggle('visible', open);
    }

    toggleSettings(show = !this.showSettings) {
        this.showSettings = show;
        const panel = this.container.querySelector('#settings-panel');
        const aiSettings = this.container.querySelector('#ai-settings');
        const profileSettings = this.container.querySelector('#profile-settings');
        const settingsTitle = this.container.querySelector('#settings-title');

        panel.style.display = show ? '' : 'none';

        if (show) {
            const isP2P = this.activeTab === CHAT_TYPES.DM || this.activeTab === CHAT_TYPES.GROUP;

            // Show/hide appropriate settings sections
            aiSettings.style.display = this.activeTab === CHAT_TYPES.AI ? '' : 'none';
            profileSettings.style.display = isP2P ? '' : 'none';

            // Update title
            settingsTitle.textContent = this.activeTab === CHAT_TYPES.AI ? 'Настройки AI' : 'Профиль';

            // Load avatar if P2P
            if (isP2P) {
                this.loadAvatar();
            }
        }
    }

    /**
     * Load current user avatar
     */
    async loadAvatar() {
        try {
            const response = await chatApi.getMyAvatar();
            const data = response.data;

            if (data && (data.image_url || data.thumbnail_url)) {
                this.renderAvatarPreview(data.thumbnail_url || data.image_url);
                this.avatarDeleteBtn.style.display = '';
            } else {
                this.renderAvatarPreview(null);
                this.avatarDeleteBtn.style.display = 'none';
            }
        } catch (error) {
            console.warn('Failed to load avatar:', error);
            this.renderAvatarPreview(null);
            this.avatarDeleteBtn.style.display = 'none';
        }
    }

    /**
     * Render avatar preview
     * @param {string|null} url - Avatar URL or null for placeholder
     */
    renderAvatarPreview(url) {
        if (url) {
            this.avatarPreview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Avatar" class="chat-avatar-img" />`;
        } else {
            this.avatarPreview.innerHTML = '<span class="chat-avatar-placeholder">👤</span>';
        }
    }

    /**
     * Handle avatar file selection
     * @param {Event} e - Change event
     */
    async handleAvatarSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate
        if (file.size > 5 * 1024 * 1024) {
            alert('Файл слишком большой. Максимум 5 MB');
            return;
        }
        if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
            alert('Недопустимый формат. Допустимые: JPEG, PNG, GIF, WebP');
            return;
        }

        // Show preview immediately
        const previewUrl = URL.createObjectURL(file);
        this.renderAvatarPreview(previewUrl);

        try {
            this.avatarUploadBtn.disabled = true;
            this.avatarUploadBtn.textContent = 'Загрузка...';

            await chatApi.uploadMyAvatar(file);

            this.avatarDeleteBtn.style.display = '';
        } catch (error) {
            console.error('Failed to upload avatar:', error);
            alert('Не удалось загрузить аватар');
            // Reload current avatar
            this.loadAvatar();
        } finally {
            this.avatarUploadBtn.disabled = false;
            this.avatarUploadBtn.textContent = 'Загрузить';
            e.target.value = '';
        }
    }

    /**
     * Delete current user avatar
     */
    async deleteAvatar() {
        if (!confirm('Удалить аватар?')) return;

        try {
            this.avatarDeleteBtn.disabled = true;
            await chatApi.deleteMyAvatar();
            this.renderAvatarPreview(null);
            this.avatarDeleteBtn.style.display = 'none';
        } catch (error) {
            console.error('Failed to delete avatar:', error);
            alert('Не удалось удалить аватар');
        } finally {
            this.avatarDeleteBtn.disabled = false;
        }
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

    // =====================================================
    // FILE ATTACHMENTS
    // =====================================================

    /**
     * Setup drag and drop handlers for file upload
     */
    setupDragAndDrop() {
        const inputArea = this.container.querySelector('#input-area');
        if (!inputArea) return;

        let dragCounter = 0;

        inputArea.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;

            // Only show for P2P chats
            if (this.activeTab === CHAT_TYPES.DM || this.activeTab === CHAT_TYPES.GROUP) {
                this.dropZone.style.display = '';
            }
        });

        inputArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;

            if (dragCounter === 0) {
                this.dropZone.style.display = 'none';
            }
        });

        inputArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        inputArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            this.dropZone.style.display = 'none';

            // Only process for P2P chats
            if (this.activeTab !== CHAT_TYPES.DM && this.activeTab !== CHAT_TYPES.GROUP) {
                return;
            }

            const files = Array.from(e.dataTransfer.files);
            this.processFiles(files);
        });
    }

    /**
     * Validate a single file
     * @param {File} file - File to validate
     * @returns {{ valid: boolean, error?: string }}
     */
    validateFile(file) {
        // Check file type
        if (!this.allowedFileTypes.includes(file.type)) {
            return {
                valid: false,
                error: `Файл "${file.name}" имеет недопустимый формат. Поддерживаются: JPEG, PNG, GIF, WebP`
            };
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            return {
                valid: false,
                error: `Файл "${file.name}" (${sizeMB} MB) превышает лимит 5 MB`
            };
        }

        return { valid: true };
    }

    /**
     * Process and validate files for upload
     * @param {File[]} files - Array of files
     */
    processFiles(files) {
        const errors = [];
        let addedCount = 0;

        for (const file of files) {
            // Check max files limit
            if (this.pendingFiles.length >= this.maxFiles) {
                errors.push(`Достигнут лимит: максимум ${this.maxFiles} файлов за сообщение`);
                break;
            }

            const validation = this.validateFile(file);
            if (!validation.valid) {
                errors.push(validation.error);
                continue;
            }

            this.pendingFiles.push(file);
            addedCount++;
        }

        // Show errors if any
        if (errors.length > 0) {
            this.showFileErrors(errors);
        }

        // Render preview if files were added
        if (addedCount > 0) {
            this.renderAttachmentsPreview();
        }
    }

    /**
     * Show file validation errors
     * @param {string[]} errors - Array of error messages
     */
    showFileErrors(errors) {
        const uniqueErrors = [...new Set(errors)];
        alert(uniqueErrors.join('\n'));
    }

    /**
     * Handle file selection from input
     * @param {Event} e - Change event
     */
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        this.processFiles(files);

        // Clear input for re-selection
        e.target.value = '';
    }

    /**
     * Show/hide upload progress indicator
     * @param {boolean} show
     * @param {string} text - Optional custom text
     */
    showUploadProgress(show, text = 'Загрузка...') {
        if (this.uploadProgress) {
            this.uploadProgress.style.display = show ? '' : 'none';
            const textEl = this.uploadProgress.querySelector('.chat-upload-text');
            if (textEl) textEl.textContent = text;
        }
        this.isUploading = show;
    }

    /**
     * Render preview of pending attachments
     */
    renderAttachmentsPreview() {
        if (!this.attachmentsPreview) return;

        if (this.pendingFiles.length === 0) {
            this.attachmentsPreview.style.display = 'none';
            this.attachmentsPreview.innerHTML = '';
            return;
        }

        this.attachmentsPreview.style.display = '';
        this.attachmentsPreview.innerHTML = this.pendingFiles.map((file, index) => {
            const url = URL.createObjectURL(file);
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            return `
                <div class="chat-attachment-preview-item" data-index="${index}">
                    <img src="${url}" alt="Превью: ${this.escapeHtml(file.name)}" loading="lazy" />
                    <button class="chat-attachment-remove" data-index="${index}" title="Удалить файл" aria-label="Удалить ${this.escapeHtml(file.name)}">✕</button>
                    <span class="chat-attachment-name" title="${this.escapeHtml(file.name)} (${sizeMB} MB)">${this.escapeHtml(file.name)}</span>
                </div>
            `;
        }).join('');

        // Add remove handlers
        this.attachmentsPreview.querySelectorAll('.chat-attachment-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                this.removeFile(index);
            });
        });
    }

    /**
     * Remove a file from pending list
     * @param {number} index - File index
     */
    removeFile(index) {
        this.pendingFiles.splice(index, 1);
        this.renderAttachmentsPreview();
    }

    /**
     * Clear all pending files
     */
    clearPendingFiles() {
        this.pendingFiles = [];
        if (this.attachmentsPreview) {
            this.attachmentsPreview.style.display = 'none';
            this.attachmentsPreview.innerHTML = '';
        }
        if (this.fileInput) {
            this.fileInput.value = '';
        }
    }

    // =====================================================
    // UTILS
    // =====================================================

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
