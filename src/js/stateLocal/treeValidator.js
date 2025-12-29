/**
 * TreeValidator - валидация и восстановление целостности дерева блоков
 *
 * Проверяет:
 * 1. Соответствие parent_id <-> children
 * 2. Синхронизация children и childOrder
 * 3. Отсутствие "висячих" ссылок (orphaned references)
 * 4. Отсутствие циклических ссылок
 */

/**
 * Нормализует parent_id, преобразуя строку "None" или "null" в null
 * Backend (Python) иногда отправляет None как строку
 * @param {*} parentId - Значение parent_id
 * @returns {string|null} Нормализованный parent_id
 */
function normalizeParentId(parentId) {
    if (parentId === 'None' || parentId === 'null' || parentId === '') {
        return null;
    }
    return parentId || null;
}

export class TreeValidator {
    constructor() {
        this.issues = [];
    }

    /**
     * Полная валидация дерева блоков
     * @param {Map<string, Object>} blocks - Map всех блоков
     * @returns {Object} результат валидации с найденными проблемами
     */
    validate(blocks) {
        this.issues = [];

        if (!blocks || blocks.size === 0) {
            return { valid: true, issues: [] };
        }

        for (const [blockId, block] of blocks) {
            this._validateBlock(block, blocks);
        }

        return {
            valid: this.issues.length === 0,
            issues: this.issues
        };
    }

    /**
     * Валидация одного блока
     */
    _validateBlock(block, blocks) {
        if (!block || !block.id) {
            this.issues.push({
                type: 'INVALID_BLOCK',
                severity: 'error',
                message: 'Блок без id',
                block: block
            });
            return;
        }

        // 1. Проверка parent_id -> родитель должен иметь этот блок в children
        // Нормализуем parent_id: строка "None" считается как отсутствие родителя
        const parentId = normalizeParentId(block.parent_id);
        if (parentId) {
            const parent = blocks.get(parentId);
            if (!parent) {
                this.issues.push({
                    type: 'ORPHAN_PARENT_REF',
                    severity: 'warning',
                    blockId: block.id,
                    parentId: parentId,
                    message: `Блок ${block.id} ссылается на несуществующего родителя ${parentId}`
                });
            } else if (!parent.children?.includes(block.id)) {
                this.issues.push({
                    type: 'PARENT_CHILD_MISMATCH',
                    severity: 'error',
                    blockId: block.id,
                    parentId: parentId,
                    message: `Блок ${block.id} имеет parent_id=${parentId}, но родитель не имеет его в children`
                });
            }
        }

        // 2. Проверка children -> каждый child должен иметь parent_id = этот блок
        if (Array.isArray(block.children)) {
            for (const childId of block.children) {
                const child = blocks.get(childId);
                if (!child) {
                    this.issues.push({
                        type: 'ORPHAN_CHILD_REF',
                        severity: 'error',
                        blockId: block.id,
                        childId: childId,
                        message: `Блок ${block.id} имеет в children несуществующий блок ${childId}`
                    });
                } else {
                    // Нормализуем parent_id ребёнка
                    const childParentId = normalizeParentId(child.parent_id);
                    if (childParentId !== block.id) {
                        this.issues.push({
                            type: 'CHILD_PARENT_MISMATCH',
                            severity: 'error',
                            blockId: block.id,
                            childId: childId,
                            actualParentId: childParentId,
                            message: `Блок ${childId} указан в children блока ${block.id}, но его parent_id=${childParentId}`
                        });
                    }
                }
            }
        }

        // 3. Проверка синхронизации children и childOrder
        const children = block.children || [];
        const childOrder = block.data?.childOrder || [];

        // childOrder содержит блоки, которых нет в children
        const extraInOrder = childOrder.filter(id => !children.includes(id));
        if (extraInOrder.length > 0) {
            this.issues.push({
                type: 'CHILDORDER_EXTRA',
                severity: 'error',
                blockId: block.id,
                extraIds: extraInOrder,
                message: `В childOrder блока ${block.id} есть блоки, отсутствующие в children: ${extraInOrder.join(', ')}`
            });
        }

        // children содержит блоки, которых нет в childOrder
        const missingInOrder = children.filter(id => !childOrder.includes(id));
        if (missingInOrder.length > 0) {
            this.issues.push({
                type: 'CHILDORDER_MISSING',
                severity: 'warning',
                blockId: block.id,
                missingIds: missingInOrder,
                message: `В children блока ${block.id} есть блоки, отсутствующие в childOrder: ${missingInOrder.join(', ')}`
            });
        }

        // 4. Проверка на дубликаты
        const childrenSet = new Set(children);
        if (childrenSet.size !== children.length) {
            this.issues.push({
                type: 'DUPLICATE_CHILDREN',
                severity: 'error',
                blockId: block.id,
                message: `В children блока ${block.id} есть дубликаты`
            });
        }

        const childOrderSet = new Set(childOrder);
        if (childOrderSet.size !== childOrder.length) {
            this.issues.push({
                type: 'DUPLICATE_CHILDORDER',
                severity: 'error',
                blockId: block.id,
                message: `В childOrder блока ${block.id} есть дубликаты`
            });
        }
    }

