// commands.js

import {arrowCommands} from "./arrowComands";
import {copyToClipboard, getClipboardText, isValidUUID, validURL} from "../utils/functions";
import {dispatch} from "../utils/utils";
import {colorCommands} from "./colorCommands";
import {EditorText} from "./textEditor";
import {arrowManager} from "./arrowManager";
import localforage from "localforage";
import {HotkeyPopup} from "./popups/hotkeyPopup";
import {log} from "@jsplumb/browser-ui";
import {UrlPopup} from "./popups/urlPopup";
import api, {pollTaskStatus} from "../api/api"
import {AccessPopup} from "./popups/accessPopup";

const textEditor = new EditorText()

function commandOpenBlock(ctx) {
    const blockElement = ctx.blockElement
    if (!blockElement) return
    const parent = blockElement.parentElement
    let hsl = [];
    let blockId = blockElement.id;

    if (parent.hasAttribute('hsl')) {
        hsl = parent.getAttribute('hsl').split(',').map(Number);
    }

    if (ctx.blockLinkElement)
        blockId = ctx.blockLinkElement.getAttribute('blocklink')

    dispatch('OpenBlock', {
        id: blockId, parentHsl: hsl, isIframe: blockElement.hasAttribute('blockIframe'),
    });
}

async function createEditHotkeyInputs() {
    const inputs = []
    const hotkeysMap = await localforage.getItem('hotkeysMap') // мапа с пеопределенными хоткеями cmdID =
    commands.forEach((cmd, i) => {
        if (cmd.description) {
            const id = cmd.id
            const value = (hotkeysMap && hotkeysMap[id]) ? hotkeysMap[id] : cmd.defaultHotkey
            inputs.push({
                id: id,
                name: id,
                description: cmd.description,
                hotkeys: value,
                defaultHotkey: cmd.defaultHotkey,
            })
        }
    })
    return inputs
}

function setCmdOpenBlock(ctx) {
    setTimeout(() => {
        ctx.setCmd('openBlock')
    }, 50)
}

