/**
 * GraphContextService - извлечение и кодирование контекста графа для LLM
 *
 * Этот сервис извлекает часть графа блоков и кодирует её в компактный формат
 * для отправки в LLM. Поддерживает разные scope'ы извлечения:
 * - current: текущий блок + прямые дети
 * - branch: текущий блок + все потомки (рекурсивно)
 * - ancestors: путь к корню + siblings
 * - full: весь видимый граф (с лимитом)
 *
 * Формат snapshot v2:
 * {
 *   "v": 2,
 *   "root": 5,
 *   "n": [[id, parent_id, type, title, text], ...],
 *   "o": [[id, [child_ids...]], ...],
 *   "e": [[source_id, target_id, connection_type], ...]
 * }
 */

import { CONNECTION_TYPES } from '../controller/connectionTypes.js';

// Типы блоков (из Python graph_mapper.py)
const BLOCK_TYPES = new Set([
    'group', 'entity', 'concept', 'doc',
    'process', 'step', 'decision',
    'system', 'component', 'interface', 'data',
    'task', 'issue', 'risk', 'metric', 'goal'
]);

const DEFAULT_TYPE = 'entity';
const MAX_TEXT_LENGTH = 500;
const SNAPSHOT_VERSION = 2;

// Performance limits
const MAX_NODES_WARNING = 50;      // Предупреждение при превышении
const MAX_NODES_LIMIT = 200;       // Жёсткий лимит
const MAX_TOKENS_WARNING = 8000;   // ~32KB контекста
const CACHE_TTL_MS = 5000;         // TTL кэша 5 секунд

/**
 * Маппинг типов соединений на короткие идентификаторы
 */
const CONNECTION_TYPE_VALUES = new Set(Object.values(CONNECTION_TYPES));

export class GraphContextService {
    /**
     * @param {Map} blocks - Map<uuid, Block> из localStateManager
     */
    constructor(blocks) {
        this.blocks = blocks;
        // Кэш для extractContext
        this._contextCache = new Map();
        this._cacheTimestamp = 0;
        // Кэш для HTML→text конвертации (LRU-like, ограниченный размер)
        this._htmlCache = new Map();
        this._htmlCacheMaxSize = 100;
    }

    /**
     * Обновить ссылку на блоки (для синглтона)
     * @param {Map} blocks
     */
    setBlocks(blocks) {
        this.blocks = blocks;
        this._invalidateCache();
    }

    /**
     * Инвалидировать кэш
     */
    _invalidateCache() {
        this._contextCache.clear();
        this._cacheTimestamp = Date.now();
    }

    /**
     * Проверить валидность кэша
     * @returns {boolean}
     */
    _isCacheValid() {
        return Date.now() - this._cacheTimestamp < CACHE_TTL_MS;
    }

    // =====================================================
    // SCOPE EXTRACTORS
    // =====================================================

