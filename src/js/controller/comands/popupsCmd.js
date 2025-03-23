import {HistoryPopup} from "../popups/historyPopup";
import api, {pollTaskStatus} from "../../api/api";
import {dispatch} from "../../utils/utils";
import {createEditHotkeyInputs, setCmdOpenBlock} from "./cmdUtils";
import {HotkeyPopup} from "../popups/hotkeyPopup";
import localforage from "localforage";
import {AccessPopup} from "../popups/accessPopup";
import {UrlPopup} from "../popups/urlPopup";
import {EditBlockPopup} from "../popups/editBlockPopup";


export const popupsCommands = [
    {
        id: "editBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Редактировать блок',
            classes: ['sidebar-button', 'fa', 'fa-wrench', 'fa-lg']
        },
        defaultHotkey: 'shift+e',
        description: 'Открывает меню редактирования размеров блока',
        execute(ctx) {
            ctx.mode = 'editBlock'
            const id = ctx.blockId || ctx.blockElement?.id.split('*').at(-1)
            if (!id) return
            ctx.closePopups()
            setCmdOpenBlock(ctx);
            localforage.getItem('currentUser', (err, user) => {
                localforage.getItem(`Block_${id}_${user}`, (err, block) => {
                    ctx.popup = new EditBlockPopup({
                        title: "Редактирование блока",
                        dynamicObject: block.data,
                        forbiddenKeys: ['childOrder', 'connections'],
                        onSubmit: (data) => {
                            ctx.mode = 'normal'
                        },
                        onCancel: () => {
                            ctx.mode = 'normal'
                        }
                    });
                })
            })
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
            ctx.closePopups()
            setCmdOpenBlock(ctx);
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
                },
                onSubmit() {
                    ctx.mode = 'normal';
                }
            })
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
            if (!id) return
            ctx.closePopups()
            ctx.mode = 'editAccessBlock'
            setCmdOpenBlock(ctx);
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
                },
                onSubmit() {
                    ctx.mode = "normal";
                },
            });
        }
    },
    {
        id: "editHotkeys",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Настроить управление',
            classes: ['sidebar-button', 'fa', 'fa-gear', 'fa-lg'],
        },
        defaultHotkey: 'shift+m',
        description: 'Открыть окно настройки колрячих клавиш',
        async execute(ctx) {

        },
        async btnExec(ctx) {
            if (ctx.popup) return
            ctx.mode = 'editHotkeys'
            ctx.closePopups()
            setCmdOpenBlock(ctx);
            ctx.popup = new HotkeyPopup({
                commands: await createEditHotkeyInputs(),
                onSubmit(newHotkeys) {
                    localforage.setItem('hotkeysMap', newHotkeys)
                        .then(() => {
                            dispatch('ReRegistrationCmd', newHotkeys)
                        })
                    ctx.mode = 'normal'
                },
                onCancel() {
                    ctx.mode = 'normal'
                }
            })
        }
    },
    {
        id: "historyView",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'История изменений',
            classes: ['sidebar-button', 'fa', 'fa-history', 'fa-lg']
        },
        defaultHotkey: 'shift+h',
        description: 'Открывает окно с историей изменений для текущего блока',
        execute(ctx) {
            ctx.mode = 'historyView';
            // Предположим, blockId получаем из контекста
            const blockId = ctx.blockId || ctx.blockElement?.id.split('*').at(-1);
            if (!blockId) return;
            ctx.closePopups()
            setCmdOpenBlock(ctx);
            // Создаём popup
            ctx.popup = new HistoryPopup({
                classPrefix: 'history-popup',
                blockId: blockId,
                fetchHistory: (blockId) => {
                    return api.getBlockHistory(blockId) // ваш реальный вызов к API
                        .then((res) => {
                            if (res.status !== 200) throw new Error('Ошибка загрузки истории');
                            // Ожидаем, что вернётся массив объектов {history_id, history_date, changed_by, ...}
                            return res.data;
                        });
                },
                revertHistory: async (blockId, historyId) => {
                    const res = await api.revertBlockToHistory(blockId, historyId);
                    console.log(res)
                    if (res.status === 200) {
                        dispatch('HistoryRevert', {block: res.data})
                    } else {
                        throw new Error('Ошибка при откате');
                    }
                },
                onCancel() {
                    // Когда пользователь закрывает окно, возвращаем режим 'normal'
                    ctx.mode = 'normal';
                },
            });
        }
    },
]