/**
 * FocusManager
 *
 * Управляет системой фокуса:
 * - Дефолтный Focus на Home Page с авторотацией недели
 * - Пользовательские контейнеры фокуса (isFocusContainer)
 * - Добавление ссылок на блоки в контейнеры фокуса
 */

import { dispatch } from '../utils/utils.js';
import { localStateManager } from '../stateLocal/localStateManager.js';
import { getISOWeekKey } from '../controller/layoutEditor/CalendarGenerator.js';

class FocusManager {
    constructor() {
        // Кэш для быстрого доступа
        this._homeFocusBlockId = null;
        this._currentWeekBlockId = null;
    }

    /**
     * Находит дефолтный блок Focus на Home Page
     * @returns {Object|null} Блок с homePageRole='focus' или null
     */
    findHomeFocusBlock() {
        for (const [id, block] of localStateManager.blocks) {
            if (block.data?.homePageRole === 'focus') {
                this._homeFocusBlockId = id;
                return block;
            }
        }
        return null;
    }

    /**
     * Находит блок текущей недели по ISO ключу
     * @returns {Object|null} Блок недели или null
     */
    findCurrentWeekBlock() {
        const currentWeekKey = getISOWeekKey(new Date());

        for (const [id, block] of localStateManager.blocks) {
            if (block.data?.calendarType === 'week' && block.data?.isoWeekKey === currentWeekKey) {
                this._currentWeekBlockId = id;
                return block;
            }
        }
        return null;
    }

    /**
     * Находит все блоки-контейнеры фокуса
     * @returns {Array<Object>} Массив блоков с isFocusContainer=true
     */
    findAllFocusContainers() {
        const containers = [];

        for (const [id, block] of localStateManager.blocks) {
            if (block.data?.isFocusContainer) {
                containers.push({
                    id,
                    title: block.title || block.data?.focusContainerName || 'Без названия',
                    name: block.data?.focusContainerName || block.title || 'Контейнер фокуса'
                });
            }
        }

        return containers;
    }

    /**
     * Получает список всех доступных контейнеров для добавления в фокус
     * Включает пользовательские контейнеры и дефолтный Home Focus
     *
     * Оптимизация: один проход по всем блокам вместо двух отдельных вызовов
     * @returns {Array<Object>} Массив контейнеров [{id, title, isHomeFocus}]
     */
    getAllAvailableContainers() {
        const containers = [];
        let homeFocusBlock = null;

        // Один проход по всем блокам
        for (const [id, block] of localStateManager.blocks) {
            // Проверяем пользовательские контейнеры фокуса
            if (block.data?.isFocusContainer) {
                containers.push({
                    id,
                    title: block.data?.focusContainerName || block.title || 'Контейнер фокуса',
                    isHomeFocus: false
                });
            }

            // Запоминаем Home Focus
            if (block.data?.homePageRole === 'focus') {
                homeFocusBlock = block;
                this._homeFocusBlockId = id;
            }
        }

        // Добавляем дефолтный Home Focus в конец списка
        if (homeFocusBlock) {
            containers.push({
                id: homeFocusBlock.id,
                title: 'Focus (Home)',
                isHomeFocus: true
            });
        }

        return containers;
    }

    /**
     * Добавляет ссылку на блок в контейнер фокуса
     * @param {string} blockId - ID блока для добавления
     * @param {string} containerId - ID контейнера фокуса
     */
    addBlockToFocusContainer(blockId, containerId) {
        if (!blockId || !containerId) {
            console.warn('FocusManager: blockId and containerId are required');
            return;
        }

        if (blockId === containerId) {
            console.warn('FocusManager: Cannot add block to itself');
            return;
        }

        // Используем существующий механизм PasteLinkBlock
        dispatch('PasteLinkBlock', {
            dest: containerId,
            src: [blockId]
        });

        console.log('FocusManager: Added block to focus container', {
            blockId,
            containerId
        });
    }

