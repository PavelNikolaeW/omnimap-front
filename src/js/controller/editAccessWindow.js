// js/accessWindow.js
import api, {pollTaskStatus} from '../api/api.js';

/**
 * Создаёт окно редактирования прав доступа рядом с заданным элементом
 * @param {HTMLElement} targetElement - DOM-элемент, рядом с которым будет создано окно
 */
export default function createAccessWindow(targetElement) {
    removeExistingAccessWindow();

    const template = document.getElementById('access-window-template');
    if (!template) {
        console.error('Шаблон окна доступа не найден');
        return;
    }

    const accessWindow = template.content.firstElementChild.cloneNode(true);
    document.body.appendChild(accessWindow);

    // =======================
    // 1. Инициализация UI
    // =======================
    const {
        blockId,
        loadingIndicator,
        content,
        publicCheckbox,
        accessSelect,
        userInput,
        confirmButton,
        userList,
        closeButton
    } = initializeUI(accessWindow, targetElement);

    // =======================
    // 2. Установка позиционирования
    // =======================
    positionAccessWindow(accessWindow, targetElement);

    // Следим за изменениями размера/прокрутки, чтобы окно не "уезжало"
    window.addEventListener('resize', () => positionAccessWindow(accessWindow, targetElement));
    window.addEventListener('scroll', () => positionAccessWindow(accessWindow, targetElement));

    // =======================
    // 3. Состояние загрузки (первичное)
    // =======================
    showLoading(loadingIndicator, content);

    // =======================
    // 4. Навешиваем обработчики
    // =======================
    // - Закрыть окно
    closeButton.addEventListener('click', () => accessWindow.remove());

    // - Публичный доступ: управление полями
    publicCheckbox.addEventListener('change', () => toggleAccessFields(publicCheckbox, userInput, accessSelect));

    // - Подтвердить изменения прав
    confirmButton.addEventListener('click', async () => {
        await onConfirmButtonClick({
            blockId,
            publicCheckbox,
            userInput,
            accessSelect,
            loadingIndicator,
            content,
            userList
        });
    });

    // =======================
    // 5. Загрузка списка прав доступа
    // =======================
    fetchUserListAndRender(blockId, {loadingIndicator, content, publicCheckbox, accessSelect, userInput, userList});

    /**
     * Удаляет уже существующее окно, чтобы избежать дубликатов
     */
    function removeExistingAccessWindow() {
        const existingWindow = document.querySelector('.access-window');
        if (existingWindow) {
            existingWindow.remove();
        }
    }

    /**
     * Инициализация UI-переменных и установка заголовка окна
     */
    function initializeUI(accessWindow, targetElement) {
        // Заголовок окна
        const blockTitle = targetElement.querySelector('titleblock b');
        const titleElement = accessWindow.querySelector('#access-window-title');

        const blockId = targetElement.id.includes('*')
            ? targetElement.id.split('*')[1]
            : targetElement.id;

        titleElement.textContent = `Редактирование прав доступа для ${blockTitle?.textContent ?? blockId}`;

        // Ссылки на элементы интерфейса
        const loadingIndicator = accessWindow.querySelector('.loading');
        const content = accessWindow.querySelector('.content');
        const publicCheckbox = accessWindow.querySelector('#public-checkbox');
        const accessSelect = accessWindow.querySelector('#access-level');
        const userInput = accessWindow.querySelector('#username-input');
        const confirmButton = accessWindow.querySelector('#confirm-button');
        const userList = accessWindow.querySelector('#user-list');
        const closeButton = accessWindow.querySelector('.close-button');

        return {
            blockId,
            loadingIndicator,
            content,
            publicCheckbox,
            accessSelect,
            userInput,
            confirmButton,
            userList,
            closeButton
        };
    }

    /**
     * Позиционирует окно рядом с targetElement
     */
    function positionAccessWindow(accessWindow, targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const windowWidth = accessWindow.offsetWidth;
        const windowHeight = accessWindow.offsetHeight;
        const scrollOffset = {
            top: window.pageYOffset || document.documentElement.scrollTop,
            left: window.pageXOffset || document.documentElement.scrollLeft
        };

        let top = rect.top + scrollOffset.top;
        let left = rect.right + 10 + scrollOffset.left;

        // Проверка выхода за правую границу
        if (left + windowWidth > scrollOffset.left + window.innerWidth) {
            left = rect.left - windowWidth - 10 + scrollOffset.left;
        }

        // Проверка выхода за нижнюю границу
        if (top + windowHeight > scrollOffset.top + window.innerHeight) {
            top = scrollOffset.top + window.innerHeight - windowHeight - 10;
        }

        // Проверка выхода за верхнюю границу
        if (top < scrollOffset.top) {
            top = scrollOffset.top + 10;
        }

        // Проверка выхода за левую границу
        if (left < scrollOffset.left) {
            left = rect.left + scrollOffset.left;
        }

        accessWindow.style.top = `${top}px`;
        accessWindow.style.left = `${left}px`;
    }

    /**
     * Показывает индикатор загрузки и скрывает контент
     */
    function showLoading(loadingIndicator, content) {
        loadingIndicator.style.display = 'block';
        content.style.display = 'none';
    }

    /**
     * Скрывает индикатор загрузки и показывает контент
     */
    function hideLoading(loadingIndicator, content) {
        loadingIndicator.style.display = 'none';
        content.style.display = 'block';
    }

    /**
     * Запрашивает список пользователей с доступом и отображает его
     */
    function fetchUserListAndRender(blockId, uiRefs) {
        const {loadingIndicator, content, publicCheckbox, accessSelect, userInput, userList} = uiRefs;

        api.getAccessList(blockId)
            .then(res => {
                if (res.status === 200) {
                    const data = res.data;
                    // Отображаем интерфейс
                    hideLoading(loadingIndicator, content);
                    // Устанавливаем состояние "публичный доступ" и состояние полей
                    publicCheckbox.checked = data.access_type === 'public';
                    accessSelect.value = 'read'; // По умолчанию
                    toggleAccessFields(publicCheckbox, userInput, accessSelect);

                    // Заполняем список пользователей
                    renderUserList(data, userList);
                } else {
                    throw new Error('Не удалось получить список доступа');
                }
            })
            .catch(err => {
                console.error(err);
                loadingIndicator.textContent = 'Ошибка загрузки данных';
            });
    }

    /**
     * Функция управления состоянием полей при переключении публичного доступа
     */
    function toggleAccessFields(publicCheckbox, userInput, accessSelect) {
        const isPublic = publicCheckbox.checked;
        userInput.disabled = isPublic;
        accessSelect.disabled = isPublic;
    }

    /**
     * Заполняет список пользователей (userList) на основе полученных данных
     */
    function renderUserList(data, userListElement) {
        userListElement.innerHTML = ''; // Очищаем текущий список

        data.forEach(({username, permission}) => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');

            const userNameSpan = document.createElement('span');
            userNameSpan.textContent = `${username} (${permission})`;

            userItem.appendChild(userNameSpan);

            // Кнопка "Запретить"
            if (permission !== 'deny') {
                const removeButton = document.createElement('button');
                removeButton.textContent = 'Запретить';
                removeButton.addEventListener('click', () => {
                    removeUserAccess(username);
                });
                userItem.appendChild(removeButton);
            }

            userListElement.appendChild(userItem);
        });
    }

    /**
     * Удаляет доступ пользователю
     */
    async function removeUserAccess(targetUser) {
        if (!confirm(`Вы уверены, что хотите запретить доступ пользователя "${targetUser}"?`)) {
            return;
        }

        // Включаем индикатор, чтобы пользователь видел, что идёт работа
        showLoading(loadingIndicator, content);

        try {
            const response = await api.updateAccess(blockId, {
                'target_username': targetUser,
                'permission_type': 'deny'
            });

            if (response.status === 202) {
                // Ожидаем завершения задачи
                await handleTask(response.data.task_id);
            } else {
                throw new Error('Не удалось обновить права доступа');
            }
        } catch (error) {
            console.error('Ошибка при обновлении прав доступа:', error);
            alert('Произошла ошибка при обновлении прав доступа.');
        } finally {
            // После операции всегда загружаем свежие данные
            fetchUserListAndRender(blockId, {
                loadingIndicator,
                content,
                publicCheckbox,
                accessSelect,
                userInput,
                userList
            });
        }
    }

    /**
     * Обработчик нажатия на кнопку "Подтвердить" (добавление/изменение прав)
     */
    async function onConfirmButtonClick({
                                            blockId,
                                            publicCheckbox,
                                            userInput,
                                            accessSelect,
                                            loadingIndicator,
                                            content,
                                            userList
                                        }) {
        const isPublic = publicCheckbox.checked;
        const username = userInput.value.trim();
        const accessLevel = accessSelect.value;

        // Если доступ не публичный, нужно ввести имя пользователя
        if (!isPublic && !username) {
            alert('Пожалуйста, введите имя пользователя.');
            return;
        }

        // Отображаем индикатор, что идёт работа
        showLoading(loadingIndicator, content);

        try {
            // Если ставим "public", то отправляем подходящие данные
            const response = await api.updateAccess(blockId, {
                'target_username': isPublic ? '' : username,
                'permission_type': isPublic ? 'public' : accessLevel
            });

            if (response.status === 202) {
                // Ждём окончания задачи
                await handleTask(response.data.task_id);

                // Если задача прошла успешно, очищаем поле ввода
                if (!isPublic) {
                    userInput.value = '';
                }
            } else {
                throw new Error('Не удалось обновить права доступа');
            }
        } catch (error) {
            console.error('Ошибка при обновлении прав доступа:', error);
            alert('Произошла ошибка при обновлении прав доступа.');
        } finally {
            // В любом случае, после выполнения операции — перезагружаем список
            fetchUserListAndRender(blockId, {
                loadingIndicator,
                content,
                publicCheckbox,
                accessSelect,
                userInput,
                userList
            });
        }
    }

    /**
     * Опрашивает статус задачи и отображает результат (успех/ошибка)
     */
    async function handleTask(taskId) {
        try {
            // Если успех — просто идём дальше
            await pollTaskStatus(taskId);
            alert('Операция успешно завершена!');
        } catch (error) {
            // Если что-то пошло не так — выдаём ошибку
            console.error('Ошибка при опросе статуса задачи:', error);
            alert('Ошибка при выполнении операции: ' + error.message);
        }
    }
}