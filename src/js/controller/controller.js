import {dispatch} from "../utils/utils";
import {BlockEditor} from "./blockEditor";
import BaseController from './baseController';
import {ArrowManager} from "./arrowManager";
import createAccessWindow from "./editAccessWindow";


// проблема с определение размера в блоках с кастомно определенным положением
// Мне нужно написать класс, который будет соединять элементы стрелочками. Я нажимаю на кнопку "добавить стрелочки" после навожу мышку на элемент и кликаю, от элемента рисуется стрелочка до другого элемента на который наведен курсор кроме родительского.
export class ControllerBlock extends BaseController {
    constructor(jsPlumbInstance, idRootContainer = 'rootContainer', idToolBar = 'control-panel') {
        super(jsPlumbInstance);
        this.rootContainer = document.getElementById(idRootContainer);
        this.toolbar = document.getElementById(idToolBar);
        this.blockEditor = new BlockEditor(idRootContainer)
        this.jsPlumbInstance = jsPlumbInstance
        this.connectionManager = new ArrowManager(jsPlumbInstance)

        this.dragableElement = null;
        this.isMoveInit = false;


        this.bindHandlers()
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        window.addEventListener('ShowedBlocks', () => {
            this.setHandlers()
        });
        window.addEventListener('CopyBlock', (e) => {
            console.log(e.detail)
            this.copies.add(e.detail)
        })
        window.addEventListener('SetControlHandlers', () => {
            this.deActivateEdit()
            this.setHandlers()
            setTimeout(() => {
                this.handleMode('openBlock', null);
            }, 0)

        });
        window.addEventListener('UpdateBlockParams', (e) => {
            const {element, newParams} = e.detail
            if (Object.values(newParams.parent).length) {
                const parent = newParams.parent.element
                const customGrid = {
                    'grid': newParams.parent.grid,
                    'contentPosition': newParams.parent.contentPosition,
                    'childrenPositions': newParams.parent.childrenPositions ? newParams.parent.childrenPositions : {}
                }

                dispatch('UpdateCustomGridBlock', {blockId: parent.id, customGrid})
            }
            if (Object.values(newParams).length > 1) {
                const data = {}
                console.log(element, data)
                if (newParams.hue) {
                    data.color = [newParams.hue, 0, 0, 0]
                }
                if (newParams.gap) {
                    data.gap = newParams.gap
                }
                dispatch('UpdateDataBlock', {blockId: element.id, data: data})
            }
        })

        this.toolbar.addEventListener('click', (e) => {
            e.preventDefault();
            let handlerName = 'handleBtnColor'
            if (e.target.type === 'submit') {
                if (e.target.id) handlerName = `handle${this.capitalize(e.target.id)}`;
                if (typeof this[handlerName] === 'function') {
                    this[handlerName](e.target);
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            // Проверка, нажаты ли модификаторные клавиши
            if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
                return;
            }

            // Проверка, находится ли окно в фокусе
            if (!document.hasFocus()) {
                return;
            }
            // Проверка, что фокус не на INPUT или TEXTAREA
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                return;
            }

            let handlerName = 'handleBtnColor'
            const code = e.code;

            if (code === 'Escape') {
                this.handleEscape()
            }
            const button = document.querySelector(`button[data-hotkey="${code}"]`);
            if (button) {
                e.preventDefault();
                if (button.id) {
                    handlerName = `handle${this.capitalize(button.id)}`;
                }
                if (typeof this[handlerName] === 'function') {
                    this[handlerName](button);
                }
            }
        });
    }

    handleEscape() {
        this.removeListenerArrowBlock()
        this.blockEditor.closeEditWindow()
        this.closeEditAccessWindow()
        this.handleMode('openBlock')
        this.setHandlers()
    }

    bindHandlers() {
        this.mouseOverHandlerBound = this.mouseOverHandler.bind(this)
        this.mouseOutHandlerBound = this.mouseOutHandler.bind(this)
        this.clickHandlerBound = this.clickHandler.bind(this)
        this.drawArrowHandlerBound = this.drawArrowHandler.bind(this)
    }

    setHandlers() {
        this.rootContainer.addEventListener('mouseover', this.mouseOverHandlerBound);
        this.rootContainer.addEventListener('mouseout', this.mouseOutHandlerBound);
        this.rootContainer.addEventListener('click', this.clickHandlerBound);
    }

