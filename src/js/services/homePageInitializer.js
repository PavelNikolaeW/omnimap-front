/**
 * HomePageInitializer
 *
 * Создаёт начальную структуру экзокортекса для новых пользователей:
 * - Home Page с 6 блоками верхнего уровня
 * - Areas с 8 областями ответственности
 *
 * Используется после регистрации когда onboarding_completed: false
 */

import { importBlocks, pollImportStatus, generateBlockId } from '../api/importService.js';
import api from '../api/api.js';
import { dispatch } from '../utils/utils.js';

/**
 * Конфигурация 6 блоков верхнего уровня Home Page
 * Сетка: 9 строк × 7 колонок
 * Inbox большой слева, справа в столбик: Focus, Projects, Areas, Spaces, Archive
 * Высота справа: 2+2+2+2+1
 */
const HOME_PAGE_BLOCKS = [
    {
        label: 'Inbox',
        role: 'inbox',
        color: '#fef3c7',
        borderColor: '#f59e0b',
        position: { row: 1, col: 1, rowSpan: 9, colSpan: 4 }
    },
    {
        label: 'Focus',
        role: 'focus',
        color: '#dbeafe',
        borderColor: '#3b82f6',
        position: { row: 1, col: 5, rowSpan: 2, colSpan: 3 }
    },
    {
        label: 'Projects',
        role: 'projects',
        color: '#dcfce7',
        borderColor: '#22c55e',
        position: { row: 3, col: 5, rowSpan: 2, colSpan: 3 }
    },
    {
        label: 'Areas',
        role: 'areas',
        color: '#e0e7ff',
        borderColor: '#6366f1',
        position: { row: 5, col: 5, rowSpan: 2, colSpan: 3 },
        hasChildren: true  // Пометка что внутри будут дочерние блоки
    },
    {
        label: 'Spaces',
        role: 'spaces',
        color: '#fce7f3',
        borderColor: '#ec4899',
        position: { row: 7, col: 5, rowSpan: 2, colSpan: 3 }
    },
    {
        label: 'Archive',
        role: 'archive',
        color: '#f3f4f6',
        borderColor: '#9ca3af',
        position: { row: 9, col: 5, rowSpan: 1, colSpan: 3 }
    }
];

/**
 * Конфигурация 8 областей ответственности
 */
const AREAS_BLOCKS = [
    { label: 'Self', labelRu: 'Я', color: '#8B5CF6', hint: 'Личность, развитие, цели, ценности, привычки, обучение' },
    { label: 'Relationships', labelRu: 'Отношения', color: '#EC4899', hint: 'Семья, друзья, коллеги, сообщества, нетворкинг' },
    { label: 'Work', labelRu: 'Работа', color: '#3B82F6', hint: 'Карьера, навыки, должность, задачи, коллеги' },
    { label: 'Finance', labelRu: 'Финансы', color: '#10B981', hint: 'Доходы, расходы, бюджет, инвестиции, накопления' },
    { label: 'Environment', labelRu: 'Среда', color: '#A16207', hint: 'Дом, вещи, пространство, цифровые инструменты' },
    { label: 'Energy', labelRu: 'Энергия', color: '#F97316', hint: 'Здоровье, сон, питание, спорт, отдых, энергия' },
    { label: 'Creation', labelRu: 'Творчество', color: '#14B8A6', hint: 'Хобби, идеи, проекты для души, самовыражение' },
    { label: 'World', labelRu: 'Мир', color: '#6366F1', hint: 'Общество, экология, волонтёрство, вклад в мир' }
];

/**
 * Генерирует структуру блоков для импорта
 * @param {string} rootBlockId - ID корневого блока пользователя
 * @returns {Array} Массив блоков для импорта
 */
