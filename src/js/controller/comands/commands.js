import {arrowCommands} from "./arrowComands";
import {validURL} from "../../utils/functions";
import {dispatch} from "../../utils/utils";
import {colorCommands} from "./colorCommands";
import {arrowManager} from "../arrowManager";
import api from "../../api/api";
import {customPrompt} from "../../utils/custom-dialog";

import {
    commandOpenBlock,
    openBlock,
    setCmdOpenBlock
} from "./cmdUtils";
import {popupsCommands} from "./popupsCmd";
import {NoteEditor} from "../noteEditor";
import Cookies from "js-cookie";
// LLM_GATEWAY_URL is injected by webpack DefinePlugin
/* global LLM_GATEWAY_URL */

// Actions
import {
    copyBlockId,
    copyMultipleBlockIds,
    getBlockIdFromClipboard,
    getBlockIdsFromClipboard,
    startCutBlock,
    completeCutBlock,
    extractBlockId,
    extractParentId,
    MODES
} from "../../actions/selectionActions";
import {
    switchTreeByIndex
} from "../../actions/navigationActions";

const nodeEditor = new NoteEditor('editor-container')

function createTreeCmd() {
    const cmds = new Array(10)
    // space+0 переключает на последнюю вкладку
    cmds[0] = {
        id: `openTree0`,
        mode: ['normal'],
        defaultHotkey: `space+0`,
        description: `Переключится на последнею вкладку.`,
        async execute(ctx) {
            const result = await switchTreeByIndex(0)
            if (result.success) {
                dispatch('ShowBlocks')
            }
            setCmdOpenBlock(ctx)
        }
    }
    // space+1..9 переключает на соответствующую вкладку
    for (let i = 1; i < 10; i++) {
        cmds[i] = {
            id: `openTree${i}`,
            mode: ['normal'],
            defaultHotkey: `space+${i}`,
            description: `Переключится на ${i} вкладку.`,
            async execute(ctx) {
                const result = await switchTreeByIndex(i)
                if (result.success) {
                    dispatch('ShowBlocks')
                }
                setCmdOpenBlock(ctx)
            }
        }
    }
    return cmds
}

const treeCommands = createTreeCmd()

