import {Queue} from "../utils/queue";
import blockCreator from "./blockCreator";
import cssConverter from "./cssConverter";
import {dispatch, getElementSizeClass, measurePerformance, printTimer, resetTimer} from "../utils/utils"
import {log} from "@jsplumb/browser-ui";

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
    constructor() {
        this.rootContainer = document.getElementById('rootContainer');
        this.config = {
            maxDepth: 40,
        }
    }

    render(blocks, {color = [], blockId}) {
        const block = blocks.get(blockId)
        const queue = new Queue([{
            block: block,
            depth: 0,
            parentBlock: {
                'id': this.rootContainer.id,
                'grid': ["grid-template-columns_1fr", "grid-template-rows_1fr"],
                'gridSize': {row: 0, col: 0},
                'contentEl': null,
                'children': [block.id],
                'childrenPositions': {[block.id]: ['grid-column_1', 'grid-row_1']},
                'size': getElementSizeClass(this.rootContainer),
                'color': [...color]
            },
            parentElement: this.rootContainer
        }], 524, false);

        this.rootContainer.textContent = ''
        this.removeIframePositions()
        this._render(queue, blocks, this.config);
        // this.printRealSize()
        this.setIframePositions()

        if (blockCreator.emptyBlocks.size) {
            dispatch('LoadEmptyBlocks', {emptyBlocks: [...blockCreator.emptyBlocks]})
            blockCreator.emptyBlocks.clear()
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
            if ((parentBlock?.size?.width < 40 && parentBlock?.size?.height < 40) &&
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
            if (element) {
                block.data.childOrder?.forEach(childId => {
                    queue.enqueue({
                        block: blocks.getBlockOrEmpty(childId),
                        depth: depth + 1,
                        parentBlock: block,
                        parentElement: element
                    });
                });
            }
        }
        fragments.appendInParent()
    }

    setIframePositions() {
        blockCreator.iframes.forEach((id) => {
            const blockEl = document.getElementById(id);
            const iframe = document.getElementById(`iframe${id}`);

            if (blockEl && iframe) {
                // Получаем размеры и положение блока
                const blockRect = blockEl.getBoundingClientRect();
                if (blockRect.width > 50 && blockRect.height > 50) {
                    iframe.style.top = `${blockRect.top + window.scrollY + 10}px`;
                    iframe.style.left = `${blockRect.left + window.scrollX + 10}px`;
                    iframe.style.width = `${blockRect.width - 20}px`;
                    iframe.style.height = `${blockRect.height - 20}px`;
                } else {
                    iframe.style.top = `-5000px`;
                    iframe.style.left = `-5000px`;
                }
            }
        });
    }

    removeIframePositions() {
        blockCreator.iframes.forEach((id) => {
            const iframe = document.getElementById(`iframe${id}`);
            iframe.style.top = `-5000px`;
            iframe.style.left = `-5000px`;
        })
        blockCreator.iframes.clear()
    }

    printRealSize() {
        const blocks = document.querySelectorAll('[block]')
        blocks.forEach((block) => {
            const size = block.getBoundingClientRect()
            const title = block.children[0].children[0]
            const content = block.children[0].children[1]
            title.innerHTML = `<b>${block.getAttribute('width')} - ${block.getAttribute('height')} - ${block.getAttribute('layout')} ${title.innerText}<b>`
            content.innerHTML = `<p> ${Math.floor(size.width)} - ${Math.floor(size.height)} - ${content.innerText} </p>`
            // content.children[0].innerHTML = ` ${Math.floor(size.width)} - ${Math.floor(size.height)} - ${content.children[0].innerText}`
        })
    }
}


