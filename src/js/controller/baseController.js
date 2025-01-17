// BaseController.js
import {dispatch} from "../utils/utils";
import api from "../api/api";
import {SearchWindow} from "./searchWindow";
import {isValidUUID} from "../utils/functions";

class BaseController {
    constructor(jsPlumbInstance) {
        this.clickMode = 'openBlock';
        this.selectedBlocks = new Set();
        this.copies = new Set();
        this.activeElement = null;
        this.currentActiveButton = null;

        this.indicator = document.getElementById('active-button-info')
        this.indicator.innerText = 'open'
        this.searchWindow = new SearchWindow()

        this.closeSearchWindow = document.getElementById('closeSearchModal')

        this.handleMode = this.handleMode.bind(this);

        // document.getElementById('openToolbar').addEventListener('click', this.handleOpenToolbar.bind(this));
        // document.getElementById('closeToolbar').addEventListener('click', this.handleOpenToolbar.bind(this));


        this.closeSearchWindow.addEventListener('click', () => {
            this.searchWindow.closeSearchWindow()
            this.handleMode('openBlock')
        })

    }

    closeToolbar() {
        document.getElementById('control-panel').classList.remove('active');
        this.isOpenedToolbar = false
    }

    handleMode(mode, el = null) {
        if (el === null) {
            if (this.currentActiveButton) this.currentActiveButton.classList.remove('active-button');
            this.currentActiveButton = null;
            this.clickMode = 'openBlock';
        } else if (this.clickMode === mode) {
            if (this.currentActiveButton) this.currentActiveButton.classList.remove('active-button');
            this.currentActiveButton = null;
            this.clickMode = 'openBlock';
        } else {
            if (this.currentActiveButton) this.currentActiveButton.classList.remove('active-button');
            el.classList.add('active-button');
            this.currentActiveButton = el;
            this.clickMode = mode;
        }
        if (this.clickMode === 'arrowBlock') {
            this.setListenerArrowBlock()
        }
        if (this.clickMode === 'moveMode') {
            this.prepareMoveMode()
        }
        this.indicator.innerText = this.clickMode.replace('Block', '')

        this.closeEditAccessWindow()

        document.getElementById('control-panel').classList.remove('active');
    }

    handleSearchBlock(el) {
        if (this.clickMode === 'searchMode') {
            this.searchWindow.closeSearchWindow()
            this.handleMode('openBlock')
        } else {
            this.searchWindow.openSearchWindow()
            this.handleMode('searchMode', el)
        }
    }

    handleToggleSidebarBtn() {
        const sidebar = document.getElementById('sidebar');
        localStorage.setItem('sidebarIsHidden', sidebar.classList.toggle('hidden'))
    }
    handleResetState() {
        dispatch('ResetState')
    }

    handleExit() {
        api.logout()
        this.closeToolbar()
    }

    handleMoveBlock(el) {
        this.handleMode('moveMode', el)
    }

    handleBtnColor(el) {
        this.colorValue = el.getAttribute('value')
        if (this.activeElement) {
            this.colorBlock(this.activeElement)
        } else {
            this.handleMode('colorBlock', el)
        }
    }

    handleTextBlock(el) {
        if (this.activeElement) {
            this.textBlock(this.activeElement)
        } else {
            this.handleMode('textBlock', el)
        }
    }

    handleEditAccessBlock(el) {
        this.handleMode('editAccessBlock', el)
    }

    handleCopyIdBlock(el) {
        if (this.activeElement) {
            navigator.clipboard.writeText(this.activeElement.id)
        }
    }

    handleTitleBlock(el) {
        if (this.activeElement) {
            this.titleBlock(this.activeElement)
        } else {
            this.handleMode('titleBlock', el)
        }
    }

    handleCutBlock(el) {
        if (confirm(`Перейти в режим вырезание блоков?`)) {
            if (this.activeElement) {
                this.cutBlock(this.activeElement)
            } else {
                this.handleMode('cutBlock', el)
            }
        }
    }

    // обработка нажатия на кнопку или на хоткей

    handleArrowBlock(el) {
        this.handleMode('arrowBlock', el)
    }

    // Обработчики действий
    handleCreateBlock(el) {
        if (this.activeElement) {
            if (this.activeElement.hasAttribute('blockLink')) {
                this.createBlock(this.activeElement.children[0])
            } else this.createBlock(this.activeElement)
        } else this.handleMode('createBlock', el);
    }

    handleSelectBlock(el) {
        this.handleMode('selectBlock', el);
    }

    handleCopyBlock(el) {
        if (this.activeElement) {
            this.copyBlock(this.activeElement);
            this.indicator.innerText = 'copy'
            setTimeout(() => {
                this.handleMode('openBlock', null);
            }, 300)
        } else {
            this.handleMode('copyBlock', el);
        }
    }

    handlePasteBlock(el) {
        navigator.clipboard.readText().then((clipText) => {
            if (this.activeElement !== null && (this.selectedBlocks.size || this.copies.size)) {
                this.pasteBlock(this.activeElement);
                this.handleMode('openBlock', null);
            } else if (this.activeElement === null && (this.selectedBlocks.size || this.copies.size)) {
                this.handleMode('pasteBlock', el);
            } else if (this.activeElement !== null && isValidUUID(clipText)) {
                dispatch('PasteBlock', {dest: this.activeElement.id, src: [clipText]})
            } else {
                console.log('Нечего вставлять');
            }
        })
    }

    handlePasteLinkBlock(el) {
        navigator.clipboard.readText().then((clipText) => {
            console.log(clipText, this.activeElement)
            if (this.activeElement !== null && (this.selectedBlocks.size || this.copies.size)) {
                this.pasteLinkBlock(this.activeElement);
                this.handleMode('openBlock', null);
            } else if (this.activeElement === null) {
                this.handleMode('pasteLinkBlock', el);
            } else if (this.activeElement !== null && isValidUUID(clipText)) {
                dispatch('PasteLinkBlock', {dest: this.activeElement.id, src: [clipText]})
            } else {
                console.log('Нечего вставлять');
            }
        })
    }

    handleDeleteTreeBlock(el) {
        if (this.activeElement) {
            this.deleteTreeBlock(this.activeElement);
            this.handleMode('openBlock', null);
        } else {
            this.handleMode('deleteTreeBlock', el);
        }

    }

    handleDeleteBlock(el) {
        if (this.activeElement) {
            this.deleteBlock(this.activeElement);
            this.handleMode('openBlock', null);
        } else {
            this.handleMode('deleteBlock', el);
        }
    }

    handleDeleteArrowBlock(el) {
        this.handleMode('deleteArrowBlock', el)
        if (this.clickMode === 'deleteArrowBlock') dispatch('setRemoveArrow', {remove: true})
        else dispatch('setRemoveArrow', {remove: false})
    }

    handleEditBlock(el) {
        if (this.clickMode === 'editBlock') {
            this.handleMode('clickBlock');
            this.deActivateEdit()
            this.setHandlers()
        } else {
            this.handleMode('editBlock', el);
            this.activeEdit()
        }
    }

    // Методы для работы с блоками
    pasteBlock(blockElement) {
        // Реализация в дочернем классе
    }

    pasteLinkBlock(blockElement) {
        // Реализация в дочернем классе
    }

    deleteBlock(blockElement) {
    }

    copyBlock(blockElement) {
        // Реализация в дочернем классе
    }

    deactivateBlock() {

    }

    deActivateResize() {

    }

    activeResize() {

    }

    setHandlers() {

    }

    resetArrowBlock() {
    }
}

export default BaseController;