    /**
     * Извлечь контекст графа по scope
     * @param {string} scope - 'current' | 'branch' | 'ancestors' | 'full'
     * @param {string} focusBlockId - ID блока в фокусе
     * @param {Object} options - дополнительные опции
     * @returns {{ snapshot: Object, idMap: Object, reverseMap: Object, warnings: string[] }}
     */
    extractContext(scope, focusBlockId, options = {}) {
        if (!this.blocks || !focusBlockId) {
            return { snapshot: null, idMap: {}, reverseMap: {}, warnings: [] };
        }

        // Проверяем кэш
        const cacheKey = `${scope}:${focusBlockId}:${options.maxDepth || 5}:${options.maxNodes || 100}`;
        if (this._isCacheValid() && this._contextCache.has(cacheKey)) {
            return this._contextCache.get(cacheKey);
        }

        let collectedBlocks;
        const warnings = [];

        switch (scope) {
            case 'current':
                collectedBlocks = this.collectCurrent(focusBlockId);
                break;
            case 'branch':
                collectedBlocks = this.collectBranch(focusBlockId, options.maxDepth || 5);
                break;
            case 'ancestors':
                collectedBlocks = this.collectAncestors(focusBlockId);
                break;
            case 'full':
                collectedBlocks = this.collectFull(focusBlockId, Math.min(options.maxNodes || 100, MAX_NODES_LIMIT));
                break;
            default:
                collectedBlocks = this.collectBranch(focusBlockId, 5);
        }

        // Проверка лимитов
        if (collectedBlocks.size > MAX_NODES_WARNING) {
            warnings.push(`Контекст содержит ${collectedBlocks.size} блоков. Рекомендуется уменьшить scope.`);
        }
        if (collectedBlocks.size > MAX_NODES_LIMIT) {
            // Обрезаем до лимита
            const limited = new Map();
            let count = 0;
            for (const [id, block] of collectedBlocks) {
                if (count >= MAX_NODES_LIMIT) break;
                limited.set(id, block);
                count++;
            }
            collectedBlocks = limited;
            warnings.push(`Контекст обрезан до ${MAX_NODES_LIMIT} блоков.`);
        }

        const result = this.encodeForLLM(collectedBlocks, focusBlockId);
        result.warnings = warnings;

        // Проверка размера токенов
        const tokens = this.estimateTokens(result.snapshot);
        if (tokens > MAX_TOKENS_WARNING) {
            result.warnings.push(`Контекст ~${tokens} токенов. Это может быть дорого.`);
        }

        // Сохраняем в кэш
        this._contextCache.set(cacheKey, result);

        return result;
    }

    /**
     * Scope: current - текущий блок + прямые дети (1 уровень)
     * @param {string} blockId
     * @returns {Map<string, Object>}
     */
    collectCurrent(blockId) {
        const result = new Map();
        const block = this.blocks.get(blockId);

        if (!block) return result;

        result.set(blockId, block);

        // Добавляем прямых детей
        const childOrder = this._getChildOrder(block);
        for (const childId of childOrder) {
            const child = this.blocks.get(childId);
            if (child) {
                result.set(childId, child);
            }
        }

        return result;
    }

    /**
     * Scope: branch - текущий блок + все потомки (рекурсивно)
     * @param {string} blockId
     * @param {number} maxDepth - максимальная глубина
     * @returns {Map<string, Object>}
     */
    collectBranch(blockId, maxDepth = 5) {
        const result = new Map();

        const traverse = (id, depth) => {
            if (depth > maxDepth || result.has(id)) return;

            const block = this.blocks.get(id);
            if (!block) return;

            result.set(id, block);

            const childOrder = this._getChildOrder(block);
            for (const childId of childOrder) {
                traverse(childId, depth + 1);
            }
        };

        traverse(blockId, 0);
        return result;
    }

    /**
     * Scope: ancestors - текущий блок + путь к корню + siblings
     * @param {string} blockId
     * @returns {Map<string, Object>}
     */
    collectAncestors(blockId) {
        const result = new Map();
        let current = this.blocks.get(blockId);

        while (current) {
            result.set(current.id, current);

            // Добавляем siblings (братья/сёстры)
            const parentId = current.parent_id;
            if (parentId) {
                const parent = this.blocks.get(parentId);
                if (parent) {
                    const siblingOrder = this._getChildOrder(parent);
                    for (const siblingId of siblingOrder) {
                        if (!result.has(siblingId)) {
                            const sibling = this.blocks.get(siblingId);
                            if (sibling) {
                                result.set(siblingId, sibling);
                            }
                        }
                    }
                }
            }

            // Переходим к родителю
            current = parentId ? this.blocks.get(parentId) : null;
        }

        return result;
    }

