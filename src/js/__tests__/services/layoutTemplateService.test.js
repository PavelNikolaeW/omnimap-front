import { layoutTemplateService, BUILT_IN_TEMPLATES } from '../../services/layoutTemplateService';

describe('LayoutTemplateService', () => {

    describe('BUILT_IN_TEMPLATES', () => {
        test('contains required templates', () => {
            expect(BUILT_IN_TEMPLATES['task-card']).toBeDefined();
            expect(BUILT_IN_TEMPLATES['project-overview']).toBeDefined();
            expect(BUILT_IN_TEMPLATES['kanban']).toBeDefined();
            expect(BUILT_IN_TEMPLATES['sidebar-layout']).toBeDefined();
            expect(BUILT_IN_TEMPLATES['hero-section']).toBeDefined();
            expect(BUILT_IN_TEMPLATES['dashboard']).toBeDefined();
        });

        test('each template has required properties', () => {
            Object.values(BUILT_IN_TEMPLATES).forEach(template => {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(template.icon).toBeDefined();
                expect(typeof template.getLayout).toBe('function');
            });
        });
    });

    describe('getTemplate', () => {
        test('returns built-in template by id', () => {
            const template = layoutTemplateService.getTemplate('task-card');
            expect(template).toBeDefined();
            expect(template.id).toBe('task-card');
        });

        test('returns null for unknown template', () => {
            const template = layoutTemplateService.getTemplate('unknown-template');
            expect(template).toBeNull();
        });
    });

    describe('getAllTemplates', () => {
        test('returns all built-in templates', () => {
            const templates = layoutTemplateService.getAllTemplates();
            expect(templates.length).toBeGreaterThanOrEqual(6);
            expect(templates.some(t => t.id === 'task-card')).toBe(true);
            expect(templates.some(t => t.id === 'kanban')).toBe(true);
        });
    });

    describe('registerTemplate', () => {
        test('registers custom template', () => {
            const customTemplate = {
                id: 'custom-test',
                name: 'Custom Test',
                description: 'Test template',
                icon: 'fa-test',
                getLayout: (childCount) => ({
                    gridTemplateColumns: '1fr',
                    gridTemplateRows: 'auto 1fr',
                    totalRows: 2,
                    totalColumns: 1,
                    positions: { 0: { gridColumn: '1', gridRow: '2' } }
                })
            };

            layoutTemplateService.registerTemplate(customTemplate);
            const retrieved = layoutTemplateService.getTemplate('custom-test');
            expect(retrieved).toBeDefined();
            expect(retrieved.name).toBe('Custom Test');

            // Cleanup
            layoutTemplateService.removeTemplate('custom-test');
        });

        test('does not register invalid template', () => {
            const invalidTemplate = { name: 'Invalid' };
            layoutTemplateService.registerTemplate(invalidTemplate);
            expect(layoutTemplateService.getTemplate(undefined)).toBeNull();
        });
    });

    describe('applyTemplate', () => {
        const createMockBlock = (childCount) => ({
            id: 'test-block',
            children: Array(childCount).fill(null).map((_, i) => `child-${i}`),
            data: {
                childOrder: Array(childCount).fill(null).map((_, i) => `child-${i}`)
            },
            size: { width: 400, height: 300 }
        });

        test('applies task-card template', () => {
            const block = createMockBlock(3);
            const result = layoutTemplateService.applyTemplate('task-card', block, { width: 400, height: 300 });

            expect(result).toBeDefined();
            expect(result.grid).toBeDefined();
            expect(result.contentPosition).toBeDefined();
            expect(result.childrenPositions).toBeDefined();
            expect(Object.keys(result.childrenPositions).length).toBe(3);
        });

        test('applies kanban template', () => {
            const block = createMockBlock(4);
            const result = layoutTemplateService.applyTemplate('kanban', block, { width: 800, height: 600 });

            expect(result).toBeDefined();
            expect(result.childrenPositions['child-0']).toBeDefined();
            expect(result.childrenPositions['child-1']).toBeDefined();
            expect(result.childrenPositions['child-2']).toBeDefined();
            expect(result.childrenPositions['child-3']).toBeDefined();
        });

        test('returns null for unknown template', () => {
            const block = createMockBlock(2);
            const result = layoutTemplateService.applyTemplate('unknown', block, { width: 400, height: 300 });

            expect(result).toBeNull();
        });

        test('handles empty children array', () => {
            const block = createMockBlock(0);
            const result = layoutTemplateService.applyTemplate('task-card', block, { width: 400, height: 300 });

            expect(result).toBeDefined();
            expect(Object.keys(result.childrenPositions).length).toBe(0);
        });
    });

    describe('convertPositionToClasses', () => {
        test('converts grid position to classes', () => {
            const pos = { gridColumn: '1 / 3', gridRow: '2' };
            const classes = layoutTemplateService.convertPositionToClasses(pos);

            expect(classes).toContain('grid-column_1__3');
            expect(classes).toContain('grid-row_2');
        });

        test('handles row span', () => {
            const pos = { gridColumn: '1 / 2', gridRow: '2 / 4' };
            const classes = layoutTemplateService.convertPositionToClasses(pos);

            expect(classes).toContain('grid-column_1__2');
            expect(classes).toContain('grid-row_2__4');
        });

        test('handles single values', () => {
            const pos = { gridColumn: '1', gridRow: '2' };
            const classes = layoutTemplateService.convertPositionToClasses(pos);

            expect(classes).toContain('grid-column_1');
            expect(classes).toContain('grid-row_2');
        });
    });

    describe('generateGridClasses', () => {
        test('generates correct grid classes', () => {
            const layout = { totalColumns: 3, totalRows: 2 };
            const classes = layoutTemplateService.generateGridClasses(layout);

            expect(classes[0]).toBe('grid-template-columns_1fr__1fr__1fr__');
            expect(classes[1]).toBe('grid-template-rows_auto__1fr__');
        });
    });

    describe('Template getLayout functions', () => {

        describe('task-card', () => {
            test('positions header across full width', () => {
                const layout = BUILT_IN_TEMPLATES['task-card'].getLayout(3, { width: 400 });
                expect(layout.positions[0].gridColumn).toBe('1 / 3');
            });

            test('positions content and meta in separate columns', () => {
                const layout = BUILT_IN_TEMPLATES['task-card'].getLayout(3, { width: 400 });
                expect(layout.positions[1].gridColumn).toBe('1 / 2');
                expect(layout.positions[2].gridColumn).toBe('2 / 3');
            });
        });

        describe('kanban', () => {
            test('distributes children horizontally', () => {
                const layout = BUILT_IN_TEMPLATES['kanban'].getLayout(4, { width: 800 });
                expect(layout.totalColumns).toBe(4);
                expect(layout.positions[0].gridColumn).toBe('1 / 2');
                expect(layout.positions[1].gridColumn).toBe('2 / 3');
                expect(layout.positions[2].gridColumn).toBe('3 / 4');
                expect(layout.positions[3].gridColumn).toBe('4 / 5');
            });

            test('limits to max 6 columns', () => {
                const layout = BUILT_IN_TEMPLATES['kanban'].getLayout(8, { width: 800 });
                expect(layout.totalColumns).toBeLessThanOrEqual(6);
            });
        });

        describe('sidebar-layout', () => {
            test('creates main content area and sidebar', () => {
                const layout = BUILT_IN_TEMPLATES['sidebar-layout'].getLayout(3, { width: 800 });
                expect(layout.gridTemplateColumns).toBe('3fr 1fr');
                expect(layout.positions[0].gridColumn).toBe('1 / 2');
                expect(layout.positions[1].gridColumn).toBe('2 / 3');
            });
        });

        describe('hero-section', () => {
            test('creates hero at top spanning full width', () => {
                const layout = BUILT_IN_TEMPLATES['hero-section'].getLayout(4, { width: 800 });
                expect(layout.positions[0].gridRow).toBe('2 / 3');
            });
        });

        describe('dashboard', () => {
            test('creates large widget spanning 2x2', () => {
                const layout = BUILT_IN_TEMPLATES['dashboard'].getLayout(4, { width: 800 });
                expect(layout.positions[0].gridColumn).toBe('1 / 3');
                expect(layout.positions[0].gridRow).toBe('2 / 4');
            });
        });
    });
});