    removeHandlers() {
        this.rootContainer.removeEventListener('mouseover', this.mouseOverHandlerBound);
        this.rootContainer.removeEventListener('mouseout', this.mouseOutHandlerBound);
        this.rootContainer.removeEventListener('click', this.clickHandlerBound);
    }


    mouseOverHandler(event) {
        event.preventDefault();
        const {element, parent} = this._getRelevantElements(event.target);
        if (!element) return;

        if (parent.hasAttribute('blockLink')) {
            parent.classList.add('block-link-active');
            this.activeElement = parent;
        } else {
            element.classList.add('block-active');
            this.activeElement = element;
        }
        const targetElement = parent.hasAttribute('blockLink') ? parent : element;

        if (targetElement.parentElement.id.includes('*')) return
        switch (this.clickMode) {
            case 'editBlock':
                this.blockEditor.openEditWindow(targetElement);
                break
            default:
                break
        }
    }

    mouseOutHandler(event) {
        event.preventDefault();
        if (this.activeElement) {
            if (this.activeElement.hasAttribute('blockLink')) {
                this.activeElement.classList.toggle('block-link-active')
            } else {
                this.activeElement.classList.toggle('block-active')
            }
            if (this.clickMode === "editBlock") {
                this.blockEditor.closeEditWindow()
            }
            this.activeElement = null;
        }
    }

    exitMoveMode() {
        this.handleMode('openBlock')
        document.querySelectorAll('[block]').forEach((el) => {
            el.removeAttribute('draggable')
        })
        document.querySelectorAll('.invisible-overlay').forEach(element => {
            element.remove();
        });
        this.isMoveInit = false
        setTimeout(() => {
            this.setHandlers()
        }, 50)
    }

    _addMoveElements(elements, blockEl) {
        if (this.isMoveInit) return
        elements.forEach((el) => {
            if (el.id !== blockEl.id &&
                !el.parentNode.hasAttribute('blockCustomGrid')) {
                if (el.parentNode.hasAttribute('blockLink')) el = el.parentNode

                const invisibleElement = document.createElement('div');

                invisibleElement.setAttribute('block_id', el.id)
                invisibleElement.setAttribute('parent_id', el.parentNode.id)
                invisibleElement.style.width = '15px';
                invisibleElement.style.height = `${el.offsetHeight + 20}px`;
                invisibleElement.style.position = 'absolute';
                invisibleElement.style.left = `${el.offsetLeft - 10}px`;
                invisibleElement.style.top = `${el.offsetTop - 10}px`;
                invisibleElement.style.opacity = '0.5';
                invisibleElement.style.pointerEvents = 'auto';
                invisibleElement.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                invisibleElement.classList.add('invisible-overlay');
                el.parentNode.insertBefore(invisibleElement, el);

                // Обработчик события для наведения мыши
                invisibleElement.addEventListener('mouseover', () => {
                    invisibleElement.style.opacity = '1'; // Элемент становится видимым при наведении
                });

                // Обработчик события для выхода мыши
                invisibleElement.addEventListener('mouseout', () => {
                    invisibleElement.style.opacity = '0.5'; // Элемент снова становится прозрачным
                });

                invisibleElement.addEventListener('mouseup', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (this.dragableElement) {
                        this.moveElement(this.dragableElement, {
                            parent: invisibleElement.getAttribute('parent_id'),
                            before: invisibleElement.getAttribute('block_id')
                        })
                        this.dragableElement = null;
                    }
                });
                this.isMoveInit = true
            }
        })
    }

    prepareMoveMode() {
        this.removeHandlers()
        const elements = document.querySelectorAll('[block]');

        elements.forEach((el) => {
            if (el.parentNode.id !== 'container-blocks'
                && !el.hasAttribute('blockCustomGrid')
                && !el.parentNode.hasAttribute('blockCustomGrid')
            ) {
                el.setAttribute('draggable', 'true')
                el.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._addMoveElements(elements, el)
                    this.dragableElement = el;
                });

                el.addEventListener('mouseup', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (this.dragableElement.id !== el.id) {
                        let id = el.id
                        if (el.parentNode.hasAttribute('blockLink')) id = el.id.split('*')[1]
                        this.moveElement(this.dragableElement, {parent: id, before: 0})
                        this.dragableElement = null;
                    }
                })
            }
        })
    }

    moveElement(src, dest) {
        let id = src.id
        let parentId = src.parentNode.id
        console.log(parentId)
        if (id.includes('*')) id = id.split('*')[1]
        if (parentId.includes('*')) parentId = parentId.split('*')[1]
        dispatch('MoveBlock', {
            block_id: id,
            old_parent_id: parentId,
            new_parent_id: dest.parent,
            before: dest.before
        })
        this.exitMoveMode()
    }

    closeEditAccessWindow() {
        const existingWindow = document.querySelector('.access-window');
        if (existingWindow) {
            existingWindow.remove();
        }
    }

    editAccessBlock(blockElement) {
        createAccessWindow(blockElement)
    }


    _getRelevantElements(target) {
        const element = this.findParentWithAttribute(target);
        if (!element) return {};

        const parent = element.parentElement;
        return {element, parent};
    }