    /**
     * Scope: full - весь видимый граф (с лимитом)
     * @param {string} focusBlockId - блок в фокусе
     * @param {number} maxNodes - максимальное количество узлов
     * @returns {Map<string, Object>}
     */
    collectFull(focusBlockId, maxNodes = 100) {
        const result = new Map();

        // Находим корень текущего дерева
        let rootId = focusBlockId;
        let current = this.blocks.get(focusBlockId);
        while (current?.parent_id) {
            rootId = current.parent_id;
            current = this.blocks.get(current.parent_id);
        }

        // BFS обход с приоритетом близости к focusBlockId
        const queue = [rootId];
        const visited = new Set();

        while (queue.length > 0 && result.size < maxNodes) {
            const id = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);

            const block = this.blocks.get(id);
            if (!block) continue;

            result.set(id, block);

            const childOrder = this._getChildOrder(block);
            for (const childId of childOrder) {
                if (!visited.has(childId)) {
                    queue.push(childId);
                }
            }
        }

        return result;
    }

    // =====================================================
    // ENCODING FOR LLM
    // =====================================================

    /**
     * Кодирует блоки в формат snapshot v2
     * @param {Map<string, Object>} blocks - собранные блоки
     * @param {string} rootId - ID корневого блока в контексте
     * @returns {{ snapshot: Object, idMap: Object, reverseMap: Object }}
     */
    encodeForLLM(blocks, rootId) {
        if (!blocks || blocks.size === 0) {
            return { snapshot: null, idMap: {}, reverseMap: {} };
        }

        // 1. Детерминированный ID mapping (сортировка UUID)
        const sortedUuids = [...blocks.keys()].sort();
        const uuidToId = new Map();
        const idToUuid = new Map();

        sortedUuids.forEach((uuid, index) => {
            const id = index + 1;
            uuidToId.set(uuid, id);
            idToUuid.set(id, uuid);
        });

        // 2. Кодирование nodes: [id, parent_id, type, title, text]
        const nodes = [];
        for (const uuid of sortedUuids) {
            const block = blocks.get(uuid);
            const id = uuidToId.get(uuid);
            const parentId = block.parent_id && uuidToId.has(block.parent_id)
                ? uuidToId.get(block.parent_id)
                : 0;
            const type = this._normalizeBlockType(block.data?.type);
            const title = block.title || '';
            const text = this._htmlToText(block.data?.text || '').slice(0, MAX_TEXT_LENGTH);

            nodes.push([id, parentId, type, title, text]);
        }

        // 3. Кодирование orders: [id, [child_ids...]]
        const orders = [];
        for (const uuid of sortedUuids) {
            const block = blocks.get(uuid);
            const childOrder = this._getChildOrder(block);

            // Фильтруем только те дети, которые есть в контексте
            const mappedOrder = childOrder
                .filter(cid => uuidToId.has(cid))
                .map(cid => uuidToId.get(cid));

            if (mappedOrder.length > 0) {
                orders.push([uuidToId.get(uuid), mappedOrder]);
            }
        }

        // 4. Кодирование edges: [source_id, target_id, connection_type]
        const edges = [];
        const edgeSet = new Set(); // Для дедубликации

        for (const uuid of sortedUuids) {
            const block = blocks.get(uuid);
            const connections = block.data?.connections || [];

            for (const conn of connections) {
                const srcUuid = conn.sourceId;
                const tgtUuid = conn.targetId;

                // Включаем только связи внутри контекста
                if (!uuidToId.has(srcUuid) || !uuidToId.has(tgtUuid)) continue;

                const srcId = uuidToId.get(srcUuid);
                const tgtId = uuidToId.get(tgtUuid);

                const key = `${srcId}-${tgtId}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    const connType = this._normalizeConnectionType(conn.type || conn.connectionType);
                    edges.push([srcId, tgtId, connType]);
                }
            }
        }

        // Сортировка edges для стабильности
        edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        return {
            snapshot: {
                v: SNAPSHOT_VERSION,
                root: uuidToId.get(rootId) || 1,
                n: nodes,
                o: orders,
                e: edges
            },
            idMap: Object.fromEntries(uuidToId),
            reverseMap: Object.fromEntries(idToUuid)
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Получить childOrder из блока
     * @param {Object} block
     * @returns {string[]}
     */
    _getChildOrder(block) {
        // Приоритет: data.childOrder > children (parsed JSON) > []
        if (block.data?.childOrder && Array.isArray(block.data.childOrder)) {
            return block.data.childOrder;
        }

        // children может быть JSON строкой или массивом
        if (block.children) {
            if (Array.isArray(block.children)) {
                return block.children;
            }
            try {
                const parsed = JSON.parse(block.children);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        return [];
    }

    /**
     * Нормализовать тип блока
     * @param {string} type
     * @returns {string}
     */
    _normalizeBlockType(type) {
        if (!type) return DEFAULT_TYPE;
        const normalized = type.toLowerCase();
        return BLOCK_TYPES.has(normalized) ? normalized : DEFAULT_TYPE;
    }

    /**
     * Нормализовать тип соединения
     * @param {string} type
     * @returns {string}
     */
    _normalizeConnectionType(type) {
        if (!type) return CONNECTION_TYPES.DEFAULT;
        return CONNECTION_TYPE_VALUES.has(type) ? type : CONNECTION_TYPES.DEFAULT;
    }

    /**
     * Конвертировать HTML в plain text (с кэшированием)
     * @param {string} html
     * @returns {string}
     */
    _htmlToText(html) {
        if (!html) return '';

        // Проверяем кэш
        if (this._htmlCache.has(html)) {
            return this._htmlCache.get(html);
        }

        const result = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]+>/g, '')           // Remove all tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')        // Normalize multiple newlines
            .trim();

        // Сохраняем в кэш (с ограничением размера)
        if (this._htmlCache.size >= this._htmlCacheMaxSize) {
            // Удаляем первый элемент (простой LRU)
            const firstKey = this._htmlCache.keys().next().value;
            this._htmlCache.delete(firstKey);
        }
        this._htmlCache.set(html, result);

        return result;
    }

    /**
     * Оценить количество токенов в snapshot
     * @param {Object} snapshot
     * @returns {number}
     */
    estimateTokens(snapshot) {
        if (!snapshot) return 0;
        const json = JSON.stringify(snapshot);
        // Приблизительно 4 символа на токен
        return Math.ceil(json.length / 4);
    }

    /**
     * Получить подсказку о размере контекста
     * @param {string} scope
     * @param {string} focusBlockId
     * @returns {{ nodes: number, tokens: number, description: string }}
     */
    getContextSizeHint(scope, focusBlockId) {
        const { snapshot } = this.extractContext(scope, focusBlockId);

        if (!snapshot) {
            return { nodes: 0, tokens: 0, description: 'Нет данных' };
        }

        const nodes = snapshot.n?.length || 0;
        const tokens = this.estimateTokens(snapshot);

        const descriptions = {
            current: 'Текущий блок + дети',
            branch: 'Вся ветка',
            ancestors: 'Путь к корню',
            full: 'Весь граф'
        };

        return {
            nodes,
            tokens,
            description: descriptions[scope] || scope
        };
    }

    /**
     * Декодировать ID из snapshot обратно в UUID
     * @param {number} snapshotId - ID из snapshot
     * @param {Object} reverseMap - маппинг id → uuid
     * @returns {string|null}
     */
    decodeId(snapshotId, reverseMap) {
        return reverseMap[snapshotId] || null;
    }
}

// Фабричная функция для создания singleton с lazy initialization
let _instance = null;

/**
 * Получить singleton экземпляр GraphContextService
 * @param {Map} blocks - Map блоков (опционально для первой инициализации)
 * @returns {GraphContextService}
 */
export function getGraphContextService(blocks) {
    if (!_instance) {
        _instance = new GraphContextService(blocks || new Map());
    } else if (blocks) {
        _instance.setBlocks(blocks);
    }
    return _instance;
}

export default GraphContextService;
