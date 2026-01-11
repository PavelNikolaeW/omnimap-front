/**
 * ChatDeepLinkHandler - Обработка deep links для чатов
 *
 * Поддерживаемые форматы:
 * - #chat/dm/{userId} - Открыть личный чат с пользователем
 * - #chat/group/{groupId} - Открыть групповой чат
 *
 * Также слушает события:
 * - OpenDirectChat - Открыть личный чат (от push notifications)
 * - OpenGroupChat - Открыть групповой чат (от push notifications)
 */

import { ConversationView } from './popups/conversationView.js';
import { GroupChatView } from './popups/groupChatView.js';
import chatApi from '../api/chatApi.js';

const LOG_PREFIX = '[ChatDeepLink]';

// Хранилище обработчиков для возможности cleanup
let directChatHandler = null;
let groupChatHandler = null;

// Паттерн для валидации ID (цифры или UUID)
const ID_PATTERN = /^[\w-]+$/;
const MAX_ID_LENGTH = 64;

/**
 * Валидирует ID чата/пользователя
 * @param {string} id - ID для валидации
 * @returns {string|null} - Валидный ID или null
 */
function validateId(id) {
    if (!id || typeof id !== 'string') {
        return null;
    }

    const trimmed = id.trim();

    if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) {
        console.warn(LOG_PREFIX, 'Invalid ID: length out of bounds', { length: trimmed.length });
        return null;
    }

    if (!ID_PATTERN.test(trimmed)) {
        console.warn(LOG_PREFIX, 'Invalid ID: contains invalid characters');
        return null;
    }

    return trimmed;
}

/**
 * Парсит hash URL для извлечения параметров чата
 * @param {string} hash - window.location.hash
 * @returns {Object|null} - { type: 'dm'|'group', id: string } или null
 */
function parseChatHash(hash) {
    if (!hash || !hash.startsWith('#chat/')) {
        return null;
    }

    // #chat/dm/123 или #chat/group/abc-uuid
    const parts = hash.slice(1).split('/'); // ['chat', 'dm', '123']

    if (parts.length !== 3 || parts[0] !== 'chat') {
        console.warn(LOG_PREFIX, 'Invalid hash format', { hash });
        return null;
    }

    const [, type, rawId] = parts;

    if (type !== 'dm' && type !== 'group') {
        console.warn(LOG_PREFIX, 'Invalid chat type', { type });
        return null;
    }

    const id = validateId(rawId);
    if (!id) {
        return null;
    }

    return { type, id };
}

/**
 * Очищает hash из URL после обработки
 */
function clearHash() {
    const url = window.location.pathname + window.location.search;
    history.replaceState(null, '', url);
}

/**
 * Открывает личный чат по ID пользователя
 * @param {string|number} userId - ID пользователя
 * @param {string} [username] - Имя пользователя (опционально)
 */
export async function openDirectChatById(userId, username = null) {
    console.log(LOG_PREFIX, 'Opening direct chat', { userId, username });

    try {
        // Если username не передан, пробуем найти в conversations
        let displayName = username;

        if (!displayName) {
            try {
                const response = await chatApi.getConversations();
                const conversations = response.data || [];
                // Приводим к числу для корректного сравнения (userId из URL - строка, из API - число)
                const numericUserId = Number(userId);
                const existing = conversations.find(c => c.user_id === numericUserId);
                if (existing) {
                    displayName = existing.username;
                }
            } catch (e) {
                console.warn(LOG_PREFIX, 'Failed to fetch conversations', e);
            }
        }

        // Открываем чат
        new ConversationView({
            user_id: userId,
            username: displayName || `User ${userId}`
        });

    } catch (error) {
        console.error(LOG_PREFIX, 'Failed to open direct chat', error);
    }
}

/**
 * Открывает групповой чат по ID
 * @param {string} groupId - ID группы
 */
export async function openGroupChatById(groupId) {
    console.log(LOG_PREFIX, 'Opening group chat', { groupId });

    try {
        // Получаем информацию о группе
        const response = await chatApi.getChatGroup(groupId);
        const group = response.data;

        if (!group) {
            console.warn(LOG_PREFIX, 'Group not found', { groupId });
            return;
        }

        // Открываем чат группы
        new GroupChatView(group);

    } catch (error) {
        console.error(LOG_PREFIX, 'Failed to open group chat', error);

        // Если 404 или другая ошибка - возможно нет доступа
        if (error.response?.status === 404) {
            console.warn(LOG_PREFIX, 'Group not found or no access');
        }
    }
}

/**
 * Обрабатывает deep link из URL hash
 * Вызывается при инициализации приложения
 */
export function handleChatDeepLink() {
    const hash = window.location.hash;

    if (!hash) {
        return;
    }

    const chatParams = parseChatHash(hash);

    if (!chatParams) {
        return;
    }

    console.log(LOG_PREFIX, 'Processing deep link', chatParams);

    // Очищаем hash сразу, чтобы избежать повторной обработки
    clearHash();

    // Открываем чат с небольшой задержкой, чтобы приложение успело инициализироваться
    setTimeout(() => {
        if (chatParams.type === 'dm') {
            openDirectChatById(chatParams.id);
        } else if (chatParams.type === 'group') {
            openGroupChatById(chatParams.id);
        }
    }, 500);
}

/**
 * Очищает обработчики событий чата
 * Вызывается перед повторной инициализацией (hot reload safety)
 */
export function cleanupChatEventListeners() {
    if (directChatHandler) {
        window.removeEventListener('OpenDirectChat', directChatHandler);
        directChatHandler = null;
    }
    if (groupChatHandler) {
        window.removeEventListener('OpenGroupChat', groupChatHandler);
        groupChatHandler = null;
    }
}

/**
 * Инициализирует обработчики событий для открытия чатов
 * Слушает события от push notifications
 */
export function initChatEventListeners() {
    // Очищаем существующие listeners (hot reload safety)
    cleanupChatEventListeners();

    // Открытие личного чата по событию
    directChatHandler = (e) => {
        const { userId, username } = e.detail || {};
        if (userId) {
            openDirectChatById(userId, username);
        }
    };
    window.addEventListener('OpenDirectChat', directChatHandler);

    // Открытие группового чата по событию
    groupChatHandler = (e) => {
        const { groupId } = e.detail || {};
        if (groupId) {
            openGroupChatById(groupId);
        }
    };
    window.addEventListener('OpenGroupChat', groupChatHandler);

    console.log(LOG_PREFIX, 'Event listeners initialized');
}

/**
 * Генерирует URL для deep link на чат
 * @param {string} type - 'dm' или 'group'
 * @param {string|number} id - ID пользователя или группы
 * @returns {string} - Полный URL
 */
export function generateChatDeepLink(type, id) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/#chat/${type}/${id}`;
}