    /**
     * Проверка на циклические ссылки
     * @param {Map<string, Object>} blocks
     * @returns {Array} массив найденных циклов
     */
    detectCycles(blocks) {
        const cycles = [];
        const visited = new Set();
        const inStack = new Set();

        const dfs = (blockId, path) => {
            if (inStack.has(blockId)) {
                const cycleStart = path.indexOf(blockId);
                cycles.push(path.slice(cycleStart));
                return;
            }
            if (visited.has(blockId)) return;

            visited.add(blockId);
            inStack.add(blockId);
            path.push(blockId);

            const block = blocks.get(blockId);
            if (block?.children) {
                for (const childId of block.children) {
                    dfs(childId, [...path]);
                }
            }

            inStack.delete(blockId);
        };

        for (const blockId of blocks.keys()) {
            if (!visited.has(blockId)) {
                dfs(blockId, []);
            }
        }

        return cycles;
    }

    /**
     * Автоматическое восстановление целостности дерева
     *
     * Стратегия определения "правильной" связи при конфликте parent_id <-> children:
     * 1. Если блок не существует — удаляем ссылку
     * 2. Если есть конфликт — доверяем более "свежему" блоку (по updated_at)
     * 3. Если updated_at одинаковый или отсутствует — доверяем parent_id ребёнка
     *
     * @param {Map<string, Object>} blocks - Map всех блоков
     * @returns {Object} результат восстановления
     */
    repair(blocks) {
        const repaired = {
            parentChildFixed: 0,
            childParentFixed: 0,
            parentIdFixed: 0,
            orphanChildrenRemoved: 0,
            childOrderSynced: 0,
            duplicatesRemoved: 0,
            modifiedBlocks: new Set(),
            decisions: [] // для отладки — какие решения были приняты
        };

        if (!blocks || blocks.size === 0) {
            return repaired;
        }

        // Вспомогательная функция для сравнения дат
        const getTimestamp = (block) => {
            if (!block?.updated_at) return 0;
            return new Date(block.updated_at).getTime() || 0;
        };

        // Первый проход: находим все конфликты и решаем их
        // Структура: childId -> { correctParentId, reason }
        const resolvedParents = new Map();

        for (const [blockId, block] of blocks) {
            if (!Array.isArray(block.children)) continue;

            for (const childId of block.children) {
                const child = blocks.get(childId);
                if (!child) continue;

                // Нормализуем parent_id ребёнка
                const childParentId = normalizeParentId(child.parent_id);

                // Если parent_id совпадает — всё ок
                if (childParentId === blockId) {
                    resolvedParents.set(childId, { correctParentId: blockId, reason: 'match' });
                    continue;
                }

                // Конфликт: блок в children родителя, но child.parent_id указывает на другого
                const claimedParent = childParentId ? blocks.get(childParentId) : null;
                const parentTimestamp = getTimestamp(block);
                const childTimestamp = getTimestamp(child);
                const claimedParentTimestamp = claimedParent ? getTimestamp(claimedParent) : 0;

                let correctParentId;
                let reason;

                // Если claimed parent не существует — доверяем текущему родителю
                if (!claimedParent && childParentId) {
                    correctParentId = blockId;
                    reason = 'claimed_parent_missing';
                }
                // Если child свежее родителя — доверяем child.parent_id
                else if (childTimestamp > parentTimestamp) {
                    correctParentId = childParentId;
                    reason = `child_newer (child: ${child.updated_at}, parent: ${block.updated_at})`;
                }
                // Если родитель свежее ребёнка — доверяем children родителя
                else if (parentTimestamp > childTimestamp) {
                    correctParentId = blockId;
                    reason = `parent_newer (parent: ${block.updated_at}, child: ${child.updated_at})`;
                }
                // Если claimed parent свежее всех — доверяем ему
                else if (claimedParentTimestamp > parentTimestamp && claimedParentTimestamp > childTimestamp) {
                    correctParentId = childParentId;
                    reason = `claimed_parent_newest`;
                }
                // По умолчанию — доверяем parent_id ребёнка (он обычно обновляется при перемещении)
                else {
                    correctParentId = childParentId;
                    reason = 'default_trust_child_parent_id';
                }

                // Сохраняем только если ещё не решено или это первый конфликт
                if (!resolvedParents.has(childId)) {
                    resolvedParents.set(childId, { correctParentId, reason });
                    repaired.decisions.push({
                        childId,
                        inChildrenOf: blockId,
                        childParentId: childParentId,
                        resolved: correctParentId,
                        reason
                    });
                }
            }
        }

        // Второй проход: применяем решения
        for (const [blockId, block] of blocks) {
            let modified = false;

            // 1. Фильтруем children — оставляем только блоки, для которых мы — правильный родитель
            const newChildren = [];
            for (const childId of (block.children || [])) {
                const child = blocks.get(childId);

                // Блок не существует — удаляем
                if (!child) {
                    repaired.orphanChildrenRemoved++;
                    modified = true;
                    continue;
                }

                // Проверяем решение
                const resolution = resolvedParents.get(childId);
                // Нормализуем parent_id ребёнка
                const childParentId = normalizeParentId(child.parent_id);
                if (resolution && resolution.correctParentId === blockId) {
                    newChildren.push(childId);
                    // Если parent_id ребёнка неправильный — исправляем
                    if (childParentId !== blockId) {
                        child.parent_id = blockId;
                        repaired.parentIdFixed++;
                        repaired.modifiedBlocks.add(childId);
                    }
                } else if (resolution && resolution.correctParentId !== blockId) {
                    // Этот блок не должен быть в наших children
                    repaired.childParentFixed++;
                    modified = true;
                } else if (!resolution && childParentId === blockId) {
                    // Нет конфликта, связь корректна
                    newChildren.push(childId);
                } else if (!resolution && childParentId !== blockId) {
                    // Блок указывает на другого родителя — удаляем из наших children
                    repaired.childParentFixed++;
                    modified = true;
                }
            }

            // 2. Добавляем блоки, которые ссылаются на нас как родителя, но не в children
            for (const [childId, child] of blocks) {
                const childParentId = normalizeParentId(child.parent_id);
                if (childParentId === blockId && !newChildren.includes(childId)) {
                    const resolution = resolvedParents.get(childId);
                    // Добавляем если нет конфликта или мы — правильный родитель
                    if (!resolution || resolution.correctParentId === blockId) {
                        newChildren.push(childId);
                        repaired.parentChildFixed++;
                        modified = true;
                    }
                }
            }

            // 3. Удаляем дубликаты
            const uniqueChildren = [...new Set(newChildren)];
            if (uniqueChildren.length !== newChildren.length) {
                repaired.duplicatesRemoved++;
                modified = true;
            }

            if (JSON.stringify(uniqueChildren) !== JSON.stringify(block.children)) {
                block.children = uniqueChildren;
                modified = true;
            }

            // 4. Синхронизируем childOrder с children
            if (!block.data) {
                block.data = {};
            }

            const currentChildOrder = block.data.childOrder || [];

            // Фильтруем childOrder — оставляем только существующие в children
            const validChildOrder = currentChildOrder.filter(id => block.children.includes(id));

            // Добавляем в конец детей, которых нет в childOrder
            const missingInOrder = block.children.filter(id => !validChildOrder.includes(id));
            const newChildOrder = [...validChildOrder, ...missingInOrder];

            // Удаляем дубликаты
            const uniqueChildOrder = [...new Set(newChildOrder)];

            if (JSON.stringify(uniqueChildOrder) !== JSON.stringify(block.data.childOrder)) {
                block.data.childOrder = uniqueChildOrder;
                repaired.childOrderSynced++;
                modified = true;
            }

            if (modified) {
                repaired.modifiedBlocks.add(blockId);
            }
        }

        // Логируем принятые решения для отладки
        if (repaired.decisions.length > 0) {
            console.group('🔍 Решения по конфликтам parent-child:');
            console.table(repaired.decisions);
            console.groupEnd();
        }

        return repaired;
    }

