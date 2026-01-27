/**
 * GraphPatchApplier - валидация и применение патчей от LLM к графу блоков
 *
 * Формат патча v2:
 * {
 *   "v": 2,
 *   "create": [{ id, parent, pos, type, title, text }],
 *   "edit": [{ id, title, type, text }],
 *   "move": [{ id, parent, pos }],
 *   "link_add": [[source_id, target_id, connection_type]],
 *   "link_del": [[source_id, target_id]]
 * }
 */

import { v4 as uuidv4 } from 'uuid';
import { dispatch } from '../utils/utils.js';
import { CONNECTION_TYPES, isValidConnectionType, getConnectionConfig } from '../controller/connectionTypes.js';

const PATCH_VERSION = 2;

// Performance limits
const MAX_OPERATIONS_WARNING = 20;  // Предупреждение при большом количестве операций
const MAX_OPERATIONS_LIMIT = 100;   // Жёсткий лимит операций

/**
 * Цвета для типов блоков (HSLA формат: [H, S, L, A])
 * Портировано из Python TYPE_COLOR_HSLA
 */
const TYPE_COLORS = {
    group: [0, 0, 80, 0],
    entity: [210, 80, 70, 0],
    concept: [270, 70, 75, 0],
    doc: [45, 80, 70, 0],
    process: [120, 60, 65, 0],
    step: [140, 50, 70, 0],
    decision: [30, 90, 65, 0],
    system: [200, 70, 60, 0],
    component: [180, 60, 65, 0],
    interface: [160, 55, 70, 0],
    data: [240, 60, 70, 0],
    task: [60, 80, 65, 0],
    issue: [0, 80, 65, 0],
    risk: [15, 85, 60, 0],
    metric: [280, 60, 70, 0],
    goal: [90, 70, 60, 0]
};

const DEFAULT_COLOR = [210, 80, 70, 0]; // entity color

export class GraphPatchApplier {
    /**
     * @param {Object} localStateManager - ссылка на localStateManager
     * @param {Object} undoManager - ссылка на undoManager
     */
    constructor(localStateManager, undoManager) {
        this.stateManager = localStateManager;
        this.undoManager = undoManager;
    }

    /**
     * Получить Map блоков из stateManager
     * @returns {Map}
     */
    get blocks() {
        return this.stateManager?.blocks || new Map();
    }

    // =====================================================
    // VALIDATION
    // =====================================================

