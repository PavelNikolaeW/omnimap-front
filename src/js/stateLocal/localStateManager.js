import localforage from "localforage";
import {dispatch} from "../utils/utils";
import {Painter} from "../painter/painter";
import api from "../api/api";

import {isExcludedElement, truncate, normalizeParentId} from '../utils/functions'
import {parseGridSize} from '../utils/gridUtils'
import {jsPlumbInstance} from "../controller/arrowManager";
import {customConfirm} from "../utils/custom-dialog";
import {treeService} from "../services/treeService";
import {treeValidator} from "./treeValidator";
import {offlineQueue} from "../sincManager/offlineQueue";
import {canEdit, canDelete, canCreateInSandbox, canDeleteInSandbox, canEditInSandbox, isInSandbox} from "../utils/permissionUtils";
import {undoManager} from "../controller/undoManager";
import {checkAndInitializeOnboarding} from "../services/homePageInitializer";
import {focusManager} from "../services/focusManager";
import {blockOperationLock} from "../utils/operationLock";
import {deduplicateChildOrder} from "../utils/childOrderUtils";
import {getDefaultImageSettings} from "../utils/imageSettingsDefaults";

/**
 * Экранирует специальные символы RegExp в строке
 * @param {string} string - Исходная строка
 * @returns {string} Экранированная строка
 */
