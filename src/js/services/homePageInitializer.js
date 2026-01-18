/**
 * OnboardingInitializer
 *
 * Создаёт туториальное дерево с обучающими материалами для новых пользователей.
 * Используется после регистрации когда onboarding_completed: false
 *
 * NOTE: Home Page структура (Inbox, Focus, Projects, Areas, Spaces, Archive)
 * будет копироваться из шаблонного графа при регистрации на бэкенде.
 */

import { importBlocks, pollImportStatus, generateBlockId } from '../api/importService.js';
import api from '../api/api.js';
import { dispatch } from '../utils/utils.js';
import { TUTORIAL_STRUCTURE } from '../onboarding/tutorialGraph.js';

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
        console.log('OnboardingInitializer: Creating tutorial tree...');

        // Сначала создаём корневое дерево через API
        const treeResponse = await api.createTree('Обучение OmniMap');
        if (treeResponse.status !== 201) {
            throw new Error('Failed to create tutorial tree');
        }

        const tutorialRootId = treeResponse.data.id;
        console.log('OnboardingInitializer: Tutorial tree created:', tutorialRootId);

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

        console.log('OnboardingInitializer: Tutorial tree initialized successfully');
        return { success: true, rootId: tutorialRootId };

    } catch (error) {
        console.error('OnboardingInitializer: Failed to initialize tutorial:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Проверяет статус онбординга и инициализирует Tutorial если нужно
 * @param {string} rootBlockId - ID корневого блока пользователя
 * @param {Map} blocksMap - Map блоков из localStateManager (избегаем circular dependency)
 * @returns {Promise<void>}
 */
export async function checkAndInitializeOnboarding(rootBlockId, blocksMap) {
    try {
        // Проверяем статус онбординга
        const { onboarding_completed } = await api.getOnboardingStatus();

        if (onboarding_completed) {
            console.log('OnboardingInitializer: Onboarding already completed, skipping');
            return;
        }

        console.log('OnboardingInitializer: New user detected, initializing tutorial...');

        // Создаём туториальное дерево
        const tutorialResult = await initializeTutorialTree();
        if (!tutorialResult.success) {
            console.warn('OnboardingInitializer: Tutorial tree creation failed:', tutorialResult.error);
            // Не блокируем онбординг из-за ошибки туториала
        }

        // Помечаем онбординг как завершённый
        await api.completeOnboarding();
        console.log('OnboardingInitializer: Onboarding completed successfully');
        // ShowBlocks вызывается в localStateManager после этой функции

    } catch (error) {
        console.error('OnboardingInitializer: Onboarding check failed:', error);
    }
}

export default {
    initializeTutorialTree,
    checkAndInitializeOnboarding
};