export const commands = [
    {
        id: 'openBlock',
        mode: ['normal'],
        regLink: true,
        execute(ctx) {
            let blockElement = ctx.blockElement
            if (!blockElement) {
                blockElement = ctx.rootContainer.children[0]
            }
            openBlock(blockElement, ctx)
        }
    },
    {
        id: 'back',
        mode: ['normal'],
        regLink: true,
        btn: {
            containerId: 'top-btn-container',
            label: 'Назад',
            classes: ['sidebar-button', 'top-btn', 'fas', 'fa-arrow-up', 'fas-lg']
        },
        throttleDisable: true,
        defaultHotkey: 'backspace',
        description: 'Назад',
        execute(ctx) {

        },
        btnExec(ctx) {
            if (ctx.mode === 'normal') {
                const rootBlock = ctx.rootContainer.children[0]
                if (rootBlock.hasAttribute('block')) {
                    dispatch('OpenBlock', {id: rootBlock.id})
                }
                setCmdOpenBlock(ctx)
            }
        }
    },
    {
        id: 'escape',
        mode: ['*'],
        defaultHotkey: 'esc',
        regLink: true,
        execute(ctx) {
            // Очистка мульти-выделения
            if (ctx.hasMultiSelection()) {
                ctx.clearSelection()
                setCmdOpenBlock(ctx)
                return
            }

            if (ctx.mode === MODES.TEXT_EDIT) {
                nodeEditor.closeEditor(false)
            }
            if (ctx.mode === MODES.CONNECT_TO_BLOCK) {
                ctx.connect_source_id = undefined
                ctx.sourceEl.classList.remove('block-selected')
                ctx.sourceEl = undefined
            }
            if (ctx.mode === MODES.CUT_BLOCK) {
                if (ctx.beforeBlockElement) ctx.beforeBlockElement.remove()

                // Очистка при групповом вырезании
                if (ctx.cutIsMultiple && Array.isArray(ctx.cut)) {
                    for (const cutData of ctx.cut) {
                        const el = document.getElementById(cutData.block_id)
                        if (el) el.classList.remove('block-selected')
                        const linkEl = document.querySelector(`[blocklink="${cutData.block_id}"]`)
                        if (linkEl) linkEl.classList.remove('block-selected')
                    }
                } else {
                    const target = ctx.blockLinkElement || ctx.blockElement
                    if (target) target.classList.remove('block-selected')
                }
                // Очистка состояния ПОСЛЕ визуальной очистки
                ctx.clearSelection()
                ctx.cut = undefined
                ctx.cutIsMultiple = false
            }
            if (ctx.mode === MODES.DIAGRAM) {
                ctx.diagramUtils.hiddenInputs()
            }
            if (ctx.mode === MODES.CHAT) {
                if (window.LLMFullscreenChat) {
                    window.LLMFullscreenChat.close();
                }
            }
            ctx.mode = MODES.NORMAL
            ctx.event = undefined
            ctx.blockId = undefined
            ctx.closePopups()
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'EnterKey',
        defaultHotkey: 'enter',
        description: 'Открывает выделенный блок',
        regLink: true,
        mode: ['*'],
        execute(ctx) {
            if (ctx.mode === MODES.NORMAL) {
                if (!ctx.blockId) {
                    commandOpenBlock(ctx)
                }
            }
            if (ctx.mode === MODES.TEXT_EDIT) {
                nodeEditor.closeEditor(true)
                ctx.mode = MODES.NORMAL
                ctx.event = undefined
            }
            ctx.submitPopup()
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'shiftEnterKey',
        defaultHotkey: 'shift+enter',
        mode: ['textEdit'],
        execute(ctx) {
        }
    },
    {
        id: 'chatClose',
        mode: ['chat'],
        defaultHotkey: 'shift+h',
        description: 'Закрыть чат',
        execute(ctx) {
            if (window.LLMFullscreenChat) {
                window.LLMFullscreenChat.close();
            }
            ctx.mode = MODES.NORMAL;
        }
    },
    {
        id: 'chat',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Chat',
            classes: ['sidebar-button', 'fas', 'fa-comment', 'fas-lg']
        },
        defaultHotkey: 'shift+h',
        description: 'Открыть чат',
        execute(ctx) {
            const token = Cookies.get('access')
            if (window.LLMFullscreenChat) {
                if (!window.LLMFullscreenChat.isInitialized()) {
                    window.LLMFullscreenChat.init({
                        apiUrl: LLM_GATEWAY_URL,
                        token: token,
                        onClose: () => { ctx.mode = MODES.NORMAL }
                    });
                }
                window.LLMFullscreenChat.open();
                ctx.mode = MODES.CHAT;
            }
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    {
        id: 'newBlock',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Создать новый блок',
            classes: ['sidebar-button', 'fas', 'fa-plus-square', 'fas-lg']
        },
        defaultHotkey: 'n',
        description: 'Создать новый блок',
        execute(ctx) {
            let id = ctx.blockElement?.id.split('*').at(-1)
            if (!id) return
            customPrompt('Введите название блока').then(title => {
                if (title !== null) {
                    if (validURL(title)) dispatch('IframeCreate', {parentId: id, src: title})
                    else dispatch('CreateBlock', {parentId: id, title});
                }
                setCmdOpenBlock(ctx)
            });
        }
    },
    {
        id: "editBlockTitle",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Изменить название блока',
            classes: ['sidebar-button', 'fas', 'fa-edit', 'fas-lg']
        },
        defaultHotkey: 't',
        description: 'Изменить название блока',
        execute(ctx) {
            if (!ctx.blockElement) return
            let id = ctx.blockElement?.id
            if (ctx.blockLinkElement?.hasAttribute('blockLink')) {
                id = ctx.blockLinkElement.getAttribute('blocklink')
            }
            const oldText = ctx.blockElement.querySelector('titleBlock')?.innerText
            customPrompt('Введите название блока', oldText ?? '').then(title => {
                if (title !== null) {
                    if (validURL(title)) {
                        dispatch('SetIframe', {blockId: id, src: title})
                    } else {
                        dispatch('TitleUpdate', {blockId: id, title})
                    }
                }
                setCmdOpenBlock(ctx)
            })

        }
    },
    {
        id: "editBlockText",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Изменить текст в блоке',
            classes: ['sidebar-button', 'fas', 'fa-keyboard', 'fas-lg']
        },
        defaultHotkey: 'w',
        description: 'Изменить текст в блоке.',
        execute(ctx) {
            if (!ctx.blockElement) return
            let id = ctx.blockElement?.id
            if (ctx.blockLinkElement?.hasAttribute('blockLink')) {
                id = ctx.blockLinkElement.getAttribute('blocklink')
            }
            ctx.mode = MODES.TEXT_EDIT
            nodeEditor.openEditor(id, ctx.blockElement.querySelector('contentBlock').innerHTML, ctx)
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "cutBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Переместить блок в другое место',
            classes: ['sidebar-button', 'fas', 'fa-cut', 'fas-lg']
        },
        defaultHotkey: 'shift+x',
        description: 'Переместить блок(и) в другое место.',
        execute(ctx) {
            // Групповое вырезание
            if (ctx.hasMultiSelection()) {
                const cutDataArray = []
                for (const blockId of ctx.getSelectedBlockIds()) {
                    const elements = ctx.selectedElements.get(blockId)
                    if (!elements) continue
                    const target = elements.linkElement || elements.element
                    const parentId = extractParentId(target)
                    if (parentId && parentId !== 'rootContainer') {
                        cutDataArray.push({
                            block_id: blockId,
                            old_parent_id: parentId
                        })
                        target.classList.add('block-selected')
                    }
                }
                if (cutDataArray.length > 0) {
                    ctx.mode = MODES.CUT_BLOCK
                    ctx.cut = cutDataArray
                    ctx.cutIsMultiple = true
                } else {
                    setCmdOpenBlock(ctx)
                }
                return
            }

            // Одиночное вырезание
            const target = ctx.blockLinkElement || ctx.blockElement
            if (!target) return

            const blockId = extractBlockId(target)
            const parentId = extractParentId(target)

            const result = startCutBlock(blockId, parentId)
            if (result.success) {
                target.classList.add('block-selected')
                ctx.mode = MODES.CUT_BLOCK
                ctx.cut = result.cutData
                ctx.cutIsMultiple = false
            } else {
                setCmdOpenBlock(ctx)
            }
        }
    },
    {
        id: 'copyBlock',
        btn: {
            containerId: 'control-panel',
            label: 'Копировать id блокa',
            classes: ['sidebar-button', 'fas', 'fa-copy', 'fas-lg'],
        },
        description: 'Копирует id выбранного блока(ов).',
        defaultHotkey: 'shift+c',
        mode: ['normal',],
        execute(ctx) {
            // Групповое копирование
            if (ctx.hasMultiSelection()) {
                const selectedIds = ctx.getSelectedBlockIds()
                copyMultipleBlockIds(selectedIds)
                ctx.clearSelection()
                setCmdOpenBlock(ctx)
                return
            }

            // Одиночное копирование
            const blockId = extractBlockId(ctx.blockElement)
            if (!blockId) return

            copyBlockId(blockId)
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'pasteBlock',
        mode: ['normal', 'cutBlock'],
        btn: {
            containerId: 'control-panel',
            label: 'Вставить копию блока',
            classes: ['sidebar-button', 'fas', 'fa-paste', 'fas-lg']
        },
        defaultHotkey: 'shift+v',
        description: 'Если скопирован id делает копию блока(ов) и вставляет в блок.',
        async execute(ctx) {
            if (ctx.mode === MODES.CUT_BLOCK) {
                const newParentId = extractBlockId(ctx.blockElement)

                // Групповое перемещение
                if (ctx.cutIsMultiple && Array.isArray(ctx.cut)) {
                    // Проверка на circular reference - нельзя переместить блок внутрь себя
                    if (ctx.cut.some(cutData => cutData.block_id === newParentId)) {
                        console.warn('Cannot move block into itself')
                        return
                    }
                    for (const cutData of ctx.cut) {
                        const result = completeCutBlock(cutData, newParentId)
                        if (result.success) {
                            dispatch('MoveBlock', result.moveData)
                        }
                    }
                    ctx.clearSelection()
                } else {
                    // Одиночное перемещение
                    const result = completeCutBlock(ctx.cut, newParentId)
                    if (result.success) {
                        dispatch('MoveBlock', result.moveData)
                    }
                }

                if (ctx.beforeBlockElement) ctx.beforeBlockElement.remove()
                ctx.cut = undefined
                ctx.cutIsMultiple = false
                ctx.mode = MODES.NORMAL
                setCmdOpenBlock(ctx)
            } else {
                // Вставка скопированных блоков
                const destId = extractBlockId(ctx.blockElement)
                if (!destId) return

                const clipboardResult = await getBlockIdsFromClipboard()
                if (clipboardResult.success) {
                    dispatch('PasteBlock', {dest: destId, src: clipboardResult.blockIds});
                }
                setCmdOpenBlock(ctx)
            }
        }
    },
    {
        id: "pasteBlockLink",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Вставить блок как ссылку',
            classes: ['sidebar-button', 'fas', 'fa-link', 'fas-lg']
        },
        defaultHotkey: 'shift+l',
        description: 'Если скопирован id, вставляет блок как ссылку',
        async execute(ctx) {
            const destId = extractBlockId(ctx.blockElement)
            if (!destId) return

            const clipboardResult = await getBlockIdFromClipboard()
            if (!clipboardResult.success) return
            if (destId === clipboardResult.blockId) return

            dispatch('PasteLinkBlock', {dest: destId, src: [clipboardResult.blockId]});
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'pasteBlockBefore',
        mode: ['cutBlock'],
        defaultHotkey: 'shift+ctrl+v',
        description: 'Если до этого была команда cutBlock, то производится вставка перед выделенным блоком.',
        async execute(ctx) {
            if (ctx.beforeBlockElement) {
                const newParentId = ctx.beforeBlockElement.getAttribute('parent_id').split('*').at(-1)
                const beforeId = ctx.beforeBlockElement.getAttribute('block_id')
                const result = completeCutBlock(ctx.cut, newParentId, beforeId)
                if (result.success) {
                    dispatch('MoveBlock', result.moveData)
                }
                ctx.beforeBlockElement.remove()
            } else {
                dispatch('MoveBlock', ctx.cut)
            }
            ctx.cut = undefined
            ctx.mode = MODES.NORMAL
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'undo',
        defaultHotkey: 'shift+z',
        btn: {
            containerId: 'control-panel',
            label: 'Отменить последнее действие',
            classes: ['sidebar-button', 'fas', 'fa-rotate-left', 'fas-lg'],
        },
        description: 'Отменить последнее действие',
        mode: ['normal'],
        execute(ctx) {
            dispatch('Undo')
            setCmdOpenBlock(ctx)
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    {
        id: 'redo',
        defaultHotkey: 'shift+ctrl+z',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Отменить отмену действия',
            classes: ['sidebar-button', 'fas', 'fa-rotate-right', 'fas-lg'],
        },
        description: 'Отменить отмену последнего действия',
        execute(ctx) {
            dispatch('Redo')
            setCmdOpenBlock(ctx)
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    {
        id: "removeTreeBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Удалить дерево',
            classes: ['sidebar-button', 'fas', 'fa-trash', 'fas-lg'],
        },
        defaultHotkey: 'shift+d',
        description: 'Удаляет блок(и), и все дочерние блоки',
        execute(ctx) {
            // Групповое удаление - одно подтверждение для всех блоков
            if (ctx.hasMultiSelection()) {
                const selectedIds = ctx.getSelectedBlockIds()
                dispatch('DeleteMultipleTreeBlocks', {blockIds: selectedIds})
                ctx.clearSelection()
                ctx.shiftLock = false
                setCmdOpenBlock(ctx)
                return
            }

            // Одиночное удаление
            const id = ctx.blockLinkElement?.id || ctx.blockElement?.id
            if (!id) return
            dispatch('DeleteTreeBlock', {blockId: id})
            ctx.shiftLock = false
            ctx.blockElement = ctx.blockLinkElement?.parentNode ?? ctx.blockElement?.parentNode
            if (ctx.blockElement && ctx.blockElement.id.indexOf('*') !== -1) {
                ctx.blockLinkElement = ctx.blockElement.parentNode
                ctx.blockElement = undefined

            }
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "createDiagram",
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Включить режим создания схемы в блоке',
            classes: ['sidebar-button', 'fas', 'fa-project-diagram', 'fas-lg',]
        },
        defaultHotkey: 'd',
        description: 'создать блок-схему',
        execute(ctx) {
            if (ctx.mode !== MODES.DIAGRAM) {
                const blockId = extractBlockId(ctx.blockElement)
                if (!blockId) return
                ctx.mode = MODES.DIAGRAM
                ctx.diagramUtils.showInputs(blockId, ctx.blockElement)
            }
        },
        btnExec(ctx) {
            if (ctx.mode === MODES.DIAGRAM) {
                ctx.mode = MODES.NORMAL
                ctx.diagramUtils.hiddenInputs()
                setCmdOpenBlock(ctx)
            }
        }
    },
    {
        id: 'options',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Дополнительные функции',
            classes: ['sidebar-button', 'fas', 'fa-bars', 'fas-lg']
        },
        defaultHotkey: 'o',
        description: 'Открыть дополнительные опции',
        btnExec(ctx) {
            ctx.optionManager.openOptions()
        }
    },
    {
        id: "connectBlock",
        mode: ['normal', 'connectToBlock'],
        btn: {
            containerId: 'control-panel',
            label: 'Добавить соединение между блоками',
            classes: ['sidebar-button', 'fas', 'fa-light', 'fa-down-left-and-up-right-to-center', 'fas-lg'],
        },
        defaultHotkey: 'a',
        description: 'Создать стрелочку от блока до другого блока',
        execute(ctx) {
            if (ctx.mode === MODES.NORMAL && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
            } else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    arrowManager.completeConnectionToElement(ctx.connect_source_id, targetId)
                    ctx.connect_source_id = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    ctx.mode = MODES.NORMAL
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                }
            }
        }
    },
    {
        id: "deleteConnectBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Удалить соединение между блоками',
            classes: ['sidebar-button', 'fas', 'fa-arrows-right-left', 'text-danger', 'fa-rotate-180', 'fas-lg'],
        },
        defaultHotkey: 'shift+a',
        description:
            'Удалить стрелочки',
        execute(ctx) {
            dispatch('setRemoveArrow')
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    ...popupsCommands,
    {
        id: "deleteLocalCache",
        mode:
            ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Очистить локальный кеш блоков',
            classes: ['sidebar-button', 'fas', 'fa-sync', 'fas-lg'],
        },
        defaultHotkey: 'shift+r',
        description:
            'Очистить локальный кеш блоков',
        execute(ctx) {
            dispatch('ResetState')
            setCmdOpenBlock(ctx)
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    {
        id: "validateTree",
        mode: ['normal'],
        defaultHotkey: 'shift+v',
        description: 'Проверить целостность дерева блоков',
        execute(ctx) {
            dispatch('ValidateTree')
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "repairTree",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Восстановить дерево блоков',
            classes: ['sidebar-button', 'fas', 'fa-wrench', 'fas-lg'],
        },
        defaultHotkey: 'shift+f',
        description: 'Восстановить целостность дерева блоков',
        execute(ctx) {
            dispatch('RepairTree')
            setCmdOpenBlock(ctx)
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    {
        id: 'Exit',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Выход',
            classes: ['sidebar-button', 'fas', 'fa-right-from-bracket', 'fas-lg'],
        },
        defaultHotkey: '',
        description: 'Выход',
        execute(ctx) {
            api.logout()
            setCmdOpenBlock(ctx)
        },
        btnExec(ctx) {
            this.execute(ctx)
        }
    },
    ...treeCommands,
    ...arrowCommands,
    ...colorCommands,

];