function generateHomePageStructure(rootBlockId) {
    const blocks = [];
    const homePageChildOrder = [];
    const areasBlockId = generateBlockId();
    const areasChildOrder = [];

    // Генерируем 6 блоков верхнего уровня
    for (const config of HOME_PAGE_BLOCKS) {
        const blockId = config.role === 'areas' ? areasBlockId : generateBlockId();
        homePageChildOrder.push(blockId);

        blocks.push({
            id: blockId,
            parent_id: rootBlockId,
            title: config.label,
            data: {
                text: config.label,
                homePageRole: config.role,
                style: {
                    backgroundColor: config.color,
                    borderColor: config.borderColor
                }
            }
        });
    }

    // Генерируем 8 областей внутри Areas (сетка 2×4)
    for (let i = 0; i < AREAS_BLOCKS.length; i++) {
        const area = AREAS_BLOCKS[i];
        const blockId = generateBlockId();
        areasChildOrder.push(blockId);

        const row = Math.floor(i / 4) + 1;
        const col = (i % 4) + 1;

        blocks.push({
            id: blockId,
            parent_id: areasBlockId,
            title: area.labelRu,
            data: {
                text: area.hint,
                areaType: area.label.toLowerCase(),
                style: {
                    backgroundColor: area.color + '20',  // 12% opacity
                    borderColor: area.color
                }
            }
        });
    }

    // Обновляем блок корневой страницы с layoutCells
    const rootBlockUpdate = {
        id: rootBlockId,
        data: {
            layout: 'cells',
            childOrder: homePageChildOrder,
            layoutCells: {
                gridSize: { rows: 9, cols: 7 },
                presetType: 'home',
                cells: {}
            }
        }
    };

    // Заполняем cells для home page
    HOME_PAGE_BLOCKS.forEach((config, index) => {
        const blockId = homePageChildOrder[index];
        rootBlockUpdate.data.layoutCells.cells[blockId] = config.position;
    });

    // Обновляем блок Areas с layoutCells для 8 областей
    const areasBlockIndex = blocks.findIndex(b => b.id === areasBlockId);
    if (areasBlockIndex !== -1) {
        const areasLayoutCells = {
            gridSize: { rows: 2, cols: 4 },
            presetType: 'areas',
            cells: {}
        };

        areasChildOrder.forEach((childId, index) => {
            const row = Math.floor(index / 4) + 1;
            const col = (index % 4) + 1;
            areasLayoutCells.cells[childId] = { row, col, rowSpan: 1, colSpan: 1 };
        });

        blocks[areasBlockIndex].data.layout = 'cells';
        blocks[areasBlockIndex].data.childOrder = areasChildOrder;
        blocks[areasBlockIndex].data.layoutCells = areasLayoutCells;
    }

    return { blocks, rootBlockUpdate };
}

/**
 * Инициализирует Home Page для нового пользователя
 * @param {string} rootBlockId - ID корневого блока пользователя
 * @param {Function} onProgress - Колбэк прогресса (опционально)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function initializeHomePage(rootBlockId, onProgress = null) {
    try {
        console.log('HomePageInitializer: Starting initialization for root block:', rootBlockId);

        // Генерируем структуру
        const { blocks, rootBlockUpdate } = generateHomePageStructure(rootBlockId);

        if (onProgress) {
            onProgress({ stage: 'generating', percent: 10, message: 'Генерация структуры...' });
        }

        console.log('HomePageInitializer: Generated', blocks.length, 'blocks');

        // Импортируем блоки
        const { task_id } = await importBlocks(blocks);

        if (onProgress) {
            onProgress({ stage: 'importing', percent: 30, message: 'Импорт блоков...' });
        }

        // Ждём завершения импорта
        await pollImportStatus(task_id, (progress) => {
            if (onProgress) {
                const percent = 30 + (progress.percent * 0.5);
                onProgress({
                    stage: 'importing',
                    percent,
                    message: `Создано ${progress.processed || 0}/${progress.total || blocks.length} блоков`
                });
            }
        });

        if (onProgress) {
            onProgress({ stage: 'configuring', percent: 85, message: 'Настройка раскладки...' });
        }

        // Обновляем корневой блок с layoutCells
        dispatch('UpdateDataBlock', {
            blockId: rootBlockId,
            data: rootBlockUpdate.data
        });

        if (onProgress) {
            onProgress({ stage: 'complete', percent: 100, message: 'Готово!' });
        }

        console.log('HomePageInitializer: Successfully initialized home page');

        return { success: true };

    } catch (error) {
        console.error('HomePageInitializer: Failed to initialize:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Проверяет статус онбординга и инициализирует Home Page если нужно
 * @param {string} rootBlockId - ID корневого блока пользователя
 * @param {Map} blocksMap - Map блоков из localStateManager (избегаем circular dependency)
 * @returns {Promise<void>}
 */
export async function checkAndInitializeOnboarding(rootBlockId, blocksMap) {
    try {
        // Проверяем статус онбординга
        const { onboarding_completed } = await api.getOnboardingStatus();

        if (onboarding_completed) {
            console.log('HomePageInitializer: Onboarding already completed, skipping');
            return;
        }

        // Idempotency check: проверяем, не созданы ли блоки частично
        // (защита от дубликатов при повторном вызове после частичной ошибки)
        const rootBlock = blocksMap?.get(rootBlockId);
        if (rootBlock?.data?.childOrder?.length > 0) {
            console.log('HomePageInitializer: Root block already has children, marking complete');
            await api.completeOnboarding();
            return;
        }

        console.log('HomePageInitializer: New user detected, initializing home page...');

        // Инициализируем Home Page
        const result = await initializeHomePage(rootBlockId);

        if (result.success) {
            // Помечаем онбординг как завершённый
            await api.completeOnboarding();
            console.log('HomePageInitializer: Onboarding completed successfully');
            // ShowBlocks вызывается в localStateManager после этой функции
        } else {
            console.error('HomePageInitializer: Failed to initialize:', result.error);
        }

    } catch (error) {
        console.error('HomePageInitializer: Onboarding check failed:', error);
    }
}

export default {
    initializeHomePage,
    checkAndInitializeOnboarding
};
