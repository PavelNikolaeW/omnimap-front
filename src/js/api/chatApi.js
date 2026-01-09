/**
 * Chat API - API для P2P и групповых чатов
 *
 * Эндпоинты:
 * - GET /api/v1/chat/dm/contacts/ - Контакты (пользователи с общими блоками)
 * - GET /api/v1/chat/dm/conversations/ - Список диалогов
 * - GET /api/v1/chat/dm/{user_id}/messages/ - История сообщений
 * - POST /api/v1/chat/dm/{user_id}/messages/ - Отправить сообщение (JSON или multipart/form-data)
 * - POST /api/v1/chat/dm/{user_id}/read/ - Отметить как прочитанные
 * - GET /api/v1/chat/unread/ - Количество непрочитанных
 * - GET /api/v1/chat/users/search/?q= - Поиск пользователей среди контактов
 * - GET /api/v1/chat/groups/ - Список групповых чатов
 * - POST /api/v1/chat/groups/ - Создать группу
 * - GET /api/v1/chat/groups/{id}/ - Информация о группе
 * - PATCH /api/v1/chat/groups/{id}/ - Обновить группу
 * - DELETE /api/v1/chat/groups/{id}/ - Удалить группу
 * - GET /api/v1/chat/groups/{id}/messages/ - Сообщения группы
 * - POST /api/v1/chat/groups/{id}/messages/ - Отправить в группу
 * - POST /api/v1/chat/groups/{id}/messages/read/ - Отметить сообщения группы как прочитанные
 * - GET /api/v1/chat/groups/{id}/members/ - Участники группы
 * - POST /api/v1/chat/groups/{id}/members/ - Добавить участника
 * - DELETE /api/v1/chat/groups/{id}/members/{user_id}/ - Удалить участника
 * - POST /api/v1/chat/groups/{id}/leave/ - Покинуть группу
 * - GET /api/v1/chat/blocks/{block_id}/ - Получить чат для блока
 * - GET /api/v1/chat/me/avatar/ - Получить аватар текущего пользователя
 * - POST /api/v1/chat/me/avatar/ - Загрузить аватар
 * - DELETE /api/v1/chat/me/avatar/ - Удалить аватар
 * - GET /api/v1/chat/groups/{id}/avatar/ - Получить аватар группы
 * - POST /api/v1/chat/groups/{id}/avatar/ - Загрузить аватар группы
 * - DELETE /api/v1/chat/groups/{id}/avatar/ - Удалить аватар группы
 */

import api from './api';

class ChatApi {
    constructor() {
        this.axios = api.api;
    }

    // =====================================================
    // ЛИЧНЫЕ СООБЩЕНИЯ (DM)
    // =====================================================

    /**
     * Получить список контактов (пользователи с общими блоками)
     * @returns {Promise<Array>} - Список контактов
     */
    getContacts() {
        return this.axios.get('chat/dm/contacts/');
    }

    /**
     * Получить список диалогов с последним сообщением
     * @returns {Promise<Array>} - Список диалогов
     */
    getConversations() {
        return this.axios.get('chat/dm/conversations/');
    }

    /**
     * Получить историю сообщений с пользователем
     * @param {number} userId - ID пользователя
     * @param {Object} options - Опции пагинации
     * @param {number} options.limit - Лимит сообщений (по умолчанию 50)
     * @param {string} options.before - UUID сообщения для пагинации (загрузить сообщения до)
     * @returns {Promise<Array>} - Список сообщений
     */
    getMessages(userId, { limit = 50, before = null } = {}) {
        let url = `chat/dm/${userId}/messages/?limit=${limit}`;
        if (before) {
            url += `&before=${before}`;
        }
        return this.axios.get(url);
    }

