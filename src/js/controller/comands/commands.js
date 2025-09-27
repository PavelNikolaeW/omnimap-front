import {arrowCommands} from "./arrowComands";
import {copyToClipboard, getClipboardText, isValidUUID, validURL} from "../../utils/functions";
import {dispatch} from "../../utils/utils";
import {colorCommands} from "./colorCommands";
import {arrowManager} from "../arrowManager";
import api from "../../api/api";
import {customPrompt} from "../../utils/custom-dialog";

import {
    commandOpenBlock,
    getTreeIds,
    getTreePath,
    openBlock,
    setCmdOpenBlock, setCurrentTree
} from "./cmdUtils";
import {popupsCommands} from "./popupsCmd";
import {NoteEditor} from "../noteEditor";
import {log} from "@jsplumb/browser-ui";

const nodeEditor = new NoteEditor('editor-container')

function createTreeCmd() {
    const cmds = new Array(10)
    cmds[0] = {
        id: `openTree0`,
        mode: ['normal'],
        defaultHotkey: `space+0`,
        description: `Переключится на последнею вкладку.`,
        execute(ctx) {
            getTreeIds((err, treeIds) => {
                setCurrentTree(treeIds.at(-1), () => {
                    dispatch('ShowBlocks')
                })
            })
            setCmdOpenBlock(ctx)
        }
    }
    for (let i = 1; i < 10; i++) {
        cmds[i] = {
            id: `openTree${i}`,
            mode: ['normal'],
            defaultHotkey: `space+${i}`,
            description: `Переключится на ${i} вкладку.`,
            execute(ctx) {
                getTreeIds((err, treeIds) => {
                    if (treeIds.length > i - 1)
                        setCurrentTree(treeIds[i - 1], () => {
                            dispatch('ShowBlocks')
                        })
                })
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
            if (ctx.mode === 'textEdit') {
                nodeEditor.closeEditor(false)
            }
            if (ctx.mode === 'connectToBlock') {
                ctx.connect_source_id = undefined
                ctx.sourceEl.classList.remove('block-selected')
                ctx.sourceEl = undefined
            }
            if (ctx.mode === 'cutBlock') {
                if (ctx.beforeBlockElement) ctx.beforeBlockElement.remove()
                const target = ctx.blockLinkElement || ctx.blockElement
                target.classList.remove('block-selected')
                ctx.cut = undefined
            }
            if (ctx.mode === 'diagram') {
                ctx.diagramUtils.hiddenInputs()
            }
            if (ctx.mode === 'chat') {
                window.closeChat(ctx)
            }
            ctx.mode = 'normal'
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
            if (ctx.mode === 'normal') {
                if (!ctx.blockId) {
                    commandOpenBlock(ctx)
                }
            }
            if (ctx.mode === 'textEdit') {
                nodeEditor.closeEditor(true)
                ctx.mode = 'normal'
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
            window.closeChat()
            console.log('close')
        }
    },
    {
        id: 'chat',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Chat',
            classes: ['sidebar-button', 'fas', 'fa-chat', 'fas-lg']
        },
        defaultHotkey: 'shift+h',
        description: 'Открыть чат',
        execute(ctx) {
            window.openChat(ctx)
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
            ctx.mode = 'textEdit'
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
        description: 'Переместить блок в другое место.',
        execute(ctx) {
            const target = ctx.blockLinkElement || ctx.blockElement
            if (!target) return
            const id = target.id.split('*').at(-1)
            const parentId = target.parentElement.id
            if (id && parentId && parentId !== 'rootContainer') {
                target.classList.add('block-selected')
                ctx.mode = 'cutBlock'
                ctx.cut = {
                    block_id: id,
                    old_parent_id: parentId.split('*').at(-1)
                }
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
        description: 'Копирует id выбранного блока или ожидает клика по блоку.',
        defaultHotkey: 'shift+c',
        mode: ['normal',],
        async execute(ctx) {
            const id = ctx.blockElement?.id?.split('*')?.at(-1)
            if (!id) return
            copyToClipboard(id)
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
        description: 'Если скопирован id делает копию блока и дочерних элементов и вставляет в блок.',
        async execute(ctx) {
            if (ctx.mode === 'cutBlock') {
                dispatch('MoveBlock', ctx.cut)
                if (ctx.beforeBlockElement) ctx.beforeBlockElement.remove()
                ctx.cut = undefined
                ctx.mode = 'normal'
                setCmdOpenBlock(ctx)
            } else {
                const id = ctx.blockElement?.id?.split('*').at(-1)
                const srcId = await getClipboardText()
                if (!id) return
                if (isValidUUID(srcId)) {
                    dispatch('PasteBlock', {dest: id, src: [srcId]});
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
            const id = ctx.blockElement?.id?.split('*').at(-1)
            if (!id) return
            const srcId = await getClipboardText()
            if (id === srcId) return
            if (isValidUUID(srcId)) {
                dispatch('PasteLinkBlock', {dest: id, src: [srcId]});
            }
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
                ctx.cut['new_parent_id'] = ctx.beforeBlockElement.getAttribute('parent_id').split('*').at(-1)
                ctx.cut['before'] = ctx.beforeBlockElement.getAttribute('block_id')
                ctx.beforeBlockElement.remove()
            }
            dispatch('MoveBlock', ctx.cut)
            ctx.cut = undefined
            ctx.mode = 'normal'
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
        description: 'Удаляет блок, и все дочерние блоки',
        execute(ctx) {
            const id = ctx.blockLinkElement?.id || ctx.blockElement.id
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
            if (ctx.mode !== 'diagram') {
                let id = ctx.blockElement?.id?.split('*')?.at(-1)
                if (!id) return
                ctx.mode = 'diagram'
                ctx.diagramUtils.showInputs(id, ctx.blockElement)
            }
        },
        btnExec(ctx) {
            console.log(ctx)
            if (ctx.mode === 'diagram') {
                ctx.mode = 'normal'
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
            if (ctx.mode === 'normal' && ctx.blockElement) {
                ctx.mode = 'connectToBlock'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
            } else if (ctx.mode === 'connectToBlock' && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    arrowManager.completeConnectionToElement(ctx.connect_source_id, targetId)
                    ctx.connect_source_id = undefined
                    ctx.sourceEl.remove('block-selected')
                    ctx.sourceEl = undefined
                    ctx.mode = 'normal'
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