function escapeRegExp(string) {
    if (typeof string !== 'string') {
        return String(string ?? '');
    }
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


class BlockRepository {
    constructor(currentUser) {
        this.currentUser = currentUser;
    }

    getKey(blockId) {
        return `Block_${blockId}_${this.currentUser}`;
    }

    async saveBlock(block) {
        const key = this.getKey(block.id);
        const blockData = {
            id: block.id,
            data: block.data,
            children: block.children,
            parent_id: block.parent_id,
            title: block.title,
            updated_at: block.updated_at,
            // Всегда сохраняем forbidden флаг (true для 403, false/undefined для обычных)
            forbidden: block.forbidden || false,
            // Уровень прав: 'view', 'edit', 'edit_ac', 'delete', 'sandbox', null (собственный блок)
            permission: block.permission || null,
            // Sandbox поля
            creator_id: block.creator_id || null,
            sandbox_mode: block.sandbox_mode || null,
            // Версия childOrder для отслеживания изменений grid при рендеринге
            _childOrderVersion: block._childOrderVersion || null,
            // Версия последнего рендера (для корректной инвалидации кэша после reload)
            _lastRenderedVersion: block._lastRenderedVersion || null
        };
        await localforage.setItem(key, blockData);
    }

    /**
     * Обновляет отдельное поле блока в IndexedDB
     * @param {string} blockId - ID блока
     * @param {string} field - Имя поля
     * @param {any} value - Новое значение
     * @param {boolean} [deepMerge=false] - Deep merge для объектов (используется для data)
     */
    async updateBlockField(blockId, field, value, deepMerge = false) {
        const key = this.getKey(blockId);
        const blockData = await localforage.getItem(key);
        if (blockData) {
            if (deepMerge && typeof blockData[field] === 'object' && typeof value === 'object') {
                blockData[field] = { ...(blockData[field] || {}), ...(value || {}) };
            } else {
                blockData[field] = value;
            }
            await localforage.setItem(key, blockData);
        }
    }

    async loadBlock(blockId) {
        const key = this.getKey(blockId);
        return await localforage.getItem(key);
    }

    async deleteBlock(blockId) {
        const key = this.getKey(blockId);
        console.log('remove', key)
        await localforage.removeItem(key);
    }
}


export class LocalStateManager {
    constructor() {
        this.rootContainer = document.getElementById('rootContainer');
        this.currentUser = null;
        this.path = [];
        this.blocks = new Map();
        this.jsPlumbInstance = jsPlumbInstance;
        this.painter = new Painter();
        this.blockRepository = null;
        this.debounceTimer = undefined;
        // Флаг защиты от concurrent рендеров
        this._isRendering = false;
        // Флаг отложенного рендера
        this._pendingRender = false;
        // Последнее отрендеренное дерево (для очистки кэша при смене)
        this._lastRenderedTree = null;
        // Флаг для защиты от множественных SessionExpired
        this._sessionExpiredHandled = false;
        // Инициализация слушателей событий
        this.registerEventHandlers();
    }

    registerEventHandlers() {
        window.addEventListener('ShowBlocks', () => this.showBlocks());
        window.addEventListener('LoadEmptyBlocks', async (e) => {
            await this.loadEmptyBlocks(e.detail)
            dispatch('ShowBlocks');
        });

        window.addEventListener('InitAnonimUser', async () => {
            // Анонимные пользователи видят только страницу регистрации
            // Туториал им не нужен
            const publicTreeBlocks = await api.getTreeBlocks();
            await this.initUser(publicTreeBlocks, 'anonim');
            dispatch('ShowBlocks');
        });

        window.addEventListener('InitUser', async (e) => {
            const treeBlocks = await api.getTreeBlocks();
            const hadNoBlocks = treeBlocks.treeIds.length === 0 ||
                (treeBlocks.treeIds.length === 1 && !treeBlocks.blocks.get(treeBlocks.treeIds[0])?.data?.childOrder?.length);

            await this.initUser(treeBlocks, e.detail.user);

            // Создаём начальную структуру для новых пользователей (Home Page + Tutorial через API)
            if (this.currentTree) {
                await checkAndInitializeOnboarding(this.currentTree, this.blocks);
            }

            // Для новых пользователей перезагружаем блоки с сервера,
            // т.к. блоки созданы через API и ещё не в локальном state
            if (hadNoBlocks) {
                dispatch('LoadTrees');
                // Показываем welcome баннер после загрузки блоков
                setTimeout(() => {
                    dispatch('ShowOnboardingWelcome');
                }, 500);
            } else {
                dispatch('ShowBlocks');
            }
        });

        window.addEventListener('LoadTrees', async (e) => {
            const treeBlocks = await api.getTreeBlocks();

            // Обновляем treeIds в localforage
            if (this.currentUser) {
                await localforage.setItem(`treeIds${this.currentUser}`, treeBlocks.treeIds);
            }

            // Сохраняем все блоки
            for (const block of treeBlocks.blocks.values()) {
                await this.saveBlock(block);
            }

            // Явно обновляем навигацию после загрузки деревьев
            dispatch('UpdateTreeNavigation');
            dispatch('ShowBlocks');
        })

        window.addEventListener('OpenBlock', (e) => {
            this.openBlock(e.detail);
        });

        window.addEventListener('UpdateDataBlock', (e) => {
            this.updateDataBlock(e.detail);
        });
        window.addEventListener('UpdateFullBlock', (e) => {
            this.updateFullBlock(e.detail);
        });
        window.addEventListener('MoveBlock', (e) => {
            this.moveBlock(e.detail);
        });

        window.addEventListener('AddConnectionBlock', (e) => {
            this.addConnectionBlock(e.detail);
        });

        window.addEventListener('RemoveConnectionBlock', (e) => {
            this.removeConnectionBlock(e.detail);
        });

        window.addEventListener('UpdateConnectionBlock', (e) => {
            this.updateConnectionBlock(e.detail);
        });

        window.addEventListener('UpdateCustomGridBlock', (e) => {
            this.updateCustomGridBlock(e.detail);
        });

        window.addEventListener('UpdateBlockStyles', (e) => {
            this.updateBlockStyles(e.detail);
        });

        window.addEventListener('UpdateRenderingMode', (e) => {
            this.updateRenderingMode(e.detail);
        });

        // Обработчик для сохранения отдельного поля блока (используется blockCreator для _lastRenderedVersion)
        window.addEventListener('SaveBlockField', (e) => {
            const { blockId, field, value } = e.detail;
            if (this.blockRepository && blockId && field) {
                // Обновляем in-memory блок
                const block = this.blocks.get(blockId);
                if (block) {
                    // Deep merge для data чтобы не потерять изменения от других операций
                    if (field === 'data') {
                        block[field] = { ...(block[field] || {}), ...(value || {}) };
                    } else {
                        block[field] = value;
                    }
                }
                // Сохраняем в IndexedDB асинхронно (updateBlockField уже мёржит data)
                this.blockRepository.updateBlockField(blockId, field, value, field === 'data');
            }
        });

        window.addEventListener('CreateBlock', (e) => {
            this.createBlock(e.detail);
        });
        window.addEventListener('IframeCreate', (e) => {
            this.iframeCreate(e.detail);
        });

        window.addEventListener('Login', async (e) => {
            const treeBlocks = await api.getTreeBlocks();
            console.log(treeBlocks)

            await this.initUser(treeBlocks, e.detail.user);
            dispatch('ShowBlocks');
            const sidebar = document.getElementById('sidebar')
            const topSidebar = document.getElementById('topSidebar')
            sidebar.classList.remove('hidden')
            topSidebar.classList.remove('hidden')
        });

        window.addEventListener('Logout', async () => {
            // Сбрасываем флаг SessionExpired при явном выходе
            this._sessionExpiredHandled = false;

            // При явном выходе просто перезагружаем страницу
            // Все данные будут очищены автоматически при reload
            window.location.reload();
        });

        window.addEventListener('SessionExpired', async () => {
            // Guard: защита от множественных вызовов
            if (this._sessionExpiredHandled) return;
            this._sessionExpiredHandled = true;

            // Очищаем токены и заголовки авторизации
            // Это гарантирует очистку независимо от источника SessionExpired
            // (api.js, webSocket.js, authStateManager.js)
            api._clearCredentials();

            await this._cleanupUserData();

            // Проверяем, онлайн ли мы
            const isOnline = navigator.onLine;

            if (isOnline) {
                // Онлайн: показываем экран истечения сессии
                this.showSessionExpiredScreen();
            } else {
                // Офлайн: показываем пустой экран с сообщением и ждем возвращения сети
                this.showOfflineLogoutScreen();
                this._setupOnlineListener();
            }
        });

        window.addEventListener('PasteBlock', async (e) => {
            this.pasteBlock(e.detail);
        });

        window.addEventListener('PasteLinkBlock', async (e) => {
            this.pasteLinkBlock(e.detail);
        });

        window.addEventListener('TextUpdate', async (e) => {
            this.textUpdate(e.detail);
        });

        window.addEventListener('TitleUpdate', async (e) => {
            this.titleUpdate(e.detail);
        });

        window.addEventListener('SetHueBlock', async (e) => {
            this.hueUpdate(e.detail);
        });
        window.addEventListener('SetIframe', async (e) => {
            this.setIframe(e.detail);
        });
        window.addEventListener('DeleteTreeBlock', (e) => {
            this.deleteTreeBlock(e.detail)
        });
        window.addEventListener('DeleteMultipleTreeBlocks', (e) => {
            this.deleteMultipleTreeBlocks(e.detail)
        });
        window.addEventListener('CreateTree', (e) => {
            this.createTree(e.detail)
        });

        window.addEventListener('HistoryRevert', (e) => {
            this.historyRevert(e.detail)
        })

        window.addEventListener('resize', () => {
            if (! isExcludedElement(document.activeElement, 'localStateManager')) {
                console.log('resize')
                this.onResize();
            }
        });
        window.addEventListener('ShowError', (e) => {
            const errorPopup = document.getElementById("error-popup");
            const errorMessage = document.getElementById("error-message");
            if (e.detail.response?.data?.detail) errorMessage.textContent = e.detail.response.data.detail;
            else errorMessage.textContent = e.detail.message

            errorPopup.classList.remove("hidden");
            errorPopup.classList.add("visible");

            setTimeout(() => {
                errorPopup.classList.remove("visible");
                errorPopup.classList.add("hidden");
            }, 3000);
        });
        window.addEventListener('SetLoading', (e) => {
            if (e.detail) document.body.classList.add('loading-cursor');
            else document.body.classList.remove('loading-cursor');
        })
        window.addEventListener('WebSocUpdateBlock', async (e) => {
            const detail = e.detail;
            const isReconnect = detail?.isReconnect || false;
            const blocks = isReconnect ? detail.blocks : detail;
            await this.webSocUpdateBlock(blocks);
            if (isReconnect) {
                await this.fetchMissingChildren(blocks);
            }
        })
        window.addEventListener('WebSocUpdateBlockAccess', async (e) => {
            await this.WebSocUpdateBlockAccess(e.detail)
        })
        window.addEventListener('ResetState', async (e) => this.resetState())
        window.addEventListener('CreateLink', async (e) => {
            if (await customConfirm('Блок и все его дочерние блоки станут доступными для тех у кого есть ссылка или id блоков')) {
                const id = e.detail.id
                api.createUrlLink(id,).then(res => {
                    if (res.status === 200) {
                        const block = res.data
                        this.saveBlock(block)
                        this.showBlocks()
                    }
                })
            }
        })
        window.addEventListener('UpdateBlocks', (e) => {
            const data = e.detail
            data.blocks?.forEach(async (block) => {
                // Защита: пропускаем блоки без id
                if (!block?.id) {
                    console.warn('⚠️ UpdateBlocks: skipping block without id:', block);
                    return;
                }
                await this.saveBlock(block)
            })
            data.removed?.forEach(async (blockId) => {
                await this.removeBlock(blockId)

            })
            this.showBlocks()
        })
        window.addEventListener('UpdateBlockImage', (e) => {
            this.updateBlockImage(e.detail)
        })
        window.addEventListener('ValidateTree', () => {
            this.validateTree()
        })
        window.addEventListener('RepairTree', () => {
            this.repairTree()
        })
        // Обработка синхронизированного блока
        window.addEventListener('BlockSynced', (e) => {
            this.handleBlockSynced(e.detail)
        })
        // Обработка завершения batch import после офлайн синхронизации
        window.addEventListener('BatchImportCompleted', (e) => {
            this.handleBatchImportCompleted(e.detail)
        })

        // Обработка одобрения запроса на доступ - обновляем pending блок
        window.addEventListener('AccessRequestApproved', async (e) => {
            await this.handleAccessRequestApproved(e.detail)
        })

        // Обработка отклонения запроса на доступ
        window.addEventListener('AccessRequestRejected', async (e) => {
            await this.handleAccessRequestRejected(e.detail)
        })
    }

    /**
     * Обрабатывает синхронизированный блок с сервера
     * @param {Object} detail - {block}
     */
    async handleBlockSynced({block}) {
        if (block) {
            await this.saveBlock(block);
            // Не вызываем ShowBlocks здесь, чтобы избежать лишних перерисовок
        }
    }

    /**
     * Обрабатывает одобрение запроса на доступ
     * Убирает pending статус с блока-ссылки и перезагружает его содержимое
     * @param {Object} detail - {blockId, permission}
     */
    async handleAccessRequestApproved({blockId, permission}) {
        if (!blockId) return;

        const blocksToLoad = [];

        // Ищем блок-ссылку с pending статусом на этот блок
        for (const [id, block] of this.blocks) {
            if (block.data?.view === 'link' && block.data?.pending && block.data?.source === blockId) {
                // Убираем pending статус
                delete block.data.pending;
                delete block.data.request_id;
                await this.saveBlock(block);
                console.log(`[AccessRequest] Block ${id} approved with permission: ${permission}`);

                // Добавляем source блок в список для загрузки
                if (!this.blocks.has(blockId)) {
                    blocksToLoad.push(blockId);
                }
            }
        }

        // Загружаем source блок с сервера если его нет локально
        if (blocksToLoad.length > 0) {
            try {
                await this.loadEmptyBlocks({ emptyBlocks: blocksToLoad });
            } catch (err) {
                console.error('[AccessRequest] Failed to load source block:', err);
            }
        }

        // Перезагружаем данные с сервера
        dispatch('ShowBlocks');
    }

    /**
     * Обрабатывает отклонение запроса на доступ
     * Обновляет UI блока с rejected статусом
     * @param {Object} detail - {blockId}
     */
    async handleAccessRequestRejected({blockId}) {
        if (!blockId) return;

        // Ищем блок-ссылку с pending статусом на этот блок
        for (const [id, block] of this.blocks) {
            if (block.data?.view === 'link' && block.data?.pending && block.data?.source === blockId) {
                // Помечаем как rejected (UI покажет другой placeholder)
                block.data.rejected = true;
                await this.saveBlock(block);
                console.log(`[AccessRequest] Block ${id} rejected`);
            }
        }

        // Обновляем UI
        this.showBlocks();
    }

    /**
     * Обрабатывает завершение batch import после офлайн синхронизации
     * Мержит данные с сервера с локальными данными
     * @param {Object} detail - {blocks, deletedIds}
     */
    async handleBatchImportCompleted({blocks, deletedIds}) {
        console.group('🔄 BatchImportCompleted');
        console.log('Blocks from server:', blocks?.length || 0);
        console.log('Deleted IDs:', deletedIds);

        // Удаляем блоки, которые были удалены офлайн
        for (const id of (deletedIds || [])) {
            if (this.blocks.has(id)) {
                console.log('Deleting block:', id);
                this.blocks.delete(id);
                await this.blockRepository.deleteBlock(id);
            }
        }

        // Мержим данные с сервера с локальными
        if (blocks && Array.isArray(blocks)) {
            for (const serverBlock of blocks) {
                // Пропускаем блоки без id
                if (!serverBlock?.id) {
                    console.warn('⚠️ Skipping block without id from server:', serverBlock);
                    continue;
                }
                const localBlock = this.blocks.get(serverBlock.id);

                if (localBlock) {
                    // Мержим: сервер имеет приоритет для основных полей,
                    // но сохраняем локальный childOrder и image если сервер их не прислал

                    // Логика мёржа image (как в webSocUpdateBlock):
                    // - Если сервер явно прислал image - используем его (включая null для удаления)
                    // - Если сервер не прислал image - сохраняем локальный
                    let mergedImage = localBlock.data?.image;
                    if (serverBlock.data && 'image' in serverBlock.data) {
                        mergedImage = serverBlock.data.image; // Сервер явно указал (или удалил)
                    }

                    // Логика мёржа customGrid (как image):
                    // - Сохраняем локальный если сервер прислал пустой (ещё не синхронизирован)
                    // - Используем серверный если он содержит реальную конфигурацию (grid)
                    let mergedCustomGrid = localBlock.data?.customGrid;
                    if (serverBlock.data && 'customGrid' in serverBlock.data) {
                        if (serverBlock.data.customGrid === null) {
                            mergedCustomGrid = null;
                        } else if (serverBlock.data.customGrid?.grid) {
                            mergedCustomGrid = serverBlock.data.customGrid;
                        }
                    }

                    const mergedBlock = {
                        ...localBlock,
                        ...serverBlock,
                        data: {
                            ...localBlock.data,
                            ...serverBlock.data,
                            // Сохраняем локальный childOrder если серверный пустой или отсутствует
                            childOrder: (serverBlock.data?.childOrder?.length > 0)
                                ? serverBlock.data.childOrder
                                : (localBlock.data?.childOrder || serverBlock.children || []),
                            // image - мёрж по логике выше
                            image: mergedImage,
                            // customGrid - мёрж по логике выше
                            customGrid: mergedCustomGrid
                        }
                    };

                    // Синхронизируем childOrder с children
                    // НЕ применяем для блоков-ссылок: их childOrder содержит sourceId,
                    // который НЕ входит в children (source - не child, а ссылка)
                    if (mergedBlock.children && mergedBlock.data.childOrder && mergedBlock.data?.view !== 'link') {
                        // childOrder должен содержать только те ID, которые есть в children
                        mergedBlock.data.childOrder = mergedBlock.data.childOrder
                            .filter(id => mergedBlock.children.includes(id));
                        // Добавляем недостающие children в конец childOrder
                        for (const childId of mergedBlock.children) {
                            if (!mergedBlock.data.childOrder.includes(childId)) {
                                mergedBlock.data.childOrder.push(childId);
                            }
                        }
                    }

                    console.log('Merging block:', serverBlock.id,
                        'children:', mergedBlock.children?.length || 0,
                        'childOrder:', mergedBlock.data?.childOrder?.length || 0);
                    await this.saveBlock(mergedBlock);
                } else {
                    // Новый блок - сохраняем как есть
                    console.log('Saving new block:', serverBlock.id);
                    await this.saveBlock(serverBlock);
                }
            }
        }

        console.groupEnd();
        dispatch('ShowBlocks');
    }

    async updateBlockImage({blockId, imageData}) {
        try {
            const block = this.blocks.get(blockId);
            if (!block) {
                console.warn(`Block ${blockId} not found`);
                return;
            }

            // Получаем родительский блок для проверки sandbox режима
            const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

            // Проверка прав на редактирование (с учётом sandbox режима)
            if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
                dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
                return;
            }

            // Обновляем данные блока с информацией об изображении
            if (imageData) {
                // Парсим settings если бек вернул их как строку (баг бека)
                let settings = imageData.settings;
                if (typeof settings === 'string') {
                    try {
                        settings = JSON.parse(settings);
                    } catch (e) {
                        console.warn('Failed to parse image settings:', e);
                        settings = null;
                    }
                }
                // Нормализуем URL поля - бек может возвращать разные названия
                const normalizedUrl = imageData.url || imageData.file_url || imageData.image_url || imageData.file;
                const normalizedThumbUrl = imageData.thumbnail_url || imageData.thumb_url || imageData.preview_url;

                block.data.image = {
                    url: normalizedUrl,
                    thumbnail_url: normalizedThumbUrl,
                    filename: imageData.filename || imageData.name || imageData.file_name,
                    width: imageData.width,
                    height: imageData.height,
                    size: imageData.size || imageData.file_size,
                    // Варианты изображений разного размера (от бека)
                    variants: imageData.variants || null,
                    // Настройки отображения картинки (используем централизованные дефолты)
                    settings: settings || getDefaultImageSettings()
                };

                console.debug('updateBlockImage: normalized image data:', block.data.image);
            } else {
                // Удаляем информацию об изображении
                delete block.data.image;
            }

            await this.saveBlock(block);
            dispatch('ShowBlocks');
        } catch (err) {
            console.error('Ошибка обновления изображения блока:', err);
        }
    }

    /**
     * Создание нового дерева
     */
    async createTree({title}) {
        // Офлайн режим
        if (!offlineQueue.isNetworkOnline()) {
            await this.createTreeOffline({title});
            return;
        }

        try {
            const res = await api.createTree(title)
            if (res.status === 201) {
                const block = res.data
                await treeService.addTree(block.id)
                await this.saveBlock(block)
                this.showBlocks()
            }
        } catch (error) {
            // При ошибке сети создаём локально
            if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
                await this.createTreeOffline({title});
            } else {
                console.error('Failed to create tree:', error)
            }
        }
    }

    /**
     * Создаёт дерево локально в офлайн режиме
     */
    async createTreeOffline({title}) {
        // Генерируем реальный UUID сразу
        const blockId = offlineQueue.generateBlockId();

        // Регистрируем блок как pending (ожидающий синхронизации)
        offlineQueue.registerPendingBlock(blockId);

        // Создаём блок-дерево с реальным ID
        const newBlock = {
            id: blockId,
            title: title || 'Новое дерево',
            parent_id: null,
            children: [],
            data: {},
            updated_at: new Date().toISOString()
        };

        // Сохраняем блок
        await this.saveBlock(newBlock);

        // Добавляем в treeService
        await treeService.addTree(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'createTree',
            data: { blockId, title }
        });

        this.showBlocks();
        console.log('Tree created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
    }

    /**
     * Удаление блока и всех его потомков (Optimistic UI)
     */
    async deleteTreeBlock({blockId}) {
        const block = this.blocks.get(blockId)
        if (!block) return

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на удаление (с учётом sandbox режима)
        if (!canDeleteInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на удаление блока' });
            return;
        }

        if (!await customConfirm(`Вы уверены, что хотите удалить блок и всех его потомков?`)) return

        await treeService.refresh()
        const isRootTree = treeService.isRootTree(blockId)

        // Нельзя удалить последнее дерево
        if (isRootTree && treeService.count === 1) {
            await customConfirm('Нельзя удалить последнее дерево')
            return
        }

        // Проверяем, является ли блок pending (создан локально, но не на сервере)
        const isPending = offlineQueue.isPendingBlock(blockId);

        // Optimistic UI: сначала удаляем локально для мгновенного отклика
        const deletedBlocks = new Map(); // Сохраняем для возможного rollback
        const allChildIds = this.getAllChildIds(block);

        // Собираем все pending блоки среди удаляемых
        const pendingBlockIds = new Set();
        for (const id of allChildIds) {
            if (offlineQueue.isPendingBlock(id)) {
                pendingBlockIds.add(id);
            }
        }

        // Сохраняем копии для rollback
        // Используем JSON.parse/JSON.stringify вместо structuredClone, т.к. блок может
        // содержать ссылки на DOM-элементы которые structuredClone не может клонировать
        for (const id of allChildIds) {
            const b = this.blocks.get(id);
            if (b) deletedBlocks.set(id, JSON.parse(JSON.stringify(b)));
        }

        // Сохраняем родительский блок для rollback (используем уже полученный parentBlock)
        const parentBackup = parentBlock ? JSON.parse(JSON.stringify(parentBlock)) : null;

        // Записываем в undo stack (до удаления)
        // Для деревьев используем recordDeleteTree с проверкой размера
        if (allChildIds.length > 1) {
            undoManager.recordDeleteTree(blockId, block.parent_id, deletedBlocks);
        } else {
            // Одиночный блок
            undoManager.recordDelete(blockId, block.parent_id, deletedBlocks.get(blockId));
        }

        // Удаляем из treeService если это корневой блок
        if (isRootTree) {
            await treeService.removeTree(blockId)
        }

        // Обновляем родительский блок (удаляем из children, childOrder и layoutCells)
        if (parentBlock) {
            if (parentBlock.children) {
                parentBlock.children = parentBlock.children.filter(id => id !== blockId);
            }
            if (parentBlock.data?.childOrder) {
                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
            }
            // Удаляем из layoutCells если есть
            if (parentBlock.data?.layoutCells?.cells) {
                delete parentBlock.data.layoutCells.cells[blockId];
            }
            await this.saveBlock(parentBlock);
        }

        // Удаляем блок и всех потомков из кеша
        const deletePromises = [];
        for (const id of allChildIds) {
            deletePromises.push(this.blockRepository.deleteBlock(id));
            this.blocks.delete(id);
        }
        await Promise.all(deletePromises);

        // Отменяем pending статус для удаляемых блоков
        offlineQueue.cancelPendingBlocks(pendingBlockIds);

        dispatch('ShowBlocks');

        // Если блок pending - не вызываем API, просто добавляем в очередь удаления
        // Import API обработает это: блок не будет создан, родитель обновится
        if (isPending) {
            console.log('Block is pending, skipping API delete:', blockId);
            await offlineQueue.enqueue({
                id: `delete_${blockId}_${Date.now()}`,
                type: 'deleteBlock',
                data: { id: blockId, parentId: block.parent_id }
            });
            return;
        }

        // Проверяем сеть
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `delete_${blockId}_${Date.now()}`,
                type: 'deleteBlock',
                data: { id: blockId, parentId: block.parent_id }
            });
            console.log('Block delete queued for sync:', blockId);
            return;
        }

        // Синхронизируем с сервером
        try {
            const res = await api.removeTree(blockId)
            if (res.status === 200) {
                // Обновляем родительский блок данными с сервера
                if (res.data.parent?.id) {
                    await this.saveBlock(res.data.parent)
                }

                // Восстанавливаем перенесённые блоки - они получат обновление через WebSocket
                // с новым parent_id (указывающим на блок-ссылку)
                if (res.data.moved?.length > 0) {
                    console.log('🔄 Restoring moved blocks:', res.data.moved);
                    for (const movedId of res.data.moved) {
                        const movedBlock = deletedBlocks.get(movedId);
                        if (movedBlock) {
                            await this.saveBlock(movedBlock);
                        }
                    }
                }

                dispatch('ShowBlocks');
            }
        } catch (error) {
            if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `delete_${blockId}_${Date.now()}`,
                    type: 'deleteBlock',
                    data: { id: blockId, parentId: block.parent_id }
                });
                console.log('Block delete queued for sync:', blockId);
            } else {
                // Rollback при других ошибках
                console.error('Delete failed, rolling back:', error);
                await this.rollbackDeleteBlock(deletedBlocks, parentBackup, isRootTree, blockId);
            }
        }
    }

    /**
     * Откатывает удаление блока при ошибке
     */
    async rollbackDeleteBlock(deletedBlocks, parentBackup, isRootTree, blockId) {
        // Восстанавливаем все удалённые блоки
        for (const [id, block] of deletedBlocks) {
            await this.saveBlock(block);
        }

        // Восстанавливаем родительский блок
        if (parentBackup) {
            await this.saveBlock(parentBackup);
        }

        // Восстанавливаем в treeService если это было дерево
        if (isRootTree) {
            await treeService.addTree(blockId);
        }

        // Удаляем undo запись для отменённого удаления
        undoManager.removeLastEntryForBlock(blockId);

        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось удалить блок' });
    }

    /**
     * Удаление нескольких блоков с одним подтверждением
     * @param {Object} params
     * @param {Array<string>} params.blockIds - массив ID блоков для удаления
     */
    async deleteMultipleTreeBlocks({blockIds}) {
        if (!blockIds || blockIds.length === 0) return

        // Проверка прав на удаление всех блоков (с учётом sandbox режима)
        const forbiddenBlocks = blockIds.filter(id => {
            const block = this.blocks.get(id);
            if (!block) return false;
            const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;
            return !canDeleteInSandbox(block, parentBlock, this.currentUser);
        });
        if (forbiddenBlocks.length > 0) {
            dispatch('ShowError', { message: 'Нет прав на удаление некоторых блоков' });
            return;
        }

        const count = blockIds.length
        const message = count === 1
            ? `Вы уверены, что хотите удалить блок и всех его потомков?`
            : `Вы уверены, что хотите удалить ${count} блоков и всех их потомков?`

        if (!await customConfirm(message)) return

        try {
            await treeService.refresh()

            // Собираем ID корневых деревьев для batch-удаления
            const rootTreeIds = blockIds.filter(id => treeService.isRootTree(id))

            // Отслеживаем успешные и неуспешные удаления
            const results = {success: [], failed: []}

            // Удаляем каждый блок с сервера и из кеша
            for (const blockId of blockIds) {
                const success = await this._deleteBlockFromServer(blockId)
                if (success) {
                    results.success.push(blockId)
                } else {
                    results.failed.push(blockId)
                }
            }

            // Batch-удаление корневых деревьев через treeService
            // Удаляем только те, которые успешно удалены с сервера
            const successfulRootTreeIds = rootTreeIds.filter(id => results.success.includes(id))
            if (successfulRootTreeIds.length > 0) {
                await treeService.removeMultipleTrees(successfulRootTreeIds)
            }

            // Логируем результаты
            if (results.failed.length > 0) {
                console.warn(`Не удалось удалить ${results.failed.length} блоков:`, results.failed)
            }

            this.showBlocks()
        } catch (error) {
            console.error('Ошибка при batch-удалении блоков:', error)
            // Показываем блоки в любом случае, чтобы обновить UI
            this.showBlocks()
        }
    }

    /**
     * Удаление блока с сервера и из локального кеша
     * @param {string} blockId - ID блока для удаления
     * @returns {Promise<boolean>} - true если удаление успешно
     * @private
     */
    async _deleteBlockFromServer(blockId) {
        const block = this.blocks.get(blockId)
        // Блок мог быть уже удалён как дочерний другого блока
        if (!block) {
            return true // Считаем успехом, так как блока уже нет
        }

        try {
            const res = await api.removeTree(blockId)
            if (res.status === 200) {
                // Обновляем родительский блок
                if (res.data.parent?.id) {
                    await this.saveBlock(res.data.parent)
                }

                // Удаляем блок и всех потомков из локального кеша
                const childIds = this.getAllChildIds(block)
                for (const id of childIds) {
                    await this.blockRepository.deleteBlock(id)
                    this.blocks.delete(id)
                }

                return true
            }
            console.warn(`Неожиданный статус ответа при удалении блока ${blockId}:`, res.status)
        } catch (error) {
            console.error(`Ошибка при удалении блока ${blockId}:`, error)
        }

        return false
    }

    /**
     * Безопасно парсит JSON, возвращает значение по умолчанию при ошибке
     * @param {string} jsonString - JSON строка
     * @param {*} defaultValue - Значение по умолчанию
     * @returns {*} Распарсенный объект или значение по умолчанию
     */
    _safeJsonParse(jsonString, defaultValue = null) {
        if (typeof jsonString !== 'string') {
            return jsonString ?? defaultValue;
        }
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('LocalStateManager: invalid JSON:', error.message);
            return defaultValue;
        }
    }

    async WebSocUpdateBlockAccess(message) {
        console.log('🔔 WebSocUpdateBlockAccess received:', JSON.stringify(message, null, 2));

        if (!message?.start_block_ids || !Array.isArray(message.start_block_ids)) {
            console.warn('LocalStateManager: invalid WebSocUpdateBlockAccess message');
            return;
        }

        const permission = message.permission;
        const blockUuids = message.block_uuids || [];

        // При отзыве прав (deny) - удаляем блоки и заменяем корневые на forbidden-заглушки
        if (permission === 'deny') {
            console.log(`🔒 Access revoked for ${blockUuids.length} blocks`);

            // start_block_ids содержит forbidden-заглушки для корневых блоков
            const forbiddenBlockIds = new Set(
                message.start_block_ids.map(b => b?.id).filter(Boolean)
            );

            // Проверяем, находится ли пользователь на одном из удаляемых блоков
            const currentScreen = this.path?.at(-1);
            const currentBlockId = currentScreen?.blockId;
            let needsNavigation = false;
            let navigationTarget = null;

            // Собираем ID для удаления (все из block_uuids кроме forbidden-заглушек)
            const idsToRemove = new Set();
            for (const blockId of blockUuids) {
                // Forbidden-блоки не удаляем - они будут заменены на заглушки
                if (!forbiddenBlockIds.has(blockId)) {
                    idsToRemove.add(blockId);
                    // Добавляем всех детей
                    const block = this.blocks.get(blockId);
                    if (block) {
                        const childIds = this.getAllChildIds(block);
                        childIds.forEach(id => {
                            if (!forbiddenBlockIds.has(id)) {
                                idsToRemove.add(id);
                            }
                        });
                    }
                }
            }

            // Проверяем нужна ли навигация (если на удаляемом блоке, но не на forbidden)
            if (currentBlockId && idsToRemove.has(currentBlockId)) {
                needsNavigation = true;
                // Ищем ближайшего родителя который не удаляется
                for (let i = this.path.length - 2; i >= 0; i--) {
                    const pathBlockId = this.path[i]?.blockId;
                    if (pathBlockId && !idsToRemove.has(pathBlockId)) {
                        navigationTarget = pathBlockId;
                        break;
                    }
                }
            }

            // Удаляем блоки (кроме forbidden)
            for (const blockId of idsToRemove) {
                await this.blockRepository.deleteBlock(blockId);
                this.blocks.delete(blockId);
            }

            // Сохраняем forbidden-заглушки (корневые блоки с пометкой 403)
            for (const block of message.start_block_ids) {
                if (!block?.id) continue;

                const data = this._safeJsonParse(block.data, {});
                const children = this._safeJsonParse(block.children, []);

                const forbiddenBlock = {
                    id: block.id,
                    updated_at: new Date(block.updated_at * 1000).toISOString(),
                    title: block.title, // "block 403 forbidden"
                    data,
                    children,
                    forbidden: true // Метка для UI
                };

                await this.saveBlock(forbiddenBlock);
            }

            // Обновляем treeIds в localforage если forbidden-блок был корневым деревом
            // (forbidden блоки остаются в treeIds чтобы показать 403)
            // Но удаляем из treeIds дочерние блоки которых больше нет
            let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
            if (Array.isArray(treeIds)) {
                const updatedTreeIds = treeIds.filter(id =>
                    forbiddenBlockIds.has(id) || !idsToRemove.has(id)
                );
                if (updatedTreeIds.length !== treeIds.length) {
                    await localforage.setItem(`treeIds${this.currentUser}`, updatedTreeIds);
                }
                treeIds = updatedTreeIds;
            }

            // Навигация при необходимости
            if (needsNavigation) {
                console.log(`📍 Current block access revoked, navigating away`);
                // Обрезаем path до navigationTarget
                if (navigationTarget) {
                    const targetIdx = this.path.findIndex(p => p.blockId === navigationTarget);
                    if (targetIdx !== -1) {
                        this.path = this.path.slice(0, targetIdx + 1);
                    }
                } else if (this.currentTree && this.blocks.has(this.currentTree)) {
                    // Переходим к корню текущего дерева
                    const rootBlock = this.blocks.get(this.currentTree);
                    const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
                    this.path = [{
                        screenName: truncate(rootBlock.title, 10),
                        color: color,
                        blockId: this.currentTree
                    }];
                } else {
                    // Переходим к первому доступному дереву из localforage
                    this.path = [];
                    if (Array.isArray(treeIds) && treeIds.length > 0) {
                        const firstTreeId = treeIds[0];
                        const firstTree = this.blocks.get(firstTreeId);
                        if (firstTree) {
                            const color = firstTree.data?.color && firstTree.data.color !== 'default_color' ? firstTree.data.color : [];
                            this.path.push({
                                screenName: truncate(firstTree.title, 10),
                                color: color,
                                blockId: firstTreeId
                            });
                            this.currentTree = firstTreeId;
                            await localforage.setItem('currentTree', firstTreeId);
                        }
                    }
                }
            }

            this.showBlocks();
            return;
        }

        // При выдаче прав (grant / view / edit / edit_ac / delete) - добавляем/обновляем блоки
        const start_block_ids = message.start_block_ids;
        const newBlocks = [];

        for (let i = 0; i < start_block_ids.length; i++) {
            const block = start_block_ids[i];
            if (!block?.id) continue;

            const data = this._safeJsonParse(block.data, {});
            const children = this._safeJsonParse(block.children, []);

            // Уровень прав: берём из block.permission (новый формат) или message.permission (legacy)
            // При grant без уровня считаем что это полный доступ (null)
            let blockPermission = block.permission || null;
            if (!blockPermission && permission && permission !== 'grant') {
                // Fallback: если block не содержит permission, но message.permission указан
                blockPermission = permission;
            }

            const newBlock = {
                id: block.id,
                updated_at: new Date(block.updated_at * 1000).toISOString(),
                title: block.title,
                data,
                children,
                parent_id: block.parent_id || null,
                forbidden: false, // Явно убираем флаг forbidden при grant
                permission: blockPermission // Уровень прав доступа
            };

            // Сохраняем блок (localforage.setItem перезапишет старый forbidden и permission)
            await this.saveBlock(newBlock);
            newBlocks.push(newBlock);

            // Обновляем path если пользователь на этом блоке
            const pathIndex = this.path?.findIndex(p => p.blockId === block.id);
            if (pathIndex !== -1 && pathIndex !== undefined) {
                const color = data?.color && data.color !== 'default_color' ? data.color : [];
                this.path[pathIndex] = {
                    screenName: truncate(block.title, 10),
                    color: color,
                    blockId: block.id
                };
            }
        }

        // Обновляем permission для существующих блоков из block_uuids
        // (блоки которые уже есть локально, но их права изменились)
        let updatedExistingCount = 0;
        for (const blockId of blockUuids) {
            // Пропускаем если блок уже обработан в start_block_ids
            if (newBlocks.some(b => b.id === blockId)) continue;

            const existingBlock = this.blocks.get(blockId);
            if (existingBlock) {
                // Определяем новый permission
                let newPermission = permission;
                if (permission === 'grant') {
                    newPermission = null; // grant без уровня = полный доступ
                }

                // Обновляем только если permission изменился
                if (existingBlock.permission !== newPermission || existingBlock.forbidden) {
                    existingBlock.permission = newPermission;
                    existingBlock.forbidden = false; // Убираем forbidden при grant
                    await this.saveBlock(existingBlock);
                    updatedExistingCount++;
                }
            }
        }

        // Принудительно перерисовываем экран
        if (newBlocks.length > 0 || updatedExistingCount > 0) {
            console.log(`✅ Access granted for ${newBlocks.length} new blocks, updated ${updatedExistingCount} existing blocks`);
            this.showBlocks();
        }
    }

    async webSocUpdateBlock(newBlocks) {
        if (!Array.isArray(newBlocks) || newBlocks.length === 0) return;

        const processedBlocks = [];

        for (const block of newBlocks) {
            if (!block?.id) continue;

            try {
                if (block.deleted) {
                    // Получаем блок до удаления чтобы найти родителя
                    const localBlock = this.blocks.get(block.id);
                    const parentId = localBlock?.parent_id;

                    // Проверяем, находится ли пользователь на удаляемом блоке
                    const currentScreen = this.path?.at(-1);
                    const isOnDeletedBlock = currentScreen?.blockId === block.id;

                    // Удаляем только этот блок (дети придут отдельными deleted событиями)
                    await this.removeOneBlock(block.id);

                    // Инвалидируем undo записи ТОЛЬКО если это удаление от другого пользователя
                    // Если localBlock undefined — мы уже удалили блок локально, это наше удаление
                    if (localBlock) {
                        undoManager.invalidateEntriesForBlock(block.id);
                    }

                    // Если пользователь был на удалённом блоке — переходим к родителю
                    if (isOnDeletedBlock) {
                        console.log(`📍 Current block ${block.id} was deleted, navigating to parent`);
                        // Удаляем текущий экран из path
                        this.path.pop();

                        if (parentId && this.blocks.has(parentId)) {
                            // Переходим к родителю
                            const parentBlock = this.blocks.get(parentId);
                            const color = parentBlock.data?.color && parentBlock.data.color !== 'default_color' ? parentBlock.data.color : [];
                            this.path.push({
                                screenName: truncate(parentBlock.title, 10),
                                color: color,
                                blockId: parentId
                            });
                        } else if (this.path.length === 0 && this.currentTree) {
                            // Если path пустой, переходим к корню дерева
                            const rootBlock = this.blocks.get(this.currentTree);
                            if (rootBlock) {
                                const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
                                this.path.push({
                                    screenName: truncate(rootBlock.title, 10),
                                    color: color,
                                    blockId: this.currentTree
                                });
                            }
                        }

                        // Сохраняем обновлённый path
                        await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path);
                    }

                    // Удаляем удалённый блок из path (может быть выше по иерархии)
                    const deletedInPath = this.path.findIndex(p => p.blockId === block.id);
                    if (deletedInPath !== -1) {
                        // Обрезаем path до удалённого блока (не включая его)
                        this.path = this.path.slice(0, deletedInPath);
                        if (this.path.length === 0 && this.currentTree) {
                            const rootBlock = this.blocks.get(this.currentTree);
                            if (rootBlock) {
                                const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
                                this.path.push({
                                    screenName: truncate(rootBlock.title, 10),
                                    color: color,
                                    blockId: this.currentTree
                                });
                            }
                        }
                        await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path);
                    }

                    // Обновляем родительский блок локально (убираем удалённого ребёнка)
                    if (parentId) {
                        const parentBlock = this.blocks.get(parentId);
                        if (parentBlock) {
                            // Убираем из children
                            if (Array.isArray(parentBlock.children)) {
                                parentBlock.children = parentBlock.children.filter(id => id !== block.id);
                            }
                            // Убираем из childOrder
                            if (parentBlock.data?.childOrder) {
                                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== block.id);
                            }
                            // Убираем из layoutCells если есть
                            if (parentBlock.data?.layoutCells?.cells) {
                                delete parentBlock.data.layoutCells.cells[block.id];
                            }
                            await this.saveBlock(parentBlock);
                            // Добавляем родителя в processedBlocks чтобы перерисовать
                            processedBlocks.push(parentBlock);
                        }
                    }
                } else {
                    // Получаем локальный блок для проверки
                    const localBlock = this.blocks.get(block.id);
                    const isPending = offlineQueue.isPendingBlock(block.id);
                    const serverData = this._safeJsonParse(block.data, {});
                    const serverChildren = this._safeJsonParse(block.children, []);

                    // Определяем permission: явный с сервера > кэш > наследование от родителя
                    // Если сервер явно прислал permission (даже null) - используем его
                    // null означает "полный доступ" (собственный блок или права удалены)
                    let blockPermission;
                    if (block.permission !== undefined) {
                        // Сервер явно указал permission (включая null для полного доступа)
                        blockPermission = block.permission;
                    } else if (localBlock?.permission !== undefined) {
                        // Блок уже в кэше, permission не прислан — сохраняем существующий
                        blockPermission = localBlock.permission;
                    } else {
                        // Новый блок без permission — наследуем от родителя
                        const parentBlock = this.blocks.get(normalizeParentId(block.parent_id));
                        blockPermission = parentBlock?.permission || null;
                    }

                    // Если блок pending — проверяем, наше ли это изменение или чужое
                    if (isPending && localBlock) {
                        const isSameTitle = localBlock.title === block.title;
                        // Сортируем ключи для корректного сравнения (порядок свойств может отличаться)
                        const sortedStringify = (obj) => JSON.stringify(obj, Object.keys(obj || {}).sort());
                        const isSameData = sortedStringify(localBlock.data || {}) === sortedStringify(serverData);

                        // Сравниваем title и весь data объект
                        const isOwnUpdate = isSameTitle && isSameData;

                        if (isOwnUpdate) {
                            // Это наше изменение вернулось с сервера — пропускаем рендер
                            offlineQueue.resolvePendingBlock(block.id);

                            await this.saveBlock({
                                id: block.id,
                                updated_at: new Date(block.updated_at * 1000).toISOString(),
                                title: block.title,
                                data: serverData,
                                children: serverChildren,
                                parent_id: normalizeParentId(block.parent_id),
                                permission: blockPermission,
                                creator_id: block.creator_id ?? localBlock?.creator_id ?? null,
                                sandbox_mode: block.sandbox_mode ?? localBlock?.sandbox_mode ?? null
                            });

                            console.log(`⏭️ Own update confirmed, skipping render: ${block.id}`);
                            continue;
                        } else {
                            // Данные отличаются — это изменение от другого пользователя
                            // Снимаем pending и рендерим (last write wins)
                            offlineQueue.resolvePendingBlock(block.id);
                            console.warn(`⚠️ Concurrent edit detected for block ${block.id}, applying server version`);

                            // Инвалидируем undo записи для этого блока (конфликт с другим пользователем)
                            undoManager.invalidateEntriesForBlock(block.id);

                            // Продолжаем выполнение — блок будет сохранён и отрендерен ниже
                        }
                    }

                    // Если блок существует локально, но не pending — проверяем, изменились ли данные
                    // Инвалидируем только если это реальное внешнее изменение (данные отличаются)
                    // И блок не затронут нашей pending операцией (move, update и т.д.)
                    if (localBlock && !isPending) {
                        // Проверяем, затронут ли блок нашей pending операцией в очереди
                        const isAffectedByPending = await offlineQueue.isBlockAffectedByPendingOperation(block.id);

                        if (!isAffectedByPending) {
                            const sortedStringify = (obj) => JSON.stringify(obj, Object.keys(obj || {}).sort());
                            const localData = sortedStringify(localBlock.data || {});
                            const serverDataStr = sortedStringify(serverData);
                            const isDataDifferent = localBlock.title !== block.title || localData !== serverDataStr;

                            if (isDataDifferent) {
                                undoManager.invalidateEntriesForBlock(block.id);
                            }
                        }
                    }

                    // Если это корневой блок (дерево), добавляем через treeService
                    if (!normalizeParentId(block.parent_id)) {
                        await treeService.refresh();
                        if (!treeService.hasTree(block.id)) {
                            await treeService.addTree(block.id);
                        }
                    }

                    const localData = localBlock?.data || {};
                    const localChildOrder = localData.childOrder || [];

                    // Мёржим data: сервер имеет приоритет
                    // childOrder: используем серверный если он определён (даже пустой []), иначе локальный
                    // ВАЖНО: дедуплицируем сразу, т.к. сервер может прислать дубликаты
                    // ВАЖНО: мёржим image данные чтобы сохранить локальные settings
                    // (сервер не присылает settings при обычных обновлениях блока)
                    // ВАЖНО: сохраняем локальный customGrid если сервер прислал пустой
                    // (сервер может не иметь актуального customGrid до завершения push)

                    // Мёржим image: сохраняем локальные settings если сервер их не прислал
                    let mergedImage = localData.image;
                    if ('image' in serverData) {
                        if (serverData.image === null) {
                            // Сервер явно удалил image
                            mergedImage = null;
                        } else if (serverData.image) {
                            // Парсим settings если бек вернул их как строку (баг бека)
                            let serverSettings = serverData.image.settings;
                            if (typeof serverSettings === 'string') {
                                try {
                                    serverSettings = JSON.parse(serverSettings);
                                } catch (e) {
                                    console.warn('Failed to parse image settings:', e);
                                    serverSettings = null;
                                }
                            }
                            // Мёржим серверный image с локальными settings
                            mergedImage = {
                                ...localData.image,
                                ...serverData.image,
                                // Сохраняем локальные settings если сервер не прислал
                                settings: serverSettings || localData.image?.settings
                            };
                        }
                    }

                    // Мёржим customGrid: сохраняем локальный если сервер прислал пустой/устаревший
                    // Это предотвращает сброс настроек диаграммы при получении WebSocket обновлений
                    // до завершения push фазы синхронизации
                    let mergedCustomGrid = localData.customGrid;
                    if ('customGrid' in serverData) {
                        if (serverData.customGrid === null) {
                            // Сервер явно удалил customGrid
                            mergedCustomGrid = null;
                        } else if (serverData.customGrid?.grid) {
                            // Сервер прислал реальную конфигурацию сетки — используем серверную
                            mergedCustomGrid = serverData.customGrid;
                        }
                        // Если сервер прислал customGrid: {} (пустой) — сохраняем локальный
                    }

                    const mergedData = {
                        ...localData,
                        ...serverData,
                        image: mergedImage,
                        customGrid: mergedCustomGrid,
                        childOrder: deduplicateChildOrder(
                            Array.isArray(serverData.childOrder)
                                ? serverData.childOrder
                                : (localData.childOrder || [])
                        )
                    };

                    // Проверяем, изменился ли childOrder (для инвалидации grid кэша)
                    const childOrderChanged = JSON.stringify(localChildOrder) !==
                                              JSON.stringify(mergedData.childOrder);

                    // Синхронизируем childOrder с serverChildren
                    // Учитываем:
                    // 1. Локально удалённые дети (undo) — не добавляем из serverChildren
                    // 2. Локально созданные дети (redo) — сохраняем даже если нет в serverChildren
                    // 3. Локально перемещённые дети (undo move) — сохраняем если parent_id указывает сюда

                    // Локальные дети, которые нужно сохранить
                    // Включает: pending-created блоки И локально перемещённые (undo move)
                    const localChildren = localBlock?.children || [];
                    const localChildrenToKeep = localChildren.filter(id => {
                        if (!this.blocks.has(id)) return false; // Блок удалён локально
                        if (serverChildren.includes(id)) return false; // Уже в серверном списке

                        // Сохраняем если:
                        // 1. pending-created блок
                        // 2. ИЛИ блок имеет parent_id указывающий на этот блок (локально перемещён сюда через undo)
                        const childBlock = this.blocks.get(id);
                        return offlineQueue.isPendingBlock(id) || childBlock?.parent_id === block.id;
                    });

                    // Фильтруем childOrder — оставляем serverChildren + локальные дети для сохранения
                    mergedData.childOrder = mergedData.childOrder.filter(id =>
                        serverChildren.includes(id) || localChildrenToKeep.includes(id)
                    );

                    // Добавляем недостающие children из server в конец childOrder,
                    // НО только если они существуют локально (не были удалены)
                    for (const childId of serverChildren) {
                        if (!mergedData.childOrder.includes(childId)) {
                            // Проверяем, существует ли ребёнок локально
                            // Если его нет — значит был удалён локально (undo) и не нужно добавлять
                            if (this.blocks.has(childId)) {
                                mergedData.childOrder.push(childId);
                            }
                        }
                    }

                    // Добавляем локальные дети для сохранения в конец childOrder если их там нет
                    for (const childId of localChildrenToKeep) {
                        if (!mergedData.childOrder.includes(childId)) {
                            mergedData.childOrder.push(childId);
                        }
                    }

                    // ВАЖНО: children должен совпадать с childOrder для консистентности
                    // childOrder - источник истины для рендеринга, children синхронизируем с ним
                    //
                    // Примечание: в loadTree() используется обратная логика (childOrder фильтруется по children),
                    // потому что там сервер авторитетен по структуре дерева (children).
                    // Здесь же childOrder авторитетен, т.к. он уже смёрджен с учётом pending операций.
                    const syncedChildren = mergedData.childOrder.filter(id => this.blocks.has(id));

                    // Обновляем версию childOrder для отслеживания изменений при рендеринге
                    let childOrderVersion = localBlock?._childOrderVersion;
                    if (childOrderChanged) {
                        childOrderVersion = Date.now();
                    }

                    // Определяем creator_id и sandbox_mode: сервер > кэш
                    const blockCreatorId = block.creator_id !== undefined
                        ? block.creator_id
                        : localBlock?.creator_id || null;
                    const blockSandboxMode = block.sandbox_mode !== undefined
                        ? block.sandbox_mode
                        : localBlock?.sandbox_mode || null;

                    await this.saveBlock({
                        id: block.id,
                        updated_at: new Date(block.updated_at * 1000).toISOString(),
                        title: block.title,
                        data: mergedData,
                        children: syncedChildren,
                        parent_id: normalizeParentId(block.parent_id),
                        permission: blockPermission,
                        creator_id: blockCreatorId,
                        sandbox_mode: blockSandboxMode,
                        _childOrderVersion: childOrderVersion  // Для отслеживания изменений grid
                    });

                    // Инвалидируем кэш позиций ПОСЛЕ saveBlock для предотвращения race conditions
                    // Это заставит grid пересчитаться при следующем рендере
                    if (childOrderChanged) {
                        const savedBlock = this.blocks.get(block.id);
                        if (savedBlock) {
                            delete savedBlock.childrenPositions;
                            delete savedBlock.grid;
                        }
                    }
                }
                processedBlocks.push(block);
            } catch (error) {
                console.error('LocalStateManager: error processing block:', block.id, error);
            }
        }

        if (processedBlocks.length > 0) {
            this.updateScreen(processedBlocks);
        }
    }

    /**
     * Проверяет наличие недостающих дочерних блоков после переподключения
     * Вызывается только при ответе на get_updates (переподключение),
     * не при обычных realtime-обновлениях
     * @param {Array} serverUpdates - блоки, полученные от сервера в ответе block_updates
     */
    async fetchMissingChildren(serverUpdates) {
        if (!Array.isArray(serverUpdates) || serverUpdates.length === 0) return;

        const missingChildIds = new Set();
        for (const block of serverUpdates) {
            if (!block?.id || block.deleted) continue;
            const children = this._safeJsonParse(block.children, []);
            for (const childId of children) {
                if (!this.blocks.has(childId)) {
                    missingChildIds.add(childId);
                }
            }
        }

        if (missingChildIds.size === 0) return;

        console.log(`🔄 Reconnect: ${missingChildIds.size} missing children detected, fetching tree...`);

        try {
            const { blocks: serverBlocks } = await api.getTreeBlocks();
            let fetchedCount = 0;

            for (const [blockId, serverBlock] of serverBlocks) {
                if (!this.blocks.has(blockId)) {
                    await this.saveBlock(serverBlock);
                    fetchedCount++;
                }
            }

            if (fetchedCount === 0) return;

            console.log(`✅ Fetched ${fetchedCount} missing blocks`);

            // Пересинхронизируем children/childOrder родителей
            const blocksToRender = [];
            for (const block of serverUpdates) {
                if (!block?.id || block.deleted) continue;
                const savedBlock = this.blocks.get(block.id);
                if (!savedBlock) continue;

                const serverChildren = this._safeJsonParse(block.children, []);
                const childOrder = [...(savedBlock.data?.childOrder || [])];
                let updated = false;

                for (const childId of serverChildren) {
                    if (this.blocks.has(childId) && !childOrder.includes(childId)) {
                        childOrder.push(childId);
                        updated = true;
                    }
                }

                if (updated) {
                    savedBlock.data = { ...savedBlock.data, childOrder };
                    savedBlock.children = childOrder.filter(id => this.blocks.has(id));
                    await this.saveBlock(savedBlock);
                    blocksToRender.push(savedBlock);
                }
            }

            if (blocksToRender.length > 0) {
                this.updateScreen(blocksToRender);
            }
        } catch (error) {
            console.error('❌ Failed to fetch missing children:', error);
        }
    }

    updateScreen(newBlocks) {
        for (let i = 0; i < newBlocks.length; i++) {
            const id = newBlocks[i].id
            const element = document.getElementById(id)
            if (element || document.querySelector(`[blocklink="${id}"]`)) {
                this.showBlocks()
                break
            }
        }
    }

    async resetState() {
        try {
            const user = await localforage.getItem('currentUser');
            if (!user) {
                console.warn('No current user found, cannot reset state');
                return;
            }

            // Экранируем username для защиты от RegExp injection
            const escapedUser = escapeRegExp(user);

            // Удаляем только данные текущего пользователя
            const keys = await localforage.keys();

            // Паттерны ключей для удаления
            const userPatterns = [
                new RegExp(`^Block_.*_${escapedUser}$`),     // Блоки пользователя
                new RegExp(`^Path_.*${escapedUser}$`),       // Пути навигации
                new RegExp(`^treeIds${escapedUser}$`),       // Список деревьев
                new RegExp(`^linkSlugTreeId${escapedUser}:`) // Ссылки
            ];

            const keysToRemove = keys.filter(key =>
                userPatterns.some(pattern => pattern.test(key))
            );

            // Удаляем все найденные ключи
            await Promise.all(keysToRemove.map(key => localforage.removeItem(key)));

            console.log(`Cleared ${keysToRemove.length} keys for user ${user}`);

            // Перезагружаем данные пользователя
            dispatch('Login', {user: user});
        } catch (err) {
            console.error('Ошибка при сбросе состояния:', err);
        }
    }

    /**
     * Валидация дерева блоков без исправления
     * @returns {Object} результат валидации
     */
    validateTree() {
        const result = treeValidator.validate(this.blocks);
        const cycles = treeValidator.detectCycles(this.blocks);

        console.group('🔍 Валидация дерева блоков');
        if (result.valid && cycles.length === 0) {
            console.log('✓ Дерево валидно');
        } else {
            if (result.issues.length > 0) {
                console.warn(`Найдено проблем: ${result.issues.length}`);
                console.table(result.issues.map(i => ({
                    type: i.type,
                    severity: i.severity,
                    blockId: i.blockId || '-',
                    message: i.message
                })));
            }
            if (cycles.length > 0) {
                console.error(`Найдено циклов: ${cycles.length}`);
                cycles.forEach((cycle, i) => {
                    console.error(`  Цикл ${i + 1}: ${cycle.join(' -> ')}`);
                });
            }
        }
        console.groupEnd();

        return { ...result, cycles };
    }

    /**
     * Валидация и автоматическое восстановление дерева блоков
     * @returns {Promise<Object>} результат восстановления с информацией о синхронизации
     */
    async repairTree() {
        console.group('🔧 Восстановление дерева блоков');

        // Удаляем блоки с undefined/null ключами (ошибочные записи)
        if (this.blocks.has(undefined)) {
            console.warn('⚠️ Удаляю блок с undefined ключом');
            this.blocks.delete(undefined);
        }
        if (this.blocks.has(null)) {
            console.warn('⚠️ Удаляю блок с null ключом');
            this.blocks.delete(null);
        }
        if (this.blocks.has('undefined')) {
            console.warn('⚠️ Удаляю блок с "undefined" ключом');
            this.blocks.delete('undefined');
        }

        const result = treeValidator.validateAndRepair(this.blocks);
        console.log(treeValidator.formatReport(result));

        // Добавляем результаты синхронизации в результат
        result.syncResult = { synced: 0, failed: 0, failedBlockIds: [] };

        if (result.repaired && result.repairs.modifiedBlocks.size > 0) {
            // Сохраняем исправленные блоки в IndexedDB
            console.log('Сохранение исправленных блоков...');
            const modifiedBlocks = [];
            for (const blockId of result.repairs.modifiedBlocks) {
                const block = this.blocks.get(blockId);
                if (block) {
                    if (this.blockRepository) {
                        await this.blockRepository.saveBlock(block);
                    }
                    modifiedBlocks.push(block);
                }
            }
            console.log(`✓ Сохранено ${result.repairs.modifiedBlocks.size} блоков в IndexedDB`);

            // Синхронизируем исправленные блоки с сервером
            console.log('Синхронизация с сервером...');
            for (const block of modifiedBlocks) {
                try {
                    const response = await api.updateBlock(block.id, {
                        data: block.data,
                        title: block.title
                    });
                    if (response.status === 200) {
                        result.syncResult.synced++;
                    } else {
                        result.syncResult.failed++;
                        result.syncResult.failedBlockIds.push(block.id);
                        console.warn(`Неожиданный статус ${response.status} для блока ${block.id}`);
                    }
                } catch (err) {
                    result.syncResult.failed++;
                    result.syncResult.failedBlockIds.push(block.id);
                    console.error(`Ошибка синхронизации блока ${block.id}:`, err.message || err);
                }
            }

            // Логируем результат синхронизации
            if (result.syncResult.failed > 0) {
                console.warn(`⚠ Не удалось синхронизировать ${result.syncResult.failed} блоков:`, result.syncResult.failedBlockIds);
                dispatch('ShowError', {message: `Восстановлено, но ${result.syncResult.failed} блоков не синхронизированы с сервером`});
            } else {
                console.log(`✓ Синхронизировано ${result.syncResult.synced} блоков с сервером`);
            }

            // Перерисовываем
            this.showBlocks();
        } else if (!result.repaired) {
            console.log('✓ Дерево блоков валидно, исправления не требуются');
        }

        console.groupEnd();
        return result;
    }

    /**
     * Автоматическая проверка и восстановление при загрузке
     * Вызывается в фоне, не блокирует UI
     */
    async autoRepairIfNeeded() {
        const validation = treeValidator.validate(this.blocks);
        if (!validation.valid) {
            console.warn(`⚠ Обнаружены проблемы в дереве блоков (${validation.issues.length}). Запускаем автовосстановление...`);
            await this.repairTree();
        }
    }

    async moveBlock({block_id, old_parent_id, new_parent_id, before, fromDiagram, toDiagram, diagramPosition}) {
        if (block_id === new_parent_id) return;

        // Захватываем блокировки для обоих родителей (предотвращает race conditions)
        const releaseOld = old_parent_id ? await blockOperationLock.acquire(`parent:${old_parent_id}`) : null;
        // Блокируем нового родителя только если он отличается от старого
        const releaseNew = (new_parent_id && new_parent_id !== old_parent_id)
            ? await blockOperationLock.acquire(`parent:${new_parent_id}`)
            : null;

        try {
            const newParent = this.blocks.get(new_parent_id);

            function reorderList(ids, id, idBefore) {
                const filteredIds = ids.filter(item => item !== id);
                const index = filteredIds.indexOf(idBefore);
                if (index !== -1) {
                    filteredIds.splice(index, 0, id);
                } else {
                    filteredIds.push(id);
                }
                return filteredIds;
            }

            if (!newParent) {
                console.error('New parent not found:', new_parent_id);
                return;
            }

            // Проверка прав на редактирование нового родителя
            if (!canEdit(newParent)) {
                dispatch('ShowError', { message: 'Нет прав на перемещение в этот раздел' });
                return;
            }

            if (!newParent.data) newParent.data = {};
            const newOrder = reorderList(newParent.data.childOrder || [], block_id, before);

            // Optimistic UI: сначала перемещаем локально
            const block = this.blocks.get(block_id);
            const oldParent = this.blocks.get(old_parent_id);

            if (!block) {
                console.error('Block not found:', block_id);
                return;
            }

            // Проверка прав на редактирование блока
            if (!canEdit(block)) {
                dispatch('ShowError', { message: 'Нет прав на перемещение этого блока' });
                return;
            }

            // Проверка прав на редактирование старого родителя
            if (oldParent && !canEdit(oldParent)) {
                dispatch('ShowError', { message: 'Нет прав на перемещение из этого раздела' });
                return;
            }

            // Сохраняем backup для rollback (deep clone чтобы избежать shared references)
            const blockBackup = JSON.parse(JSON.stringify(block));
            const oldParentBackup = oldParent ? JSON.parse(JSON.stringify(oldParent)) : null;
            const newParentBackup = JSON.parse(JSON.stringify(newParent));

            // Обновляем parent_id блока
            block.parent_id = new_parent_id;
            block.updated_at = new Date().toISOString();

            // Очищаем унаследованный sandbox_mode при перемещении из sandbox в обычное место
            // Это исправляет баг с "застрявшим" замочком после перемещения блока
            if (!isInSandbox(newParent) && block.sandbox_mode) {
                block.sandbox_mode = null;
            }

            // Удаляем из старого родителя
            if (oldParent && oldParent.children) {
                oldParent.children = oldParent.children.filter(id => id !== block_id);
                if (oldParent.data?.childOrder) {
                    oldParent.data.childOrder = oldParent.data.childOrder.filter(id => id !== block_id);
                }

                // Если старый родитель - диаграмма, удаляем позицию из customGrid
                if (fromDiagram && oldParent.data?.customGrid?.childrenPositions) {
                    delete oldParent.data.customGrid.childrenPositions[block_id];
                }

                await this.saveBlock(oldParent);
            }

            // Добавляем в нового родителя и синхронизируем children с childOrder
            if (!newParent.children) newParent.children = [];
            if (!newParent.children.includes(block_id)) {
                newParent.children.push(block_id);
            }
            newParent.data.childOrder = newOrder;
            // Синхронизируем children с childOrder для правильного порядка
            newParent.children = newOrder.filter(id => newParent.children.includes(id));
            newParent.updated_at = new Date().toISOString();

            // Если новый родитель - диаграмма, добавляем позицию в customGrid
            if (toDiagram && newParent.data?.customGrid) {
                if (!newParent.data.customGrid.childrenPositions) {
                    newParent.data.customGrid.childrenPositions = {};
                }

                // Вычисляем позицию для нового блока
                const position = this._calculateBlockPositionInDiagram(
                    newParent.data.customGrid,
                    block_id,
                    diagramPosition
                );

                newParent.data.customGrid.childrenPositions[block_id] = position;
            }

            await this.saveBlock(block);
            await this.saveBlock(newParent);
            dispatch('ShowBlocks');

            // Для same-parent reorder сохраняем состояние родителя ПОСЛЕ перемещения (deep clone)
            const oldParentAfter = old_parent_id === new_parent_id
                ? JSON.parse(JSON.stringify(newParent))
                : null;

            // Записываем в undo stack
            undoManager.recordMove(
                block_id,
                old_parent_id,
                new_parent_id,
                blockBackup,
                block,
                oldParentBackup,
                newParentBackup,
                oldParentAfter
            );

            // Синхронизируем через batch import (отправит 3 блока: old parent, new parent, moved block)
            // Используем immediate:true для немедленной синхронизации
            try {
                await offlineQueue.enqueue({
                    id: `move_${block_id}_${Date.now()}`,
                    type: 'moveBlock',
                    data: { blockId: block_id, oldParentId: old_parent_id, newParentId: new_parent_id, childOrder: newOrder }
                }, { immediate: true });
            } catch (err) {
                // Rollback при ошибке очереди (например, IndexedDB quota exceeded)
                console.error('Failed to queue move operation:', err);
                await this.rollbackMoveBlock(blockBackup, oldParentBackup, newParentBackup);
            }
        } finally {
            // Освобождаем блокировки в обратном порядке
            if (releaseNew) releaseNew();
            if (releaseOld) releaseOld();
        }
    }

    /**
     * Вычисляет позицию блока в customGrid диаграммы
     * @param {Object} customGrid - customGrid родительского блока
     * @param {string} blockId - ID блока
     * @param {Object|null} dropPosition - позиция drop {col, row} или null для автовычисления
     * @returns {Array} - ['grid-column_X__Y', 'grid-row_X__Y']
     */
    _calculateBlockPositionInDiagram(customGrid, blockId, dropPosition) {
        const { cols: gridCols, rows: gridRows } = parseGridSize(customGrid.grid, { cols: 3, rows: 3 });

        // Находим минимальный размер блока среди существующих в диаграмме
        const { width: blockWidth, height: blockHeight } = this._findMinBlockSizeInDiagram(customGrid);

        // Если есть позиция drop, используем её
        if (dropPosition?.col && dropPosition?.row) {
            let colStart = dropPosition.col;
            let rowStart = dropPosition.row;
            let colEnd = Math.min(colStart + blockWidth, gridCols + 1);
            let rowEnd = Math.min(rowStart + blockHeight, gridRows + 2);

            // Ограничиваем по границам grid
            if (colStart > gridCols) colStart = gridCols;
            if (rowStart > gridRows + 1) rowStart = gridRows + 1;

            return [
                `grid-column_${colStart}__${colEnd}`,
                `grid-row_${rowStart}__${rowEnd}`
            ];
        }

        // Автоматический поиск свободной позиции
        return this._findFreePositionInCustomGrid(customGrid, gridCols, gridRows, blockWidth, blockHeight);
    }

    /**
     * Находит минимальный размер блока среди существующих в диаграмме
     * @param {Object} customGrid - customGrid диаграммы
     * @returns {Object} - {width, height} минимальный размер
     */
    _findMinBlockSizeInDiagram(customGrid) {
        // Значения по умолчанию если блоков нет
        let minWidth = 1;
        let minHeight = 1;
        let hasBlocks = false;

        if (customGrid.childrenPositions) {
            for (const [, position] of Object.entries(customGrid.childrenPositions)) {
                if (!position || !Array.isArray(position)) continue;

                const colStr = position.find(p => p?.startsWith('grid-column_'));
                const rowStr = position.find(p => p?.startsWith('grid-row_'));

                if (!colStr || !rowStr) continue;

                const colMatch = colStr.match(/_(\d+)(?:__(\d+))?/);
                const rowMatch = rowStr.match(/_(\d+)(?:__(\d+))?/);

                if (!colMatch || !rowMatch) continue;

                const colStart = parseInt(colMatch[1], 10);
                const colEnd = colMatch[2] ? parseInt(colMatch[2], 10) : colStart + 1;
                const rowStart = parseInt(rowMatch[1], 10);
                const rowEnd = rowMatch[2] ? parseInt(rowMatch[2], 10) : rowStart + 1;

                const width = colEnd - colStart;
                const height = rowEnd - rowStart;

                if (!hasBlocks) {
                    // Первый блок - инициализируем минимумы
                    minWidth = width;
                    minHeight = height;
                    hasBlocks = true;
                } else {
                    // Обновляем минимумы
                    if (width < minWidth) minWidth = width;
                    if (height < minHeight) minHeight = height;
                }
            }
        }

        return { width: minWidth, height: minHeight };
    }

    /**
     * Находит свободную позицию в customGrid для блока
     * @param {Object} customGrid - customGrid
     * @param {number} gridCols - количество колонок в grid
     * @param {number} gridRows - количество строк в grid
     * @param {number} blockWidth - ширина блока
     * @param {number} blockHeight - высота блока
     * @returns {Array} - ['grid-column_X__Y', 'grid-row_X__Y']
     */
    _findFreePositionInCustomGrid(customGrid, gridCols, gridRows, blockWidth, blockHeight) {
        // Создаём карту занятых ячеек
        const occupied = new Set();

        if (customGrid.childrenPositions) {
            for (const [, position] of Object.entries(customGrid.childrenPositions)) {
                if (!position || !Array.isArray(position)) continue;

                const colStr = position.find(p => p?.startsWith('grid-column_'));
                const rowStr = position.find(p => p?.startsWith('grid-row_'));

                if (!colStr || !rowStr) continue;

                const colMatch = colStr.match(/_(\d+)(?:__(\d+))?/);
                const rowMatch = rowStr.match(/_(\d+)(?:__(\d+))?/);

                if (!colMatch || !rowMatch) continue;

                const colStart = parseInt(colMatch[1], 10);
                const colEnd = colMatch[2] ? parseInt(colMatch[2], 10) : colStart + 1;
                const rowStart = parseInt(rowMatch[1], 10);
                const rowEnd = rowMatch[2] ? parseInt(rowMatch[2], 10) : rowStart + 1;

                // Отмечаем все ячейки как занятые
                for (let r = rowStart; r < rowEnd; r++) {
                    for (let c = colStart; c < colEnd; c++) {
                        occupied.add(`${r}-${c}`);
                    }
                }
            }
        }

        // Ищем свободную позицию (начиная со строки 2, т.к. строка 1 - контент)
        for (let row = 2; row <= gridRows + 1; row++) {
            for (let col = 1; col <= gridCols; col++) {
                // Проверяем, поместится ли блок
                let canPlace = true;
                for (let r = row; r < row + blockHeight && r <= gridRows + 1; r++) {
                    for (let c = col; c < col + blockWidth && c <= gridCols; c++) {
                        if (occupied.has(`${r}-${c}`)) {
                            canPlace = false;
                            break;
                        }
                    }
                    if (!canPlace) break;
                }

                if (canPlace) {
                    const colEnd = Math.min(col + blockWidth, gridCols + 1);
                    const rowEnd = Math.min(row + blockHeight, gridRows + 2);
                    return [
                        `grid-column_${col}__${colEnd}`,
                        `grid-row_${row}__${rowEnd}`
                    ];
                }
            }
        }

        // Если свободного места нет, размещаем в последней доступной позиции (1x1)
        return [
            `grid-column_${gridCols}__${gridCols + 1}`,
            `grid-row_${gridRows + 1}__${gridRows + 2}`
        ];
    }

    /**
     * Откатывает перемещение блока при ошибке
     */
    async rollbackMoveBlock(blockBackup, oldParentBackup, newParentBackup) {
        await this.saveBlock(blockBackup);
        if (oldParentBackup) await this.saveBlock(oldParentBackup);
        await this.saveBlock(newParentBackup);
        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось переместить блок' });
    }

    async loadEmptyBlocks({emptyBlocks}) {
        await api.loadEmpty(emptyBlocks).then((res) => {
            if (res.status === 200) {
                Object.values(res.data).forEach((block) => {
                    this.saveBlock(block)
                })
            }
        })
    }


    /**
     * Атомарно сохраняет блок в memory и IndexedDB.
     * Мёржит с существующим блоком, чтобы сохранить runtime поля.
     * @param {Object} block - Блок для сохранения (может быть частичным)
     * @returns {Object|undefined} Сохранённый блок или undefined при ошибке
     */
    async saveBlock(block) {
        if (!block) {
            console.error('Save block undefined');
            console.trace('saveBlock called with undefined');
            return;
        }
        if (!block.id) {
            console.error('Save block without id:', block);
            console.trace('saveBlock called without id');
            return;
        }

        // Атомарно обновляем in-memory и IndexedDB
        const existingBlock = this.blocks.get(block.id);

        // Мёржим с существующим блоком (сохраняем runtime поля)
        // Deep merge для data чтобы не потерять вложенные поля
        const mergedBlock = existingBlock
            ? {
                ...existingBlock,
                ...block,
                data: { ...(existingBlock.data || {}), ...(block.data || {}) }
            }
            : block;

        // Для блоков-ссылок: childOrder должен содержать sourceId
        // Сервер может не присылать childOrder, но для рендеринга он необходим
        if (mergedBlock.data?.view === 'link' && mergedBlock.data?.source) {
            const sourceId = mergedBlock.data.source;
            // Не pending и не удалённый источник - устанавливаем childOrder = [sourceId]
            if (!mergedBlock.data.pending && !mergedBlock.data.source_deleted) {
                mergedBlock.data.childOrder = [sourceId];
            }
        }

        // ВАЖНО: финальная дедупликация childOrder перед сохранением
        // Это защита от любых источников дубликатов (сервер, баги, race conditions)
        if (mergedBlock.data?.childOrder?.length > 0) {
            const uniqueChildOrder = deduplicateChildOrder(mergedBlock.data.childOrder);
            if (uniqueChildOrder.length !== mergedBlock.data.childOrder.length) {
                console.warn(`⚠️ Removing ${mergedBlock.data.childOrder.length - uniqueChildOrder.length} duplicate(s) in childOrder for block ${block.id}`);
                mergedBlock.data.childOrder = uniqueChildOrder;
            }
        }

        this.blocks.set(block.id, mergedBlock);
        if (this.blockRepository) {
            await this.blockRepository.saveBlock(mergedBlock);
        } else {
            console.warn('BlockRepository not initialized, block saved only in memory:', block.id);
        }

        return mergedBlock;
    }

    async removeOneBlock(blockId) {
        const block = this.blocks.get(blockId);

        // Обновляем родителя если блок найден в памяти
        if (block) {
            const parentId = block.parent_id;
            if (parentId) {
                const parentBlock = this.blocks.get(parentId);
                if (parentBlock) {
                    if (Array.isArray(parentBlock.children)) {
                        parentBlock.children = parentBlock.children.filter(id => id !== blockId);
                    }
                    if (parentBlock.data?.childOrder) {
                        parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
                    }
                    this.blockRepository.saveBlock(parentBlock)
                }
            }
        }

        // Удаляем из treeIds если это корневой блок
        let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
        if (Array.isArray(treeIds)) {
            treeIds = treeIds.filter(id => id !== blockId);
            await localforage.setItem(`treeIds${this.currentUser}`, treeIds);
        }

        // Удаляем из памяти
        this.blocks.delete(blockId);

        // Всегда пытаемся удалить из IndexedDB (даже если блока нет в памяти)
        await this.blockRepository.deleteBlock(blockId);
    }

    // Corrected block and branch removal logic with parent update
    async removeBlock(blockId) {
        const block = this.blocks.get(blockId);
        if (!block) {
            console.warn(`Block ${blockId} not found`);
            return;
        }

        // Recursively remove children first
        this.removeBranch(block);

        // Attempt to update parent block using parent_id
        const parentId = block.parent_id;
        if (parentId) {
            const parentBlock = this.blocks.get(parentId);
            if (parentBlock) {
                if (Array.isArray(parentBlock.children)) {
                    parentBlock.children = parentBlock.children.filter(id => id !== blockId);
                }
                if (Array.isArray(parentBlock.childOrder)) {
                    parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
                }
            }
        }

        // Remove from treeIds in localforage
        let treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
        if (Array.isArray(treeIds)) {
            treeIds = treeIds.filter(id => id !== blockId);
            await localforage.setItem(`treeIds${this.currentUser}`, treeIds);
        }

        // Remove from internal map and delete from repository
        this.blocks.delete(blockId);
        await this.blockRepository.deleteBlock(blockId);
    }

    removeBranch(block) {
        if (!block || !Array.isArray(block.children)) {
            console.warn(`Block ${block?.id} is invalid or has no children`);
            return;
        }

        for (const childId of block.children) {
            const childBlock = this.blocks.get(childId);
            this.removeBranch(childBlock);

            // Remove child from internal map and repository
            this.blocks.delete(childId);
            this.blockRepository.deleteBlock(childId).catch(err => {
                console.error(`Ошибка при удалении блока ${childId}:`, err);
            });
        }
    }


    // Initialization
    async initUser({treeIds, blocks}, user) {
        this.currentUser = user;
        this.blockRepository = new BlockRepository(this.currentUser);
        this.currentTree = treeIds[0]

        delete this.blocks
        this.blocks = new Map()

        await localforage.setItem('currentUser', user);
        await localforage.setItem('currentTree', this.currentTree)
        await localforage.setItem(`treeIds${user}`, treeIds)

        // Получаем существующие ключи блоков для этого пользователя
        const keys = await localforage.keys();
        const escapedUser = escapeRegExp(user);
        const pattern = new RegExp(`^Block_.*_${escapedUser}$`);
        const existingBlockKeys = new Set(keys.filter(key => pattern.test(key)));

        // Новые ключи с сервера
        const newBlockIds = new Set(blocks.keys());

        // Удаляем блоки, которых нет на сервере (stale blocks)
        const keysToDelete = [];
        for (const key of existingBlockKeys) {
            // Извлекаем blockId из ключа формата Block_{blockId}_{user}
            const match = key.match(/^Block_(.+)_[^_]+$/);
            if (match) {
                const blockId = match[1];
                if (!newBlockIds.has(blockId)) {
                    keysToDelete.push(key);
                }
            }
        }

        // Удаляем устаревшие блоки из IndexedDB
        if (keysToDelete.length > 0) {
            console.log(`🧹 Cleaning ${keysToDelete.length} stale blocks from IndexedDB`);
            await Promise.all(keysToDelete.map(key => localforage.removeItem(key)));
        }

        // Сохраняем блоки с await для гарантии записи в IndexedDB
        for (const block of blocks.values()) {
            await this.saveBlock(block);
        }

        // Initialize path with the root block
        for (let i = 0; i < treeIds.length; i++) {
            const tree = treeIds[i]
            const rootBlock = blocks.get(tree);
            if (!rootBlock) {
                console.warn(`Root block ${tree} not found in blocks`);
                continue;
            }
            const color = rootBlock.data?.color && rootBlock.data.color !== 'default_color' ? rootBlock.data.color : [];
            const titleBlock = rootBlock.title;

            const path = [{screenName: truncate(titleBlock, 10), color: color, blockId: rootBlock.id}];
            await localforage.setItem(`Path_${tree}${this.currentUser}`, path);
        }
        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`)

        // Уведомляем offlineQueue что данные загружены — следующий pull можно пропустить
        offlineQueue.markPullCompleted();
    }


    async getAllBlocksForUser(username) {
        const keys = await localforage.keys();
        // Экранируем username для защиты от RegExp injection
        const escapedUsername = escapeRegExp(username);
        const pattern = new RegExp(`^Block_.*_${escapedUsername}$`);
        const blockKeys = keys.filter((key) => pattern.test(key));
        const blocks = await Promise.all(
            blockKeys.map(key => localforage.getItem(key))
        );

        this.blocks = new Map();
        blocks.forEach(block => {
            if (block && block.id) {
                this.blocks.set(block.id, block);
            }
        });
    }

    async initShowLink(linkSlug, user) {
        let treeId = await localforage.getItem(`linkSlugTreeId${user}:${linkSlug}`)
        if (!treeId) {
            const res = await api.loadBlockUrl(linkSlug)

            if (res.status === 200 && res.data) {
                const blocks = Object.values(res.data)
                const block = blocks[0]
                const color = block.data?.color && block.data.color !== 'default_color' ? block.data.color : [];
                await localforage.setItem(`linkSlugTreeId${user}:${linkSlug}`, block.id)
                await localforage.setItem(`Path_${block.id}${user}`, [
                    {screenName: truncate(block.title, 10), color: color, blockId: block.id}
                ])

                for (let i = 0; i < blocks.length; i++) {
                    const block = blocks[i]
                    await this.saveBlock(block)
                }
                return block.id
            }
            if (res.status === 404) {
                console.error('Url не найден')
            }
        } else {
            return treeId
        }
    }

    async showBlocks() {
        // Защита от concurrent рендеров с отложенным повторным вызовом
        if (this._isRendering) {
            this._pendingRender = true;
            return;
        }
        this._isRendering = true;

        try {
            this.currentUser = await localforage.getItem('currentUser') || 'anonim';
            this.blockRepository = new BlockRepository(this.currentUser);

        const isLinkView = window.location.search.length > 0;

        if (isLinkView) {
            // Просмотр по ссылке
            this.currentTree = await this.initShowLink(window.location.search.slice(1,), this.currentUser)
        } else {
            // Обычный режим — загружаем деревья пользователя
            const treeIds = await localforage.getItem(`treeIds${this.currentUser}`);
            const savedTree = await localforage.getItem('currentTree');

            // Проверяем, что сохранённое дерево принадлежит пользователю
            if (savedTree && treeIds && treeIds.includes(savedTree)) {
                this.currentTree = savedTree;
            } else if (treeIds && treeIds.length > 0) {
                // Используем первое дерево пользователя
                this.currentTree = treeIds[0];
                await localforage.setItem('currentTree', this.currentTree);
            } else {
                // Нет деревьев — нужна повторная инициализация
                this.currentTree = null;
            }
        }

        // Всегда загружаем блоки из IndexedDB если память пуста или блок текущего дерева отсутствует
        if (!this.blocks || this.blocks.size === 0 || (this.currentTree && !this.blocks.has(this.currentTree))) {
            await this.getAllBlocksForUser(this.currentUser);
            // Автоматическая проверка и восстановление после загрузки
            this.autoRepairIfNeeded();
        }

        this.path = await localforage.getItem(`Path_${this.currentTree}${this.currentUser}`) || [];
        let screenObj = this.path.at(-1);

        if (!screenObj) {
            const block = this.blocks.get(this.currentTree);
            // Если блок всё ещё не найден после загрузки, попробуем перезагрузить с сервера
            if (!block) {
                console.warn('Block not found in cache, reloading from server...');
                dispatch('LoadTrees');
                return;
            }
            screenObj = {
                screenName: truncate(block.title, 10),
                color: block.data?.color && block.data.color !== 'default_color' ? block.data.color : [],
                blockId: block.id
            }
            this.path.push(screenObj)
            await localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path)
        }

        // Проверяем наличие блока и перезагружаем если нужно
        if (!this.blocks.has(screenObj.blockId)) {
            await this.getAllBlocksForUser(this.currentUser);
            // Если блок всё ещё не найден, перезагружаем с сервера
            if (!this.blocks.has(screenObj.blockId)) {
                console.warn('Block still not found after cache reload, fetching from server...');
                dispatch('LoadTrees');
                return;
            }
        }

        // Очищаем кэш картинок при смене дерева (предотвращение memory leak)
        if (this._lastRenderedTree && this._lastRenderedTree !== this.currentTree) {
            if (this.painter && this.painter.clearImageCache) {
                this.painter.clearImageCache();
            }
        }
        this._lastRenderedTree = this.currentTree;

        this.painter.render(this.blocks, screenObj, this.currentUser);
        dispatch('ShowedBlocks', {path: this.path, activeId: undefined});
        } finally {
            this._isRendering = false;
            // Выполняем отложенный рендер если был запрошен
            if (this._pendingRender) {
                this._pendingRender = false;
                this.showBlocks();
            }
        }
    }

    /**
     * Асинхронно возвращает копию текущего path из памяти
     * @returns {Promise<Array>} копия path или пустой массив
     */
    async getPathPromise() {
        // Используем path из памяти для консистентности с getPathSync()
        return this.path ? [...this.path] : [];
    }

    /**
     * Возвращает текущий path из памяти
     * @deprecated Используй this.path напрямую или getPathSync()
     * @param {Function} callback - callback(err, path)
     */
    getPath(callback) {
        // Для обратной совместимости вызываем callback асинхронно
        setTimeout(() => {
            callback(null, this.path || []);
        }, 0);
    }

    /**
     * Синхронно возвращает копию текущего path
     * @returns {Array} копия path или пустой массив
     */
    getPathSync() {
        // Возвращаем копию чтобы избежать мутации оригинального массива
        return this.path ? [...this.path] : [];
    }

    /**
     * Проверяет инициализировано ли состояние и восстанавливает его при необходимости
     * Вызывается когда обнаружено что IndexedDB был очищен
     * @returns {Promise<boolean>} true если состояние валидно, false если требуется полная перезагрузка
     */
    async ensureStateInitialized() {
        // Проверяем наличие критичных данных
        const hasPath = this.path && this.path.length > 0;
        const hasBlocks = this.blocks && this.blocks.size > 0;
        const hasCurrentTree = !!this.currentTree;

        if (hasPath && hasBlocks && hasCurrentTree) {
            return true;
        }

        console.warn('🔄 State not initialized, attempting recovery...', {
            hasPath,
            hasBlocks,
            hasCurrentTree
        });

        // Пробуем загрузить данные из IndexedDB
        if (!this.currentUser) {
            this.currentUser = await localforage.getItem('currentUser');
        }

        if (!this.currentUser) {
            console.warn('❌ No current user, cannot recover state');
            return false;
        }

        // Проверяем есть ли данные в IndexedDB
        const storedTree = await localforage.getItem('currentTree');
        const storedPath = storedTree
            ? await localforage.getItem(`Path_${storedTree}${this.currentUser}`)
            : null;

        if (!storedTree || !storedPath) {
            // IndexedDB был очищен - требуется полная перезагрузка с сервера
            console.warn('❌ IndexedDB cleared, triggering full reload from server');
            dispatch('LoadTrees');
            return false;
        }

        // Восстанавливаем состояние из IndexedDB
        this.currentTree = storedTree;
        this.path = storedPath;

        if (!hasBlocks) {
            await this.getAllBlocksForUser(this.currentUser);
        }

        console.log('✅ State recovered from IndexedDB');
        return true;
    }

    openBlock({id, parentHsl, isIframe, links}, _isRecoveryAttempt = false) {
        // Используем this.path напрямую вместо чтения из IndexedDB
        if (!this.path || this.path.length === 0) {
            // Защита от бесконечной рекурсии
            if (_isRecoveryAttempt) {
                console.warn('openBlock: recovery failed, path still empty');
                return;
            }
            console.warn('openBlock: path not initialized, attempting recovery...');
            // Асинхронно пытаемся восстановить состояние
            this.ensureStateInitialized().then(initialized => {
                if (initialized) {
                    // Повторяем попытку после восстановления с флагом
                    this.openBlock({id, parentHsl, isIframe, links}, true);
                }
            });
            return;
        }

        const currentScreen = this.path.at(-1);
        if (!currentScreen) {
            console.warn('openBlock: currentScreen is undefined, skipping navigation');
            return;
        }

        const block = this.blocks.get(id);
        if (!block) {
            console.warn('openBlock: block not found:', id);
            return;
        }

        // Автоматическое обновление ссылки на текущую неделю при открытии Home Focus
        if (block.data?.homePageRole === 'focus') {
            focusManager.initializeWeekLinkIfNeeded().catch(err => {
                console.warn('Failed to update current week link:', err);
            });
        }

        const title = block.title;
        let activeId = undefined;

        if (currentScreen.blockId === block.id) {
            if (this.path.length === 1) return;
            activeId = this.path.pop().blockId;
        } else {
            this.path.push({screenName: truncate(title, 10), color: parentHsl, blockId: id, links});
        }

        if (!isIframe) {
            this.painter.render(this.blocks, this.path.at(-1), this.currentUser);
        }

        // Сохраняем path в IndexedDB для персистентности
        localforage.setItem(`Path_${this.currentTree}${this.currentUser}`, this.path);
        dispatch("ShowedBlocks", {path: this.path, activeId});
    }

    /**
     * Находит свободную позицию в layoutCells сетке
     * Если нет свободного места - автоматически расширяет сетку на 1 строку
     * @param {Object} layoutCells - {gridSize, cells}
     * @returns {{row: number, col: number, gridExpanded: boolean}} - позиция (всегда возвращает позицию)
     */
    _findFreePositionInLayoutCells(layoutCells) {
        if (!layoutCells?.gridSize || !layoutCells?.cells) {
            return { row: 1, col: 1, gridExpanded: false };
        }

        const { gridSize, cells } = layoutCells;
        const occupied = new Set();

        // Отмечаем все занятые ячейки
        for (const [, cell] of Object.entries(cells)) {
            if (cell) {
                for (let r = cell.row; r < cell.row + (cell.rowSpan || 1); r++) {
                    for (let c = cell.col; c < cell.col + (cell.colSpan || 1); c++) {
                        occupied.add(`${r}-${c}`);
                    }
                }
            }
        }

        // Ищем первую свободную ячейку в существующей сетке
        for (let r = 1; r <= gridSize.rows; r++) {
            for (let c = 1; c <= gridSize.cols; c++) {
                if (!occupied.has(`${r}-${c}`)) {
                    return { row: r, col: c, gridExpanded: false };
                }
            }
        }

        // Нет свободного места - расширяем сетку на 1 строку
        // Возвращаем первую ячейку новой строки
        return {
            row: gridSize.rows + 1,
            col: 1,
            gridExpanded: true
        };
    }

    async createBlock({parentId, title}) {
        // Получаем блокировку для предотвращения race conditions
        // при одновременном создании блоков в одном родителе
        const releaseLock = await blockOperationLock.acquire(`parent:${parentId}`);

        try {
            // Генерируем реальный UUID сразу (не временный)
            const blockId = offlineQueue.generateBlockId();

            const parentBlock = this.blocks.get(parentId);
            if (!parentBlock) {
                console.error('Parent block not found:', parentId);
                return;
            }

            // Проверка прав на создание в родителе (с учётом sandbox режима)
            if (!canCreateInSandbox(parentBlock)) {
                dispatch('ShowError', { message: 'Нет прав на создание блока в этом разделе' });
                return;
            }

            // Проверяем, является ли родитель диаграммой (имеет customGrid)
            // Если да — синхронизируем сразу без debounce
            const isDiagram = !!parentBlock.data?.customGrid?.grid;

            // Проверяем layoutCells - если есть, нужно найти свободное место
            const hasLayoutCells = parentBlock.data?.layout === 'cells' && parentBlock.data?.layoutCells;
            let newCellPosition = null;

            if (hasLayoutCells) {
                newCellPosition = this._findFreePositionInLayoutCells(parentBlock.data.layoutCells);
                // Если сетка была расширена - увеличиваем gridSize
                if (newCellPosition.gridExpanded) {
                    parentBlock.data.layoutCells.gridSize.rows = newCellPosition.row;
                    console.log('Grid expanded to', newCellPosition.row, 'rows for new block');
                }
            }

            // Регистрируем блок как pending (ожидающий синхронизации)
            offlineQueue.registerPendingBlock(blockId);

            // Создаём блок с реальным ID
            const newBlock = {
                id: blockId,
                title: title || '',
                parent_id: parentId,
                children: [],
                data: { childOrder: [] },
                updated_at: new Date().toISOString(),
                // Устанавливаем creator_id для sandbox режима
                creator_id: this.currentUser || null
            };

            // Обновляем родительский блок
            if (!parentBlock.children) parentBlock.children = [];
            if (!parentBlock.data) parentBlock.data = {};
            if (!parentBlock.data.childOrder) parentBlock.data.childOrder = [];

            // ВАЖНО: добавляем blockId в оба массива синхронно
            // с проверкой на дубликаты для предотвращения race conditions
            if (!parentBlock.children.includes(blockId)) {
                parentBlock.children.push(blockId);
            }
            if (!parentBlock.data.childOrder.includes(blockId)) {
                parentBlock.data.childOrder.push(blockId);
            }

            // Если есть layoutCells - добавляем позицию для нового блока
            if (hasLayoutCells && newCellPosition) {
                parentBlock.data.layoutCells.cells[blockId] = {
                    row: newCellPosition.row,
                    col: newCellPosition.col,
                    rowSpan: 1,
                    colSpan: 1
                };
            }

            // Обновляем timestamp родителя
            parentBlock.updated_at = new Date().toISOString();

            // Сохраняем локально и показываем сразу (мгновенный отклик)
            await this.saveBlock(newBlock);
            await this.saveBlock(parentBlock);

            dispatch('ShowBlocks');

            // Записываем в undo stack
            undoManager.recordCreate(blockId, parentId, newBlock);

            // Добавляем в очередь синхронизации (отправится через batch import)
            // Для диаграммы отправляем сразу без debounce
            await offlineQueue.enqueue({
                type: 'createBlock',
                data: { blockId, parentId }
            }, { immediate: isDiagram });

            console.log('Block created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
        } finally {
            // Освобождаем блокировку в любом случае
            releaseLock();
        }
    }

    /**
     * Откатывает создание блока при ошибке
     */
    async rollbackCreateBlock(blockId, parentId) {
        // Удаляем блок
        this.blocks.delete(blockId);
        await this.blockRepository.deleteBlock(blockId);

        // Убираем из родительского блока (из children и childOrder)
        const parentBlock = this.blocks.get(parentId);
        if (parentBlock && parentBlock.children) {
            parentBlock.children = parentBlock.children.filter(id => id !== blockId);

            // Также убираем из childOrder
            if (parentBlock.data?.childOrder) {
                parentBlock.data.childOrder = parentBlock.data.childOrder.filter(id => id !== blockId);
            }
            await this.saveBlock(parentBlock);
        }

        dispatch('ShowBlocks');
        dispatch('ShowError', { message: 'Не удалось создать блок' });
    }

    async iframeCreate({parentId, src}) {
        const blockData = {
            view: 'iframe',
            attributes: [
                {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
                {name: 'src', value: src}
            ]
        };

        // Генерируем реальный UUID сразу
        const blockId = offlineQueue.generateBlockId();

        const parentBlock = this.blocks.get(parentId);
        if (!parentBlock) {
            console.error('Parent block not found:', parentId);
            return;
        }

        // Проверяем layoutCells - если есть, нужно найти свободное место
        const hasLayoutCells = parentBlock.data?.layout === 'cells' && parentBlock.data?.layoutCells;
        let newCellPosition = null;

        if (hasLayoutCells) {
            newCellPosition = this._findFreePositionInLayoutCells(parentBlock.data.layoutCells);
            // Если сетка была расширена - увеличиваем gridSize
            if (newCellPosition.gridExpanded) {
                parentBlock.data.layoutCells.gridSize.rows = newCellPosition.row;
                console.log('Grid expanded to', newCellPosition.row, 'rows for iframe block');
            }
        }

        // Регистрируем блок как pending (ожидающий синхронизации)
        offlineQueue.registerPendingBlock(blockId);

        // Создаём iframe блок с реальным ID
        const newBlock = {
            id: blockId,
            title: '',
            parent_id: parentId,
            children: [],
            data: blockData,
            updated_at: new Date().toISOString()
        };

        // Обновляем родительский блок
        // с проверкой на дубликаты для предотвращения race conditions
        if (!parentBlock.children) parentBlock.children = [];
        if (!parentBlock.children.includes(blockId)) {
            parentBlock.children.push(blockId);
        }

        // Синхронизируем childOrder с children
        if (!parentBlock.data) parentBlock.data = {};
        if (!parentBlock.data.childOrder) parentBlock.data.childOrder = [];
        if (!parentBlock.data.childOrder.includes(blockId)) {
            parentBlock.data.childOrder.push(blockId);
        }

        // Если есть layoutCells - добавляем позицию для нового блока
        if (hasLayoutCells && newCellPosition) {
            parentBlock.data.layoutCells.cells[blockId] = {
                row: newCellPosition.row,
                col: newCellPosition.col,
                rowSpan: 1,
                colSpan: 1
            };
        }

        await this.saveBlock(newBlock);
        await this.saveBlock(parentBlock);
        dispatch('ShowBlocks');

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'createBlock',
            data: { blockId, parentId }
        });

        console.log('Iframe created:', blockId, offlineQueue.isNetworkOnline() ? '(syncing)' : '(offline)');
    }

    async pasteBlock(data) {
        // Копирование недоступно в офлайн режиме
        if (!offlineQueue.isNetworkOnline()) {
            dispatch('ShowError', { message: 'Копирование блоков доступно только в онлайн режиме' });
            return;
        }

        if (data.src.length > 0) {
            try {
                const response = await api.pasteBlock(data);
                if (response.status === 200) {
                    const newBlocks = response.data;
                    for (const block of Object.values(newBlocks)) {
                        // Защита: пропускаем блоки без id
                        if (!block?.id) {
                            console.warn('⚠️ pasteBlock: skipping block without id:', block);
                            continue;
                        }
                        await this.saveBlock(block);
                    }
                    dispatch('ShowBlocks');
                }
            } catch (err) {
                if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                    dispatch('ShowError', { message: 'Копирование блоков доступно только в онлайн режиме' });
                } else {
                    console.error(err);
                }
            }
        }
    }

    async pasteLinkBlock(data) {
        // Создание ссылок недоступно в офлайн режиме
        if (!offlineQueue.isNetworkOnline()) {
            dispatch('ShowError', { message: 'Создание ссылок доступно только в онлайн режиме' });
            return;
        }

        try {
            const response = await api.pasteLinkBlock(data);
            if (response.status === 201) {
                const responseData = response.data;

                // Проверяем, это pending запрос на доступ или массив блоков
                if (responseData && responseData.pending === true) {
                    // Запрос на доступ отправлен владельцу блока
                    // Сохраняем parent и link блоки если они есть
                    if (responseData.parent?.id) {
                        await this.saveBlock(responseData.parent);
                    }
                    if (responseData.link?.id) {
                        await this.saveBlock(responseData.link);
                    }
                    dispatch('ShowBlocks');
                    dispatch('ShowToast', {
                        message: 'Запрос на доступ отправлен владельцу блока',
                        type: 'info',
                        duration: 4000
                    });
                    dispatch('PasteBlockLink');
                } else if (Array.isArray(responseData)) {
                    // Обычный случай: массив блоков
                    for (const block of responseData) {
                        // Защита: пропускаем блоки без id
                        if (!block?.id) {
                            console.warn('⚠️ pasteLinkBlock: skipping block without id:', block);
                            continue;
                        }
                        await this.saveBlock(block);
                    }
                    dispatch('ShowBlocks');
                    dispatch('PasteBlockLink');
                } else {
                    console.warn('⚠️ pasteLinkBlock: unexpected response format:', responseData);
                }
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                dispatch('ShowError', { message: 'Создание ссылок доступно только в онлайн режиме' });
            } else if (err.response?.status === 409) {
                // Повторный запрос при pending
                dispatch('ShowToast', {
                    message: 'Запрос на доступ уже отправлен и ожидает ответа',
                    type: 'warning',
                    duration: 3000
                });
            } else if (err.response?.status === 403) {
                // Запрос отклонён ранее
                dispatch('ShowError', {
                    message: err.response?.data?.detail || 'Доступ к блоку запрещён'
                });
            } else {
                console.error(err);
                dispatch('ShowError', {
                    message: err.response?.data?.detail || 'Ошибка при создании ссылки'
                });
            }
        }
    }

    async updateCustomGridBlock({blockId, customGrid}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = await this.blockRepository.loadBlock(blockId);
        if (!block) {
            console.error(`Block ${blockId} not found`);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        block.data.customGrid = customGrid;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    /**
     * Обновить кастомные стили блока
     * @param {string} blockId - ID блока
     * @param {Object} customStyles - Объект стилей (background, borderColor, border, shape, shadow)
     */
    async updateBlockStyles({blockId, customStyles}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = await this.blockRepository.loadBlock(blockId);
        if (!block) {
            console.error(`Block ${blockId} not found`);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo
        const beforeState = JSON.parse(JSON.stringify(block));

        block.data.customStyles = customStyles;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    /**
     * Обновить настройки режима рендеринга блока
     * @param {string} blockId - ID блока
     * @param {Object|null} renderingMode - Настройки режима рендеринга
     *   - forceDefault: boolean - игнорировать customGrid/layout
     *   - hideConnections: boolean - не рендерить соединения
     *   - inheritToChildren: boolean - наследовать потомкам (default: true)
     */
    async updateRenderingMode({blockId, renderingMode}) {
        const block = this.blocks.get(blockId);
        if (!block) {
            console.error(`Block ${blockId} not found`);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo
        const beforeState = JSON.parse(JSON.stringify(block));

        // Гарантируем существование block.data
        if (!block.data) {
            block.data = {};
        }

        if (renderingMode) {
            block.data.renderingMode = renderingMode;
        } else {
            delete block.data.renderingMode;
        }

        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async updateDataBlock({blockId, data}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) {
            console.error(`Block with id ${blockId} not found.`);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo (deep clone)
        const beforeState = JSON.parse(JSON.stringify(block));

        // Мержим новые data с существующими (сохраняем все поля, перезаписываем только переданные)
        // childOrder и connections: используем переданные если есть, иначе сохраняем существующие
        block.data = {
            ...block.data,
            ...data,
            childOrder: data.childOrder !== undefined ? data.childOrder : block.data?.childOrder,
            connections: data.connections !== undefined ? data.connections : block.data?.connections
        };
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    /**
     * Обновляет блок (для ручного редактирования через Shift+E)
     * Позволяет менять только title и data
     * Системные поля (id, parent_id, children, permission и т.д.) защищены
     * @param {Object} param
     * @param {string} param.blockId - ID блока
     * @param {Object} param.block - Отредактированный блок (только title и data)
     */
    async updateFullBlock({blockId, block: editedBlock}) {
        const block = this.blocks.get(blockId);
        if (!block) {
            console.error(`Block with id ${blockId} not found.`);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo (deep clone)
        const beforeState = JSON.parse(JSON.stringify(block));

        // Обновляем ТОЛЬКО разрешённые поля: title и data
        // Системные поля (id, parent_id, children, permission, etc.) защищены
        if (editedBlock.title !== undefined) block.title = editedBlock.title;
        if (editedBlock.data !== undefined) block.data = editedBlock.data;

        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async textUpdate({blockId, text}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo
        const beforeState = JSON.parse(JSON.stringify(block));

        if (!block.data) block.data = {};
        block.data.text = text;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }


    historyRevert({block}) {
        console.log(block)
        this.saveBlock(block)
        this.showBlocks()
    }

    async titleUpdate({blockId, title}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo
        const beforeState = JSON.parse(JSON.stringify(block));

        block.title = title;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async setIframe({blockId, src}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        if (!block.data) block.data = {};
        block.data.view = 'iframe';
        block.data.text = '';
        block.data.attributes = [
            {name: 'sandbox', value: 'allow-scripts allow-same-origin allow-forms'},
            {name: 'src', value: src}
        ];
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async hueUpdate({blockId, hue}) {
        // Optimistic UI: обновляем локально, синхронизация через batch import
        const block = this.blocks.get(blockId);
        if (!block) return;

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = block.parent_id ? this.blocks.get(block.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(block, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Сохраняем состояние ДО изменения для undo
        const beforeState = JSON.parse(JSON.stringify(block));

        if (!block.data) block.data = {};
        block.data.color = hue;
        block.updated_at = new Date().toISOString();
        await this.saveBlock(block);

        // Записываем в undo stack
        undoManager.recordEdit(blockId, beforeState, block);

        // Регистрируем блок как pending для индикатора
        offlineQueue.registerPendingBlock(blockId);

        // Добавляем в очередь синхронизации
        await offlineQueue.enqueue({
            type: 'updateBlock',
            data: { id: blockId }
        });

        dispatch('ShowBlocks');
    }

    async addConnectionBlock({
                                 id,  // ID соединения (генерируется в arrowManager)
                                 sourceId,
                                 targetId,
                                 connector,
                                 paintStyle,
                                 overlays,
                                 anchors,
                                 endpoint,
                                 endpointStyle,
                                 sourceAnchor,
                                 targetAnchor
                             }) {
        // Извлечь чистые ID блоков (DOM ID может содержать префикс родителя в формате parentId*childId)
        const cleanSourceId = sourceId?.includes('*') ? sourceId.split('*').pop() : sourceId;
        const cleanTargetId = targetId?.includes('*') ? targetId.split('*').pop() : targetId;

        if (!cleanSourceId) {
            console.error('Source ID is required for addConnectionBlock');
            return;
        }

        const sourceBlock = this.blocks.get(cleanSourceId);
        if (!sourceBlock) {
            console.error('Source block not found:', sourceId, '(clean:', cleanSourceId, ')');
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = sourceBlock.parent_id ? this.blocks.get(sourceBlock.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(sourceBlock, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        if (!sourceBlock.data) sourceBlock.data = {};
        if (!sourceBlock.data.connections) sourceBlock.data.connections = [];

        // Используем переданный ID или генерируем новый (для обратной совместимости)
        const connectionId = id || (
            (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        );

        const connectionData = {
            id: connectionId,
            sourceId: cleanSourceId,  // Используем чистый ID для хранения
            targetId: cleanTargetId,  // Используем чистый ID для хранения
            connector,
            paintStyle,
            overlays,
            anchors,
            endpoint,
            endpointStyle,
            sourceAnchor,
            targetAnchor
        };

        // Проверяем уникальность соединения:
        // 1. Сначала по connectionId (приоритет - это уникальный идентификатор)
        // 2. Затем по source + target + anchors (позволяет несколько соединений между парой блоков)
        let existingConnection = null;

        // Поиск по ID соединения (если передан)
        if (connectionId) {
            existingConnection = sourceBlock.data.connections.find(
                connection => connection.id === connectionId
            );
        }

        // Если не найдено по ID, ищем по source/target/anchors
        if (!existingConnection) {
            existingConnection = sourceBlock.data.connections.find(
                connection => connection.sourceId === cleanSourceId &&
                             connection.targetId === cleanTargetId &&
                             connection.sourceAnchor === sourceAnchor &&
                             connection.targetAnchor === targetAnchor
            );
        }

        if (existingConnection) {
            // Сохраняем оригинальный ID при обновлении
            connectionData.id = existingConnection.id || connectionId;
            Object.assign(existingConnection, connectionData);
        } else {
            sourceBlock.data.connections.push(connectionData);
        }

        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);
        dispatch('ShowBlocks');

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `add_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: cleanSourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(cleanSourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `add_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: cleanSourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    async removeConnectionBlock({connectionId, sourceId, targetId, sourceAnchor, targetAnchor}) {
        // Извлечь чистые ID блоков (DOM ID может содержать префикс родителя)
        const cleanSourceId = sourceId?.includes('*') ? sourceId.split('*').pop() : sourceId;
        const cleanTargetId = targetId?.includes('*') ? targetId.split('*').pop() : targetId;

        if (!cleanSourceId) {
            console.error('Source ID is required for removeConnectionBlock');
            return;
        }

        const sourceBlock = this.blocks.get(cleanSourceId);
        if (!sourceBlock || !sourceBlock.data?.connections) {
            console.error('Source block or connections not found:', sourceId, '(clean:', cleanSourceId, ')');
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = sourceBlock.parent_id ? this.blocks.get(sourceBlock.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(sourceBlock, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Приоритет 1: Удаление по уникальному connectionId (самый надёжный способ)
        if (connectionId) {
            sourceBlock.data.connections = sourceBlock.data.connections.filter(
                (el) => el.id !== connectionId
            );
        }
        // Приоритет 2: Удаление по anchors (для старых соединений без ID)
        else if (sourceAnchor !== undefined && sourceAnchor !== null &&
                 targetAnchor !== undefined && targetAnchor !== null) {
            sourceBlock.data.connections = sourceBlock.data.connections.filter(
                (el) => !(el.targetId === cleanTargetId &&
                         el.sourceAnchor === sourceAnchor &&
                         el.targetAnchor === targetAnchor)
            );
        }
        // Приоритет 3: Удаление всех соединений к target (обратная совместимость)
        else {
            sourceBlock.data.connections = sourceBlock.data.connections.filter((el) => el.targetId !== cleanTargetId);
        }
        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `remove_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: cleanSourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(cleanSourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `remove_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: cleanSourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    /**
     * Обновляет существующее соединение между блоками
     * @param {Object} connectionData - Данные соединения
     */
    async updateConnectionBlock({id, sourceId, targetId, sourceAnchor, targetAnchor, connector, paintStyle, overlays, anchors, ...rest}) {
        // Извлекаем чистые ID блоков (без префиксов)
        const cleanSourceId = sourceId?.includes('*') ? sourceId.split('*').pop() : sourceId;
        const cleanTargetId = targetId?.includes('*') ? targetId.split('*').pop() : targetId;

        const sourceBlock = this.blocks.get(cleanSourceId);
        if (!sourceBlock || !sourceBlock.data?.connections) {
            console.error('Source block or connections not found:', cleanSourceId);
            return;
        }

        // Получаем родительский блок для проверки sandbox режима
        const parentBlock = sourceBlock.parent_id ? this.blocks.get(sourceBlock.parent_id) : null;

        // Проверка прав на редактирование (с учётом sandbox режима)
        if (!canEditInSandbox(sourceBlock, parentBlock, this.currentUser)) {
            dispatch('ShowError', { message: 'Нет прав на редактирование блока' });
            return;
        }

        // Находим существующее соединение:
        // 1. По connectionId (приоритет)
        // 2. По source/target/anchors (для обратной совместимости)
        let connIndex = -1;

        if (id) {
            connIndex = sourceBlock.data.connections.findIndex(c => c.id === id);
        }

        if (connIndex === -1) {
            connIndex = sourceBlock.data.connections.findIndex(
                c => c.sourceId === cleanSourceId &&
                     c.targetId === cleanTargetId &&
                     c.sourceAnchor === sourceAnchor &&
                     c.targetAnchor === targetAnchor
            );
        }

        // Fallback: поиск только по source/target (старое поведение)
        if (connIndex === -1) {
            connIndex = sourceBlock.data.connections.findIndex(
                c => c.sourceId === cleanSourceId && c.targetId === cleanTargetId
            );
        }

        if (connIndex === -1) {
            console.warn('Connection not found for update:', cleanSourceId, '->', cleanTargetId);
            return;
        }

        // Мёржим данные соединения (сохраняем существующие поля, обновляем переданные)
        const existingConnection = sourceBlock.data.connections[connIndex];
        sourceBlock.data.connections[connIndex] = {
            ...existingConnection,
            sourceId: cleanSourceId,
            targetId: cleanTargetId,
            ...(connector !== undefined && { connector }),
            ...(paintStyle !== undefined && { paintStyle }),
            ...(overlays !== undefined && { overlays }),
            ...(anchors !== undefined && { anchors }),
            ...(sourceAnchor !== undefined && { sourceAnchor }),
            ...(targetAnchor !== undefined && { targetAnchor }),
            ...rest
        };

        sourceBlock.updated_at = new Date().toISOString();
        await this.saveBlock(sourceBlock);

        // Примечание: не добавляем в undo stack, т.к. стили соединений
        // не поддерживают формат операций для undo/redo

        // Офлайн режим: добавляем в очередь
        if (!offlineQueue.isNetworkOnline()) {
            await offlineQueue.enqueue({
                id: `update_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                type: 'updateBlock',
                data: {
                    id: cleanSourceId,
                    blockData: {data: sourceBlock.data}
                }
            });
            return;
        }

        try {
            const response = await api.updateBlock(cleanSourceId, {data: sourceBlock.data});
            if (response.status === 200 && response.data?.id) {
                await this.saveBlock(response.data);
            }
        } catch (err) {
            if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
                await offlineQueue.enqueue({
                    id: `update_connection_${cleanSourceId}_${cleanTargetId}_${Date.now()}`,
                    type: 'updateBlock',
                    data: {
                        id: cleanSourceId,
                        blockData: {data: sourceBlock.data}
                    }
                });
            } else {
                console.error(err);
            }
        }
    }

    // Event handling methods
    async onResize() {
        if (this._pendingResize) return;
        this._pendingResize = true;

        if (!this.blocks || this.blocks.size === 0) {
            await this.getAllBlocksForUser(this.currentUser ?? 'anonim');
        }
        const path = await this.getPathPromise();

        if (path?.length) {
            this.jsPlumbInstance.repaintEverything();
            this.painter.render(this.blocks, path.at(-1), this.currentUser);
        }
        this._pendingResize = false;
    }

    getAllChildIds(block) {
        const removesIds = [block.id];

        const traverse = (currentBlock) => {
            if (!currentBlock || !currentBlock.children) return;
            for (const childId of currentBlock.children) {
                removesIds.push(childId);
                traverse(this.blocks.get(childId));
            }
        };

        traverse(block);
        return removesIds;
    }

    /**
     * Показывает экран выхода в офлайн режиме
     */
    /**
     * Показывает экран входа при logout
     * Очищает rootContainer и показывает сообщение о необходимости повторного входа
     */
    showSessionExpiredScreen() {
        // Очищаем rootContainer
        if (!this.rootContainer) return;
        this.rootContainer.innerHTML = '';

        // Устанавливаем анонимного пользователя в localforage
        localforage.setItem('currentUser', 'anonim');

        // Показываем сообщение о истечении сессии
        const loginScreen = document.createElement('div');
        loginScreen.className = 'session-expired-screen';
        loginScreen.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';

        const content = document.createElement('div');
        content.style.cssText = 'background: white; border-radius: 12px; padding: 32px 24px; max-width: 380px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center;';

        const icon = document.createElement('div');
        icon.style.cssText = 'font-size: 48px; margin-bottom: 16px; color: #667eea;';
        icon.innerHTML = '<i class="fas fa-clock"></i>';

        const title = document.createElement('h2');
        title.textContent = 'Сессия истекла';
        title.style.cssText = 'margin: 0 0 12px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;';

        const message = document.createElement('p');
        message.textContent = 'Ваша сессия завершена. Пожалуйста, обновите страницу для повторного входа.';
        message.style.cssText = 'margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;';

        const button = document.createElement('button');
        button.textContent = 'Обновить страницу';
        button.style.cssText = 'width: 100%; padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500; transition: background 0.2s;';
        button.onmouseover = () => button.style.background = '#5568d3';
        button.onmouseout = () => button.style.background = '#667eea';
        button.onclick = () => window.location.reload();

        content.appendChild(icon);
        content.appendChild(title);
        content.appendChild(message);
        content.appendChild(button);
        loginScreen.appendChild(content);
        this.rootContainer.appendChild(loginScreen);
    }

    /**
     * Приватный метод для очистки данных пользователя
     * Используется обработчиками Logout и SessionExpired
     */
    async _cleanupUserData() {
        // Очищаем URL если есть параметры
        if (window.location.search || window.location.hash) {
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Очищаем данные текущего пользователя из памяти
        this.blocks.clear();
        this.currentUser = null;
        this.currentTree = null;
        this.path = [];

        // Очищаем кэш картинок painter
        if (this.painter && this.painter.clearImageCache) {
            this.painter.clearImageCache();
        }

        // Очищаем данные из IndexedDB
        await localforage.removeItem('currentTree');
        await localforage.removeItem('currentUser');

        // Скрываем UI элементы
        const sidebar = document.getElementById('sidebar');
        const topSidebar = document.getElementById('topSidebar');
        if (sidebar) sidebar.classList.add('hidden');
        if (topSidebar) topSidebar.classList.add('hidden');
    }

    /**
     * Настраивает слушатель для автоматического перехода на экран входа
     * когда сеть восстанавливается после офлайн-режима
     */
    _setupOnlineListener() {
        const onlineHandler = () => {
            window.removeEventListener('online', onlineHandler);
            this.showSessionExpiredScreen();
        };
        window.addEventListener('online', onlineHandler);
    }

    showOfflineLogoutScreen() {
        // Очищаем rootContainer
        if (this.rootContainer) {
            this.rootContainer.innerHTML = '';
        }

        // Показываем сообщение о офлайн выходе
        const offlineScreen = document.createElement('div');
        offlineScreen.className = 'offline-logout-screen';
        offlineScreen.innerHTML = `
            <div class="offline-logout-content">
                <i class="fas fa-wifi-slash offline-logout-icon"></i>
                <h2>Вы вышли из системы</h2>
                <p>Подключитесь к интернету и обновите страницу для входа.</p>
                <button class="offline-refresh-btn" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt"></i> Обновить страницу
                </button>
            </div>
        `;

        if (this.rootContainer) {
            this.rootContainer.appendChild(offlineScreen);
        }
    }

}

// Ленивый singleton для использования в других модулях
let _localStateManagerInstance = null;

export const localStateManager = {
    get blocks() {
        if (!_localStateManagerInstance) {
            _localStateManagerInstance = new LocalStateManager();
        }
        return _localStateManagerInstance.blocks;
    },
    getInstance() {
        if (!_localStateManagerInstance) {
            _localStateManagerInstance = new LocalStateManager();
            // Делаем доступным глобально для errorTracker
            window.__localStateManager = _localStateManagerInstance;
        }
        return _localStateManagerInstance;
    },
    getPathSync() {
        if (!_localStateManagerInstance) {
            _localStateManagerInstance = new LocalStateManager();
        }
        return _localStateManagerInstance.getPathSync();
    }
};
