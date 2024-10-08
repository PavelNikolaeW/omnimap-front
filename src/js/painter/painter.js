import {Queue} from "../utils/queue";
import blockCreator from "./blockCreator";
import cssConverter from "./cssConverter";
import {dispatch, getElementSizeClass, measurePerformance, printTimer, resetTimer} from "../utils/utils"
import {jsPlumb} from "jsplumb";

Map.prototype.appendInParent = function () {
    const elementsToDelete = [];

    for (let [parent, fragment] of this) {
        parent.appendChild(fragment);
        elementsToDelete.push(parent);
    }

    for (let parent of elementsToDelete) {
        this.delete(parent);
    }
};

Map.prototype.getBlockOrEmpty = function (key) {
    const block = this.get(key)
    return block ? block : {'id': key, 'data': {'childOrder': []}, 'children': [], 'empty': true}
}

export class Painter {
    constructor(jsPlumbInstance) {
        this.rootContainer = document.getElementById('rootContainer');
        this.config = {
            maxDepth: 40,
        }
        this.jsPlumbInstance = jsPlumbInstance
        this._render = measurePerformance('_render', this._render)
    }

    render(blocks, {screenName, color = [], blockId}) {
        const block = blocks.get(blockId)
        const queue = new Queue([{
            block: block,
            depth: 0,
            parentBlock: {
                'id': this.rootContainer.id,
                'grid': ["grid-template-columns_1fr", "grid-template-rows_1fr"],
                'contentEl': null,
                'children': [block.id],
                'childrenPositions': {[block.id]: ['grid-column_1', 'grid-row_1'], row: 0, col: 0},
                'size': getElementSizeClass(this.rootContainer),
                'color': [...color]
            },
            parentElement: this.rootContainer
        }], 512, false);

        this.rootContainer.textContent = ''
        this._render(queue, blocks, this.config);

        if (blockCreator.emptyBlocks.length) {
            dispatch('LoadEmptyBlocks', {emptyBlocks: [...blockCreator.emptyBlocks]})
            blockCreator.emptyBlocks = []
        } else {
            dispatch('DrawArrows', {'arrows': blockCreator.arrows})
            blockCreator.arrows.clear()
        }
    }

    _render(queue, blocks, {maxDepth}) {
        const fragments = new Map();
        let render_fragment = null
        let step = 0

        while (!queue.isEmpty()) {
            const {block, depth, parentBlock, parentElement} = queue.dequeue();

            if (
                (parentBlock.size.width < 60 || parentBlock.size.height < 60) &&
                parentBlock.data?.view !== 'link' ||
                depth > maxDepth
            ) continue;

            if (step !== depth) {
                step = depth
                fragments.appendInParent()
            }

            if (!fragments.has(parentElement)) {
                render_fragment = document.createDocumentFragment()
                fragments.set(parentElement, render_fragment);
            }

            const element = blockCreator.createElement(block, parentBlock, screen, depth);
            render_fragment.appendChild(element);

            block.data.childOrder.forEach(childId => {
                queue.enqueue({
                    block: blocks.getBlockOrEmpty(childId),
                    depth: depth + 1,
                    parentBlock: block,
                    parentElement: element
                });
            });
        }
        fragments.appendInParent()
    }
}


