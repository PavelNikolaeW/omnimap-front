import {DiagramUtils} from "../diagramUtils";

export class ContextManager {
    constructor(rootContainer, breadcrumb, treeNavigation) {
        this.mode = 'normal'
        this.blockElement = undefined
        this.blockLinkElement = undefined
        this.activeBtnElem = undefined
        this.event = undefined
        this.cmdId = 'openBlock'
        this.activeBtnIndicator = document.getElementById('active-button-info')
        this.blockId = undefined
        this.blockLinkId = undefined
        this.popup = undefined
        this.cut = undefined

        this.rootContainer = rootContainer
        this.breadcrumb = breadcrumb
        this.treeNavigation = treeNavigation
        this.diagramUtils = new DiagramUtils()

        this.init()
    }

    init() {
        this.bindHandlers()
        // надо отписываться от собитыий при перерендере?
        window.addEventListener('ShowedBlocks', (e) => {
            this.rotationElements(e.detail)
        });

        this.rootContainer.addEventListener('mouseover', this.mouseOverBlockHandlerBound);
        this.rootContainer.addEventListener('touchstart', this.mouseOverBlockHandlerBound);
        this.rootContainer.addEventListener('mouseout', this.mouseOutBlockHandlerBound);
        this.rootContainer.addEventListener('touchend', this.mouseOutBlockHandlerBound);

        this.treeNavigation.addEventListener('mouseover', this.mouseOverTreeHandlerBound)
        this.treeNavigation.addEventListener('touchstart', this.mouseOverTreeHandlerBound)
        this.treeNavigation.addEventListener('mouseout', this.mouseOutBreadcrumbHandlerBound)
        this.treeNavigation.addEventListener('touchend', this.mouseOutTreeHandlerBound)

        this.breadcrumb.addEventListener('mouseover', this.mouseOverBreadcrumbHandlerBound);
        this.breadcrumb.addEventListener('touchstart', this.mouseOverBreadcrumbHandlerBound);
        this.breadcrumb.addEventListener('mouseout', this.mouseOutBreadcrumbHandlerBound);
        this.breadcrumb.addEventListener('touchend', this.mouseOutBreadcrumbHandlerBound);

        window.addEventListener('keydown', this.keydownHandler.bind(this));
        window.addEventListener('keyup', this.keyupHandler.bind(this));
    }

    keydownHandler(e) {
        if (e.key === 'Shift' || e.key == '-') {
            this.shiftLock = true;
        }
    }

    keyupHandler(e) {
        if (e.key === 'Shift' || e.key == '-') {
            this.shiftLock = false;
        }
    }

    rotationElements({path, activeId}) {
        if (!activeId) activeId = this.blockElement?.id.split('*')[0]
        this.blockElement = undefined
        this.blockLinkElement = undefined
        if (activeId) {
            let el = document.getElementById(activeId)
            this.blockElement = el
            if (!el) {
                el = document.querySelector(`[blocklink="${activeId}"]`)
                if (el) this.blockLinkElement = el
            }
        }
        this.addActiveClass()
    }

    bindHandlers() {
        this.mouseOverBlockHandlerBound = this.mouseOverBlockHandler.bind(this)
        this.mouseOutBlockHandlerBound = this.mouseOutBlockHandler.bind(this)

        this.mouseOverTreeHandlerBound = this.mouseOverTreeHandler.bind(this)
        this.mouseOutTreeHandlerBound = this.mouseOutTreeHandler.bind(this)

        this.mouseOverBreadcrumbHandlerBound = this.mouseOverBreadcrumbHandler.bind(this)
        this.mouseOutBreadcrumbHandlerBound = this.mouseOutBreadcrumbHandler.bind(this)

    }

    mouseOverBlockHandler(event) {
        if (!this.shiftLock) {
            this.setActiveBlock(event.target)
        }
    }

    setActiveBlock(el) {
        const {element, link} = this.getRelevantElements(el);
        if (!element) return;
        this.removeActiveClass()
        this.blockElement = element
        this.blockLinkElement = link
        this.blockLinkId = link && link.id
        this.blockId = undefined
        this.addActiveClass()
        if (this.mode === 'cutBlock') {
            const target = link || element
            if (target.id !== this.cut.block_id) {
                if (!this.beforeBlockElement) this.createBeforeBlockElement(target)
                if (link) this.cut['new_parent_id'] = link.getAttribute('blocklink')
                else this.cut['new_parent_id'] = element.id
            }
        }
        return element
    }

    mouseOutBlockHandler(event) {
        const relatedTarget = event.relatedTarget
        if (!this.shiftLock) {
            this.setDisActiveBlock(relatedTarget)
        }
    }

    setDisActiveBlock(el) {
        const relatedId = el?.getAttribute('block_id')
        if (this.mode === 'cutBlock' &&
            el &&
            this.blockElement &&
            relatedId === this.blockElement.id ||
            this.blockLinkElement &&
            relatedId === this.blockLinkElement.id) {
            return
        }
        this.removeActiveClass()
        this.blockElement = undefined
        this.blockLinkElement = undefined
        this.blockLinkId = undefined
        this.block = undefined
        if (this.mode === 'cutBlock') {
            if (this.beforeBlockElement) {
                this.beforeBlockElement.remove()
                this.beforeBlockElement = undefined
            }
        }
    }

