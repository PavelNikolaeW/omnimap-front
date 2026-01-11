/**
 * ChatSync - WebSocket интеграция для P2P и групповых чатов
 *
 * Обрабатывает события:
 * - dm: личное сообщение
 * - group_message: сообщение в группе
 * - dm_typing: typing indicator для DM
 * - group_typing: typing indicator для групп
 * - group_update: изменения в группе (member_added, member_removed, group_renamed, group_deleted)
 */

import { dispatch } from '../utils/utils.js';

class ChatSync {
    constructor() {
        this.wsInstance = null;
        this.isSubscribed = false;
    }

    /**
     * Инициализация с экземпляром WebSocket
     * @param {UpdateServiceWebSocket} wsInstance
     */
    init(wsInstance) {
        this.wsInstance = wsInstance;
    }

    /**
     * Подписаться на чат-события
     */
    subscribe() {
        if (!this.wsInstance || this.isSubscribed) return;

        this.wsInstance.sendMessage({
            action: 'chat_subscribe'
        });
        this.isSubscribed = true;
    }

    /**
     * Отписаться от чат-событий
     */
    unsubscribe() {
        if (!this.wsInstance || !this.isSubscribed) return;

        this.wsInstance.sendMessage({
            action: 'chat_unsubscribe'
        });
        this.isSubscribed = false;
    }

    /**
     * Отправить typing indicator для личного сообщения
     * @param {number} recipientId - ID получателя
     * @param {boolean} isTyping - Печатает ли пользователь
     */
    sendDmTyping(recipientId, isTyping) {
        if (!this.wsInstance) return;

        this.wsInstance.sendMessage({
            action: 'dm_typing',
            recipient_id: recipientId,
            is_typing: isTyping
        });
    }

    /**
     * Отправить typing indicator для группового чата
     * @param {string} groupId - ID группы
     * @param {boolean} isTyping - Печатает ли пользователь
     */
    sendGroupTyping(groupId, isTyping) {
        if (!this.wsInstance) return;

        this.wsInstance.sendMessage({
            action: 'group_typing',
            group_id: groupId,
            is_typing: isTyping
        });
    }

    /**
     * Обработка входящего сообщения от WebSocket
     * Вызывается из webSocket.js
     * @param {Object} message - Распарсенное сообщение
     * @returns {boolean} - true если сообщение было обработано
     */
    handleMessage(message) {
        if (!message || !message.type) return false;

        switch (message.type) {
            case 'chat_event':
                return this.handleChatEvent(message);

            case 'dm':
                this.handleDirectMessage(message.data);
                return true;

            case 'group_message':
                this.handleGroupMessage(message.data);
                return true;

            case 'dm_typing':
                this.handleDmTyping(message.data);
                return true;

            case 'group_typing':
                this.handleGroupTyping(message.data);
                return true;

            case 'group_update':
                this.handleGroupUpdate(message.data);
                return true;

            default:
                return false;
        }
    }

    /**
     * Обработка chat_event (обёртка для разных типов событий)
     * @param {Object} message
     */
    handleChatEvent(message) {
        const { event_type, data } = message;

        switch (event_type) {
            case 'dm':
                this.handleDirectMessage(data);
                break;
            case 'group_message':
                this.handleGroupMessage(data);
                break;
            case 'group_update':
                this.handleGroupUpdate(data);
                break;
            default:
                console.warn('Unknown chat event type:', event_type);
                return false;
        }

        return true;
    }

    /**
     * Обработка личного сообщения
     * @param {Object} data - { sender_id, recipient_id, message: { id, content, created_at } }
     */
    handleDirectMessage(data) {
        // DEBUG: Log incoming DM data from WebSocket
        console.log('[ChatSync] handleDirectMessage', data);

        dispatch('ChatEvent', {
            type: 'dm',
            data: {
                sender_id: data.sender_id,
                recipient_id: data.recipient_id,
                message: data.message
            }
        });

        dispatch('NewDirectMessage', {
            senderId: data.sender_id,
            recipientId: data.recipient_id,
            message: data.message
        });

        // Показать push-уведомление если чат не открыт
        this.showNotification('dm', data);
    }