    /**
     * Отправить личное сообщение
     * @param {number} userId - ID получателя
     * @param {string} content - Текст сообщения
     * @param {File[]} files - Массив файлов (опционально, макс. 5 файлов по 10MB)
     * @returns {Promise<Object>} - Созданное сообщение
     */
    sendMessage(userId, content, files = null) {
        if (files && files.length > 0) {
            const formData = new FormData();
            formData.append('content', content);
            files.forEach((file) => {
                formData.append('files', file);
            });
            return this.axios.post(`chat/dm/${userId}/messages/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        }
        return this.axios.post(`chat/dm/${userId}/messages/`, { content });
    }

    /**
     * Отметить сообщения как прочитанные
     * @param {number} userId - ID пользователя
     * @returns {Promise}
     */
    markAsRead(userId) {
        return this.axios.post(`chat/dm/${userId}/read/`);
    }

    // =====================================================
    // ГРУППОВЫЕ ЧАТЫ
    // =====================================================

    /**
     * Получить список групповых чатов пользователя
     * @returns {Promise<Array>} - Список групп
     */
    getChatGroups() {
        return this.axios.get('chat/groups/');
    }

    /**
     * Создать групповой чат
     * @param {string} name - Название группы
     * @param {string} blockId - ID связанного блока (опционально)
     * @returns {Promise<Object>} - Созданная группа
     */
    createChatGroup(name, blockId = null) {
        const data = { name };
        if (blockId) {
            data.block_id = blockId;
        }
        return this.axios.post('chat/groups/', data);
    }

    /**
     * Получить информацию о группе
     * @param {string} groupId - ID группы
     * @returns {Promise<Object>} - Информация о группе
     */
    getChatGroup(groupId) {
        return this.axios.get(`chat/groups/${groupId}/`);
    }

    /**
     * Обновить группу (только для админа)
     * @param {string} groupId - ID группы
     * @param {Object} data - { name: "..." }
     * @returns {Promise<Object>} - Обновленная группа
     */
    updateChatGroup(groupId, data) {
        return this.axios.patch(`chat/groups/${groupId}/`, data);
    }

    /**
     * Удалить группу (только для админа)
     * @param {string} groupId - ID группы
     * @returns {Promise}
     */
    deleteChatGroup(groupId) {
        return this.axios.delete(`chat/groups/${groupId}/`);
    }

    /**
     * Получить сообщения группы
     * @param {string} groupId - ID группы
     * @param {Object} options - Опции пагинации
     * @param {number} options.limit - Лимит сообщений
     * @param {string} options.before - UUID для пагинации
     * @returns {Promise<Array>} - Список сообщений
     */
    getGroupMessages(groupId, { limit = 50, before = null } = {}) {
        let url = `chat/groups/${groupId}/messages/?limit=${limit}`;
        if (before) {
            url += `&before=${before}`;
        }
        return this.axios.get(url);
    }

    /**
     * Отправить сообщение в группу
     * @param {string} groupId - ID группы
     * @param {string} content - Текст сообщения
     * @param {File[]} files - Массив файлов (опционально, макс. 5 файлов по 10MB)
     * @returns {Promise<Object>} - Созданное сообщение
     */
    sendGroupMessage(groupId, content, files = null) {
        if (files && files.length > 0) {
            const formData = new FormData();
            formData.append('content', content);
            files.forEach((file) => {
                formData.append('files', file);
            });
            return this.axios.post(`chat/groups/${groupId}/messages/`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        }
        return this.axios.post(`chat/groups/${groupId}/messages/`, { content });
    }

    /**
     * Получить участников группы
     * @param {string} groupId - ID группы
     * @returns {Promise<Array>} - Список участников
     */
    getChatGroupMembers(groupId) {
        return this.axios.get(`chat/groups/${groupId}/members/`);
    }

    /**
     * Добавить участника в группу (только для админа)
     * @param {string} groupId - ID группы
     * @param {number} userId - ID пользователя
     * @returns {Promise}
     */
    addChatGroupMember(groupId, userId) {
        return this.axios.post(`chat/groups/${groupId}/members/`, { user_id: userId });
    }

    /**
     * Удалить участника из группы (только для админа)
     * @param {string} groupId - ID группы
     * @param {number} userId - ID пользователя
     * @returns {Promise}
     */
    removeChatGroupMember(groupId, userId) {
        return this.axios.delete(`chat/groups/${groupId}/members/${userId}/`);
    }

    /**
     * Покинуть группу
     * @param {string} groupId - ID группы
     * @returns {Promise}
     */
    leaveChatGroup(groupId) {
        return this.axios.post(`chat/groups/${groupId}/leave/`);
    }

    /**
     * Отметить сообщения группы как прочитанные
     * @param {string} groupId - ID группы
     * @returns {Promise<Object>} - { marked_as_read: number }
     */
    markGroupAsRead(groupId) {
        return this.axios.post(`chat/groups/${groupId}/messages/read/`);
    }

    // =====================================================
    // ОБЩЕЕ
    // =====================================================

    /**
     * Получить количество непрочитанных сообщений
     * @returns {Promise<Object>} - { dm_unread, groups_unread, total }
     */
    getUnreadCount() {
        return this.axios.get('chat/unread/');
    }

    /**
     * Получить чат для блока
     * @param {string} blockId - ID блока
     * @returns {Promise<Object>} - { has_chat, chat }
     */
    getBlockChat(blockId) {
        return this.axios.get(`chat/blocks/${blockId}/`);
    }

    /**
     * Поиск пользователей (только среди shared blocks)
     * @param {string} query - Поисковый запрос (минимум 2 символа)
     * @returns {Promise<Array>} - Список пользователей
     */
    searchUsers(query) {
        return this.axios.get(`chat/users/search/?q=${encodeURIComponent(query)}`);
    }

    // =====================================================
    // АВАТАРЫ ПОЛЬЗОВАТЕЛЯ
    // =====================================================

    /**
     * Получить аватар текущего пользователя
     * @returns {Promise<Object>} - { image_url, thumbnail_url, updated_at } или { avatar: null }
     */
    getMyAvatar() {
        return this.axios.get('chat/me/avatar/');
    }

    /**
     * Загрузить/обновить аватар текущего пользователя
     * @param {File} file - Файл изображения (JPEG, PNG, GIF, WebP, макс. 5MB)
     * @returns {Promise<Object>} - { image_url, thumbnail_url, updated_at }
     */
    uploadMyAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);
        return this.axios.post('chat/me/avatar/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }

    /**
     * Удалить аватар текущего пользователя
     * @returns {Promise}
     */
    deleteMyAvatar() {
        return this.axios.delete('chat/me/avatar/');
    }

    // =====================================================
    // АВАТАРЫ ГРУПП
    // =====================================================

    /**
     * Получить аватар группы
     * @param {string} groupId - ID группы
     * @returns {Promise<Object>} - { image_url, thumbnail_url, updated_at } или { avatar: null }
     */
    getGroupAvatar(groupId) {
        return this.axios.get(`chat/groups/${groupId}/avatar/`);
    }

    /**
     * Загрузить/обновить аватар группы (только для админов)
     * @param {string} groupId - ID группы
     * @param {File} file - Файл изображения (JPEG, PNG, GIF, WebP, макс. 5MB)
     * @returns {Promise<Object>} - { image_url, thumbnail_url, updated_at }
     */
    uploadGroupAvatar(groupId, file) {
        const formData = new FormData();
        formData.append('avatar', file);
        return this.axios.post(`chat/groups/${groupId}/avatar/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }

    /**
     * Удалить аватар группы (только для админов)
     * @param {string} groupId - ID группы
     * @returns {Promise}
     */
    deleteGroupAvatar(groupId) {
        return this.axios.delete(`chat/groups/${groupId}/avatar/`);
    }
}

const chatApi = new ChatApi();

export default chatApi;