export const commands = [
        {
            id: 'openBlock',
            mode: ['normal'],
            execute(ctx) {
                commandOpenBlock(ctx)
            }
        },
        {
            id: 'escape',
            mode: ['*'],
            defaultHotkey: 'esc',
            execute(ctx) {
                console.log(ctx)
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
            label: 'Enter',
            defaultHotkey: 'enter',
            description: 'Открывает выделенный блок',
            mode: ['*'],
            execute(ctx) {
                console.log(ctx)
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
            label: 'shift+Enter',
            defaultHotkey: 'shift+enter',
            mode: ['textEdit'],
            execute(ctx) {
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
                let id = ctx.blockId || ctx.blockElement.id.split('*').at(-1)
                console.log(ctx.blockId, ctx.blockLinkId, ctx.blockElement.id)
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
                let id = ctx.blockElement.id
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
                let id = ctx.blockElement.id
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
                console.log(ctx.cut)
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
                        dispatch('PasteBlock', {dest: id, src: [srcId]});
                    }
                    setCmdOpenBlock(ctx)
                }
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
                let id = ctx.blockId || ctx.blockLinkId || ctx.blockElement.id
                if (!id) return
                dispatch('DeleteTreeBlock', {blockId: id})
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
                const id = ctx.blockId || ctx.blockLinkElement?.getAttribute('blockLink') || ctx.blockElement.id
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
            id: "createUrl",
            mode: ['normal'],
            btn: {
                containerId: 'control-panel',
                label: 'Создать url на блок',
                classes: ['sidebar-button', 'fa', 'fa-globe', 'fa-lg']
            },
            defaultHotkey: 'shift+u',
            description: 'Открывает меню блока для управления URL',
            execute(ctx) {
                ctx.mode = 'createUrl'
                const id = ctx.blockId || ctx.blockElement?.id.split('*').at(-1)
                if (!id) return
                ctx.popup = new UrlPopup({
                    classPrefix: 'url-popup',
                    fetchUrls: () =>
                        api.getUrls(id)
                            .then(res => {
                                // Если статус не 200 – выбрасываем ошибку
                                if (res.status !== 200) {
                                    throw new Error('Ошибка загрузки URL');
                                }
                                return res.data.map(link => ({
                                    creator: link.creator,
                                    name: link.slug,
                                    blockId: link.source,
                                    url: `${location.protocol}//${location.host}/?${link.slug}`
                                }));
                            })
                            .catch(err => {
                                console.error('fetchUrls:', err);
                                // Возвращаем пустой список или обрабатываем ошибку другим образом
                                return [];
                            }),

                    checkName: async (name) => {
                        try {
                            const res = await api.checkUrl(name);
                            if (res.status === 200) {
                                return res.data.status === 'available';
                            }
                            throw new Error('Ошибка проверки имени');
                        } catch (err) {
                            console.error('checkName:', err);
                            // Можно вернуть false или обрабатывать ошибку
                            return false;
                        }
                    },

                    onCreate: async (name) => {
                        try {
                            const res = await api.createUrlLink(id, name);
                            if (res.status === 200) {
                                const link = res.data[0];
                                return {
                                    creator: link.creator,
                                    name: link.slug,
                                    blockId: link.source,
                                    url: `${location.protocol}//${location.host}/?${link.slug}`
                                };
                            }
                            throw new Error('Ошибка создания ссылки');
                        } catch (err) {
                            console.error('onCreate:', err);
                            throw err; // Ошибка будет поймана в методе handleCreate попапа
                        }
                    },

                    onDelete: async (blockId, slug) => {
                        try {
                            const res = await api.deleteUrl(slug, blockId);
                            if (res.status !== 200) {
                                throw new Error('Ошибка удаления ссылки');
                            }
                        } catch (err) {
                            console.error('onDelete:', err);
                            throw err;
                        }
                    },

                    onCancel() {
                        ctx.mode = 'normal';
                        setCmdOpenBlock(ctx);
                    },

                    onSubmit() {
                        ctx.mode = 'normal';
                        setCmdOpenBlock(ctx);
                    }
                })
            }
        },
        {
            id: "editBlock",
            mode: ['normal'],
            btn: {
                containerId: 'control-panel',
                label: 'Редактировать размеры блока',
                classes: ['fa', 'fa-wrench', 'fa-lg']
            },
            defaultHotkey: 'shift+e',
            description: 'Открывает меню редактирования размеров блока',
            execute(ctx) {
                setCmdOpenBlock(ctx)
            }
        },
        {
            id: "editAccessBlock",
            mode: ['normal'],
            btn: {
                containerId: 'control-panel',
                label: 'Редактировать права на блок',
                classes: ['sidebar-button', 'fa', 'fa-user-lock', 'fa-lg']
            },
            defaultHotkey: 'shift+p',
            description: 'Открывает меню редактирования прав на блок',
            execute(ctx) {
                const id = ctx.blockId || ctx.blockLinkId || ctx.blockElement?.id
                ctx.mode = 'editAccessBlock'
                ctx.popup = new AccessPopup({
                    blockId: id,
                    getAccessList: (blockId) =>
                        api.getAccessList(blockId).then((res) => {
                            if (res.status !== 200) {
                                throw new Error("Ошибка загрузки прав доступа");
                            }
                            return res.data; // ожидается массив объектов: { user_id, username, email, permission }
                        }),
                    updateAccess: (blockId, data) => {
                        return api.updateAccess(blockId, data)
                            .then((res) => {
                                if (res.status !== 202) {
                                    throw new Error("Ошибка обновления прав доступа");
                                }
                                return res.data;
                            })
                            .then(async (data) => {
                                await pollTaskStatus(data.task_id);
                                return data;
                            })
                            .catch((err) => {
                                console.error("Ошибка в updateAccess:", err);
                                throw err;
                            });
                    },
                    getGroups: () =>
                        api.getGroups().then((res) => {
                            if (res.status !== 200) throw new Error("Ошибка загрузки групп");
                            return res.data;
                        }),
                    createGroup: (groupData) =>
                        api.createGroup(groupData).then((res) => {
                            if (res.status !== 201) throw new Error("Ошибка создания группы");
                            return res.data;
                        }),
                    deleteGroup: (groupId) => api.deleteGroup(groupId),
                    addUserToGroup: (groupId, data) => api.addUserToGroup(groupId, data),
                    removeUserGroup: (groupId, username) => api.removeUserGroup(groupId, username),
                    getGroupMembers: (groupId) =>
                        api.getGroupMembers(groupId).then((res) => {
                            if (res.status !== 200) throw new Error("Ошибка загрузки участников группы");
                            return res.data;
                        }),
                    onCancel() {
                        ctx.mode = "normal";
                        setCmdOpenBlock(ctx);
                    },
                    onSubmit() {
                        ctx.mode = "normal";
                        setCmdOpenBlock(ctx);
                    },
                });
            }
        },
        {
            id: "connectBlock",
            mode:
                ['normal', 'connectToBlock'],
            btn:
                {
                    containerId: 'control-panel',
                    label:
                        'Добавить соединение между блоками',
                    classes:
                        ['sidebar-button', 'fa', 'fa-arrows-left-right', 'fa-lg'],

                }
            ,
            defaultHotkey: 'a',
            description:
                'Создать стрелочку от блока до другого блока',
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
            mode:
                ['normal'],
            btn:
                {
                    containerId: 'control-panel',
                    label:
                        'Удалить соединение между блоками',
                    classes:
                        ['sidebar-button', 'fa', 'fa-stack', 'fa-arrows-left-right', 'fa-lg'],
                    icons:
                        [['fa', 'fa-xmark', 'fa-ml', 'fa-stack-1x', 'text-danger',]]
                }
            ,
            defaultHotkey: 'shift+a',
            description:
                'Удалить стрелочки',
            execute(ctx) {
                dispatch('setRemoveArrow')
            }
            ,
            btnExec(ctx) {
                this.execute(ctx)
            }
        },
        {
            id: "editHotkeys",
            mode:
                ['normal'],
            btn:
                {
                    containerId: 'control-panel',
                    label:
                        'Настроить управление',
                    classes:
                        ['sidebar-button', 'fa', 'fa-gear', 'fa-lg'],
                },
            defaultHotkey: 'shift+m',
            description:
                'Открыть окно настройки колрячих клавиш',
            async execute(ctx) {
                ctx.mode = 'editHotkeys'
                ctx.popup = new HotkeyPopup({
                    commands: await createEditHotkeyInputs(),
                    onSubmit(newHotkeys) {
                        localforage.setItem('hotkeysMap', newHotkeys)
                            .then(() => {
                                dispatch('ReRegistrationCmd', newHotkeys)
                            })
                        ctx.mode = 'normal'
                        setCmdOpenBlock(ctx)
                    },
                    onCancel() {
                        ctx.mode = 'normal'
                        setCmdOpenBlock(ctx)
                    }
                })
            },
            async btnExec(ctx) {
                await this.execute(ctx)
            }
        },
        {
            id: "deleteLocalCache",
            mode:
                ['normal'],
            btn:
                {
                    containerId: 'control-panel',
                    label:
                        'Очистить локальный кеш блоков',
                    classes:
                        ['sidebar-button', 'fa', 'fa-sync', 'fa-lg'],
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
            mode:
                ['normal'],
            btn:
                {
                    containerId: 'control-panel',
                    label:
                        'Выход',
                    classes:
                        ['sidebar-button', 'fa', 'fa-right-from-bracket', 'fa-lg'],
                },
            defaultHotkey: '',
            description:
                'Выход',
            execute(ctx) {
                api.logout()
                setCmdOpenBlock(ctx)
            }
            ,
            btnExec(ctx) {
                this.execute(ctx)
            }
        },
// fa-gear
        ...
            arrowCommands,
        ...
            colorCommands
    ]
;

