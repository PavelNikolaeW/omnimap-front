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
 * Раскладка: сетка 9 строк × 7 колонок
 * Inbox слева (5 колонок × 9 строк), остальные справа сверху вниз
 */
const HOME_PAGE_BLOCKS = [
    {
        label: 'Inbox',
        role: 'inbox',
        color: '#fef3c7',
        borderColor: '#f59e0b',
        position: { row: 1, col: 1, rowSpan: 9, colSpan: 5 },
        sandboxMode: 'open'  // Inbox доступен для записи всем
    },
    {
        label: 'Focus',
        role: 'focus',
        color: '#dbeafe',
        borderColor: '#3b82f6',
        position: { row: 1, col: 6, rowSpan: 2, colSpan: 2 }
    },
    {
        label: 'Projects',
        role: 'projects',
        color: '#dcfce7',
        borderColor: '#22c55e',
        position: { row: 3, col: 6, rowSpan: 2, colSpan: 2 }
    },
    {
        label: 'Areas',
        role: 'areas',
        color: '#e0e7ff',
        borderColor: '#6366f1',
        position: { row: 5, col: 6, rowSpan: 2, colSpan: 2 }
    },
    {
        label: 'Spaces',
        role: 'spaces',
        color: '#fce7f3',
        borderColor: '#ec4899',
        position: { row: 7, col: 6, rowSpan: 2, colSpan: 2 }
    },
    {
        label: 'Archive',
        role: 'archive',
        color: '#f3f4f6',
        borderColor: '#9ca3af',
        position: { row: 9, col: 6, rowSpan: 1, colSpan: 2 }
    }
];

/**
 * Размер сетки для Home Page
 */
const HOME_PAGE_GRID = { rows: 9, cols: 7 };

/**
 * Генерирует структуру блоков для импорта
 * @param {string} rootBlockId - ID корневого блока пользователя
 * @returns {{blocks: Array, rootBlockUpdate: Object, sandboxBlocks: Array}} Структура для импорта
 */
function generateHomePageStructure(rootBlockId) {
    const blocks = [];
    const homePageChildOrder = [];
    const sandboxBlocks = [];  // Блоки для установки sandbox режима

    // Генерируем 6 блоков верхнего уровня
    for (const config of HOME_PAGE_BLOCKS) {
        const blockId = generateBlockId();
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

        // Запоминаем блоки с sandbox режимом
        if (config.sandboxMode) {
            sandboxBlocks.push({ blockId, mode: config.sandboxMode });
        }
    }

    // Обновляем блок корневой страницы с layoutCells
    const rootBlockUpdate = {
        id: rootBlockId,
        data: {
            layout: 'cells',
            childOrder: homePageChildOrder,
            layoutCells: {
                gridSize: HOME_PAGE_GRID,
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

    return { blocks, rootBlockUpdate, sandboxBlocks };
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
        const { blocks, rootBlockUpdate, sandboxBlocks } = generateHomePageStructure(rootBlockId);

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

        // Устанавливаем sandbox режим для соответствующих блоков
        for (const { blockId, mode } of sandboxBlocks) {
            try {
                await api.setSandboxMode(blockId, mode);
                console.log(`HomePageInitializer: Set sandbox mode '${mode}' for block ${blockId}`);
            } catch (err) {
                console.warn(`HomePageInitializer: Failed to set sandbox mode for ${blockId}:`, err);
            }
        }

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
