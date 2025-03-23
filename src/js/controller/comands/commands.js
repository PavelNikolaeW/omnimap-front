import {arrowCommands} from "./arrowComands";
import {copyToClipboard, getClipboardText, isValidUUID, validURL} from "../../utils/functions";
import {dispatch} from "../../utils/utils";
import {colorCommands} from "./colorCommands";
import {EditorText} from "../textEditor";
import {arrowManager} from "../arrowManager";
import api from "../../api/api";
import {
    commandOpenBlock,
    createEditHotkeyInputs,
    getTreeIds,
    getTreePath,
    openBlock,
    setCmdOpenBlock, setCurrentTree
} from "./cmdUtils";
import {popupsCommands} from "./popupsCmd";

const textEditor = new EditorText()

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
        btn: {
            containerId: 'top-btn-container',
            label: 'Назад',
            classes: ['sidebar-button', 'top-btn', 'fa', 'fa-arrow-up', 'fa-lg']
        },
        throttleDisable: true,
        defaultHotkey: 'backspace',
        description: 'Назад',
        execute(ctx) {

        },
        btnExec(ctx) {
            const rootBlock = ctx.rootContainer.children[0]
            if (rootBlock.hasAttribute('block')) dispatch('OpenBlock', {id: rootBlock.id})
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'escape',
        mode: ['*'],
        defaultHotkey: 'esc',
        execute(ctx) {
            console.log('esc')
            if (ctx.mode === 'textEdit') {
                textEditor.closeEditor(false)
            }
            if (ctx.mode === 'connectToBlock') {
                ctx.connect_source_id = undefined
                ctx.sourceEl.classList.remove('block-selected')
                ctx.sourceEl = undefined
            }
            if (ctx.mode === 'cutBlock') {
                if (ctx.beforeBlockElement) ctx.beforeBlockElement.remove()
                ctx.cut = undefined
            }
            ctx.closePopups()
            ctx.mode = 'normal'
            ctx.event = undefined
            ctx.blockId = undefined
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'EnterKey',
        defaultHotkey: 'enter',
        description: 'Открывает выделенный блок',
        mode: ['*'],
        execute(ctx) {
            if (ctx.mode === 'normal') {
                if (!ctx.blockId) {
                    commandOpenBlock(ctx)
                }
            }
            if (ctx.mode === 'textEdit') {
                textEditor.closeEditor()
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
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'undo',
        defaultHotkey: 'shift+z',
        mode: ['normal'],
        execute(ctx) {
            dispatch('Undo')
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'redo',
        defaultHotkey: 'shift+ctrl+z',
        mode: ['normal'],
        execute(ctx) {
            dispatch('Redo')
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'newBlock',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Создать новый блок',
            classes: ['sidebar-button', 'fa', 'fa-plus-square', 'fa-lg']
        },
        defaultHotkey: 'n',
        description: 'Создать новый блок',
        execute(ctx) {
            let id = ctx.blockId || ctx.blockElement?.id.split('*').at(-1)
            if (!id) return
            const title = prompt('Введите название блока');
            if (title !== null) {
                if (validURL(title)) dispatch('IframeCreate', {parentId: id, src: title})
                else dispatch('CreateBlock', {parentId: id, title});
            }
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "editBlockTitle",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Изменить название блока',
            classes: ['sidebar-button', 'fa', 'fa-edit', 'fa-lg']
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
            const title = prompt('Введите название блока', oldText ?? '')

            if (title !== null) {
                if (validURL(title)) {
                    dispatch('SetIframe', {blockId: id, src: title})
                } else {
                    dispatch('TitleUpdate', {blockId: id, title})
                }
            }
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "editBlockText",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Изменить текст в блоке',
            classes: ['sidebar-button', 'fa', 'fa-keyboard', 'fa-lg']
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
            textEditor.initEditor(ctx.blockElement.querySelector('contentBlock'), id)
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: "cutBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Переместить блок в другое место',
            classes: ['sidebar-button', 'fa', 'fa-cut', 'fa-lg']
        },
        defaultHotkey: 'shift+x',
        description: 'Переместить блок в другое место.',
        execute(ctx) {
            const target = ctx.blockLinkElement || ctx.blockElement
            if (!target) return
            const id = target.id.split('*').at(-1)
            const parentId = target.parentElement.id
            if (id && parentId && parentId !== 'rootContainer') {
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
            classes: ['sidebar-button', 'fa', 'fa-copy', 'fa-lg'],
        },
        description: 'Копирует id выбранного блока или ожидает клика по блоку.',
        defaultHotkey: 'shift+c',
        mode: ['normal',],
        async execute(ctx) {
            const id = ctx.blockId || ctx.blockLinkId || ctx.blockElement?.id
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
            classes: ['sidebar-button', 'fa', 'fa-paste', 'fa-lg']
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
                const id = ctx.blockId || ctx.blockLinkElement?.getAttribute('blockLink') || ctx.blockElement?.id
                const srcId = await getClipboardText()
                if (!id) return
                if (isValidUUID(srcId)) {
                    if (ctx.isTree) {
                        getTreePath(id, (err, path) => {
                            const id = path.at(-1).blockId
                            dispatch('PasteBlock', {dest: id, src: [srcId]});
                        })
                    } else {
                        dispatch('PasteBlock', {dest: id, src: [srcId]});
                    }
                }
                setCmdOpenBlock(ctx)
            }
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
        id: "pasteBlockLink",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Вставить блок как ссылку',
            classes: ['sidebar-button', 'fa', 'fa-link', 'fa-lg']
        },
        defaultHotkey: 'shift+l',
        description: 'Если скопирован id, вставляет блок как ссылку',
        async execute(ctx) {
            const id = ctx.blockId || ctx.blockLinkElement?.getAttribute('blockLink') || ctx.blockElement?.id
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
        id: "connectBlock",
        mode: ['normal', 'connectToBlock'],
        btn: {
            containerId: 'control-panel',
            label: 'Добавить соединение между блоками',
            classes: ['sidebar-button', 'fa', 'fa-arrows-left-right', 'fa-lg'],
        },
        defaultHotkey: 'a',
        description: 'Создать стрелочку от блока до другого блока',
        execute(ctx) {
            if (ctx.mode === 'normal' && ctx.blockElement) {
                ctx.mode = 'connectToBlock'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement.id
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
            classes: ['sidebar-button', 'fa', 'fa-stack', 'fa-arrows-left-right', 'fa-lg'],
            icons: [['fa', 'fa-xmark', 'fa-ml', 'fa-stack-1x', 'text-danger',]]
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
    {
        id: "removeTreeBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Удалить дерево',
            classes: ['sidebar-button', 'fa', 'fa-trash', 'fa-lg'],
        },
        defaultHotkey: 'shift+d',
        description: 'Удаляет блок, и все дочерние блоки',
        execute(ctx) {
            let id = ctx.blockId ?? ctx.blockLinkId ?? ctx.blockElement?.id
            if (!id) return
            dispatch('DeleteTreeBlock', {blockId: id})
            ctx.blockElement = ctx.blockLinkElement?.parentNode ?? ctx.blockElement?.parentNode
            if (ctx.blockElement && ctx.blockElement.id.indexOf('*') !== -1) {
                ctx.blockLinkElement = ctx.blockElement.parentNode
                ctx.blockElement = undefined
            }
            setCmdOpenBlock(ctx)
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
            classes: ['sidebar-button', 'fa', 'fa-sync', 'fa-lg'],
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
            classes: ['sidebar-button', 'fa', 'fa-right-from-bracket', 'fa-lg'],
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
