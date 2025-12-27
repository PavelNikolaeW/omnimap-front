import {HistoryPopup} from "../popups/historyPopup";
import api, {pollTaskStatus} from "../../api/api";
import {dispatch} from "../../utils/utils";
import {createEditHotkeyInputs, setCmdOpenBlock} from "./cmdUtils";
import {HotkeyPopup} from "../popups/hotkeyPopup";
import localforage from "localforage";
import {AccessPopup} from "../popups/accessPopup";
import {UrlPopup} from "../popups/urlPopup";
import {EditBlockPopup} from "../popups/editBlockPopup";
import {SearchBlocksPopup} from "../popups/SearchPopup";
import {ImportPopup} from "../popups/importPopup";
import {ImageUploadPopup} from "../popups/imageUploadPopup";


export const popupsCommands = [
    {
        id: "findBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Поиск блоков',
            classes: ['sidebar-button', 'fas', 'fa-search', 'fas-lg']
        },
        defaultHotkey: 'f',
        description: 'Поиск блоков',
        execute(ctx) {
        },
        btnExec(ctx) {
            ctx.mode = 'findBlock'
            ctx.closePopups()
            setCmdOpenBlock(ctx);
            if (!ctx.searchPopupState) {
                ctx.searchPopupState = {query: "", everywhere: false, results: []};
            }
            ctx.popup = new SearchBlocksPopup({
                initialState: ctx.searchPopupState,
                async onSearch(query, everywhere) {
                    return await api.searchBlock(query, everywhere, ctx.rootContainer.children[0].id)
                        .then(res => {
                            if (res.status !== 200) throw new Error('Ошибка помска блока');

                            ctx.searchPopupState.query = query;
                            ctx.searchPopupState.everywhere = everywhere;
                            ctx.searchPopupState.results = res.data.results;
                            return res.data.results
                        }).catch(err => {
                            console.error(err)
                            return []
                        })
                },
                onOpen(id) {
                    dispatch('OpenBlock', {id})
                },
                onCancel() {
                    ctx.mode = "normal";
                },
            })
            setTimeout(() => ctx.popup.searchInput.focus(), 0)

        }
    },
    {
        id: "editBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Редактировать блок',
            classes: ['sidebar-button', 'fas', 'fa-wrench', 'fas-lg']
        },
        defaultHotkey: 'shift+e',
        description: 'Открывает меню редактирования размеров блока',
        execute(ctx) {
            ctx.mode = 'editBlock'
            const id = ctx.blockId || ctx.blockElement?.id.split('*').at(0)
            if (!id) return
            ctx.closePopups()
            setCmdOpenBlock(ctx);
            localforage.getItem('currentUser', (err, user) => {
                localforage.getItem(`Block_${id}_${user}`, (err, block) => {
                    ctx.popup = new EditBlockPopup({
                        title: "Редактирование блока",
                        blockData: block.data,
                        forbiddenKeys: ['childOrder', 'connections'],
                        onSubmit: (data) => {
                            dispatch('UpdateDataBlock', {blockId: id, data})
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
            classes: ['sidebar-button', 'fas', 'fa-globe', 'fas-lg']
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
            setTimeout(() => ctx.popup.nameInput.focus(), 0)
        }
    },
    {
        id: "editAccessBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Редактировать права на блок',
            classes: ['sidebar-button', 'fas', 'fa-user-lock', 'fas-lg']
        },
        defaultHotkey: 'shift+p',
        description: 'Открывает меню редактирования прав на блок',
        execute(ctx) {
            const id = ctx.blockElement?.id.split('*').at(-1)
            console.log(id)
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
                            console.log(res)
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
            classes: ['sidebar-button', 'fas', 'fa-gear', 'fas-lg'],
        },
        defaultHotkey: 'shift+m',
        description: 'Открыть окно настройки колрячих клавиш',
        async execute(ctx) {

        },
        async btnExec(ctx) {
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
    // {
    //     id: "historyView",
    //     mode: ['normal'],
    //     btn: {
    //         containerId: 'control-panel',
    //         label: 'История изменений',
    //         classes: ['sidebar-button', 'fas', 'fa-history', 'fas-lg']
    //     },
    //     defaultHotkey: 'shift+h',
    //     description: 'Открывает окно с историей изменений для текущего блока',
    //     execute(ctx) {
    //         ctx.mode = 'historyView';
    //         // Предположим, blockId получаем из контекста
    //         const blockId = ctx.blockId || ctx.blockElement?.id.split('*').at(-1);
    //         if (!blockId) return;
    //         ctx.closePopups()
    //         setCmdOpenBlock(ctx);
    //         // Создаём popup
    //         ctx.popup = new HistoryPopup({
    //             classPrefix: 'history-popup',
    //             blockId: blockId,
    //             fetchHistory: (blockId) => {
    //                 return api.getBlockHistory(blockId) // ваш реальный вызов к API
    //                     .then((res) => {
    //                         if (res.status !== 200) throw new Error('Ошибка загрузки истории');
    //                         // Ожидаем, что вернётся массив объектов {history_id, history_date, changed_by, ...}
    //                         return res.data;
    //                     });
    //             },
    //             revertHistory: async (blockId, historyId) => {
    //                 const res = await api.revertBlockToHistory(blockId, historyId);
    //                 console.log(res)
    //                 if (res.status === 200) {
    //                     dispatch('HistoryRevert', {block: res.data})
    //                 } else {
    //                     throw new Error('Ошибка при откате');
    //                 }
    //             },
    //             onCancel() {
    //                 // Когда пользователь закрывает окно, возвращаем режим 'normal'
    //                 ctx.mode = 'normal';
    //             },
    //         });
    //     }
    // },
    {
        id: "importBlocks",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Импорт блоков',
            classes: ['sidebar-button', 'fas', 'fa-file-import', 'fas-lg']
        },
        defaultHotkey: 'shift+i',
        description: 'Импортировать блоки из JSON',
        execute(ctx) {
            ctx.mode = 'importBlocks';
            // Родительский блок - текущий выбранный
            const parentId = ctx.blockElement?.id.split('*').at(-1) || null;
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.popup = new ImportPopup({
                parentBlockId: parentId,
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "uploadBlockImage",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Загрузить изображение в блок',
            classes: ['sidebar-button', 'fas', 'fa-image', 'fas-lg']
        },
        defaultHotkey: 'i',
        description: 'Загрузить изображение в блок',
        async execute(ctx) {
            const blockId = ctx.blockElement?.id.split('*').at(-1);
            if (!blockId) return;

            ctx.mode = 'uploadBlockImage';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            // Загружаем текущее изображение блока (если есть)
            let currentImage = null;
            try {
                currentImage = await api.getBlockImage(blockId);
            } catch (err) {
                console.error('Ошибка загрузки информации об изображении:', err);
            }

            ctx.popup = new ImageUploadPopup({
                blockId: blockId,
                currentImage: currentImage,
                onImageChange(imageData) {
                    // Обновляем данные блока с информацией об изображении
                    dispatch('UpdateBlockImage', { blockId, imageData });
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
]