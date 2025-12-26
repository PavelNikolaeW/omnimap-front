import api from "../../api/api";

/**
 * Создает модальное окно регистрации
 * Полностью изолировано от событий блоков
 */
export function registration(block, parent) {
    const overlay = createOverlay();
    const container = createContainer('register-container');
    const form = createForm('register-form');

    // Заголовок
    const title = document.createElement('h2');
    title.textContent = 'Регистрация';
    title.classList.add('auth-title');

    // Поля формы
    const usernameGroup = createInputGroup({
        id: 'reg-username',
        label: 'Имя пользователя',
        type: 'text',
        autocomplete: 'username',
        required: true
    });

    const emailGroup = createInputGroup({
        id: 'email',
        label: 'Электронная почта',
        type: 'email',
        autocomplete: 'email',
        required: true
    });

    const passwordGroup = createInputGroup({
        id: 'reg-password',
        label: 'Пароль',
        type: 'password',
        autocomplete: 'new-password',
        required: true
    });

    const confirmPasswordGroup = createInputGroup({
        id: 'confirm-password',
        label: 'Подтвердите пароль',
        type: 'password',
        autocomplete: 'new-password',
        required: true
    });

    // Кнопка отправки
    const submitButton = createButton('Зарегистрироваться', 'submit');

    // Сообщение об ошибке
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('auth-error');
    errorMessage.style.display = 'none';

    // Сборка формы
    form.appendChild(title);
    form.appendChild(usernameGroup.wrapper);
    form.appendChild(emailGroup.wrapper);
    form.appendChild(passwordGroup.wrapper);
    form.appendChild(confirmPasswordGroup.wrapper);
    form.appendChild(errorMessage);
    form.appendChild(submitButton);

    container.appendChild(form);
    overlay.appendChild(container);

    // Обработчик отправки
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const username = usernameGroup.input.value.trim();
        const email = emailGroup.input.value.trim();
        const password = passwordGroup.input.value;
        const confirmPassword = confirmPasswordGroup.input.value;

        // Валидация
        if (!username || !email || !password || !confirmPassword) {
            showError(errorMessage, 'Заполните все поля');
            return;
        }

        if (password !== confirmPassword) {
            showError(errorMessage, 'Пароли не совпадают');
            return;
        }

        if (password.length < 6) {
            showError(errorMessage, 'Пароль должен быть не менее 6 символов');
            return;
        }

        if (!isValidEmail(email)) {
            showError(errorMessage, 'Введите корректный email');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Регистрация...';

        try {
            const isRegistered = await api.register({ username, email, password });
            if (isRegistered) {
                overlay.remove();
            } else {
                showError(errorMessage, 'Ошибка регистрации. Попробуйте другое имя пользователя');
            }
        } catch (error) {
            showError(errorMessage, 'Ошибка соединения с сервером');
            console.error('Registration error:', error);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Зарегистрироваться';
        }
    });

    // Добавляем в документ
    document.body.appendChild(overlay);

    // Фокус на первое поле
    setTimeout(() => usernameGroup.input.focus(), 100);

    return overlay;
}

/**
 * Создает overlay для блокировки взаимодействия с фоном
 */
function createOverlay() {
    const overlay = document.createElement('div');
    overlay.classList.add('auth-overlay');

    // Блокируем все события от всплытия
    const stopEvents = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'];
    stopEvents.forEach(eventType => {
        overlay.addEventListener(eventType, (e) => {
            e.stopPropagation();
        }, true);
    });

    return overlay;
}

/**
 * Создает контейнер формы
 */
function createContainer(id) {
    const container = document.createElement('div');
    container.id = id;
    container.classList.add('auth-container');

    // Блокируем всплытие событий
    container.addEventListener('click', (e) => e.stopPropagation());
    container.addEventListener('mousedown', (e) => e.stopPropagation());
    container.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

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

/**
 * Проверяет валидность email
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
