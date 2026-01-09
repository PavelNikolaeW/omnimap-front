/**
 * LLM API - API для работы с LLM Gateway
 *
 * Эндпоинты:
 * - GET /api/v1/dialogs - Список диалогов
 * - POST /api/v1/dialogs - Создать диалог
 * - DELETE /api/v1/dialogs/{id} - Удалить диалог
 * - GET /api/v1/dialogs/{id}/messages - История сообщений
 * - POST /api/v1/dialogs/{id}/messages - Отправить сообщение (SSE streaming)
 * - GET /api/v1/models - Доступные модели
 * - GET /api/v1/users/me/tokens - Баланс токенов
 */

import Cookies from 'js-cookie';
import config from '../config';

class LlmApi {
    constructor() {
        // Используем централизованный config (runtime config + build-time fallback)
        this.baseUrl = config.LLM_GATEWAY_URL;
    }

    /**
     * Получить токен авторизации
     */
    getAuthToken() {
        return Cookies.get('access') || '';
    }

    /**
     * Выполнить fetch запрос с авторизацией
     */
    async fetch(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAuthToken()}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.detail || `HTTP ${response.status}`);
        }

        return response;
    }

    // =====================================================
    // ДИАЛОГИ
    // =====================================================

    /**
     * Получить список диалогов
     * @returns {Promise<Array>} - Список диалогов
     */
    async getDialogs() {
        const response = await this.fetch('/api/v1/dialogs');
        const data = await response.json();
        return data.items || data.dialogs || data || [];
    }

    /**
     * Создать новый диалог
     * @param {Object} params
     * @param {string} params.title - Название диалога
     * @param {string} params.model - Название модели
     * @param {string} params.systemPrompt - System prompt
     * @param {Object} params.agentConfig - Конфиг агента (temperature, max_tokens, top_p)
     * @returns {Promise<Object>} - Созданный диалог
     */
    async createDialog({ title, model, systemPrompt, agentConfig = {} }) {
        const response = await this.fetch('/api/v1/dialogs', {
            method: 'POST',
            body: JSON.stringify({
                title,
                model_name: model,
                system_prompt: systemPrompt || undefined,
                agent_config: {
                    temperature: agentConfig.temperature ?? 0.7,
                    max_tokens: agentConfig.maxTokens ?? 4096,
                    top_p: agentConfig.topP ?? 0.9
                }
            })
        });
        return response.json();
    }

    /**
     * Удалить диалог
     * @param {string} dialogId - ID диалога
     */
    async deleteDialog(dialogId) {
        await this.fetch(`/api/v1/dialogs/${dialogId}`, {
            method: 'DELETE'
        });
    }

    /**
     * Обновить диалог
     * @param {string} dialogId - ID диалога
     * @param {Object} data - Данные для обновления
     */
    async updateDialog(dialogId, data) {
        const response = await this.fetch(`/api/v1/dialogs/${dialogId}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
        return response.json();
    }

    // =====================================================
    // СООБЩЕНИЯ
    // =====================================================

    /**
     * Получить сообщения диалога
     * @param {string} dialogId - ID диалога
     * @returns {Promise<Array>} - Список сообщений
     */
    async getMessages(dialogId) {
        const response = await this.fetch(`/api/v1/dialogs/${dialogId}/messages`);
        const data = await response.json();
        return Array.isArray(data) ? data : (data.messages || []);
    }

    /**
     * Отправить сообщение и получить ответ через SSE streaming
     * @param {string} dialogId - ID диалога
     * @param {string} content - Текст сообщения
     * @param {Function} onChunk - Callback для каждого чанка ответа
     * @param {AbortSignal} signal - Signal для отмены запроса
     * @returns {Promise<Object>} - Финальный результат { content, promptTokens, completionTokens }
     */
    async sendMessageStream(dialogId, content, onChunk, signal) {
        const url = `${this.baseUrl}/api/v1/dialogs/${dialogId}/messages`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${this.getAuthToken()}`
            },
            body: JSON.stringify({ content }),
            signal
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || error.detail || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let buffer = '';
        let promptTokens = 0;
        let completionTokens = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const chunk = parsed.content || parsed.choices?.[0]?.delta?.content || '';

                        if (chunk) {
                            accumulatedContent += chunk;
                            onChunk?.(chunk, accumulatedContent);
                        }

                        if (parsed.done) {
                            promptTokens = parsed.prompt_tokens || 0;
                            completionTokens = parsed.completion_tokens || 0;
                        }
                    } catch {
                        // Skip non-JSON lines
                    }
                }
            }
        }

        return {
            content: accumulatedContent,
            promptTokens,
            completionTokens
        };
    }

    // =====================================================
    // МОДЕЛИ И БАЛАНС
    // =====================================================

    /**
     * Получить доступные модели
     * @returns {Promise<Array>} - Список моделей
     */
    async getModels() {
        try {
            const response = await this.fetch('/api/v1/models');
            const data = await response.json();
            return data || [];
        } catch (err) {
            console.error('Failed to load models:', err);
            // Fallback models
            return [
                { name: 'gpt-4-turbo', provider: 'openai', context_window: 128000 },
                { name: 'gpt-3.5-turbo', provider: 'openai', context_window: 16000 }
            ];
        }
    }

    /**
     * Получить баланс токенов пользователя
     * @returns {Promise<Object>} - { balance, total_used, limit }
     */
    async getTokenBalance() {
        try {
            const response = await this.fetch('/api/v1/users/me/tokens');
            return response.json();
        } catch (err) {
            console.error('Failed to load token balance:', err);
            return null;
        }
    }
}

const llmApi = new LlmApi();

export default llmApi;
