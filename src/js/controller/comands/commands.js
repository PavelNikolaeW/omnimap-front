import {arrowCommands} from "./arrowComands";
import {validURL} from "../../utils/functions";
import {dispatch} from "../../utils/utils";
import {colorCommands} from "./colorCommands";
import {layoutCommands} from "./layoutCommands";
import {arrowManager} from "../arrowManager";
import {blockStyleManager} from "../blockStyleManager";
import {CONNECTION_TYPES} from "../connectionTypes";
import {connectionAnchorManager} from "../connectionAnchorManager";
import api from "../../api/api";
import {customPrompt} from "../../utils/custom-dialog";

import {
    commandOpenBlock,
    openBlock,
    setCmdOpenBlock,
    getBlock
} from "./cmdUtils";
import {popupsCommands} from "./popupsCmd";
import {NoteEditor} from "../noteEditor";
import Cookies from "js-cookie";
import { openUnifiedChat } from "../popups/unifiedChatPanel";

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

/**
 * Показать временную подсказку пользователю
 * @param {string} message - Текст подсказки
 * @param {number} duration - Длительность показа в мс (по умолчанию 3000)
 */
function showHint(message, duration = 3000) {
    let hint = document.getElementById('command-hint')
    if (!hint) {
        hint = document.createElement('div')
        hint.id = 'command-hint'
        hint.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            transition: opacity 0.3s ease;
        `
        document.body.appendChild(hint)
    }
    hint.textContent = message
    hint.style.opacity = '1'
    hint.style.display = 'block'

    // Скрыть через duration
    clearTimeout(hint._timeout)
    hint._timeout = setTimeout(() => {
        hint.style.opacity = '0'
        setTimeout(() => {
            hint.style.display = 'none'
        }, 300)
    }, duration)
}

/**
 * Обработка клика на якорь блока-источника в режиме создания соединения
 * @param {Object} ctx - Контекст
 * @returns {boolean} - true если клик был на якоре источника и обработан
 */
function handleSourceAnchorClick(ctx) {
    if (ctx.clickedAnchor) {
        ctx.sourceAnchor = ctx.clickedAnchor.position
        ctx.clickedAnchor = null
        showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
        return true
    }
    return false
}

function hideHint() {
    const hint = document.getElementById('command-hint')
    if (hint) {
        clearTimeout(hint._timeout)
        hint.style.opacity = '0'
        setTimeout(() => {
            hint.style.display = 'none'
        }, 300)
    }
}

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
                document.body.classList.remove('connect-mode')
                connectionAnchorManager.deactivate()
            }
            if (ctx.mode === MODES.CONNECT_SELECT_SOURCE) {
                ctx.connectionType = undefined
                document.body.style.cursor = ''
                document.body.classList.remove('connect-mode')
                connectionAnchorManager.deactivate()
                hideHint()
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
        id: 'unifiedChat',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Чаты',
            classes: ['sidebar-button', 'fas', 'fa-comments', 'fas-lg']
        },
        defaultHotkey: 'shift+m',
        description: 'Открыть чаты (личные, группы, AI)',
        execute(ctx) {
            openUnifiedChat();
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
            // Guard от повторного вызова при быстром двойном нажатии
            if (ctx.mode === MODES.TEXT_EDIT) return

            // Сохраняем ссылки в замыкании до async операции
            const currentBlockElement = ctx.blockElement
            const currentBlockLinkElement = ctx.blockLinkElement

            let id = currentBlockElement.id
            if (currentBlockLinkElement?.hasAttribute('blockLink')) {
                id = currentBlockLinkElement.getAttribute('blocklink')
            }

            // Получаем текст из данных блока (не из DOM, т.к. маленькие блоки могут не отображать контент)
            const blockId = id.split('*').at(-1)
            getBlock(blockId, (err, block) => {
                // Извлекаем текст из данных блока
                let content = ''
                if (!err && block) {
                    if (typeof block.data === 'string') {
                        try {
                            const data = JSON.parse(block.data)
                            content = data.text || ''
                        } catch {
                            content = ''
                        }
                    } else if (block.data?.text) {
                        content = block.data.text
                    }
                }

                // Fallback на DOM если IndexedDB не содержит данных
                if (!content) {
                    const contentEl = currentBlockElement.querySelector('contentBlock')
                    if (contentEl) {
                        content = contentEl.innerHTML
                    }
                }

                ctx.mode = MODES.TEXT_EDIT
                nodeEditor.openEditor(id, content, ctx)
                setCmdOpenBlock(ctx)
            })
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
        offlineDisabled: true, // Копирование недоступно офлайн
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
        offlineDisabled: true, // Создание ссылок недоступно офлайн
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
        offlineDisabled: true, // Undo требует API вызова
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
        offlineDisabled: true, // Redo требует API вызова
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
            // TODO: OptionManager не реализован
            if (ctx.optionManager) {
                ctx.optionManager.openOptions()
            } else {
                console.warn('OptionManager не инициализирован')
            }
        }
    },
    {
        id: "connectBlock",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Добавить соединение между блоками',
            classes: ['sidebar-button', 'fas', 'fa-light', 'fa-down-left-and-up-right-to-center', 'fas-lg'],
        },
        defaultHotkey: 'a',
        description: 'Создать стрелочку от блока до другого блока',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode  // Сохраняем режим для возврата
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                // Сохраняем anchor если кликнули на него
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)  // Показать anchors при hover (и на текущем блоке)
                showHint('Кликните на блок или точку привязки для создания соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode  // Сохраняем режим для возврата
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = undefined  // обычное соединение
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()  // Показать anchors при hover
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                // Сохраняем anchor если кликнули на него
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для создания соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    // Сохраняем target anchor если кликнули на него
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    // Создаём соединение с опциональными anchors
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        CONNECTION_TYPES.DEFAULT,
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()  // Скрыть anchors
                    // Вернуться в предыдущий режим (DIAGRAM или NORMAL)
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else {
                    // Клик на якорь того же блока-источника - обновить sourceAnchor
                    handleSourceAnchorClick(ctx)
                }
            }
        }
    },
    {
        id: "deleteConnectBlock",
        mode: ['normal', 'diagram'],
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
    {
        id: "connectDashed",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Пунктирное соединение',
            classes: ['sidebar-button', 'fas', 'fa-ellipsis', 'fas-lg'],
        },
        defaultHotkey: '',
        description: 'Создать пунктирное соединение между блоками',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_TO_BLOCK
                ctx.connectionType = 'dashed'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)
                showHint('Кликните на блок или точку привязки для пунктирного соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = 'dashed'
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для пунктирного соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        ctx.connectionType || 'dashed',
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.connectionType = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Пунктирное соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else if (ctx.clickedAnchor) {
                    ctx.sourceAnchor = ctx.clickedAnchor.position
                    ctx.clickedAnchor = null
                    showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
                }
            }
        }
    },
    {
        id: "connectDouble",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Двустороннее соединение',
            classes: ['sidebar-button', 'fas', 'fa-arrows-left-right', 'fas-lg'],
        },
        defaultHotkey: '',
        description: 'Создать двустороннее соединение между блоками',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_TO_BLOCK
                ctx.connectionType = 'double'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)
                showHint('Кликните на блок или точку привязки для двустороннего соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = 'double'
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для двустороннего соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        ctx.connectionType || 'double',
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.connectionType = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Двустороннее соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else if (ctx.clickedAnchor) {
                    ctx.sourceAnchor = ctx.clickedAnchor.position
                    ctx.clickedAnchor = null
                    showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
                }
            }
        }
    },
    {
        id: "connectCurved",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Изогнутое соединение',
            classes: ['sidebar-button', 'fas', 'fa-bezier-curve', 'fas-lg'],
        },
        defaultHotkey: '',
        description: 'Создать изогнутое (Bezier) соединение между блоками',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_TO_BLOCK
                ctx.connectionType = 'curved'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)
                showHint('Кликните на блок или точку привязки для изогнутого соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = 'curved'
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для изогнутого соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        ctx.connectionType || 'curved',
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.connectionType = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Изогнутое соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else if (ctx.clickedAnchor) {
                    ctx.sourceAnchor = ctx.clickedAnchor.position
                    ctx.clickedAnchor = null
                    showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
                }
            }
        }
    },
    {
        id: "connectStraight",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Прямое соединение',
            classes: ['sidebar-button', 'fas', 'fa-ruler', 'fas-lg'],
        },
        defaultHotkey: '',
        description: 'Создать прямое соединение между блоками',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_TO_BLOCK
                ctx.connectionType = 'straight'
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)
                showHint('Кликните на блок или точку привязки для прямого соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = 'straight'
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для прямого соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        ctx.connectionType || 'straight',
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.connectionType = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Прямое соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else if (ctx.clickedAnchor) {
                    ctx.sourceAnchor = ctx.clickedAnchor.position
                    ctx.clickedAnchor = null
                    showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
                }
            }
        }
    },
    {
        id: "connectOrthogonal",
        mode: ['normal', 'connectToBlock', 'connectSelectSource', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Ортогональное соединение',
            classes: ['sidebar-button', 'fas', 'fa-right-left', 'fas-lg'],
        },
        defaultHotkey: '',
        regLink: false,
        description: 'Создать ортогональное соединение между блоками',
        execute(ctx) {
            // Шаг 1: Выбор источника (блок уже выбран)
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_TO_BLOCK
                ctx.connectionType = CONNECTION_TYPES.ORTHOGONAL
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate(sourceEl)
                showHint('Кликните на блок или точку привязки для ортогонального соединения')
            }
            // Шаг 1 альтернатива: Блок не выбран - ждём выбора источника
            else if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && !ctx.blockElement) {
                ctx.previousMode = ctx.mode
                ctx.mode = MODES.CONNECT_SELECT_SOURCE
                ctx.connectionType = CONNECTION_TYPES.ORTHOGONAL
                document.body.style.cursor = 'crosshair'
                document.body.classList.add('connect-mode')
                connectionAnchorManager.activate()
                showHint('Кликните на блок или точку привязки источника (Esc для отмены)')
            }
            // Шаг 2: Выбор источника после входа в режим ожидания
            else if (ctx.mode === MODES.CONNECT_SELECT_SOURCE && ctx.blockElement) {
                ctx.mode = MODES.CONNECT_TO_BLOCK
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement
                ctx.connect_source_id = sourceEl.id
                ctx.sourceAnchor = ctx.clickedAnchor?.position || null
                ctx.clickedAnchor = null
                sourceEl.classList.add('block-selected')
                ctx.sourceEl = sourceEl
                document.body.style.cursor = ''
                showHint('Кликните на блок или точку привязки для ортогонального соединения')
            }
            // Шаг 3: Выбор целевого блока
            else if (ctx.mode === MODES.CONNECT_TO_BLOCK && ctx.blockElement) {
                let targetEl = ctx.blockElement
                if (ctx.blockLinkElement) targetEl = ctx.blockLinkElement
                let targetId = targetEl.id
                if (ctx.connect_source_id !== targetId) {
                    const targetAnchor = ctx.clickedAnchor?.position || null
                    ctx.clickedAnchor = null
                    arrowManager.completeConnectionToElement(
                        ctx.connect_source_id,
                        targetId,
                        ctx.connectionType || CONNECTION_TYPES.ORTHOGONAL,
                        null,
                        ctx.sourceAnchor,
                        targetAnchor
                    )
                    ctx.connect_source_id = undefined
                    ctx.connectionType = undefined
                    ctx.sourceAnchor = undefined
                    ctx.sourceEl.classList.remove('block-selected')
                    ctx.sourceEl = undefined
                    document.body.classList.remove('connect-mode')
                    connectionAnchorManager.deactivate()
                    ctx.mode = ctx.previousMode || MODES.NORMAL
                    ctx.previousMode = undefined
                    showHint('Ортогональное соединение создано', 1500)
                    setTimeout(() => {
                        ctx.setCmd('openBlock')
                    }, 50)
                } else if (ctx.clickedAnchor) {
                    ctx.sourceAnchor = ctx.clickedAnchor.position
                    ctx.clickedAnchor = null
                    showHint(`Точка привязки источника: ${ctx.sourceAnchor}`, 1500)
                }
            }
        }
    },
    {
        id: "connectSelfLoop",
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Петля (self-loop)',
            classes: ['sidebar-button', 'fas', 'fa-rotate', 'fas-lg'],
        },
        defaultHotkey: 'shift+l',
        regLink: false,
        description: 'Создать соединение блока с самим собой',
        execute(ctx) {
            if ((ctx.mode === MODES.NORMAL || ctx.mode === MODES.DIAGRAM) && ctx.blockElement) {
                let sourceEl = ctx.blockElement
                if (ctx.blockLinkElement) sourceEl = ctx.blockLinkElement

                arrowManager.createConnection(
                    sourceEl.id,
                    sourceEl.id,
                    CONNECTION_TYPES.STATEMACHINE,
                    null,
                    null,
                    null
                )

                showHint('Петля создана', 1500)
            } else {
                showHint('Выделите блок для создания петли', 2000)
            }
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
    ...layoutCommands,

    // ═══════════════════════════════════════════════════════════════════════════
    // DIAGRAM COMMANDS - команды для редактирования диаграмм
    // ═══════════════════════════════════════════════════════════════════════════
    {
        id: 'diagramGridColPlus',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: '+Колонка',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: '+C'
        },
        description: 'Добавить колонку в сетку диаграммы',
        execute(ctx) {
            ctx.diagramUtils?.adjustGridSize('col', 1)
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramGridColMinus',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: '-Колонка',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: '-C'
        },
        description: 'Убрать колонку из сетки диаграммы',
        execute(ctx) {
            ctx.diagramUtils?.adjustGridSize('col', -1)
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramGridRowPlus',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: '+Строка',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: '+R'
        },
        description: 'Добавить строку в сетку диаграммы',
        execute(ctx) {
            ctx.diagramUtils?.adjustGridSize('row', 1)
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramGridRowMinus',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: '-Строка',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: '-R'
        },
        description: 'Убрать строку из сетки диаграммы',
        execute(ctx) {
            ctx.diagramUtils?.adjustGridSize('row', -1)
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramSizeXs',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Размер XS',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: 'XS'
        },
        description: 'Установить размер сетки XS',
        execute(ctx) {
            ctx.diagramUtils?.setGridSize('xs')
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramSizeS',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Размер S',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: 'S'
        },
        description: 'Установить размер сетки S',
        execute(ctx) {
            ctx.diagramUtils?.setGridSize('s')
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramSizeM',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Размер M',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: 'M'
        },
        description: 'Установить размер сетки M',
        execute(ctx) {
            ctx.diagramUtils?.setGridSize('m')
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramSizeL',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Размер L',
            classes: ['sidebar-button', 'diagram-size-btn'],
            text: 'L'
        },
        description: 'Установить размер сетки L',
        execute(ctx) {
            ctx.diagramUtils?.setGridSize('l')
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramAddBlock',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Добавить блок в диаграмму',
            classes: ['sidebar-button', 'fas', 'fa-square-plus', 'fas-lg'],
        },
        description: 'Добавить новый блок в диаграмму',
        execute(ctx) {
            ctx.diagramUtils?.addBtnHandler()
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramBlockStyle',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Стили блока',
            classes: ['sidebar-button', 'fas', 'fa-palette', 'fas-lg'],
        },
        description: 'Настроить стили выбранного блока',
        execute(ctx) {
            // Попробовать получить ID из diagramUtils или напрямую из контекста
            let selectedBlockId = ctx.diagramUtils?.getSelectedChildBlockId()
            let selectedElement = null

            if (selectedBlockId) {
                selectedElement = document.getElementById(selectedBlockId)
            } else if (ctx.blockElement) {
                // Если нет дочернего блока диаграммы, используем текущий выбранный блок
                selectedBlockId = ctx.blockId
                selectedElement = ctx.blockElement
            } else if (ctx.blockLinkElement) {
                // Для блоков-ссылок
                selectedBlockId = ctx.blockLinkElement.id?.split('*').pop()
                selectedElement = ctx.blockLinkElement
            }

            if (selectedBlockId && selectedElement) {
                blockStyleManager.toggle(selectedBlockId, selectedElement)
            } else {
                // Блок не выбран - включить режим ожидания выбора
                blockStyleManager.startStyleSelectionMode()
            }
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramConnectionSettings',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Настройки соединений',
            classes: ['sidebar-button', 'fas', 'fa-sliders', 'fas-lg'],
        },
        description: 'Открыть панель настройки стилей соединений',
        execute(ctx) {
            ctx.diagramUtils?.connectionStyleManager.toggle()
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramReset',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Сбросить сетку',
            classes: ['sidebar-button', 'fas', 'fa-rotate', 'fas-lg'],
        },
        description: 'Сбросить настройки сетки диаграммы',
        execute(ctx) {
            ctx.diagramUtils?.resetHandler()
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramDeleteBlock',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Удалить блок из диаграммы',
            classes: ['sidebar-button', 'fas', 'fa-square-minus', 'fas-lg'],
        },
        description: 'Удалить выбранный блок из диаграммы',
        async execute(ctx) {
            let blockIdToDelete = ctx.diagramUtils?.getSelectedChildBlockId()

            // Если нет выделенного блока, удаляем последний добавленный
            if (!blockIdToDelete && ctx.diagramUtils?.blockId) {
                const block = await ctx.diagramUtils.getBlock(ctx.diagramUtils.blockId)
                if (block?.data?.childOrder?.length > 0) {
                    const lastChildId = block.data.childOrder[block.data.childOrder.length - 1]
                    // Формируем полный ID с учётом родителя
                    blockIdToDelete = ctx.diagramUtils.element?.id
                        ? `${ctx.diagramUtils.element.id}*${lastChildId}`
                        : lastChildId
                }
            }

            if (blockIdToDelete) {
                dispatch('DeleteTreeBlock', { blockId: blockIdToDelete })
            }
        },
        btnExec(ctx) { this.execute(ctx) }
    },
    {
        id: 'diagramResetBlockStyle',
        mode: ['normal', 'diagram'],
        btn: {
            containerId: 'control-panel',
            label: 'Сбросить стили блока',
            classes: ['sidebar-button', 'fas', 'fa-eraser', 'fas-lg'],
        },
        description: 'Сбросить кастомные стили выбранного блока',
        execute(ctx) {
            // Попробовать получить ID из diagramUtils или напрямую из контекста
            let selectedBlockId = ctx.diagramUtils?.getSelectedChildBlockId()

            if (!selectedBlockId && ctx.blockId) {
                selectedBlockId = ctx.blockId
            } else if (!selectedBlockId && ctx.blockLinkElement) {
                selectedBlockId = ctx.blockLinkElement.id?.split('*').pop()
            }

            if (selectedBlockId) {
                dispatch('UpdateBlockStyles', {
                    blockId: selectedBlockId,
                    customStyles: {}
                })
                // Очистить inline стили с элемента
                const element = document.getElementById(selectedBlockId) || ctx.blockElement || ctx.blockLinkElement
                if (element) {
                    element.style.backgroundColor = ''
                    element.style.borderColor = ''
                    element.removeAttribute('data-block-border')
                    element.removeAttribute('data-block-shape')
                    element.removeAttribute('data-block-shadow')
                }
            } else {
                console.warn('Выберите блок для сброса стилей')
            }
        },
        btnExec(ctx) { this.execute(ctx) }
    },
];