    getActiveElement() {
        if (this.blockLinkElement) return this.blockLinkElement
        if (this.blockElement) return this.blockElement
        return this.rootContainer.children[0]
    }

    mouseOverTreeHandler(event) {
        if (event.target.hasAttribute('blockid')) {
            this.blockId = event.target.getAttribute('blockid')
            this.isTree = true
        }
        if (this.mode === 'cutBlock') {
            this.cut['new_parent_id'] = this.blockId
        }
    }

    mouseOutTreeHandler(event) {
        this.blockId = undefined
        this.isTree = false
        if (this.mode === 'cutBlock') {
            this.cut['new_parent_id'] = undefined
        }
    }

    mouseOverBreadcrumbHandler(event) {
        if (event.target.hasAttribute('blockid')) {
            this.blockId = event.target.getAttribute('blockid')
        }
        if (this.mode === 'cutBlock') {
            this.cut['new_parent_id'] = this.blockId
        }
    }

    mouseOutBreadcrumbHandler(event) {
        this.blockId = undefined
        if (this.mode === 'cutBlock') {
            this.cut['new_parent_id'] = undefined
        }
    }


    getRelevantElements(target) {
        const element = this.findParentWithAttribute(target);
        let link = undefined
        if (!element) return {};
        if (element.parentElement.hasAttribute('blocklink')) {
            link = element.parentElement
        }
        return {element, link};
    }

    findParentWithAttribute(el, attributeName = 'block') {
        while (el && el !== document.documentElement) {
            if (el.hasAttribute(attributeName)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }

    setCmd(cmd) {
        if (typeof cmd !== "string") {
            if (this.cmdId === cmd.id) {
                this.setCmd('openBlock')
                return
            }
            this.cmdId = cmd.id
            this.toggleActiveButton(cmd.id)
            this.activeBtnIndicator.innerText = cmd.id
            if (cmd.btnExec) {
                cmd.btnExec(this)
            }
        } else {
            this.cmdId = cmd
            this.toggleActiveButton(cmd)
            this.activeBtnIndicator.innerText = cmd
        }
    }

    toggleActiveButton(cmd) {
        if (this.activeBtnElem && this.activeBtnElem.id !== cmd) {
            this.activeBtnElem.classList.remove('active-button')
            this.activeBtnElem.blur()
        }
        const elem = document.getElementById(cmd)
        if (elem) {
            elem.classList.add('active-button')
            this.activeBtnElem = elem
        }
    }

    setEvent(event) {
        this.event = event
    }

    getCmd() {
        return this.cmdId
    }

    addActiveClass() {
        if (this.blockLinkElement) {
            this.blockLinkElement.classList.add('block-link-active')
        } else if (this.blockElement) {
            this.blockElement.classList.add('block-active')
        }
    }

    removeActiveClass() {
        if (this.blockLinkElement) {
            this.blockLinkElement.classList.remove('block-link-active')
        }
        if (this.blockElement) {
            this.blockElement.classList.remove('block-active')
        }
    }

    submitPopup() {
        if (this.popup) {
            this.popup.handleSubmit()
            this.popup = undefined
            this.mode = 'normal'
        }
    }

    closePopups() {
        if (this.popup) {
            this.popup.handleCancel()
            this.popup = undefined
            this.mode = 'normal'
        }
    }

    createBeforeBlockElement(blockElement) {
        if (blockElement.parentNode.id === 'rootContainer') return
        const beforeBlockElement = document.createElement('div');
        beforeBlockElement.setAttribute('block_id', blockElement.id);
        beforeBlockElement.setAttribute('parent_id', blockElement.parentNode.id);
        beforeBlockElement.classList.add('before-block');

        // Устанавливаем позицию относительно родительского элемента
        beforeBlockElement.style.height = `${blockElement.offsetHeight + 20}px`;
        beforeBlockElement.style.left = `${blockElement.offsetLeft - 10}px`;
        beforeBlockElement.style.top = `${blockElement.offsetTop - 10}px`;

        blockElement.parentNode.insertBefore(beforeBlockElement, blockElement);
        this.beforeBlockElement = beforeBlockElement;

        // Наведение мыши
        beforeBlockElement.addEventListener('mouseover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            beforeBlockElement.classList.add('before-block-hover');
            this.cut['new_parent_id'] = blockElement.parentElement.id
            this.cut['before'] = blockElement.id;
        });

        // Уход мыши
        beforeBlockElement.addEventListener('mouseout', (e) => {
            e.preventDefault();
            e.stopPropagation();
            beforeBlockElement.classList.remove('before-block-hover');
            this.cut['before'] = undefined;
            this.cut['new_parent_id'] = undefined;
        });
    }

}
