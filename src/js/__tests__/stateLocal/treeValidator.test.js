import { TreeValidator, treeValidator } from '../../stateLocal/treeValidator';

describe('TreeValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new TreeValidator();
    });

    describe('validate', () => {
        it('должен возвращать valid=true для пустого Map', () => {
            const blocks = new Map();
            const result = validator.validate(blocks);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('должен возвращать valid=true для корректного дерева', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child1', 'child2'], data: { childOrder: ['child1', 'child2'] } }],
                ['child1', { id: 'child1', parent_id: 'root', children: [], data: { childOrder: [] } }],
                ['child2', { id: 'child2', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('должен находить PARENT_CHILD_MISMATCH когда child ссылается на родителя, но не в children', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: [], data: { childOrder: [] } }],
                ['orphan', { id: 'orphan', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'PARENT_CHILD_MISMATCH')).toBe(true);
        });

        it('должен находить ORPHAN_CHILD_REF когда children содержит несуществующий блок', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['missing'], data: { childOrder: ['missing'] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'ORPHAN_CHILD_REF')).toBe(true);
        });

        it('должен находить CHILD_PARENT_MISMATCH когда child имеет неверный parent_id', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child'], data: { childOrder: ['child'] } }],
                ['other', { id: 'other', parent_id: null, children: [], data: { childOrder: [] } }],
                ['child', { id: 'child', parent_id: 'other', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'CHILD_PARENT_MISMATCH')).toBe(true);
        });

        it('должен находить CHILDORDER_EXTRA когда childOrder содержит лишние блоки', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child1'], data: { childOrder: ['child1', 'extra'] } }],
                ['child1', { id: 'child1', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'CHILDORDER_EXTRA')).toBe(true);
        });

        it('должен находить CHILDORDER_MISSING когда в childOrder отсутствуют дети', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child1', 'child2'], data: { childOrder: ['child1'] } }],
                ['child1', { id: 'child1', parent_id: 'root', children: [], data: { childOrder: [] } }],
                ['child2', { id: 'child2', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'CHILDORDER_MISSING')).toBe(true);
        });

        it('должен находить DUPLICATE_CHILDREN', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child', 'child'], data: { childOrder: ['child'] } }],
                ['child', { id: 'child', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validate(blocks);
            expect(result.valid).toBe(false);
            expect(result.issues.some(i => i.type === 'DUPLICATE_CHILDREN')).toBe(true);
        });
    });

    describe('detectCycles', () => {
        it('не должен находить циклы в корректном дереве', () => {
            const blocks = new Map([
                ['root', { id: 'root', children: ['child'] }],
                ['child', { id: 'child', children: [] }],
            ]);
            const cycles = validator.detectCycles(blocks);
            expect(cycles).toHaveLength(0);
        });

        it('должен находить простой цикл', () => {
            const blocks = new Map([
                ['a', { id: 'a', children: ['b'] }],
                ['b', { id: 'b', children: ['a'] }],
            ]);
            const cycles = validator.detectCycles(blocks);
            expect(cycles.length).toBeGreaterThan(0);
        });
    });

    describe('repair', () => {
        it('должен добавлять блок в children родителя если parent_id указан', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: [], data: { childOrder: [] } }],
                ['orphan', { id: 'orphan', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.repair(blocks);
            expect(result.parentChildFixed).toBeGreaterThan(0);
            expect(blocks.get('root').children).toContain('orphan');
        });

        it('должен удалять несуществующий блок из children', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['missing'], data: { childOrder: ['missing'] } }],
            ]);
            const result = validator.repair(blocks);
            expect(result.orphanChildrenRemoved).toBeGreaterThan(0);
            expect(blocks.get('root').children).not.toContain('missing');
        });

        it('должен синхронизировать childOrder с children', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child1', 'child2'], data: { childOrder: ['child1'] } }],
                ['child1', { id: 'child1', parent_id: 'root', children: [], data: { childOrder: [] } }],
                ['child2', { id: 'child2', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.repair(blocks);
            expect(result.childOrderSynced).toBeGreaterThan(0);
            expect(blocks.get('root').data.childOrder).toContain('child2');
        });

        it('должен удалять дубликаты из children', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child', 'child'], data: { childOrder: ['child'] } }],
                ['child', { id: 'child', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            validator.repair(blocks);
            expect(blocks.get('root').children).toEqual(['child']);
        });

        it('должен доверять child.parent_id если child свежее (updated_at)', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child'], data: { childOrder: ['child'] }, updated_at: '2024-01-01T00:00:00Z' }],
                ['other', { id: 'other', parent_id: null, children: [], data: { childOrder: [] }, updated_at: '2024-01-01T00:00:00Z' }],
                ['child', { id: 'child', parent_id: 'other', children: [], data: { childOrder: [] }, updated_at: '2024-01-02T00:00:00Z' }],
            ]);
            validator.repair(blocks);
            // child свежее, значит доверяем его parent_id = 'other'
            expect(blocks.get('root').children).not.toContain('child');
            expect(blocks.get('other').children).toContain('child');
        });

        it('должен доверять children родителя если родитель свежее (updated_at)', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child'], data: { childOrder: ['child'] }, updated_at: '2024-01-02T00:00:00Z' }],
                ['other', { id: 'other', parent_id: null, children: [], data: { childOrder: [] }, updated_at: '2024-01-01T00:00:00Z' }],
                ['child', { id: 'child', parent_id: 'other', children: [], data: { childOrder: [] }, updated_at: '2024-01-01T00:00:00Z' }],
            ]);
            validator.repair(blocks);
            // root свежее, значит child должен быть в его children, а parent_id child исправлен
            expect(blocks.get('root').children).toContain('child');
            expect(blocks.get('child').parent_id).toBe('root');
        });

        it('должен доверять parent_id по умолчанию при равных датах', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child'], data: { childOrder: ['child'] } }],
                ['other', { id: 'other', parent_id: null, children: [], data: { childOrder: [] } }],
                ['child', { id: 'child', parent_id: 'other', children: [], data: { childOrder: [] } }],
            ]);
            validator.repair(blocks);
            // Без updated_at доверяем parent_id ребёнка
            expect(blocks.get('root').children).not.toContain('child');
            expect(blocks.get('other').children).toContain('child');
        });

        it('должен записывать decisions для отладки', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: ['child'], data: { childOrder: ['child'] } }],
                ['other', { id: 'other', parent_id: null, children: [], data: { childOrder: [] } }],
                ['child', { id: 'child', parent_id: 'other', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.repair(blocks);
            expect(result.decisions.length).toBeGreaterThan(0);
            expect(result.decisions[0]).toHaveProperty('childId');
            expect(result.decisions[0]).toHaveProperty('reason');
        });
    });

    describe('validateAndRepair', () => {
        it('должен возвращать wasValid=true для валидного дерева', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validateAndRepair(blocks);
            expect(result.wasValid).toBe(true);
            expect(result.repaired).toBe(false);
        });

        it('должен исправлять проблемы и возвращать информацию', () => {
            const blocks = new Map([
                ['root', { id: 'root', parent_id: null, children: [], data: { childOrder: [] } }],
                ['orphan', { id: 'orphan', parent_id: 'root', children: [], data: { childOrder: [] } }],
            ]);
            const result = validator.validateAndRepair(blocks);
            expect(result.wasValid).toBe(false);
            expect(result.repaired).toBe(true);
            expect(result.issuesAfter.length).toBeLessThan(result.issuesBefore.length);
        });
    });

    describe('formatReport', () => {
        it('должен форматировать отчет о валидном дереве', () => {
            const result = { wasValid: true, issuesBefore: [], issuesAfter: [], repaired: false };
            const report = validator.formatReport(result);
            expect(report).toContain('валидно');
        });

        it('должен форматировать отчет о восстановлении', () => {
            const result = {
                wasValid: false,
                repaired: true,
                issuesBefore: [{ type: 'PARENT_CHILD_MISMATCH', message: 'test' }],
                issuesAfter: [],
                repairs: {
                    parentChildFixed: 1,
                    childParentFixed: 0,
                    orphanChildrenRemoved: 0,
                    childOrderSynced: 0,
                    duplicatesRemoved: 0,
                    modifiedBlocks: new Set(['root'])
                }
            };
            const report = validator.formatReport(result);
            expect(report).toContain('проблем');
            expect(report).toContain('исправлены');
        });
    });

    describe('exported singleton', () => {
        it('treeValidator должен быть экземпляром TreeValidator', () => {
            expect(treeValidator).toBeInstanceOf(TreeValidator);
        });
    });
});
