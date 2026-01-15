/**
 * HomePageInitializer
 *
 * Создаёт начальную структуру экзокортекса для новых пользователей:
 * - Home Page с 6 блоками верхнего уровня (Inbox, Focus, Projects, Areas, Spaces, Archive)
 * - Туториальное дерево с обучающими материалами
 *
 * Используется после регистрации когда onboarding_completed: false
 */

import { importBlocks, pollImportStatus, generateBlockId } from '../api/importService.js';
import api from '../api/api.js';
import { dispatch } from '../utils/utils.js';
import { TUTORIAL_STRUCTURE } from '../onboarding/tutorialGraph.js';

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
 * Генерирует структуру туториального дерева для импорта
 * @returns {{blocks: Array, rootId: string}} Блоки и ID корневого блока
 */
function generateTutorialStructure() {
    const blocks = [];
    const idMap = {};

    // Генерируем UUID для каждого блока
    Object.keys(TUTORIAL_STRUCTURE).forEach(key => {
        idMap[key] = generateBlockId();
    });

    const rootId = idMap['root'];

    // Находит родительский ключ для блока
    const findParentKey = (childKey) => {
        if (childKey === 'root') return null;
        for (const [key, block] of Object.entries(TUTORIAL_STRUCTURE)) {
            if (block.children.includes(childKey)) {
                return key;
            }
        }
        return null;
    };

    // Преобразуем блоки
    Object.entries(TUTORIAL_STRUCTURE).forEach(([key, block]) => {
        const id = idMap[key];
        const parentKey = findParentKey(key);
        const parentId = parentKey ? idMap[parentKey] : null;

        // Преобразуем children из ключей в UUID
        const childrenIds = block.children.map(childKey => idMap[childKey]);

        blocks.push({
            id,
            parent_id: parentId,
            title: block.title,
            data: {
                text: block.data.text,
                color: block.data.color,
                childOrder: childrenIds
            }
        });
    });

    return { blocks, rootId };
}

/**
 * Создаёт туториальное дерево на сервере
 * @returns {Promise<{success: boolean, rootId?: string, error?: string}>}
 */
export async function initializeTutorialTree() {
    try {
        console.log('HomePageInitializer: Creating tutorial tree...');

        // Сначала создаём корневое дерево через API
        const treeResponse = await api.createTree('Обучение OmniMap');
        if (treeResponse.status !== 201) {
            throw new Error('Failed to create tutorial tree');
        }

        const tutorialRootId = treeResponse.data.id;
        console.log('HomePageInitializer: Tutorial tree created:', tutorialRootId);

        // Генерируем структуру туториальных блоков
        const { blocks } = generateTutorialStructure();

        // Заменяем parent_id=null на tutorialRootId для корневых блоков
        // и обновляем ссылки для дочерних
        const idMap = { root: tutorialRootId };
        const blocksForImport = [];

        // Строим новую карту ID (root -> tutorialRootId, остальные -> новые UUID)
        blocks.forEach(block => {
            if (block.parent_id === null) {
                // Это root блок из TUTORIAL_STRUCTURE — пропускаем, используем созданное дерево
                // Но сохраняем его данные для обновления корневого блока
                idMap['__root_data__'] = block;
            } else {
                blocksForImport.push(block);
            }
        });

        // Обновляем parent_id для блоков первого уровня
        blocksForImport.forEach(block => {
            // Находим блок в оригинальной структуре
            const originalKey = Object.entries(TUTORIAL_STRUCTURE).find(([_, b]) =>
                b.title === block.title
            )?.[0];

            if (originalKey) {
                const parentKey = Object.entries(TUTORIAL_STRUCTURE).find(([_, b]) =>
                    b.children.includes(originalKey)
                )?.[0];

                if (parentKey === 'root') {
                    block.parent_id = tutorialRootId;
                }
            }
        });

        if (blocksForImport.length > 0) {
            // Импортируем дочерние блоки
            const { task_id } = await importBlocks(blocksForImport);
            await pollImportStatus(task_id, null, 500, 60000, { silent: true });
        }

        // Обновляем корневой блок с данными туториала
        const rootData = idMap['__root_data__'];
        if (rootData) {
            dispatch('UpdateDataBlock', {
                blockId: tutorialRootId,
                data: {
                    text: rootData.data.text,
                    color: rootData.data.color,
                    childOrder: blocksForImport
                        .filter(b => b.parent_id === tutorialRootId)
                        .map(b => b.id)
                }
            });
        }

        console.log('HomePageInitializer: Tutorial tree initialized successfully');
        return { success: true, rootId: tutorialRootId };

    } catch (error) {
        console.error('HomePageInitializer: Failed to initialize tutorial:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Проверяет статус онбординга и инициализирует Home Page + Tutorial если нужно
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

        console.log('HomePageInitializer: New user detected, initializing...');

        // 1. Инициализируем Home Page
        const homeResult = await initializeHomePage(rootBlockId);
        if (!homeResult.success) {
            console.error('HomePageInitializer: Failed to initialize home page:', homeResult.error);
            return;
        }

        // 2. Создаём туториальное дерево
        const tutorialResult = await initializeTutorialTree();
        if (!tutorialResult.success) {
            console.warn('HomePageInitializer: Tutorial tree creation failed:', tutorialResult.error);
            // Не блокируем онбординг из-за ошибки туториала
        }

        // Помечаем онбординг как завершённый
        await api.completeOnboarding();
        console.log('HomePageInitializer: Onboarding completed successfully');
        // ShowBlocks вызывается в localStateManager после этой функции

    } catch (error) {
        console.error('HomePageInitializer: Onboarding check failed:', error);
    }
}

export default {
    initializeHomePage,
    initializeTutorialTree,
    checkAndInitializeOnboarding
};
