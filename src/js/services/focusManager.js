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
        this._currentWeekKey = null;
        this._focusContainersCache = null; // Map<id, {id, title, name}>
    }

    /**
     * Сбрасывает весь кэш
     * Вызывать при полной перезагрузке блоков (InitUser, logout)
     */
    invalidateCache() {
        this._homeFocusBlockId = null;
        this._currentWeekBlockId = null;
        this._currentWeekKey = null;
        this._focusContainersCache = null;
    }

    /**
     * Сбрасывает кэш контейнеров фокуса
     * Вызывать при изменении isFocusContainer у блоков
     */
    invalidateContainersCache() {
        this._focusContainersCache = null;
    }

    /**
     * Находит дефолтный блок Focus на Home Page
     * Использует кэш для быстрого доступа
     * @returns {Object|null} Блок с homePageRole='focus' или null
     */
    findHomeFocusBlock() {
        // Проверяем кэш
        if (this._homeFocusBlockId) {
            const cached = localStateManager.blocks.get(this._homeFocusBlockId);
            if (cached?.data?.homePageRole === 'focus') {
                return cached;
            }
            // Кэш невалиден - сбрасываем
            this._homeFocusBlockId = null;
        }

        // Полный поиск
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
     * Использует кэш, инвалидирует при смене недели
     * @returns {Object|null} Блок недели или null
     */
    findCurrentWeekBlock() {
        const currentWeekKey = getISOWeekKey(new Date());

        // Проверяем кэш (с учётом смены недели)
        if (this._currentWeekBlockId && this._currentWeekKey === currentWeekKey) {
            const cached = localStateManager.blocks.get(this._currentWeekBlockId);
            if (cached?.data?.calendarType === 'week' && cached?.data?.isoWeekKey === currentWeekKey) {
                return cached;
            }
            // Кэш невалиден - сбрасываем
            this._currentWeekBlockId = null;
            this._currentWeekKey = null;
        }

        // Полный поиск
        for (const [id, block] of localStateManager.blocks) {
            if (block.data?.calendarType === 'week' && block.data?.isoWeekKey === currentWeekKey) {
                this._currentWeekBlockId = id;
                this._currentWeekKey = currentWeekKey;
                return block;
            }
        }
        return null;
    }

    /**
     * Находит все блоки-контейнеры фокуса
     * Использует кэш для избежания полного перебора
     * @returns {Array<Object>} Массив блоков с isFocusContainer=true
     */
    findAllFocusContainers() {
        // Проверяем кэш
        if (this._focusContainersCache) {
            // Валидируем кэш - проверяем что блоки ещё существуют и имеют нужный флаг
            const valid = [...this._focusContainersCache.values()].every(c => {
                const block = localStateManager.blocks.get(c.id);
                return block?.data?.isFocusContainer;
            });
            if (valid) {
                return [...this._focusContainersCache.values()];
            }
            this._focusContainersCache = null;
        }

        // Полный поиск и заполнение кэша
        this._focusContainersCache = new Map();

        for (const [id, block] of localStateManager.blocks) {
            if (block.data?.isFocusContainer) {
                const container = {
                    id,
                    title: block.title || block.data?.focusContainerName || 'Без названия',
                    name: block.data?.focusContainerName || block.title || 'Контейнер фокуса'
                };
                this._focusContainersCache.set(id, container);
            }
        }

        return [...this._focusContainersCache.values()];
    }

    /**
     * Получает список всех доступных контейнеров для добавления в фокус
     * Включает пользовательские контейнеры и дефолтный Home Focus
     *
     * Использует кэш для пользовательских контейнеров
     * @returns {Array<Object>} Массив контейнеров [{id, title, isHomeFocus}]
     */
    getAllAvailableContainers() {
        // Получаем пользовательские контейнеры (с кэшированием)
        const focusContainers = this.findAllFocusContainers();
        const containers = focusContainers.map(c => ({
            id: c.id,
            title: c.name,
            isHomeFocus: false
        }));

        // Получаем Home Focus (с кэшированием)
        const homeFocusBlock = this.findHomeFocusBlock();

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

        // Инвалидируем кэш контейнеров
        this.invalidateContainersCache();

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

        // Инвалидируем кэш контейнеров
        this.invalidateContainersCache();

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
