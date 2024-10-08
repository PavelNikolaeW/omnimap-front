// js/accessWindow.js
import api from '../api/api.js';

/**
 * Функция для создания окна редактирования прав доступа рядом с заданным элементом
 * @param {HTMLElement} targetElement - DOM элемент, рядом с которым будет создано окно
 */
export default function createAccessWindow(targetElement) {
    // Проверяем, существует ли уже окно, и удаляем его, чтобы избежать дубликатов
    const existingWindow = document.querySelector('.access-window');
    if (existingWindow) {
        existingWindow.remove();
    }

    // Получаем шаблон из основного HTML
    const template = document.getElementById('access-window-template');
    if (!template) {
        console.error('Шаблон окна доступа не найден');
        return;
    }

    // Клонируем содержимое шаблона
    const accessWindow = template.content.firstElementChild.cloneNode(true);

    // Устанавливаем заголовок окна
    const blockTitle = targetElement.querySelector('titleblock b');
    const title = accessWindow.querySelector('#access-window-title');
    title.textContent = `Редактирование прав доступа для ${blockTitle?.textContent ?? targetElement.id}`;

    // Добавляем окно в документ
    document.body.appendChild(accessWindow);

    // Функция для позиционирования окна
    function positionWindow() {
        const rect = targetElement.getBoundingClientRect();
        const windowWidth = accessWindow.offsetWidth;
        const windowHeight = accessWindow.offsetHeight;
        const scrollOffset = windowElementScrollOffset();
        let top = rect.top + scrollOffset.top;
        let left = rect.right + 10 + scrollOffset.left;

        // Проверяем, чтобы окно не выходило за правую границу
        if (left + windowWidth > scrollOffset.left + window.innerWidth) {
            left = rect.left - windowWidth - 10 + scrollOffset.left;
        }

        // Проверяем, чтобы окно не выходило за нижнюю границу
        if (top + windowHeight > scrollOffset.top + window.innerHeight) {
            top = scrollOffset.top + window.innerHeight - windowHeight - 10;
        }

        // Проверяем, чтобы окно не выходило за верхнюю границу
        if (top < scrollOffset.top) {
            top = scrollOffset.top + 10;
        }

        // Проверяем, чтобы окно не выходило за левую границу
        if (left < scrollOffset.left) {
            left = rect.left + scrollOffset.left;
        }

        accessWindow.style.top = `${top}px`;
        accessWindow.style.left = `${left}px`;
    }

    // Получаем текущие смещения скролла
    function windowElementScrollOffset() {
        return {
            top: window.pageYOffset || document.documentElement.scrollTop,
            left: window.pageXOffset || document.documentElement.scrollLeft
        };
    }

    // Обработчики для обеспечения постоянной видимости окна
    window.addEventListener('resize', positionWindow);
    window.addEventListener('scroll', positionWindow);
    // Initial positioning
    positionWindow();

    // Скрываем индикатор загрузки и показываем контент
    const loadingIndicator = accessWindow.querySelector('.loading');
    const content = accessWindow.querySelector('.content');
    loadingIndicator.style.display = 'block';
    content.style.display = 'none';

    // Функция для получения списка пользователей с доступом
    function fetchUserList() {
        api.getAccessList(targetElement.id)
            .then(res => {
                if (res.status === 200) {
                    populateUserList(res.data);
                } else {
                    throw new Error('Не удалось получить список доступа');
                }
            })
            .catch(err => {
                console.error(err);
                loadingIndicator.textContent = 'Ошибка загрузки данных';
            });
    }

    // Функция для заполнения списка пользователей
    function populateUserList(data) {
        // Удаляем индикатор загрузки и показываем контент
        loadingIndicator.style.display = 'none';
        content.style.display = 'block';

        // Устанавливаем состояние публичного доступа
        const publicCheckbox = accessWindow.querySelector('#public-checkbox');
        publicCheckbox.checked = data.access_type === 'public';

        // Устанавливаем значения по умолчанию
        const accessSelect = accessWindow.querySelector('#access-level');
        accessSelect.value = 'read'; // По умолчанию

        // Управляем состоянием полей ввода в зависимости от публичного доступа
        const userInput = accessWindow.querySelector('#username-input');
        const confirmButton = accessWindow.querySelector('#confirm-button');
        const userList = accessWindow.querySelector('#user-list');

        // Инициализируем состояние полей
        toggleAccessFields(publicCheckbox.checked);

        // Обработчик для чекбокса публичного доступа
        publicCheckbox.addEventListener('change', () => {
            toggleAccessFields(publicCheckbox.checked);
        });

        function toggleAccessFields(isPublic) {
            userInput.disabled = isPublic;
            accessSelect.disabled = isPublic;
        }

        // Обработчик для кнопки "Подтвердить"
        confirmButton.addEventListener('click', async () => {
            const isPublic = publicCheckbox.checked;
            const username = userInput.value.trim();
            const accessLevel = accessSelect.value;

            // Подготовка данных для отправки
            const payload = {
                access_type: isPublic ? 'public' : 'private',
                visible_for: isPublic ? null : username || null,
                editable_for: isPublic ? null : (accessLevel === 'edit' ? username : null)
            };

            // Валидация
            if (!isPublic && !username) {
                alert('Пожалуйста, введите имя пользователя или сделайте доступ публичным.');
                return;
            }

            try {
                const response = await api.updateAccess(targetElement.id, payload);
                if (response.status === 200) {
                    const result = response.data;
                    // Обновляем список пользователей
                    populateUserListContent(result);
                    // Очищаем поля ввода
                    if (!isPublic) {
                        userInput.value = '';
                    }
                    // Можно оставить окно открытым или закрыть, как нужно
                    // accessWindow.remove();
                } else {
                    throw new Error('Не удалось обновить права доступа');
                }
            } catch (error) {
                console.error('Ошибка при обновлении прав доступа:', error);
                alert('Произошла ошибка при обновлении прав доступа.');
            }
        });

        // Заполнение списка пользователей
        populateUserListContent(data);
    }

    // Функция для заполнения списка пользователей на основе данных
    function populateUserListContent(data) {
        const userList = accessWindow.querySelector('#user-list');
        userList.innerHTML = ''; // Очищаем текущий список

        // Отображаем пользователей, которым виден элемент
        data.visible_to_users.forEach(username => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');

            const userName = document.createElement('span');
            userName.textContent = `${username} (Чтение)`;

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Удалить';
            removeButton.addEventListener('click', () => removeUserAccess({
                username,
                'data': {remove_vision_for: username}
            }));

            userItem.appendChild(userName);
            userItem.appendChild(removeButton);
            userList.appendChild(userItem);
        });

        // Отображаем пользователей, которые могут редактировать элемент
        data.editable_by_users.forEach(username => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');

            const userName = document.createElement('span');
            userName.textContent = `${username} (Редактирование)`;

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Удалить';
            removeButton.addEventListener('click', () => removeUserAccess({
                username,
                'data': {remove_edit_for: username}
            }));

            userItem.appendChild(userName);
            userItem.appendChild(removeButton);
            userList.appendChild(userItem);
        });
    }

    // Функция для удаления доступа пользователя
    async function removeUserAccess(params) {
        if (!confirm(`Вы уверены, что хотите удалить доступ пользователя "${params.username}"?`)) {
            return;
        }

        try {
            const response = await api.removeAccess(targetElement.id, {'data': params.data});
            if (response.status === 200) {
                console.log(response.data);
                populateUserListContent(response.data); // Обновляем список пользователей
            } else {
                throw new Error('Не удалось удалить доступ');
            }
        } catch (error) {
            console.error('Ошибка при удалении доступа:', error);
            alert('Произошла ошибка при удалении доступа.');
        }
    }

    // Обработчик для кнопки закрытия
    const closeButton = accessWindow.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        accessWindow.remove();
    });

    // Инициализируем получение списка пользователей
    fetchUserList();
}
