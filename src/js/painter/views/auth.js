import api from "../../api/api";

/**
 * Создает блок с формой авторизации
 * Рендерится внутри родительского блока
 */
export function auth(block, parent) {
    const container = document.createElement('div');
    container.id = block.id;
    container.classList.add('auth-block');
    container.setAttribute('block', '');

    const form = createForm('login-form');

    // Заголовок
    const title = document.createElement('h2');
    title.textContent = 'Вход';
    title.classList.add('auth-title');

    // Поля формы
    const usernameGroup = createInputGroup({
        id: 'username',
        label: 'Имя пользователя',
        type: 'text',
        autocomplete: 'username',
        required: true
    });

    const passwordGroup = createInputGroup({
        id: 'password',
        label: 'Пароль',
        type: 'password',
        autocomplete: 'current-password',
        required: true
    });

    // Кнопка отправки
    const submitButton = createButton('Войти', 'submit');

    // Сообщение об ошибке
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('auth-error');
    errorMessage.style.display = 'none';

    // Сборка формы
    form.appendChild(title);
    form.appendChild(usernameGroup.wrapper);
    form.appendChild(passwordGroup.wrapper);
    form.appendChild(errorMessage);
    form.appendChild(submitButton);

    container.appendChild(form);

    // Блокируем всплытие событий (клики не должны открывать блок)
    const stopEvents = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'];
    stopEvents.forEach(eventType => {
        container.addEventListener(eventType, (e) => {
            e.stopPropagation();
        }, true);
    });

    // Обработчик отправки
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const username = usernameGroup.input.value.trim();
        const password = passwordGroup.input.value;

        if (!username || !password) {
            showError(errorMessage, 'Заполните все поля');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Вход...';

        try {
            const isAuth = await api.login({ username, password });
            if (isAuth) {
                // После успешного входа страница перерисуется через событие Login
            } else {
                showError(errorMessage, 'Неверное имя пользователя или пароль');
            }
        } catch (error) {
            showError(errorMessage, 'Ошибка соединения с сервером');
            console.error('Login error:', error);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Войти';
        }
    });

    // Фокус на первое поле после рендера
    setTimeout(() => usernameGroup.input.focus(), 100);

    return container;
}

/**
 * Создает форму
 */
function createForm(id) {
    const form = document.createElement('form');
    form.id = id;
    form.classList.add('auth-form');
    form.setAttribute('novalidate', '');

    return form;
}

/**
 * Создает группу ввода (label + input)
 */
function createInputGroup({ id, label, type, autocomplete, required }) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('auth-input-group');

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    labelEl.classList.add('auth-label');

    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.name = id;
    input.autocomplete = autocomplete;
    input.required = required;
    input.classList.add('auth-input');

    // Предотвращаем всплытие событий клавиатуры
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);

    return { wrapper, input };
}

/**
 * Создает кнопку
 */
function createButton(text, type = 'button') {
    const button = document.createElement('button');
    button.type = type;
    button.textContent = text;
    button.classList.add('auth-button');

    return button;
}

/**
 * Показывает сообщение об ошибке
 */
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}
