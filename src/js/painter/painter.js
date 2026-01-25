import {Queue} from "../utils/queue";
import blockCreator from "./blockCreator";
import cssConverter from "./cssConverter";
import {dispatch, getElementSizeClass, measurePerformance, printTimer, resetTimer} from "../utils/utils"
import {log} from "@jsplumb/browser-ui";
import {filterChildrenForPrivateSandbox} from "../utils/permissionUtils";

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
        this.counter = 0
        // Персистентный кэш img элементов (как AllIframes) - не очищается при перерендере
        this._allImages = new Map()
    }

    /**
     * Отсоединяет img элементы от DOM перед очисткой (но не удаляет из кэша)
     */
    _detachImages() {
        const images = this.rootContainer.querySelectorAll('.block-image')
        images.forEach(img => {
            const testId = img.getAttribute('data-testid')
            if (testId) {
                const blockId = testId.replace('block-image-tag-', '')
                // Сохраняем в кэш если картинка загружена
                if (img.complete && img.naturalWidth > 0) {
                    // Отсоединяем от DOM и сохраняем
                    img.remove()
                    this._allImages.set(blockId, img)
                }
            }
        })
    }

    /**
     * Восстанавливает закэшированные img элементы в новый DOM
     * Всегда переиспользует DOM элемент, обновляя все атрибуты включая src
     * (при смене размера блока может измениться вариант картинки)
     */
    _reattachImages() {
        if (this._allImages.size === 0) return

        const newImages = this.rootContainer.querySelectorAll('.block-image')
        newImages.forEach(newImg => {
            const testId = newImg.getAttribute('data-testid')
            if (testId) {
                const blockId = testId.replace('block-image-tag-', '')
                const cachedImg = this._allImages.get(blockId)

                if (cachedImg) {
                    // Всегда переиспользуем DOM элемент - обновляем ВСЕ атрибуты
                    // Это предотвращает моргание даже при смене варианта картинки
                    // (браузер возьмёт новый src из HTTP кэша)
                    for (const attr of newImg.attributes) {
                        cachedImg.setAttribute(attr.name, attr.value)
                    }
                    // Удаляем атрибуты которых нет в новом элементе
                    for (const attr of [...cachedImg.attributes]) {
                        if (!newImg.hasAttribute(attr.name)) {
                            cachedImg.removeAttribute(attr.name)
                        }
                    }
                    // Заменяем новый img на закэшированный
                    newImg.parentNode.replaceChild(cachedImg, newImg)
                }
            }
        })
    }

    /**
     * Очистка кэша картинок для блоков которых больше нет
     */
    _cleanupImageCache(blocks) {
        for (const blockId of this._allImages.keys()) {
            if (!blocks.has(blockId)) {
                this._allImages.delete(blockId)
            }
        }
    }

    render(blocks, {color = [], blockId}, currentUserId = null) {
        const block = blocks.get(blockId)
        if (block === undefined && this.counter === 0) {
            dispatch('LoadTrees')
            this.counter++
            return
        }
        if (block === undefined && this.counter === 1) {
            dispatch('ResetState')
            this.counter++
            return;
        }
        if (block === undefined && this.counter > 1 ) {
            dispatch("ShowError", `Ну все, приплыли block id ${blockId} не найден`)
            return;
        }
        let queue
        try {
            queue = new Queue([{
                block: block,
                depth: 0,
                parentBlock: {
                    'id': this.rootContainer.id,
                    'grid': ["grid-template-columns_1fr", "grid-template-rows_1fr"],
                    'contentEl': null,
                    'children': [block.id],
                    'childrenPositions': {[block.id]: ['grid-column_1', 'grid-row_1']},
                    'size': getElementSizeClass(this.rootContainer),
                    'color': [...color]
                },
                parentElement: this.rootContainer
            }], 524, false);
        } catch (e) {
            console.error(`Create queue ${block} error ${e} ${e.trace} `)
        }

        // Отсоединяем img элементы перед очисткой DOM (как iframes)
        this._detachImages()

        this.rootContainer.textContent = ''
        this.removeIframePositions()
        this._render(queue, blocks, this.config, currentUserId);

        // Восстанавливаем img элементы в новый DOM
        this._reattachImages()

        // Чистим кэш от удалённых блоков
        this._cleanupImageCache(blocks)

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

    _render(queue, blocks, {maxDepth}, currentUserId = null) {
        const fragments = new Map();
        let render_fragment = null
        let step = 0
        let c = 0
        while (!queue.isEmpty()) {
            c++
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

            // Фильтруем детей ДО создания элемента, чтобы grid рассчитывался только для видимых
            const childOrder = block.data.childOrder || [];
            const visibleChildren = filterChildrenForPrivateSandbox(
                childOrder,
                blocks,
                block,
                currentUserId
            );

            const element = blockCreator.createElement(block, parentBlock, screen, depth, {
                currentUserId,
                blocks,
                visibleChildren
            });
            render_fragment.appendChild(element);
            if (element) {
                // Для link blocks childOrder устанавливается внутри createLink(),
                // поэтому нужно использовать обновлённый childOrder после создания элемента
                const childrenToRender = block.data?.view === 'link'
                    ? filterChildrenForPrivateSandbox(block.data.childOrder || [], blocks, block, currentUserId)
                    : visibleChildren;

                childrenToRender.forEach(childId => {
                    queue.enqueue({
                        block: blocks.getBlockOrEmpty(childId),
                        depth: depth + 1,
                        parentBlock: block,
                        parentElement: element
                    });
                });
            }
        }
        console.log("blocks ", c)
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


