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
        required: true,
        showToggle: true
    });

    // Кнопка отправки
    const submitButton = createButton('Войти', 'submit');

    // Сообщение об ошибке
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('auth-error');
    errorMessage.style.display = 'none';
    // ux2: aria-live для скринридеров
    errorMessage.setAttribute('role', 'alert');
    errorMessage.setAttribute('aria-live', 'polite');
    errorMessage.setAttribute('aria-atomic', 'true');

    // Сборка формы
    form.appendChild(title);
    form.appendChild(usernameGroup.wrapper);
    form.appendChild(passwordGroup.wrapper);
    form.appendChild(errorMessage);
    form.appendChild(submitButton);

    container.appendChild(form);

    // ux1: Скрываем ошибку при вводе
    const allInputs = [usernameGroup.input, passwordGroup.input];
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            hideError(errorMessage);
            clearFieldError(input);
        });
    });

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

        // Сбрасываем ошибки
        hideError(errorMessage);
        clearAllFieldErrors(allInputs);

        if (!username || !password) {
            showError(errorMessage, 'Заполните все поля');
            if (!username) {
                showFieldError(usernameGroup.input, 'Обязательное поле');
            }
            if (!password) {
                showFieldError(passwordGroup.input, 'Обязательное поле');
            }
            focusFirstInvalidField(allInputs);
            return;
        }

        // ux4: Показываем спиннер
        setButtonLoading(submitButton, true, 'Вход...');

        try {
            const isAuth = await api.login({ username, password });
            if (isAuth) {
                // После успешного входа страница перерисуется через событие Login
            } else {
                showError(errorMessage, 'Неверное имя пользователя или пароль');
                focusFirstInvalidField(allInputs);
            }
        } catch (error) {
            // ux8: Проверяем тип ошибки
            if (isNetworkError(error)) {
                showNetworkError(errorMessage, () => form.dispatchEvent(new Event('submit')));
            } else {
                showError(errorMessage, 'Ошибка соединения с сервером');
            }
            console.error('Login error:', error);
        } finally {
            setButtonLoading(submitButton, false, 'Войти');
        }
    });

    // ux10: Фокус на первое поле после рендера
    requestAnimationFrame(() => {
        usernameGroup.input.focus();
    });

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
function createInputGroup({ id, label, type, autocomplete, required, showToggle = false }) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('auth-input-group');

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    labelEl.classList.add('auth-label');

    // ux5: Контейнер для поля ввода (для позиционирования toggle)
    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('auth-input-wrapper');

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

    inputWrapper.appendChild(input);

    // ux6: Кнопка показать/скрыть пароль
    if (showToggle && type === 'password') {
        const toggle = createPasswordToggle(input);
        inputWrapper.appendChild(toggle);
        input.classList.add('auth-input--with-toggle');
    }

    // ux5: Inline ошибка под полем
    const fieldError = document.createElement('span');
    fieldError.classList.add('auth-field-error');
    fieldError.id = `${id}-error`;
    input.setAttribute('aria-describedby', fieldError.id);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(inputWrapper);
    wrapper.appendChild(fieldError);

    return { wrapper, input, fieldError };
}

/**
 * ux6: Создает кнопку toggle для пароля
 */
function createPasswordToggle(input) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.classList.add('auth-password-toggle');
    toggle.setAttribute('aria-label', 'Показать пароль');
    toggle.innerHTML = '<i class="fas fa-eye"></i>';

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.innerHTML = isPassword
            ? '<i class="fas fa-eye-slash"></i>'
            : '<i class="fas fa-eye"></i>';
        toggle.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
    });

    return toggle;
}

/**
 * Создает кнопку
 */
function createButton(text, type = 'button') {
    const button = document.createElement('button');
    button.type = type;
    button.classList.add('auth-button');

    // ux4: Структура кнопки со спиннером
    const spinner = document.createElement('span');
    spinner.classList.add('auth-button-spinner');

    const buttonText = document.createElement('span');
    buttonText.classList.add('auth-button-text');
    buttonText.textContent = text;

    button.appendChild(spinner);
    button.appendChild(buttonText);

    return button;
}

/**
 * ux4: Устанавливает состояние загрузки кнопки
 */
function setButtonLoading(button, isLoading, text) {
    button.disabled = isLoading;
    button.classList.toggle('loading', isLoading);
    const textEl = button.querySelector('.auth-button-text');
    if (textEl) {
        textEl.textContent = text;
    }
}

/**
 * ux1: Показывает сообщение об ошибке (без автоскрытия)
 */
function showError(element, message) {
    // Убираем кнопку повтора если была
    const retryBtn = element.querySelector('.auth-retry-button');
    if (retryBtn) retryBtn.remove();

    element.textContent = message;
    element.style.display = 'block';
}

/**
 * ux1: Скрывает сообщение об ошибке
 */
function hideError(element) {
    element.style.display = 'none';
    element.textContent = '';
}

/**
 * ux5: Показывает inline ошибку на поле
 */
function showFieldError(input, message) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    const errorEl = input.closest('.auth-input-group')?.querySelector('.auth-field-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

/**
 * ux5: Очищает ошибку поля
 */
function clearFieldError(input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
    const errorEl = input.closest('.auth-input-group')?.querySelector('.auth-field-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

/**
 * Очищает ошибки всех полей
 */
function clearAllFieldErrors(inputs) {
    inputs.forEach(input => clearFieldError(input));
}

/**
 * ux10: Фокус на первое невалидное или пустое поле
 */
function focusFirstInvalidField(inputs) {
    // Приоритет 1: поле с ошибкой
    const errorField = inputs.find(input => input.classList.contains('error'));
    if (errorField) {
        errorField.focus();
        return;
    }

    // Приоритет 2: пустое поле
    const emptyField = inputs.find(input => !input.value.trim());
    if (emptyField) {
        emptyField.focus();
        return;
    }

    // Приоритет 3: первое поле
    if (inputs[0]) {
        inputs[0].focus();
    }
}

/**
 * ux8: Проверяет, является ли ошибка сетевой
 */
function isNetworkError(error) {
    return !navigator.onLine ||
           error.message?.includes('network') ||
           error.message?.includes('Network') ||
           error.message?.includes('fetch') ||
           error.name === 'TypeError';
}

/**
 * ux8: Показывает ошибку сети с кнопкой повтора
 */
function showNetworkError(element, retryCallback) {
    element.innerHTML = '';
    element.style.display = 'block';

    const text = document.createTextNode('Нет подключения к сети. ');
    element.appendChild(text);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.classList.add('auth-retry-button');
    retryBtn.textContent = 'Повторить';
    retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideError(element);
        retryCallback();
    });

    element.appendChild(retryBtn);
}