    /**
     * Обработка группового сообщения
     * @param {Object} data - { group_id, sender_id, message: { id, content, created_at } }
     */
    handleGroupMessage(data) {
        dispatch('ChatEvent', {
            type: 'group_message',
            data: {
                group_id: data.group_id,
                sender_id: data.sender_id,
                message: data.message
            }
        });

        dispatch('NewGroupMessage', {
            groupId: data.group_id,
            senderId: data.sender_id,
            message: data.message
        });

        // Показать push-уведомление если чат не открыт
        this.showNotification('group', data);
    }

    /**
     * Обработка typing indicator для DM
     * @param {Object} data - { user_id, is_typing }
     */
    handleDmTyping(data) {
        dispatch('TypingIndicator', {
            userId: data.user_id,
            isTyping: data.is_typing
        });
    }

    /**
     * Обработка typing indicator для группы
     * @param {Object} data - { group_id, user_id, username, is_typing }
     */
    handleGroupTyping(data) {
        dispatch('GroupTypingIndicator', {
            groupId: data.group_id,
            userId: data.user_id,
            username: data.username,
            isTyping: data.is_typing
        });
    }

    /**
     * Обработка изменений в группе
     * @param {Object} data - { group_id, action, data }
     */
    handleGroupUpdate(data) {
        dispatch('ChatEvent', {
            type: 'group_update',
            data: {
                group_id: data.group_id,
                action: data.group_action || data.action,
                ...data.data
            }
        });

        // Специфичные события
        switch (data.group_action || data.action) {
            case 'member_added':
                dispatch('ChatGroupMemberAdded', {
                    groupId: data.group_id,
                    userId: data.data?.user_id,
                    username: data.data?.username
                });
                break;

            case 'member_removed':
                dispatch('ChatGroupMemberRemoved', {
                    groupId: data.group_id,
                    userId: data.data?.user_id
                });
                break;

            case 'group_renamed':
                dispatch('ChatGroupRenamed', {
                    groupId: data.group_id,
                    name: data.data?.name
                });
                break;

            case 'group_deleted':
                dispatch('ChatGroupDeleted', {
                    groupId: data.group_id
                });
                break;
        }
    }

    /**
     * Показать уведомление о новом сообщении
     * @param {string} type - 'dm' | 'group'
     * @param {Object} data
     */
    showNotification(type, data) {
        // Проверяем разрешение на уведомления
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        // Не показываем уведомление если документ активен
        if (document.visibilityState === 'visible') {
            return;
        }

        const title = type === 'dm'
            ? `Новое сообщение от ${data.sender_username || 'пользователя'}`
            : `Новое сообщение в группе`;

        const body = data.message?.content?.substring(0, 100) || 'Новое сообщение';

        try {
            const notification = new Notification(title, {
                body,
                icon: '/favicon.ico',
                tag: type === 'dm' ? `dm-${data.sender_id}` : `group-${data.group_id}`,
                renotify: true
            });

            notification.onclick = () => {
                window.focus();
                notification.close();

                // Открыть соответствующий чат
                if (type === 'dm') {
                    dispatch('OpenDirectChat', { userId: data.sender_id });
                } else {
                    dispatch('OpenGroupChat', { groupId: data.group_id });
                }
            };
        } catch (error) {
            console.warn('Failed to show notification:', error);
        }
    }

    /**
     * Запросить разрешение на уведомления
     */
    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            return 'unsupported';
        }

        if (Notification.permission === 'granted') {
            return 'granted';
        }

        if (Notification.permission === 'denied') {
            return 'denied';
        }

        return await Notification.requestPermission();
    }
}

// Синглтон
const chatSync = new ChatSync();

export default chatSync;

/**
 * Инициализация ChatSync с WebSocket
 * @param {UpdateServiceWebSocket} wsInstance
 */
export function initChatSync(wsInstance) {
    chatSync.init(wsInstance);
    chatSync.subscribe();
}