    /**
     * Валидация и восстановление с отчетом
     * @param {Map<string, Object>} blocks
     * @returns {Object} полный отчет
     */
    validateAndRepair(blocks) {
        // Сначала валидация
        const validationBefore = this.validate(blocks);

        if (validationBefore.valid) {
            return {
                wasValid: true,
                repaired: false,
                issuesBefore: [],
                issuesAfter: [],
                repairs: null
            };
        }

        // Потом восстановление
        const repairs = this.repair(blocks);

        // Повторная валидация
        const validationAfter = this.validate(blocks);

        return {
            wasValid: false,
            repaired: repairs.modifiedBlocks.size > 0,
            issuesBefore: validationBefore.issues,
            issuesAfter: validationAfter.issues,
            repairs: repairs
        };
    }

    /**
     * Форматированный отчет о проблемах
     */
    formatReport(result) {
        const lines = [];

        if (result.wasValid) {
            lines.push('✓ Дерево блоков валидно');
            return lines.join('\n');
        }

        lines.push(`⚠ Найдено проблем: ${result.issuesBefore.length}`);

        // Группируем по типу
        const byType = {};
        for (const issue of result.issuesBefore) {
            if (!byType[issue.type]) byType[issue.type] = [];
            byType[issue.type].push(issue);
        }

        for (const [type, issues] of Object.entries(byType)) {
            lines.push(`  ${type}: ${issues.length}`);
        }

        if (result.repaired) {
            lines.push('');
            lines.push('Восстановление:');
            const r = result.repairs;
            if (r.parentChildFixed) lines.push(`  - Добавлено в children: ${r.parentChildFixed}`);
            if (r.childParentFixed) lines.push(`  - Удалено из children (неверный parent): ${r.childParentFixed}`);
            if (r.parentIdFixed) lines.push(`  - Исправлено parent_id: ${r.parentIdFixed}`);
            if (r.orphanChildrenRemoved) lines.push(`  - Удалено "висячих" ссылок: ${r.orphanChildrenRemoved}`);
            if (r.childOrderSynced) lines.push(`  - Синхронизировано childOrder: ${r.childOrderSynced}`);
            if (r.duplicatesRemoved) lines.push(`  - Удалено дубликатов: ${r.duplicatesRemoved}`);
            lines.push(`  Изменено блоков: ${r.modifiedBlocks.size}`);
        }

        if (result.issuesAfter.length > 0) {
            lines.push('');
            lines.push(`⚠ Осталось нерешенных проблем: ${result.issuesAfter.length}`);
            for (const issue of result.issuesAfter.slice(0, 5)) {
                lines.push(`  - ${issue.message}`);
            }
            if (result.issuesAfter.length > 5) {
                lines.push(`  ... и еще ${result.issuesAfter.length - 5}`);
            }
        } else if (result.repaired) {
            lines.push('');
            lines.push('✓ Все проблемы исправлены');
        }

        return lines.join('\n');
    }
}

export const treeValidator = new TreeValidator();
