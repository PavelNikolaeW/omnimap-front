/**
 * Общие утилиты для форм авторизации
 * Используется auth.js и registration.js
 */

/**
 * Создает форму
 */
export function createForm(id) {
    const form = document.createElement('form');
    form.id = id;
    form.classList.add('auth-form');
    form.setAttribute('novalidate', '');

    return form;
}

/**
 * Создает группу ввода (label + input)
 */
export function createInputGroup({ id, label, type, autocomplete, required, showToggle = false, showHint = false }) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('auth-input-group');

    const labelEl = document.createElement('label');
    labelEl.htmlFor = id;
    labelEl.textContent = label;
    labelEl.classList.add('auth-label');

    // Контейнер для поля ввода (для позиционирования toggle)
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

    // Кнопка показать/скрыть пароль
    if (showToggle && type === 'password') {
        const toggle = createPasswordToggle(input);
        inputWrapper.appendChild(toggle);
        input.classList.add('auth-input--with-toggle');
    }

    // Inline ошибка под полем
    const fieldError = document.createElement('span');
    fieldError.classList.add('auth-field-error');
    fieldError.id = `${id}-error`;
    // aria-describedby будет добавлен при показе ошибки

    wrapper.appendChild(labelEl);
    wrapper.appendChild(inputWrapper);
    wrapper.appendChild(fieldError);

    // Подсказка с требованиями к паролю
    let hint = null;
    if (showHint && type === 'password') {
        hint = document.createElement('div');
        hint.classList.add('auth-password-hint');
        hint.innerHTML = '<span class="hint-icon">ℹ️</span> <span>Минимум 6 символов</span>';
        wrapper.appendChild(hint);
    }

    return { wrapper, input, fieldError, hint };
}

/**
 * Создает кнопку toggle для пароля
 */
export function createPasswordToggle(input) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.classList.add('auth-password-toggle');
    toggle.setAttribute('aria-label', 'Показать пароль');
    // Используем текстовые иконки как fallback если FontAwesome не загружен
    toggle.innerHTML = '<span class="toggle-icon">👁</span>';

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.innerHTML = isPassword
            ? '<span class="toggle-icon">🙈</span>'
            : '<span class="toggle-icon">👁</span>';
        toggle.setAttribute('aria-label', isPassword ? 'Скрыть пароль' : 'Показать пароль');
    });

    return toggle;
}

/**
 * Создает кнопку
 */
export function createButton(text, type = 'button') {
    const button = document.createElement('button');
    button.type = type;
    button.classList.add('auth-button');

    // Структура кнопки со спиннером
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
 * Устанавливает состояние загрузки кнопки
 */
export function setButtonLoading(button, isLoading, text) {
    button.disabled = isLoading;
    button.classList.toggle('loading', isLoading);
    const textEl = button.querySelector('.auth-button-text');
    if (textEl) {
        textEl.textContent = text;
    }
}

/**
 * Показывает сообщение об ошибке (без автоскрытия)
 */
export function showError(element, message) {
    // Убираем кнопку повтора если была
    const retryBtn = element.querySelector('.auth-retry-button');
    if (retryBtn) retryBtn.remove();

    element.textContent = message;
    element.style.display = 'block';
}

/**
 * Скрывает сообщение об ошибке
 */
export function hideError(element) {
    element.style.display = 'none';
    element.textContent = '';
}

/**
 * Показывает inline ошибку на поле
 */
export function showFieldError(input, message) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    const errorEl = input.closest('.auth-input-group')?.querySelector('.auth-field-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        // Связываем input с ошибкой для accessibility
        input.setAttribute('aria-describedby', errorEl.id);
    }
}

/**
 * Очищает ошибку поля
 */
export function clearFieldError(input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const errorEl = input.closest('.auth-input-group')?.querySelector('.auth-field-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

/**
 * Очищает ошибки всех полей
 */
export function clearAllFieldErrors(inputs) {
    inputs.forEach(input => clearFieldError(input));
}

/**
 * Фокус на первое невалидное или пустое поле
 */
export function focusFirstInvalidField(inputs) {
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
 * Проверяет, является ли ошибка сетевой
 */
export function isNetworkError(error) {
    return !navigator.onLine ||
           error.message?.includes('network') ||
           error.message?.includes('Network') ||
           error.message?.includes('fetch') ||
           error.name === 'TypeError';
}

/**
 * Показывает ошибку сети с кнопкой повтора
 */
export function showNetworkError(element, retryCallback) {
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

/**
 * Обновляет подсказку по паролю
 */
export function updatePasswordHint(input, hint) {
    if (!hint) return;

    const password = input.value;
    const isValid = password.length >= 6;

    if (isValid) {
        hint.classList.add('valid');
        hint.innerHTML = '<span class="hint-icon">✅</span> <span>Минимум 6 символов</span>';
    } else {
        hint.classList.remove('valid');
        hint.innerHTML = '<span class="hint-icon">ℹ️</span> <span>Минимум 6 символов</span>';
    }
}

/**
 * Проверяет валидность email
 */
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
