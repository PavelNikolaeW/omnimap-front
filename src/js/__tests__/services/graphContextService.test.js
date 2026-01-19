/**
 * Tests for GraphContextService
 */

import { GraphContextService } from '../../services/graphContextService';
import { CONNECTION_TYPES } from '../../controller/connectionTypes';

describe('GraphContextService', () => {
    let service;
    let mockBlocks;

    // Helper to create mock blocks
    const createBlock = (id, parentId, title, options = {}) => ({
        id,
        parent_id: parentId,
        title,
        children: JSON.stringify(options.children || []),
        data: {
            text: options.text || '',
            type: options.type || 'entity',
            childOrder: options.childOrder || options.children || [],
            connections: options.connections || [],
            color: [210, 80, 70, 0]
        }
    });

    beforeEach(() => {
        // Create a mock block tree:
        //   root (uuid-1)
        //   ├── child1 (uuid-2)
        //   │   ├── grandchild1 (uuid-4)
        //   │   └── grandchild2 (uuid-5)
        //   └── child2 (uuid-3)
        //       └── grandchild3 (uuid-6)
        mockBlocks = new Map([
            ['uuid-1', createBlock('uuid-1', null, 'Root', {
                childOrder: ['uuid-2', 'uuid-3'],
                type: 'group'
            })],
            ['uuid-2', createBlock('uuid-2', 'uuid-1', 'Child 1', {
                childOrder: ['uuid-4', 'uuid-5'],
                type: 'system'
            })],
            ['uuid-3', createBlock('uuid-3', 'uuid-1', 'Child 2', {
                childOrder: ['uuid-6'],
                type: 'component'
            })],
            ['uuid-4', createBlock('uuid-4', 'uuid-2', 'Grandchild 1', {
                text: '<p>Some content</p>',
                type: 'task'
            })],
            ['uuid-5', createBlock('uuid-5', 'uuid-2', 'Grandchild 2', {
                type: 'interface'
            })],
            ['uuid-6', createBlock('uuid-6', 'uuid-3', 'Grandchild 3', {
                type: 'data',
                connections: [{
                    sourceId: 'uuid-6',
                    targetId: 'uuid-4',
                    type: CONNECTION_TYPES.DEPENDENCY
                }]
            })]
        ]);

        service = new GraphContextService(mockBlocks);
    });

    describe('collectCurrent', () => {
        it('should return block and its direct children', () => {
            const result = service.collectCurrent('uuid-2');

            expect(result.size).toBe(3); // uuid-2, uuid-4, uuid-5
            expect(result.has('uuid-2')).toBe(true);
            expect(result.has('uuid-4')).toBe(true);
            expect(result.has('uuid-5')).toBe(true);
            expect(result.has('uuid-1')).toBe(false);
        });

        it('should return only the block if no children', () => {
            const result = service.collectCurrent('uuid-4');

            expect(result.size).toBe(1);
            expect(result.has('uuid-4')).toBe(true);
        });

        it('should return empty map for non-existent block', () => {
            const result = service.collectCurrent('non-existent');

            expect(result.size).toBe(0);
        });
    });

    describe('collectBranch', () => {
        it('should return block and all descendants', () => {
            const result = service.collectBranch('uuid-2', 5);

            expect(result.size).toBe(3); // uuid-2, uuid-4, uuid-5
            expect(result.has('uuid-2')).toBe(true);
            expect(result.has('uuid-4')).toBe(true);
            expect(result.has('uuid-5')).toBe(true);
        });

        it('should return entire tree from root', () => {
            const result = service.collectBranch('uuid-1', 5);

            expect(result.size).toBe(6); // All blocks
        });

        it('should respect maxDepth', () => {
            const result = service.collectBranch('uuid-1', 1);

            expect(result.size).toBe(3); // root + 2 children
            expect(result.has('uuid-1')).toBe(true);
            expect(result.has('uuid-2')).toBe(true);
            expect(result.has('uuid-3')).toBe(true);
            expect(result.has('uuid-4')).toBe(false);
        });
    });

    describe('collectAncestors', () => {
        it('should return path to root and siblings', () => {
            const result = service.collectAncestors('uuid-4');

            // uuid-4 -> uuid-2 (parent) + uuid-5 (sibling) -> uuid-1 (grandparent) + uuid-3 (uncle)
            expect(result.has('uuid-4')).toBe(true);
            expect(result.has('uuid-2')).toBe(true);
            expect(result.has('uuid-5')).toBe(true); // sibling
            expect(result.has('uuid-1')).toBe(true);
            expect(result.has('uuid-3')).toBe(true); // uncle
        });

        it('should return only block for root', () => {
            const result = service.collectAncestors('uuid-1');

            expect(result.size).toBe(1);
            expect(result.has('uuid-1')).toBe(true);
        });
    });

    describe('collectFull', () => {
        it('should return all blocks up to maxNodes', () => {
            const result = service.collectFull('uuid-4', 100);

            expect(result.size).toBe(6); // All blocks
        });

        it('should respect maxNodes limit', () => {
            const result = service.collectFull('uuid-1', 3);

            expect(result.size).toBe(3);
        });
    });

    describe('encodeForLLM', () => {
        it('should create deterministic IDs from UUIDs', () => {
            const blocks = service.collectBranch('uuid-1', 5);
            const { snapshot, idMap, reverseMap } = service.encodeForLLM(blocks, 'uuid-1');

            expect(snapshot.v).toBe(2);
            expect(snapshot.n).toHaveLength(6);

            // IDs should be sorted by UUID
            const sortedUuids = [...blocks.keys()].sort();
            sortedUuids.forEach((uuid, index) => {
                expect(idMap[uuid]).toBe(index + 1);
                expect(reverseMap[index + 1]).toBe(uuid);
            });
        });

        it('should encode nodes correctly', () => {
            const blocks = new Map([['uuid-4', mockBlocks.get('uuid-4')]]);
            const { snapshot } = service.encodeForLLM(blocks, 'uuid-4');

            const node = snapshot.n[0];
            expect(node[0]).toBe(1); // id
            expect(node[1]).toBe(0); // parent_id (not in context)
            expect(node[2]).toBe('task'); // type
            expect(node[3]).toBe('Grandchild 1'); // title
            expect(node[4]).toBe('Some content'); // text (HTML stripped)
        });

        it('should encode orders correctly', () => {
            const blocks = service.collectCurrent('uuid-2');
            const { snapshot, idMap } = service.encodeForLLM(blocks, 'uuid-2');

            // Find order for uuid-2
            const uuid2Id = idMap['uuid-2'];
            const order = snapshot.o.find(o => o[0] === uuid2Id);

            expect(order).toBeDefined();
            expect(order[1]).toEqual([idMap['uuid-4'], idMap['uuid-5']]);
        });

        it('should encode connections with types', () => {
            const blocks = new Map([
                ['uuid-4', mockBlocks.get('uuid-4')],
                ['uuid-6', mockBlocks.get('uuid-6')]
            ]);
            const { snapshot, idMap } = service.encodeForLLM(blocks, 'uuid-6');

            expect(snapshot.e).toHaveLength(1);
            const edge = snapshot.e[0];
            expect(edge[0]).toBe(idMap['uuid-6']); // source
            expect(edge[1]).toBe(idMap['uuid-4']); // target
            expect(edge[2]).toBe(CONNECTION_TYPES.DEPENDENCY);
        });

        it('should filter out connections outside context', () => {
            // Only include uuid-6, not uuid-4
            const blocks = new Map([['uuid-6', mockBlocks.get('uuid-6')]]);
            const { snapshot } = service.encodeForLLM(blocks, 'uuid-6');

            expect(snapshot.e).toHaveLength(0);
        });

        it('should handle empty blocks', () => {
            const { snapshot } = service.encodeForLLM(new Map(), 'any');

            expect(snapshot).toBeNull();
        });
    });

    describe('extractContext', () => {
        it('should use correct scope extractor', () => {
            const currentResult = service.extractContext('current', 'uuid-2');
            const branchResult = service.extractContext('branch', 'uuid-2');

            expect(currentResult.snapshot.n).toHaveLength(3);
            expect(branchResult.snapshot.n).toHaveLength(3);
        });

        it('should return empty for invalid focusBlockId', () => {
            const result = service.extractContext('branch', null);

            expect(result.snapshot).toBeNull();
        });

        it('should default to branch scope', () => {
            const result = service.extractContext('unknown', 'uuid-2');

            expect(result.snapshot.n).toHaveLength(3);
        });
    });

    describe('utility methods', () => {
        it('should strip HTML tags from text', () => {
            const html = '<p>Hello <strong>world</strong></p><br>Test&nbsp;&amp;&lt;&gt;';
            const text = service._htmlToText(html);

            // </p> adds \n, <br> adds \n, resulting in \n\n
            // &nbsp; → ' ', &amp; → '&', &lt; → '<', &gt; → '>'
            expect(text).toBe('Hello world\n\nTest &<>');
        });

        it('should normalize block types', () => {
            expect(service._normalizeBlockType('SYSTEM')).toBe('system');
            expect(service._normalizeBlockType('unknown')).toBe('entity');
            expect(service._normalizeBlockType(null)).toBe('entity');
        });

        it('should estimate tokens correctly', () => {
            const snapshot = { v: 2, n: [[1, 0, 'entity', 'Test', 'Content']] };
            const tokens = service.estimateTokens(snapshot);

            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(100);
        });

        it('should provide context size hint', () => {
            const hint = service.getContextSizeHint('branch', 'uuid-2');

            expect(hint.nodes).toBe(3);
            expect(hint.tokens).toBeGreaterThan(0);
            expect(hint.description).toBe('Вся ветка');
        });
    });
});