    /**
     * Помечает блок как контейнер фокуса
     * @param {string} blockId - ID блока
     * @param {string} [name] - Название контейнера (опционально)
     */
    markAsFocusContainer(blockId, name = null) {
        const block = localStateManager.blocks.get(blockId);
        if (!block) {
            console.warn('FocusManager: Block not found:', blockId);
            return;
        }

        const containerName = name || block.title || 'Контейнер фокуса';

        dispatch('UpdateDataBlock', {
            blockId,
            data: {
                ...block.data,
                isFocusContainer: true,
                focusContainerName: containerName
            }
        });

        console.log('FocusManager: Marked block as focus container', {
            blockId,
            name: containerName
        });
    }

    /**
     * Снимает метку контейнера фокуса с блока
     * @param {string} blockId - ID блока
     */
    unmarkAsFocusContainer(blockId) {
        const block = localStateManager.blocks.get(blockId);
        if (!block) {
            console.warn('FocusManager: Block not found:', blockId);
            return;
        }

        const newData = { ...block.data };
        delete newData.isFocusContainer;
        delete newData.focusContainerName;

        dispatch('UpdateDataBlock', {
            blockId,
            data: newData
        });

        console.log('FocusManager: Unmarked block as focus container', { blockId });
    }

    /**
     * Проверяет, является ли блок контейнером фокуса
     * @param {string} blockId - ID блока
     * @returns {boolean}
     */
    isFocusContainer(blockId) {
        const block = localStateManager.blocks.get(blockId);
        return !!block?.data?.isFocusContainer;
    }

    /**
     * Обновляет ссылку на текущую неделю в дефолтном Home Focus
     * Авторотация: удаляет старую ссылку на неделю и создаёт новую
     *
     * Важно: операции выполняются последовательно чтобы избежать race condition
     */
    async updateCurrentWeekLink() {
        const homeFocus = this.findHomeFocusBlock();
        if (!homeFocus) {
            return;
        }

        const currentWeekBlock = this.findCurrentWeekBlock();
        if (!currentWeekBlock) {
            return;
        }

        const currentWeekKey = getISOWeekKey(new Date());
        const homeFocusId = homeFocus.id;
        const currentWeekId = currentWeekBlock.id;

        // Проверяем, есть ли уже ссылка на текущую неделю
        const childOrder = homeFocus.data?.childOrder || [];
        let hasCurrentWeekLink = false;
        const oldWeekLinkIds = [];

        for (const childId of childOrder) {
            const childBlock = localStateManager.blocks.get(childId);
            if (childBlock?.data?.view === 'link' && childBlock?.data?.calendarType === 'weekLink') {
                if (childBlock.data.isoWeekKey === currentWeekKey) {
                    hasCurrentWeekLink = true;
                } else {
                    // Старая ссылка на другую неделю - пометим для удаления
                    oldWeekLinkIds.push(childId);
                }
            }
            // Также проверяем прямую ссылку на блок недели
            if (childBlock?.data?.view === 'link' && childBlock?.data?.source === currentWeekId) {
                hasCurrentWeekLink = true;
            }
        }

        // Если уже есть ссылка на текущую неделю и нет старых ссылок - ничего не делаем
        if (hasCurrentWeekLink && oldWeekLinkIds.length === 0) {
            return;
        }

        // Сначала удаляем старые ссылки на недели (авторотация)
        // Выполняем последовательно чтобы избежать race condition
        for (const oldLinkId of oldWeekLinkIds) {
            await new Promise(resolve => {
                dispatch('DeleteTreeBlock', { blockId: oldLinkId });
                // Даём время на обработку события
                setTimeout(resolve, 50);
            });
        }

        // Затем добавляем ссылку на текущую неделю если её нет
        if (!hasCurrentWeekLink) {
            dispatch('PasteLinkBlock', {
                dest: homeFocusId,
                src: [currentWeekId]
            });
        }
    }

    /**
     * Инициализирует ссылку на текущую неделю при первом входе
     * Вызывается при открытии Home Focus
     *
     * Обрабатывает оба случая:
     * - Первая инициализация (пустой Home Focus)
     * - Авторотация (проверка актуальности недели)
     */
    async initializeWeekLinkIfNeeded() {
        await this.updateCurrentWeekLink();
    }
}

// Singleton instance
export const focusManager = new FocusManager();

export default focusManager;
