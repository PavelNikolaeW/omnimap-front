/**
 * ConversationView - Окно личного диалога
 *
 * Включает:
 * - Заголовок с именем собеседника
 * - История сообщений с infinite scroll
 * - Поле ввода сообщения
 * - Typing indicator
 */

import { Popup } from './popup.js';
import { dispatch } from '../../utils/utils.js';
import chatApi from '../../api/chatApi.js';
import localforage from 'localforage';

export class ConversationView extends Popup {
    /**
     * @param {Object} conversation - Данные диалога
     * @param {number} conversation.user_id - ID собеседника
     * @param {string} conversation.username - Имя собеседника
     */
    constructor(conversation) {
        super({
            title: conversation.username || `User ${conversation.user_id}`,
            size: 'lg',
            modal: true,
            draggable: true,
            closeOnOverlay: true,
            closeOnEsc: true
        });

        this.userId = conversation.user_id;
        this.username = conversation.username || `User ${conversation.user_id}`;
        this.messages = [];
        this.isLoading = false;
        this.hasMore = true;
        this.oldestMessageId = null;
        this.currentUserId = null;
        this.typingTimeout = null;
        this.isTyping = false;
        this.partnerTyping = false;

        this.init();
    }

    async init() {
        this.currentUserId = await localforage.getItem('currentUser');
        this.renderContent();
        this.bindChatEvents();
        await this.loadMessages();
        await this.markAsRead();
    }

    renderContent() {
        this.contentArea.innerHTML = '';
        this.contentArea.className = 'popup-content p2p-conversation-view';

        // Header with back button and user info
        const header = document.createElement('div');
        header.className = 'p2p-conversation-header';

        const backBtn = document.createElement('button');
        backBtn.className = 'p2p-conversation-back-btn';
        backBtn.innerHTML = '&larr;';
        backBtn.addEventListener('click', () => this.goBack());

        const userInfo = document.createElement('div');
        userInfo.className = 'p2p-conversation-user-info';

        const avatar = document.createElement('div');
        avatar.className = 'p2p-chat-avatar';
        avatar.textContent = this.username.charAt(0).toUpperCase();

        const nameContainer = document.createElement('div');
        nameContainer.className = 'p2p-conversation-name-container';

        const name = document.createElement('span');
        name.className = 'p2p-conversation-username';
        name.textContent = this.username;

        const status = document.createElement('span');
        status.className = 'p2p-conversation-status';
        status.id = 'typing-status';
        status.textContent = '';

        nameContainer.appendChild(name);
        nameContainer.appendChild(status);

        userInfo.appendChild(avatar);
        userInfo.appendChild(nameContainer);

        header.appendChild(backBtn);
        header.appendChild(userInfo);

        this.contentArea.appendChild(header);

        // Messages container
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'p2p-conversation-messages';
        messagesContainer.id = 'messages-container';
        this.messagesContainer = messagesContainer;

        // Scroll event for infinite scroll
        messagesContainer.addEventListener('scroll', () => this.handleScroll());

        this.contentArea.appendChild(messagesContainer);

        // Input area
        const inputArea = document.createElement('div');
        inputArea.className = 'p2p-conversation-input-area';

        const input = document.createElement('textarea');
        input.className = 'p2p-conversation-input';
        input.placeholder = 'Написать сообщение...';
        input.rows = 1;
        input.addEventListener('input', () => this.handleInputChange());
        input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.messageInput = input;

        const sendBtn = document.createElement('button');
        sendBtn.className = 'p2p-conversation-send-btn';
        sendBtn.innerHTML = '&#10148;'; // Arrow symbol
        sendBtn.addEventListener('click', () => this.sendMessage());
        this.sendBtn = sendBtn;

        inputArea.appendChild(input);
        inputArea.appendChild(sendBtn);

        this.contentArea.appendChild(inputArea);
    }

    renderMessages() {
        if (!this.messagesContainer) return;

        this.messagesContainer.innerHTML = '';

        if (this.messages.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'p2p-conversation-empty';
            emptyEl.textContent = 'Начните диалог, отправив первое сообщение';
            this.messagesContainer.appendChild(emptyEl);
            return;
        }

        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(this.messages);

        groupedMessages.forEach(group => {
            // Date separator
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'p2p-conversation-date-separator';
            dateSeparator.textContent = group.dateLabel;
            this.messagesContainer.appendChild(dateSeparator);

            // Messages
            group.messages.forEach(msg => {
                const msgEl = this.createMessageElement(msg);
                this.messagesContainer.appendChild(msgEl);
            });
        });

        // Scroll to bottom
        this.scrollToBottom();
    }

    createMessageElement(message) {
        // Приводим к числу для корректного сравнения (sender_id из API всегда число)
        const isOwn = Number(message.sender_id) === Number(this.currentUserId);

        const container = document.createElement('div');
        container.className = `p2p-message ${isOwn ? 'p2p-message--own' : 'p2p-message--other'}`;
        container.setAttribute('data-message-id', message.id);

        const bubble = document.createElement('div');
        bubble.className = 'p2p-message-bubble';
        bubble.textContent = message.content;

        const meta = document.createElement('div');
        meta.className = 'p2p-message-meta';

        const time = document.createElement('span');
        time.className = 'p2p-message-time';
        time.textContent = this.formatMessageTime(message.created_at);

        meta.appendChild(time);

        if (isOwn) {
            const status = document.createElement('span');
            status.className = 'p2p-message-status';
            if (message.read) {
                status.innerHTML = '&#10003;&#10003;'; // Double check
                status.classList.add('read');
            } else {
                status.innerHTML = '&#10003;'; // Single check
            }
            meta.appendChild(status);
        }

        bubble.appendChild(meta);
        container.appendChild(bubble);

        return container;
    }

