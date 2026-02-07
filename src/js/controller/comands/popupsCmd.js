import {HistoryPopup} from "../popups/historyPopup";
import api, {pollTaskStatus} from "../../api/api";
import {dispatch} from "../../utils/utils";
import {createEditHotkeyInputs, setCmdOpenBlock} from "./cmdUtils";
import {HotkeyPopup} from "../popups/hotkeyPopup";
import localforage from "localforage";
import {AccessPopup} from "../popups/accessPopup";
import {localStateManager} from "../../stateLocal/localStateManager";
import {canEditAccess} from "../../utils/permissionUtils";
import {UrlPopup} from "../popups/urlPopup";
import {EditBlockPopup} from "../popups/editBlockPopup";
import {SearchBlocksPopup} from "../popups/SearchPopup";
import {ImportPopup} from "../popups/importPopup";
import {ImageUploadPopup} from "../popups/imageUploadPopup";
import {openFullsizeImage} from "../../utils/imageUtils";
import {ReminderPopup} from "../popups/reminderPopup";
import {SubscriptionPopup} from "../popups/subscriptionPopup";
import {NotificationSettingsPopup} from "../popups/notificationSettingsPopup";
import {RemindersListPopup} from "../popups/remindersListPopup";
import {SubscriptionsListPopup} from "../popups/subscriptionsListPopup";
import {AccessRequestsPopup} from "../popups/accessRequestsPopup";
import {FocusContainerPopup} from "../popups/focusContainerPopup";
import {focusManager} from "../../services/focusManager";
import {MODES} from "../../actions/selectionActions";
import {resolveBlockId} from "../../actions/navigationActions";


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
            this.btnExec(ctx);
        },
        btnExec(ctx) {
            dispatch('OpenSearchPopup');
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
        description: 'Открывает редактор всех полей блока',
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
                        fullBlock: block,           // Передаём весь блок
                        blockData: block.data,      // Для обратной совместимости
                        blockId: id,
                        onSubmit: (editedBlock) => {
                            // Обновляем весь блок
                            dispatch('UpdateFullBlock', {blockId: id, block: editedBlock})
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

            // Проверка прав на управление доступом
            const block = localStateManager.blocks.get(id);
            if (!canEditAccess(block)) {
                dispatch('ShowError', { message: 'Нет прав на управление доступом к блоку' });
                return;
            }

            ctx.closePopups()
            ctx.mode = 'editAccessBlock'
            dispatch('OpenAccessPopup', { blockId: id });
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
                getSandboxMode: (blockId) => api.getSandboxMode(blockId),
                setSandboxMode: (blockId, mode) => api.setSandboxMode(blockId, mode),
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
        defaultHotkey: 'shift+h',
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
            dispatch('OpenImportPopup', { parentId });
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
            const normalizeBlockId = (value) => {
                if (!value || typeof value !== 'string') return null;
                return value.trim().split('*').at(-1) || null;
            };

            const extractFromTestId = (testId, prefix) => {
                if (typeof testId !== 'string' || !testId.startsWith(prefix)) return null;
                return normalizeBlockId(testId.slice(prefix.length));
            };

            const getElementCandidateIds = (el) => {
                if (!el || typeof el.getAttribute !== 'function') return [];
                return [
                    normalizeBlockId(el.id),
                    normalizeBlockId(el.getAttribute('blockLink')),
                    extractFromTestId(el.getAttribute('data-testid'), 'block-'),
                    extractFromTestId(el.getAttribute('data-testid'), 'block-link-'),
                ].filter(Boolean);
            };

            const getImageOwnerIdFromDom = (el, preferredIds = []) => {
                if (!el || typeof el.querySelector !== 'function') return null;

                // Сначала пробуем найти контейнер картинки для ожидаемого блока.
                for (const preferredId of preferredIds) {
                    const exact = el.matches?.(`.block-image-container[data-testid="block-image-${preferredId}"]`)
                        ? el
                        : el.querySelector(`.block-image-container[data-testid="block-image-${preferredId}"]`);
                    if (exact) return preferredId;
                }

                const ownId = normalizeBlockId(el.id);
                if (ownId) {
                    const ownContainer = el.querySelector(`.block-image-container[data-testid="block-image-${ownId}"]`);
                    if (ownContainer) return ownId;
                }

                const anyContainer = el.matches?.('.block-image-container[data-testid^="block-image-"]')
                    ? el
                    : el.querySelector('.block-image-container[data-testid^="block-image-"]');

                return extractFromTestId(anyContainer?.getAttribute?.('data-testid'), 'block-image-');
            };

            const rememberedBlockId = normalizeBlockId(ctx.lastImagePopupBlockId);
            const focusedElement = document.activeElement;

            const domSources = [...new Set([
                ctx.blockElement,
                ctx.blockLinkElement,
                document.querySelector('.block-active'),
                document.querySelector('.block-link-active'),
                focusedElement?.closest?.('[block]'),
                focusedElement?.closest?.('[blockLink]'),
            ].filter(Boolean))];

            const blockId = normalizeBlockId(resolveBlockId(ctx.blockElement, ctx.blockLinkElement))
                || normalizeBlockId(ctx.blockId)
                || domSources.flatMap((el) => getElementCandidateIds(el))[0]
                || rememberedBlockId
                || null;
            if (!blockId) return;

            const imageOwnerFromDom = domSources
                .map((el) => getImageOwnerIdFromDom(el, [blockId, ...getElementCandidateIds(el)]))
                .find(Boolean);

            const candidateBlockIds = [...new Set([
                blockId,
                imageOwnerFromDom,
                rememberedBlockId,
                ...domSources.flatMap((el) => getElementCandidateIds(el)),
            ].filter(Boolean))];

            const hasImagePreviewSource = (image) => {
                if (!image || typeof image !== 'object') return false;
                return Boolean(
                    image.thumbnail_url ||
                    image.thumb_url ||
                    image.preview_url ||
                    image.url ||
                    image.file_url ||
                    image.image_url ||
                    image.file ||
                    image.variants?.thumb?.url ||
                    image.variants?.original?.url
                );
            };

            ctx.mode = 'uploadBlockImage';
            dispatch('OpenImageUploadPopup', { blockId });
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            let imageOwnerBlockId = blockId;
            let currentImage = null;

            // Сначала проверяем локальный state (включая link-контексты)
            for (const candidateId of candidateBlockIds) {
                const block = localStateManager.blocks.get(candidateId);
                const localImage = block?.data?.image || null;
                if (!localImage) continue;
                if (hasImagePreviewSource(localImage) || localImage?.settings) {
                    currentImage = localImage;
                    imageOwnerBlockId = candidateId;
                    break;
                }
                if (!currentImage) {
                    currentImage = localImage;
                    imageOwnerBlockId = candidateId;
                }
            }

            console.debug('uploadBlockImage: local image data:', currentImage ? 'found' : 'not found', currentImage, 'candidates:', candidateBlockIds);

            // Если локально нет URL картинки или нет settings - запрашиваем с сервера.
            // Это покрывает кейс, когда в блоке сохранились только settings без ссылок на файл.
            if (!hasImagePreviewSource(currentImage) || !currentImage?.settings) {
                for (const candidateId of candidateBlockIds) {
                    try {
                        const apiImage = await api.getBlockImage(candidateId);
                        console.debug('uploadBlockImage: fetched from API:', candidateId, apiImage);
                        // Нормализуем данные от API (разные поля под одни и те же названия)
                        if (apiImage) {
                            // Мержим с локальными данными, API имеет приоритет для settings
                            currentImage = {
                                ...(currentImage || {}), // Локальные данные как база
                                ...apiImage,             // API данные поверх
                                // Нормализуем URL поля - бек может возвращать разные названия
                                url: apiImage.url || apiImage.file_url || apiImage.image_url || apiImage.file,
                                thumbnail_url: apiImage.thumbnail_url || apiImage.thumb_url || apiImage.preview_url,
                                filename: apiImage.filename || apiImage.name || apiImage.file_name,
                                size: apiImage.size || apiImage.file_size,
                                // Settings из API имеют приоритет
                                settings: apiImage.settings || currentImage?.settings || null
                            };
                            imageOwnerBlockId = candidateId;

                            // Сохраняем в локальный state для следующих открытий
                            const block = localStateManager.blocks.get(candidateId);
                            if (block) {
                                block.data.image = currentImage;
                            }
                            break;
                        }
                    } catch (err) {
                        // Игнорируем ошибки - просто попробуем другие варианты ID
                        console.debug('getBlockImage error:', candidateId, err);
                    }
                }
            }

            // Fallback: если URL всё ещё не найден, но в DOM есть изображение - извлекаем из DOM
            if (!hasImagePreviewSource(currentImage)) {
                for (const sourceEl of domSources) {
                    let imageContainer = null;

                    // Приоритет: ищем контейнеры, соответствующие candidate ID.
                    for (const candidateId of candidateBlockIds) {
                        imageContainer = sourceEl.matches?.(`.block-image-container[data-testid="block-image-${candidateId}"]`)
                            ? sourceEl
                            : sourceEl.querySelector(`.block-image-container[data-testid="block-image-${candidateId}"]`);
                        if (imageContainer) {
                            imageOwnerBlockId = candidateId;
                            break;
                        }
                    }

                    // Последний fallback: любой контейнер картинки в найденном блоке.
                    if (!imageContainer) {
                        imageContainer = sourceEl.matches?.('.block-image-container[data-testid^="block-image-"]')
                            ? sourceEl
                            : sourceEl.querySelector('.block-image-container[data-testid^="block-image-"]');
                        const ownerFromContainer = extractFromTestId(
                            imageContainer?.getAttribute?.('data-testid'),
                            'block-image-'
                        );
                        if (ownerFromContainer) {
                            imageOwnerBlockId = ownerFromContainer;
                        }
                    }

                    if (!imageContainer) continue;
                    const img = imageContainer.querySelector('.block-image');
                    const fullsizeUrl = imageContainer.getAttribute('data-fullsize-url');
                    if (fullsizeUrl) {
                        console.debug('uploadBlockImage: extracting image data from DOM');
                        currentImage = {
                            url: fullsizeUrl,
                            thumbnail_url: img?.src || fullsizeUrl,
                            filename: img?.alt || 'image',
                            settings: {
                                fitMode: imageContainer.getAttribute('data-fit') || 'contain',
                                position: imageContainer.getAttribute('data-position') || 'center',
                                background: {
                                    enabled: imageContainer.getAttribute('data-background') === 'true'
                                }
                            }
                        };
                        // Сохраняем в локальный state
                        let saved = false;
                        for (const candidateId of candidateBlockIds) {
                            const block = localStateManager.blocks.get(candidateId);
                            if (block) {
                                block.data.image = currentImage;
                                imageOwnerBlockId = candidateId;
                                saved = true;
                                break;
                            }
                        }
                        if (!saved) {
                            imageOwnerBlockId = blockId;
                        }
                        break;
                    }
                }
            }

            // Если нашли изображение, но нет settings - задаём дефолты локально,
            // чтобы всегда открыть popup в режиме редактирования.
            if (currentImage && !currentImage.settings) {
                currentImage.settings = {
                    fitMode: 'contain',
                    position: 'center',
                    background: {
                        enabled: false,
                        opacity: 60,
                        blur: 0,
                        brightness: 100,
                        contrast: 100,
                        saturation: 100,
                        overlayColor: '#000000',
                        overlayOpacity: 30
                    }
                };
                for (const candidateId of candidateBlockIds) {
                    const block = localStateManager.blocks.get(candidateId);
                    if (block?.data?.image) {
                        block.data.image.settings = currentImage.settings;
                        imageOwnerBlockId = candidateId;
                        break;
                    }
                }
            }

            // Запоминаем последний блок, для которого открыт image popup.
            // Нужен как fallback, когда после закрытия popup blockElement очищается mouseout.
            ctx.lastImagePopupBlockId = imageOwnerBlockId || blockId;

            ctx.popup = new ImageUploadPopup({
                blockId: imageOwnerBlockId,
                currentImage: currentImage,
                onImageChange(imageData) {
                    // Обновляем данные блока с информацией об изображении
                    dispatch('UpdateBlockImage', { blockId: imageOwnerBlockId, imageData });
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "editBlockImageSettings",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Настройки изображения',
            classes: ['sidebar-button', 'fas', 'fa-sliders-h', 'fas-lg']
        },
        description: 'Открыть только настройки изображения блока',
        async execute(ctx) {
            const normalizeBlockId = (value) => {
                if (!value || typeof value !== 'string') return null;
                return value.trim().split('*').at(-1) || null;
            };

            const hasImagePreviewSource = (image) => {
                if (!image || typeof image !== 'object') return false;
                return Boolean(
                    image.thumbnail_url ||
                    image.thumb_url ||
                    image.preview_url ||
                    image.url ||
                    image.file_url ||
                    image.image_url ||
                    image.file ||
                    image.variants?.thumb?.url ||
                    image.variants?.original?.url
                );
            };

            const rememberedBlockId = normalizeBlockId(ctx.lastImagePopupBlockId);
            const activeBlockEl = document.querySelector('.block-active');
            const activeLinkEl = document.querySelector('.block-link-active');

            const candidateBlockIds = [...new Set([
                normalizeBlockId(resolveBlockId(ctx.blockElement, ctx.blockLinkElement)),
                normalizeBlockId(ctx.blockId),
                normalizeBlockId(ctx.blockElement?.id),
                normalizeBlockId(ctx.blockElement?.getAttribute?.('blockLink')),
                normalizeBlockId(ctx.blockLinkElement?.id),
                normalizeBlockId(ctx.blockLinkElement?.getAttribute?.('blockLink')),
                normalizeBlockId(activeBlockEl?.id),
                normalizeBlockId(activeLinkEl?.id),
                normalizeBlockId(activeLinkEl?.getAttribute?.('blockLink')),
                rememberedBlockId
            ].filter(Boolean))];

            const blockId = candidateBlockIds[0];
            if (!blockId) {
                dispatch('ShowError', { message: 'Выберите блок с изображением' });
                return;
            }

            let imageOwnerBlockId = blockId;
            let currentImage = null;

            // Сначала local state
            for (const candidateId of candidateBlockIds) {
                const block = localStateManager.blocks.get(candidateId);
                const localImage = block?.data?.image || null;
                if (!localImage) continue;
                if (hasImagePreviewSource(localImage) || localImage?.settings) {
                    currentImage = localImage;
                    imageOwnerBlockId = candidateId;
                    break;
                }
            }

            // Потом API если локально данных недостаточно
            if (!hasImagePreviewSource(currentImage) || !currentImage?.settings) {
                for (const candidateId of candidateBlockIds) {
                    try {
                        const apiImage = await api.getBlockImage(candidateId);
                        if (!apiImage) continue;

                        currentImage = {
                            ...(currentImage || {}),
                            ...apiImage,
                            url: apiImage.url || apiImage.file_url || apiImage.image_url || apiImage.file,
                            thumbnail_url: apiImage.thumbnail_url || apiImage.thumb_url || apiImage.preview_url,
                            filename: apiImage.filename || apiImage.name || apiImage.file_name,
                            size: apiImage.size || apiImage.file_size,
                            settings: apiImage.settings || currentImage?.settings || null
                        };
                        imageOwnerBlockId = candidateId;

                        const block = localStateManager.blocks.get(candidateId);
                        if (block) {
                            block.data.image = currentImage;
                        }
                        break;
                    } catch (err) {
                        console.debug('editBlockImageSettings: getBlockImage error:', candidateId, err);
                    }
                }
            }

            if (!hasImagePreviewSource(currentImage)) {
                dispatch('ShowError', { message: 'В этом блоке нет загруженной картинки' });
                return;
            }

            if (!currentImage.settings) {
                currentImage.settings = {
                    fitMode: 'contain',
                    position: 'center',
                    background: {
                        enabled: false,
                        opacity: 60,
                        blur: 0,
                        brightness: 100,
                        contrast: 100,
                        saturation: 100,
                        overlayColor: '#000000',
                        overlayOpacity: 30
                    }
                };
            }

            ctx.mode = 'uploadBlockImage';
            dispatch('OpenImageUploadPopup', { blockId: imageOwnerBlockId });
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.lastImagePopupBlockId = imageOwnerBlockId;

            ctx.popup = new ImageUploadPopup({
                title: 'Настройки изображения',
                blockId: imageOwnerBlockId,
                currentImage: currentImage,
                settingsOnly: true,
                onImageChange(imageData) {
                    dispatch('UpdateBlockImage', { blockId: imageOwnerBlockId, imageData });
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "viewFullsizeImage",
        mode: ['normal'],
        defaultHotkey: 'v',
        description: 'Открыть изображение блока на полный экран',
        execute(ctx) {
            const blockElement = ctx.blockElement;
            if (!blockElement) return;

            // Ищем изображение в текущем блоке
            const imageContainer = blockElement.querySelector('.block-image-container');
            if (!imageContainer) return;

            const fullsizeUrl = imageContainer.getAttribute('data-fullsize-url');
            if (!fullsizeUrl) return;

            const img = imageContainer.querySelector('.block-image');
            openFullsizeImage(fullsizeUrl, img?.alt || 'Изображение блока');
        }
    },
    {
        id: "setReminder",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Напомнить о блоке',
            classes: ['sidebar-button', 'fas', 'fa-bell', 'fas-lg']
        },
        defaultHotkey: 'r',
        description: 'Создать напоминание о блоке',
        async execute(ctx) {
            const blockId = ctx.blockElement?.id.split('*').at(-1);
            if (!blockId) return;

            dispatch('OpenReminderPopup', { blockId });
            ctx.mode = 'setReminder';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            // Получаем название блока и проверяем существующее напоминание
            let blockTitle = ctx.blockElement.querySelector('titleBlock')?.innerText || '';
            let existingReminder = null;

            try {
                const res = await api.getBlockReminder(blockId);
                if (res.status === 200 && res.data) {
                    existingReminder = res.data;
                }
            } catch (err) {
                // 404 = нет напоминания, это нормально
                if (err.response?.status !== 404) {
                    console.error('Error fetching reminder:', err);
                }
            }

            ctx.popup = new ReminderPopup({
                blockId: blockId,
                blockTitle: blockTitle,
                existingReminder: existingReminder,
                onSave() {
                    ctx.mode = 'normal';
                },
                onDelete() {
                    ctx.mode = 'normal';
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "watchBlock",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Следить за изменениями блока',
            classes: ['sidebar-button', 'fas', 'fa-eye', 'fas-lg']
        },
        defaultHotkey: 'shift+w',
        description: 'Подписаться на изменения блока',
        async execute(ctx) {
            const blockId = ctx.blockElement?.id.split('*').at(-1);
            if (!blockId) return;

            dispatch('WatchBlock', { blockId });
            ctx.mode = 'watchBlock';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            let blockTitle = ctx.blockElement.querySelector('titleBlock')?.innerText || '';
            let existingSubscription = null;

            try {
                const res = await api.getBlockSubscription(blockId);
                if (res.status === 200 && res.data) {
                    existingSubscription = res.data;
                }
            } catch (err) {
                // 404 = нет подписки, это нормально
                if (err.response?.status !== 404) {
                    console.error('Error fetching subscription:', err);
                }
            }

            // Если подписки нет — создаём быстро с дефолтными настройками
            if (!existingSubscription) {
                try {
                    await api.createSubscription({
                        block_id: blockId,
                        depth: 1,
                        on_text_change: true,
                        on_data_change: true,
                        on_move: true,
                        on_child_add: true,
                        on_child_delete: true
                    });
                    dispatch('SubscriptionUpdated', { blockId });
                    dispatch('ShowToast', { message: 'Подписка на изменения включена', type: 'success' });
                    ctx.mode = 'normal';
                    return;
                } catch (err) {
                    console.error('Failed to create subscription:', err);
                    dispatch('ShowError', { message: 'Не удалось создать подписку' });
                    ctx.mode = 'normal';
                    return;
                }
            }

            // Если подписка уже есть — открываем окно настройки
            ctx.popup = new SubscriptionPopup({
                blockId: blockId,
                blockTitle: blockTitle,
                existingSubscription: existingSubscription,
                onSave() {
                    ctx.mode = 'normal';
                },
                onDelete() {
                    ctx.mode = 'normal';
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "notificationSettings",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Настройки уведомлений',
            classes: ['sidebar-button', 'fas', 'fa-sliders', 'fas-lg']
        },
        defaultHotkey: 'shift+n',
        description: 'Открыть настройки уведомлений',
        execute(ctx) {
            dispatch('OpenNotificationSettings');
            ctx.mode = 'notificationSettings';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.popup = new NotificationSettingsPopup({
                onCancel() {
                    ctx.mode = 'normal';
                },
                onSave() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "myReminders",
        mode: ['normal'],
        defaultHotkey: '',
        description: 'Показать мои напоминания',
        execute(ctx) {
            ctx.mode = 'myReminders';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.popup = new RemindersListPopup({
                onOpen(blockId) {
                    dispatch('OpenBlock', { id: blockId });
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "mySubscriptions",
        mode: ['normal'],
        defaultHotkey: '',
        description: 'Показать мои подписки',
        execute(ctx) {
            ctx.mode = 'mySubscriptions';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.popup = new SubscriptionsListPopup({
                onOpen(blockId) {
                    dispatch('OpenBlock', { id: blockId });
                },
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "accessRequests",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Запросы на доступ',
            classes: ['sidebar-button', 'fas', 'fa-user-check', 'fas-lg']
        },
        defaultHotkey: 'shift+o',
        description: 'Открыть запросы на доступ к блокам',
        execute(ctx) {
            dispatch('OpenAccessRequestsManager');
            ctx.mode = 'accessRequests';
            ctx.closePopups();
            setCmdOpenBlock(ctx);

            ctx.popup = new AccessRequestsPopup({
                onCancel() {
                    ctx.mode = 'normal';
                }
            });
        }
    },
    {
        id: "addToFocus",
        mode: ['normal', 'addToFocus'],
        btn: {
            containerId: 'control-panel',
            label: 'Добавить в фокус',
            classes: ['sidebar-button', 'fas', 'fa-bullseye', 'fas-lg']
        },
        defaultHotkey: 'shift+k',
        description: 'Добавить блок в контейнер фокуса',
        execute(ctx) {
            // Если блок не выбран - входим в режим выбора
            if (!ctx.blockElement && ctx.mode !== MODES.ADD_TO_FOCUS) {
                ctx.previousMode = ctx.mode;  // Сохраняем для возврата
                ctx.mode = MODES.ADD_TO_FOCUS;
                document.body.style.cursor = 'crosshair';
                // Показываем подсказку
                let hint = document.getElementById('command-hint');
                if (!hint) {
                    hint = document.createElement('div');
                    hint.id = 'command-hint';
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
                    `;
                    document.body.appendChild(hint);
                }
                hint.textContent = 'Кликните на блок для добавления в фокус (Esc для отмены)';
                hint.style.opacity = '1';
                hint.style.display = 'block';
                return;
            }

            // Если в режиме ADD_TO_FOCUS и кликнули на блок
            if (ctx.mode === MODES.ADD_TO_FOCUS && ctx.blockElement) {
                document.body.style.cursor = '';
                // Скрываем подсказку
                const hint = document.getElementById('command-hint');
                if (hint) {
                    hint.style.opacity = '0';
                    setTimeout(() => { hint.style.display = 'none'; }, 300);
                }
            }

            // Получаем ID выбранного блока
            let blockId = ctx.blockElement?.id?.split('*').at(-1);
            if (ctx.blockLinkElement?.hasAttribute('blockLink')) {
                blockId = ctx.blockLinkElement.getAttribute('blocklink');
            }

            if (!blockId) {
                ctx.mode = MODES.NORMAL;
                setCmdOpenBlock(ctx);
                return;
            }

            // Получаем название блока
            const block = localStateManager.blocks.get(blockId);
            const blockTitle = block?.title || ctx.blockElement?.querySelector('titleBlock')?.innerText || 'Блок';

            ctx.closePopups();
            const previousMode = ctx.previousMode;  // Сохраняем до сброса
            ctx.mode = MODES.ADD_TO_FOCUS;
            dispatch('OpenFocusContainerPopup', { blockId });

            // Показываем popup выбора контейнера
            ctx.popup = new FocusContainerPopup({
                blockId: blockId,
                blockTitle: blockTitle,
                onSelect(containerId) {
                    focusManager.addBlockToFocusContainer(blockId, containerId);
                    ctx.mode = previousMode || MODES.NORMAL;
                    ctx.previousMode = undefined;
                    setCmdOpenBlock(ctx);
                },
                onCancel() {
                    ctx.mode = previousMode || MODES.NORMAL;
                    ctx.previousMode = undefined;
                    setCmdOpenBlock(ctx);
                }
            });
        }
    },
    {
        id: "markAsFocusContainer",
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Сделать контейнером фокуса',
            classes: ['sidebar-button', 'fas', 'fa-folder-plus', 'fas-lg']
        },
        defaultHotkey: 'shift+ctrl+k',
        description: 'Пометить блок как контейнер фокуса',
        execute(ctx) {
            let blockId = ctx.blockElement?.id?.split('*').at(-1);
            if (ctx.blockLinkElement?.hasAttribute('blockLink')) {
                blockId = ctx.blockLinkElement.getAttribute('blocklink');
            }

            if (!blockId) {
                dispatch('ShowError', { message: 'Выберите блок' });
                return;
            }

            // Проверяем, является ли блок уже контейнером
            if (focusManager.isFocusContainer(blockId)) {
                // Снимаем метку
                focusManager.unmarkAsFocusContainer(blockId);
                dispatch('ShowToast', { message: 'Метка контейнера фокуса снята', type: 'info' });
            } else {
                // Помечаем как контейнер
                focusManager.markAsFocusContainer(blockId);
                dispatch('MarkAsFocusContainer', { blockId });
                dispatch('ShowToast', { message: 'Блок помечен как контейнер фокуса', type: 'success' });
            }

            setCmdOpenBlock(ctx);
        }
    },
]