    /**
     * Валидировать патч перед применением
     * @param {Object} patch - патч от LLM
     * @param {Object} reverseMap - маппинг id → uuid
     * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
     */
    validatePatch(patch, reverseMap) {
        const errors = [];
        const warnings = [];

        // Check version
        if (patch.v !== PATCH_VERSION) {
            warnings.push(`Patch version mismatch: expected ${PATCH_VERSION}, got ${patch.v}`);
        }

        // Performance check
        const totalOps = this._countOperations(patch);
        if (totalOps > MAX_OPERATIONS_LIMIT) {
            errors.push(`Патч содержит ${totalOps} операций, максимум ${MAX_OPERATIONS_LIMIT}`);
        } else if (totalOps > MAX_OPERATIONS_WARNING) {
            warnings.push(`Патч содержит ${totalOps} операций. Это может занять время.`);
        }

        // Собираем все ID которые будут существовать после patch.create
        const existingIds = new Set(Object.keys(reverseMap).map(Number));
        const createdIds = new Map(); // patchId → true

        // Validate CREATE
        const creates = patch.create || [];
        if (creates.length > 0) {
            const maxExisting = Math.max(...existingIds, 0);

            for (let i = 0; i < creates.length; i++) {
                const op = creates[i];
                const expectedId = maxExisting + 1 + i;

                // Проверяем что ID последовательные
                if (op.id !== expectedId) {
                    errors.push(`Create: ID ${op.id} should be ${expectedId} (consecutive from ${maxExisting})`);
                }

                // Проверяем что parent существует или будет создан
                if (op.parent !== 0) {
                    const parentExists = existingIds.has(op.parent) ||
                        creates.slice(0, i).some(c => c.id === op.parent);
                    if (!parentExists) {
                        errors.push(`Create: unknown parent ${op.parent} for block ${op.id}`);
                    }
                }

                createdIds.set(op.id, true);
            }
        }

        // Множество всех валидных ID (существующие + созданные)
        const allValidIds = new Set([...existingIds, ...createdIds.keys()]);

        // Validate EDIT
        for (const op of patch.edit || []) {
            if (!existingIds.has(op.id) && !createdIds.has(op.id)) {
                errors.push(`Edit: unknown block ${op.id}`);
            }
        }

        // Validate MOVE
        for (const op of patch.move || []) {
            if (!allValidIds.has(op.id)) {
                errors.push(`Move: unknown block ${op.id}`);
            }
            if (op.parent !== 0 && !allValidIds.has(op.parent)) {
                errors.push(`Move: unknown parent ${op.parent}`);
            }
            // Проверка на циклы
            if (op.id === op.parent) {
                errors.push(`Move: block ${op.id} cannot be its own parent`);
            }
        }

        // Validate LINK_ADD
        for (const edge of patch.link_add || []) {
            const [src, tgt, connType] = edge;
            if (!allValidIds.has(src)) {
                errors.push(`link_add: unknown source ${src}`);
            }
            if (!allValidIds.has(tgt)) {
                errors.push(`link_add: unknown target ${tgt}`);
            }
            if (connType && !isValidConnectionType(connType)) {
                warnings.push(`link_add: unknown connection type "${connType}", will use default`);
            }
        }

        // Validate LINK_DEL
        for (const edge of patch.link_del || []) {
            const [src, tgt] = edge;
            if (!existingIds.has(src)) {
                errors.push(`link_del: unknown source ${src}`);
            }
            if (!existingIds.has(tgt)) {
                errors.push(`link_del: unknown target ${tgt}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    // =====================================================
    // PREVIEW
    // =====================================================

    /**
     * Генерировать preview изменений для UI
     * @param {Object} patch - патч от LLM
     * @param {Object} reverseMap - маппинг id → uuid
     * @returns {Array<{ type: string, icon: string, description: string, blockId?: string, data: Object }>}
     */
    previewChanges(patch, reverseMap) {
        const changes = [];

        // CREATE operations
        for (const op of patch.create || []) {
            const parentTitle = this._getBlockTitle(reverseMap[op.parent]);
            changes.push({
                type: 'create',
                icon: '➕',
                description: `Создать "${op.title || 'Без названия'}" в "${parentTitle || 'корне'}"`,
                data: op
            });
        }

        // EDIT operations
        for (const op of patch.edit || []) {
            const uuid = reverseMap[op.id];
            const title = this._getBlockTitle(uuid);
            const fields = [];
            if (op.title !== undefined) fields.push('название');
            if (op.text !== undefined) fields.push('текст');
            if (op.type !== undefined) fields.push('тип');

            changes.push({
                type: 'edit',
                icon: '✏️',
                description: `Изменить "${title}": ${fields.join(', ')}`,
                blockId: uuid,
                data: op
            });
        }

        // MOVE operations
        for (const op of patch.move || []) {
            const uuid = reverseMap[op.id];
            const title = this._getBlockTitle(uuid);
            const newParentTitle = this._getBlockTitle(reverseMap[op.parent]);

            changes.push({
                type: 'move',
                icon: '📦',
                description: `Переместить "${title}" в "${newParentTitle || 'корень'}"`,
                blockId: uuid,
                data: op
            });
        }

        // LINK_ADD operations
        for (const edge of patch.link_add || []) {
            const [src, tgt, connType] = edge;
            const srcTitle = this._getBlockTitle(reverseMap[src]);
            const tgtTitle = this._getBlockTitle(reverseMap[tgt]);

            changes.push({
                type: 'link_add',
                icon: '🔗',
                description: `Связь: "${srcTitle}" → "${tgtTitle}" (${connType || 'default'})`,
                data: { src, tgt, connType }
            });
        }

        // LINK_DEL operations
        for (const edge of patch.link_del || []) {
            const [src, tgt] = edge;
            const srcTitle = this._getBlockTitle(reverseMap[src]);
            const tgtTitle = this._getBlockTitle(reverseMap[tgt]);

            changes.push({
                type: 'link_del',
                icon: '🔗❌',
                description: `Удалить связь: "${srcTitle}" → "${tgtTitle}"`,
                data: { src, tgt }
            });
        }

        return changes;
    }

    // =====================================================
    // APPLY PATCH
    // =====================================================

    /**
     * Применить патч к графу
     * @param {Object} patch - патч от LLM
     * @param {Object} reverseMap - маппинг id → uuid
     * @returns {Promise<{ success: boolean, createdIds: Object, error?: string }>}
     */
    async applyPatch(patch, reverseMap) {
        const createdIds = new Map(); // patchId → uuid

        try {
            // Phase 1: CREATE
            for (const op of patch.create || []) {
                const uuid = uuidv4();
                createdIds.set(op.id, uuid);

                // Резолвим parent UUID
                const parentUuid = op.parent === 0 ? null
                    : (createdIds.get(op.parent) || reverseMap[op.parent]);

                const newBlock = {
                    id: uuid,
                    parent_id: parentUuid,
                    title: op.title || '',
                    children: [],
                    updated_at: Date.now(),
                    data: {
                        text: this._textToHtml(op.text || ''),
                        type: op.type || 'entity',
                        childOrder: [],
                        color: TYPE_COLORS[op.type] || DEFAULT_COLOR
                    }
                };

                await this.stateManager.saveBlock(newBlock);

                // Обновляем children и childOrder родителя
                if (parentUuid) {
                    const parent = this.blocks.get(parentUuid);
                    if (parent) {
                        // children — локальный кеш, должен быть синхронизирован с childOrder
                        if (!parent.children) parent.children = [];
                        if (!parent.children.includes(uuid)) {
                            parent.children.push(uuid);
                        }

                        const childOrder = [...(parent.data?.childOrder || [])];
                        if (op.pos != null && op.pos >= 0 && op.pos < childOrder.length) {
                            childOrder.splice(op.pos, 0, uuid);
                        } else {
                            childOrder.push(uuid);
                        }
                        parent.data = { ...parent.data, childOrder };
                        await this.stateManager.saveBlock(parent);
                    }
                }
            }

            // Phase 2: EDIT
            for (const op of patch.edit || []) {
                const uuid = createdIds.get(op.id) || reverseMap[op.id];
                const block = this.blocks.get(uuid);
                if (!block) continue;

                if (op.title !== undefined) {
                    block.title = op.title;
                }
                if (op.text !== undefined) {
                    block.data = { ...block.data, text: this._textToHtml(op.text) };
                }
                if (op.type !== undefined) {
                    block.data = {
                        ...block.data,
                        type: op.type,
                        color: TYPE_COLORS[op.type] || block.data?.color || DEFAULT_COLOR
                    };
                }

                block.updated_at = Date.now();
                await this.stateManager.saveBlock(block);
            }

            // Phase 3: MOVE
            for (const op of patch.move || []) {
                const uuid = createdIds.get(op.id) || reverseMap[op.id];
                const block = this.blocks.get(uuid);
                if (!block) continue;

                const oldParentUuid = block.parent_id;
                const newParentUuid = op.parent === 0 ? null
                    : (createdIds.get(op.parent) || reverseMap[op.parent]);

                // Skip if same parent and no position change
                if (oldParentUuid === newParentUuid && op.pos == null) continue;

                // Remove from old parent's childOrder
                if (oldParentUuid) {
                    const oldParent = this.blocks.get(oldParentUuid);
                    if (oldParent) {
                        const oldChildOrder = (oldParent.data?.childOrder || [])
                            .filter(id => id !== uuid);
                        oldParent.data = { ...oldParent.data, childOrder: oldChildOrder };
                        await this.stateManager.saveBlock(oldParent);
                    }
                }

                // Update block's parent_id
                block.parent_id = newParentUuid;
                block.updated_at = Date.now();

                // Add to new parent's childOrder
                if (newParentUuid) {
                    const newParent = this.blocks.get(newParentUuid);
                    if (newParent) {
                        const newChildOrder = [...(newParent.data?.childOrder || [])];
                        if (op.pos != null && op.pos >= 0 && op.pos <= newChildOrder.length) {
                            newChildOrder.splice(op.pos, 0, uuid);
                        } else {
                            newChildOrder.push(uuid);
                        }
                        newParent.data = { ...newParent.data, childOrder: newChildOrder };
                        await this.stateManager.saveBlock(newParent);
                    }
                }

                await this.stateManager.saveBlock(block);
            }

            // Phase 4: LINK_DEL
            for (const edge of patch.link_del || []) {
                const [src, tgt] = edge;
                const srcUuid = createdIds.get(src) || reverseMap[src];
                const tgtUuid = createdIds.get(tgt) || reverseMap[tgt];

                // Connections хранятся в source блоке
                const block = this.blocks.get(srcUuid);
                if (!block) continue;

                const connections = (block.data?.connections || [])
                    .filter(c => !(c.sourceId === srcUuid && c.targetId === tgtUuid));

                block.data = { ...block.data, connections };
                block.updated_at = Date.now();
                await this.stateManager.saveBlock(block);
            }

            // Phase 5: LINK_ADD
            for (const edge of patch.link_add || []) {
                const [src, tgt, connType] = edge;
                const srcUuid = createdIds.get(src) || reverseMap[src];
                const tgtUuid = createdIds.get(tgt) || reverseMap[tgt];

                const block = this.blocks.get(srcUuid);
                if (!block) continue;

                const connections = block.data?.connections || [];

                // Check if connection already exists
                const exists = connections.some(c =>
                    c.sourceId === srcUuid && c.targetId === tgtUuid);
                if (exists) continue;

                connections.push(this._createConnection(srcUuid, tgtUuid, connType || CONNECTION_TYPES.DEFAULT));
                block.data = { ...block.data, connections };
                block.updated_at = Date.now();
                await this.stateManager.saveBlock(block);
            }

            return {
                success: true,
                createdIds: Object.fromEntries(createdIds)
            };

        } catch (error) {
            console.error('GraphPatchApplier.applyPatch error:', error);
            return {
                success: false,
                createdIds: Object.fromEntries(createdIds),
                error: error.message
            };
        }
    }

    /**
     * Применить патч с поддержкой Undo
     * @param {Object} patch - патч от LLM
     * @param {Object} reverseMap - маппинг id → uuid
     * @returns {Promise<{ success: boolean, createdIds: Object, error?: string }>}
     */
    async applyPatchWithUndo(patch, reverseMap) {
        // Записываем состояния "до" для всех затронутых блоков
        const beforeStates = new Map();

        // Собираем ID всех блоков которые будут изменены
        const affectedBlockIds = new Set();

        for (const op of patch.edit || []) {
            affectedBlockIds.add(reverseMap[op.id]);
        }
        for (const op of patch.move || []) {
            const uuid = reverseMap[op.id];
            affectedBlockIds.add(uuid);
            const block = this.blocks.get(uuid);
            if (block?.parent_id) affectedBlockIds.add(block.parent_id);
            if (op.parent !== 0) affectedBlockIds.add(reverseMap[op.parent]);
        }
        for (const op of patch.create || []) {
            if (op.parent !== 0) affectedBlockIds.add(reverseMap[op.parent]);
        }
        for (const edge of patch.link_del || []) {
            affectedBlockIds.add(reverseMap[edge[0]]);
        }
        for (const edge of patch.link_add || []) {
            affectedBlockIds.add(reverseMap[edge[0]]);
        }

        // Сохраняем состояния "до" (используем быстрое клонирование)
        for (const uuid of affectedBlockIds) {
            if (uuid) {
                const block = this.blocks.get(uuid);
                if (block) {
                    beforeStates.set(uuid, this._deepClone(block));
                }
            }
        }

        // Применяем патч
        const result = await this.applyPatch(patch, reverseMap);

        if (result.success) {
            // Записываем в undoManager каждое изменение
            // Для простоты записываем как batch edit
            for (const [uuid, beforeState] of beforeStates) {
                const afterState = this.blocks.get(uuid);
                if (afterState && this.undoManager) {
                    this.undoManager.recordEdit(uuid, beforeState, afterState);
                }
            }

            // Записываем создания
            for (const op of patch.create || []) {
                const uuid = result.createdIds[op.id];
                const parentUuid = op.parent === 0 ? null
                    : (result.createdIds[op.parent] || reverseMap[op.parent]);
                const block = this.blocks.get(uuid);

                if (block && this.undoManager) {
                    this.undoManager.recordCreate(uuid, parentUuid, block);
                }
            }

            // Trigger re-render
            dispatch('ShowBlocks');
        }

        return result;
    }

    // =====================================================
    // HELPERS
    // =====================================================

    /**
     * Получить название блока по UUID
     * @param {string} uuid
     * @returns {string}
     */
    _getBlockTitle(uuid) {
        if (!uuid) return '';
        const block = this.blocks.get(uuid);
        if (!block) return '';
        return block.title || 'Без названия';
    }

    /**
     * Конвертировать plain text в HTML
     * @param {string} text
     * @returns {string}
     */
    _textToHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');
    }

    /**
     * Создать объект connection
     * @param {string} sourceId - UUID источника
     * @param {string} targetId - UUID цели
     * @param {string} type - тип соединения
     * @returns {Object}
     */
    _createConnection(sourceId, targetId, type) {
        return {
            id: uuidv4(),
            sourceId,
            targetId,
            type: isValidConnectionType(type) ? type : CONNECTION_TYPES.DEFAULT,
            connectionType: type, // legacy field
            label: ''
        };
    }

    /**
     * Получить статистику патча
     * @param {Object} patch
     * @returns {{ creates: number, edits: number, moves: number, linksAdded: number, linksDeleted: number }}
     */
    getPatchStats(patch) {
        return {
            creates: (patch.create || []).length,
            edits: (patch.edit || []).length,
            moves: (patch.move || []).length,
            linksAdded: (patch.link_add || []).length,
            linksDeleted: (patch.link_del || []).length
        };
    }

    /**
     * Подсчитать общее количество операций в патче
     * @param {Object} patch
     * @returns {number}
     */
    _countOperations(patch) {
        return (patch.create || []).length +
               (patch.edit || []).length +
               (patch.move || []).length +
               (patch.link_add || []).length +
               (patch.link_del || []).length;
    }

    /**
     * Быстрое клонирование объекта (использует structuredClone если доступен)
     * @param {Object} obj
     * @returns {Object}
     */
    _deepClone(obj) {
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        }
        return JSON.parse(JSON.stringify(obj));
    }
}

// Фабричная функция для создания singleton
let _instance = null;

/**
 * Получить singleton экземпляр GraphPatchApplier
 * @param {Object} localStateManager
 * @param {Object} undoManager
 * @returns {GraphPatchApplier}
 */
export function getGraphPatchApplier(localStateManager, undoManager) {
    if (!_instance && localStateManager) {
        _instance = new GraphPatchApplier(localStateManager, undoManager);
    }
    return _instance;
}

export default GraphPatchApplier;