    groupMessagesByDate(messages) {
        const groups = [];
        let currentGroup = null;

        messages.forEach(msg => {
            const date = new Date(msg.created_at);
            const dateKey = date.toDateString();
            const dateLabel = this.formatDateLabel(date);

            if (!currentGroup || currentGroup.dateKey !== dateKey) {
                currentGroup = {
                    dateKey,
                    dateLabel,
                    messages: []
                };
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
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    formatMessageTime(isoDate) {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    async loadMessages(loadMore = false) {
        if (this.isLoading || (!loadMore && this.messages.length > 0)) return;
        if (loadMore && !this.hasMore) return;

        this.isLoading = true;

        try {
            const options = { limit: 50 };
            if (loadMore && this.oldestMessageId) {
                options.before = this.oldestMessageId;
            }

            const response = await chatApi.getMessages(this.userId, options);
            const newMessages = response.data || [];

            if (newMessages.length < 50) {
                this.hasMore = false;
            }

            if (newMessages.length > 0) {
                this.oldestMessageId = newMessages[newMessages.length - 1].id;

                if (loadMore) {
                    // Prepend older messages
                    this.messages = [...newMessages.reverse(), ...this.messages];
                } else {
                    // Initial load - messages come newest first, need to reverse
                    this.messages = newMessages.reverse();
                }
            }

            this.renderMessages();
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;

        try {
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
            this.messageInput.value = '';
            this.autoResizeInput();

            // Send to server
            const response = await chatApi.sendMessage(this.userId, content);
            const sentMessage = response.data;

            // Replace temp message with real one
            const tempIndex = this.messages.findIndex(m => m.id === tempMessage.id);
            if (tempIndex >= 0) {
                this.messages[tempIndex] = sentMessage;
                this.renderMessages();
            }

            dispatch('ChatMessageSent', {
                type: 'dm',
                userId: this.userId,
                message: sentMessage
            });

        } catch (error) {
            console.error('Failed to send message:', error);
            // Remove temp message on error
            this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
            this.renderMessages();
            this.messageInput.value = content;
        }
    }

    async markAsRead() {
        try {
            await chatApi.markAsRead(this.userId);
            dispatch('ChatMessagesRead', {
                type: 'dm',
                userId: this.userId
            });
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    }

    handleScroll() {
        // Load more when scrolled to top
        if (this.messagesContainer.scrollTop < 100 && this.hasMore && !this.isLoading) {
            this.loadMessages(true);
        }
    }

    handleInputChange() {
        this.autoResizeInput();
        this.handleTyping();
    }

    autoResizeInput() {
        const input = this.messageInput;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    handleTyping() {
        if (!this.isTyping) {
            this.isTyping = true;
            dispatch('ChatTyping', {
                type: 'dm',
                recipientId: this.userId,
                isTyping: true
            });
        }

        // Reset timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.typingTimeout = setTimeout(() => {
            this.isTyping = false;
            dispatch('ChatTyping', {
                type: 'dm',
                recipientId: this.userId,
                isTyping: false
            });
        }, 2000);
    }

    handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    goBack() {
        this.close();
        // Import dynamically to avoid circular dependency
        import('./chatPanel.js').then(({ openChatPanel }) => {
            openChatPanel();
        });
    }

    bindChatEvents() {
        // Listen for new messages
        this.newMessageHandler = (e) => {
            const { type, data } = e.detail || {};
            // Используем нестрогое сравнение для совместимости типов (string/number)
            // eslint-disable-next-line eqeqeq
            if (type === 'dm' && data?.sender_id == this.userId) {
                this.handleIncomingMessage(data.message);
            }
        };
        window.addEventListener('ChatEvent', this.newMessageHandler);

        // Listen for typing indicator
        this.typingHandler = (e) => {
            const { userId, isTyping } = e.detail || {};
            // eslint-disable-next-line eqeqeq
            if (userId == this.userId) {
                this.showTypingIndicator(isTyping);
            }
        };
        window.addEventListener('TypingIndicator', this.typingHandler);
    }

    handleIncomingMessage(message) {
        this.messages.push(message);
        this.renderMessages();
        this.markAsRead();
    }

    showTypingIndicator(isTyping) {
        this.partnerTyping = isTyping;
        const statusEl = document.getElementById('typing-status');
        if (statusEl) {
            statusEl.textContent = isTyping ? 'печатает...' : '';
        }
    }

    close() {
        // Stop typing indicator
        if (this.isTyping) {
            dispatch('ChatTyping', {
                type: 'dm',
                recipientId: this.userId,
                isTyping: false
            });
        }

        // Clear typing timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Cleanup event listeners
        if (this.newMessageHandler) {
            window.removeEventListener('ChatEvent', this.newMessageHandler);
        }
        if (this.typingHandler) {
            window.removeEventListener('TypingIndicator', this.typingHandler);
        }

        super.close();
    }

    // Override buttons - custom input area instead
    createButtons() {
        // No default buttons for conversation view
    }
}