// обработка клика по блоку в зависимости от активированного мода
    clickHandler(e) {
        const el = this.findParentWithAttribute(e.target);
        if (!el) return;

        const targetElement = el.parentElement.hasAttribute('blockLink') ? el.parentElement : el;
        const actionMethod = this.clickMode;

        if (typeof this[actionMethod] === 'function') {
            this[actionMethod](targetElement);
        }
    }

// Реализация методов из BaseController
    openBlock(blockElement) {
        const parent = blockElement.parentElement;
        let parentHsl = [];
        let blockId = blockElement.id;

        if (parent.hasAttribute('hsl')) {
            parentHsl = parent.getAttribute('hsl').split(',').map(Number);
        }
        if (blockElement.hasAttribute('blockLink')) {
            blockId = blockElement.firstChild.id.split('*')[1]; // id дочернего элемента это id блока-ссылки * id блока
        }
        dispatch('OpenBlock', {
            id: blockId, parentHsl: parentHsl, isIframe: blockElement.hasAttribute('blockIframe'),
        });
    }

    setListenerArrowBlock() {
        if (this.clickMode !== 'arrowMode') {
            const elements = document.querySelectorAll('div[block]');
            elements.forEach(el => {
                if (el.parentElement.id !== 'rootContainer') {
                    el.addEventListener('click', this.drawArrowHandlerBound);

                }
            });
        }
    }

    removeListenerArrowBlock() {
        const elements = document.querySelectorAll('div[block]');

        elements.forEach(el => {
            el.removeEventListener('click', this.drawArrowHandlerBound);
        });

        if (this.blockArrow) {
            this.blockArrow.classList.remove('block-arrow');
            this.blockArrow = undefined;
        }

        if (this.connectionManager.isCreatingConnection) {
            this.connectionManager.isCreatingConnection = false
        }
    }


    drawArrowHandler(e) {
        e.stopPropagation();
        e.preventDefault()
        const el = this.findParentWithAttribute(e.target);
        if (this.connectionManager.isCreatingConnection && el !== this.blockArrow) {
            // Если источник уже выбран, завершаем соединение
            this.connectionManager.completeConnectionToElement(el.id);
            this.blockArrow.classList.remove('block-arrow')
            this.blockArrow = undefined

            this.handleMode('openBlock')
        } else {
            // Иначе начинаем новое соединение от этого элемента
            el.classList.add('block-arrow')
            this.blockArrow = el
            this.connectionManager.startConnectionFromElement(el.id);
        }
    }

    resetArrowBlock() {
        const elements = document.querySelectorAll('div[block]');
        elements.forEach(el => {
            el.removeEventListener('click', this.drawArrowHandlerBound)
        })
    }

    createBlock(blockElement) {
        const title = prompt('Введите название блока');

        if (title !== null) dispatch('CreateBlock', {parent: blockElement, title});
        this.handleMode('openMode')

    }

    editBlock(blockElement) {
        this.removeHandlers()
        this.blockEditor.setHandlers(this.activeElement)
    }

    deActivateEdit() {
        this.setHandlers()
        this.blockEditor.closeEditWindow()
        this.blockEditor.removeHandlers()
    }

    activeEdit() {
        if (this.activeElement) this.blockEditor.openEditWindow(this.activeElement);
    }

    copyBlock(blockElement) {
        this.copies = new Set()
        if (this.selectedBlocks.size) {
            this.selectedBlocks.forEach((el) => {
                this.copies.add(el);
                el.classList.remove('block-selected');
            });
            this.selectedBlocks.clear();
        } else if (blockElement) {
            this.copies.add(blockElement);
            this.handleMode('openBlock', null);
        }
    }

    cutBlock(blockElement) {
        this.copies = new Set()
        if (this.selectedBlocks.size) {
            this.selectedBlocks.forEach((el) => {
                if (el.parentElement.id === 'container-blocks') {
                    alert("Нельзя удалять корневой элемент. Вернитесь на блок выше.")
                    return
                }
                this.copies.add(el);
                dispatch('DeleteBlock', {removeId: el.id, parentId: el.parentElement.id});
            });
            this.selectedBlocks.clear();
        } else if (blockElement) {
            this.copies.add(blockElement);
            dispatch('DeleteBlock', {removeId: blockElement.id, parentId: blockElement.parentElement.id});
            this.handleMode('pasteBlock', document.getElementById('pasteBlock'));
        }
    }

    pasteBlock(blockElement) {
        const blocksToPaste = this.copies.size ? this.copies : this.selectedBlocks;
        const ids = []
        let dest = blockElement.id

        if (blockElement.hasAttribute('blockLink')) {
            dest = blockElement.getAttribute('blockLink')
        }

        blocksToPaste.forEach((el) => ids.push(el.id))
        dispatch('PasteBlock', {dest: dest, src: ids});
        this.clearActiveBlocks(blocksToPaste);
        this.handleMode('openBlock', null);
    }

    pasteLinkBlock(blockElement) {
        const blocksToPaste = this.copies.size ? this.copies : this.selectedBlocks
        const ids = []
        blocksToPaste.forEach((el) => ids.push(el.id))
        let dest = blockElement.id

        if (blockElement.hasAttribute('blockLink')) {
            dest = blockElement.getAttribute('blockLink')
        }


        dispatch('PasteLinkBlock', {dest: dest, src: ids});
        this.clearActiveBlocks(blocksToPaste);
        this.handleMode('openBlock', null);
    }

    deleteBlock(blockElement) {
        const parent = blockElement.parentElement
        if (parent.id === 'container-blocks') {
            alert("Нельзя удалять корневой элемент. Вернитесь на блок выше.")
            return
        }
        if (confirm(`Вы уверены, что хотите удалить блок ${blockElement.id} у родителя ${parent.id}`)) {
            dispatch('DeleteBlock', {removeId: blockElement.id, parentId: parent.id});
            this.clearActiveBlocks(this.selectedBlocks);
            this.handleMode('openBlock', null);
        } else {
            this.clearActiveBlocks(this.selectedBlocks);
            this.handleMode('openBlock', null);
        }
    }

    selectBlock(blockElement) {
        if (this.selectedBlocks.has(blockElement)) {
            this.selectedBlocks.delete(blockElement);
            blockElement.classList.remove('block-selected');
        } else {
            this.selectedBlocks.add(blockElement);
            blockElement.classList.add('block-selected');
        }
    }

    textBlock(blockElement) {
        let id = blockElement.id
        if (blockElement.hasAttribute('blockLink')) {
            blockElement = blockElement.children[0]
            id = blockElement.id.split('*')[1]
        }
        const oldText = blockElement.querySelector('contentBlock')?.innerText

        const text = prompt('Введите текст блока', oldText ?? '')
        if (text !== null) dispatch('TextUpdate', {blockId: id, text})
        this.handleMode('openBlock')

    }

    titleBlock(blockElement) {
        let id = blockElement.id
        if (blockElement.hasAttribute('blockLink')) {
            blockElement = blockElement.children[0]
            id = blockElement.id.split('*')[1]
        }
        const oldText = blockElement.querySelector('titleBlock')?.innerText
        const title = prompt('Введите название блока', oldText ?? '')
        if (title !== null) dispatch('TitleUpdate', {blockId: id, title})
        this.handleMode('openBlock')
    }

    colorBlock(blockElement) {
        if (this.colorValue) {
            dispatch('SetHueBlock', {blockId: blockElement.id, hue: this.colorValue})
            this.colorValue = null
            this.handleMode('openBlock')
        }
    }


// Вспомогательные методы

    findParentWithAttribute(el, attributeName = 'block') {
        while (el && el !== document.documentElement) {
            if (el.hasAttribute(attributeName)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }


    clearActiveBlocks(blocks) {
        blocks.forEach((el) => {
            if (el.classList) el.classList.remove('block-selected');
        });
        blocks.clear();
    }

    capitalize(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
}


