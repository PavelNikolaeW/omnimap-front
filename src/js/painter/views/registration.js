import api from "../../api/api";
import {
    createForm,
    createInputGroup,
    createButton,
    setButtonLoading,
    showError,
    hideError,
    showFieldError,
    clearFieldError,
    clearAllFieldErrors,
    focusFirstInvalidField,
    isNetworkError,
    showNetworkError,
    updatePasswordHint,
    isValidEmail,
    parseDjangoErrors
} from "./authUtils";

/**
 * Создает блок с формой регистрации
 * Рендерится внутри родительского блока
 */
export function registration(block, parent) {
    // Если уже есть форма входа - не показываем регистрацию
    if (document.getElementById('login-form')) {
        return document.createElement('div'); // пустой элемент
    }

    const container = document.createElement('div');
    container.id = block.id;
    container.classList.add('auth-block');
    container.setAttribute('block', '');

    const form = createForm('register-form');

    // Заголовок
    const title = document.createElement('h2');
    title.textContent = 'Регистрация';
    title.classList.add('auth-title');

    // Проверяем invite-код из URL
    const urlParams = new URLSearchParams(window.location.search);
    const inviteFromUrl = urlParams.get('invite');

    // Очищаем invite из URL чтобы не светился в адресной строке
    if (inviteFromUrl) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('invite');
        history.replaceState(null, '', cleanUrl.toString());
    }

    // Поле инвайт-кода
    const inviteCodeGroup = createInputGroup({
        id: 'invite-code',
        label: 'Код приглашения',
        type: 'text',
        autocomplete: 'off',
        required: true
    });

    // Если код из URL — предзаполняем и блокируем редактирование
    if (inviteFromUrl) {
        inviteCodeGroup.input.value = inviteFromUrl;
        inviteCodeGroup.input.readOnly = true;
        inviteCodeGroup.input.classList.add('auth-input--prefilled');
    }

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
        required: true,
        showToggle: true,
        showHint: true  // показываем требования к паролю
    });

    const confirmPasswordGroup = createInputGroup({
        id: 'confirm-password',
        label: 'Подтвердите пароль',
        type: 'password',
        autocomplete: 'new-password',
        required: true,
        showToggle: true
    });

    // Кнопка отправки
    const submitButton = createButton('Зарегистрироваться', 'submit');

    // Сообщение об ошибке
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('auth-error');
    errorMessage.style.display = 'none';
    // aria-live для скринридеров
    errorMessage.setAttribute('role', 'alert');
    errorMessage.setAttribute('aria-live', 'polite');
    errorMessage.setAttribute('aria-atomic', 'true');

    // Сборка формы — invite-code первым (перед username)
    form.appendChild(title);
    form.appendChild(inviteCodeGroup.wrapper);
    form.appendChild(usernameGroup.wrapper);
    form.appendChild(emailGroup.wrapper);
    form.appendChild(passwordGroup.wrapper);
    form.appendChild(confirmPasswordGroup.wrapper);
    form.appendChild(errorMessage);
    form.appendChild(submitButton);

    container.appendChild(form);

    // AbortController для cleanup event listeners
    const abortController = new AbortController();

    // Скрываем ошибку при вводе (invite-code добавлен в массив)
    const allInputs = [inviteCodeGroup.input, usernameGroup.input, emailGroup.input, passwordGroup.input, confirmPasswordGroup.input];
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            hideError(errorMessage);
            clearFieldError(input);
        }, { signal: abortController.signal });
    });

    // Динамическая валидация пароля
    if (passwordGroup.hint) {
        passwordGroup.input.addEventListener('input', () => {
            updatePasswordHint(passwordGroup.input, passwordGroup.hint);
        }, { signal: abortController.signal });
    }

    // Блокируем всплытие событий (клики не должны открывать блок)
    // Используем bubble фазу чтобы внутренние элементы (toggle) получали события первыми
    const stopEvents = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'];
    stopEvents.forEach(eventType => {
        container.addEventListener(eventType, (e) => {
            e.stopPropagation();
        }, { signal: abortController.signal });
    });

    // Обработчик отправки
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const inviteCode = inviteCodeGroup.input.value.trim();
        const username = usernameGroup.input.value.trim();
        const email = emailGroup.input.value.trim();
        const password = passwordGroup.input.value;
        const confirmPassword = confirmPasswordGroup.input.value;

        // Сбрасываем ошибки
        hideError(errorMessage);
        clearAllFieldErrors(allInputs);

        // Валидация
        let hasError = false;

        if (!inviteCode) {
            showFieldError(inviteCodeGroup.input, 'Обязательное поле');
            hasError = true;
        }

        if (!username) {
            showFieldError(usernameGroup.input, 'Обязательное поле');
            hasError = true;
        }

        if (!email) {
            showFieldError(emailGroup.input, 'Обязательное поле');
            hasError = true;
        } else if (!isValidEmail(email)) {
            showFieldError(emailGroup.input, 'Введите корректный email');
            hasError = true;
        }

        if (!password) {
            showFieldError(passwordGroup.input, 'Обязательное поле');
            hasError = true;
        } else if (password.length < 8) {
            showFieldError(passwordGroup.input, 'Минимум 8 символов');
            hasError = true;
        }

        if (!confirmPassword) {
            showFieldError(confirmPasswordGroup.input, 'Обязательное поле');
            hasError = true;
        } else if (password !== confirmPassword) {
            showFieldError(confirmPasswordGroup.input, 'Пароли не совпадают');
            hasError = true;
        }

        if (hasError) {
            // Не показываем общее сообщение — inline ошибки достаточно информативны
            focusFirstInvalidField(allInputs);
            return;
        }

        // Показываем спиннер
        setButtonLoading(submitButton, true, 'Регистрация...');

        try {
            const result = await api.register({ username, email, password, invite_code: inviteCode });

            if (result?.success) {
                // После успешной регистрации страница перерисуется через событие Login
            } else if (result?.errors) {
                // Парсим ошибки Django
                const { fieldErrors, generalError } = parseDjangoErrors(result.errors);

                // Показываем ошибки на полях
                const fieldInputMap = {
                    'invite_code': inviteCodeGroup.input,
                    'username': usernameGroup.input,
                    'email': emailGroup.input,
                    'password': passwordGroup.input,
                    'confirm-password': confirmPasswordGroup.input
                };

                for (const [field, message] of Object.entries(fieldErrors)) {
                    const input = fieldInputMap[field];
                    if (input) {
                        showFieldError(input, message);
                    }
                }

                // Показываем общую ошибку если есть
                if (generalError) {
                    showError(errorMessage, generalError);
                }

                focusFirstInvalidField(allInputs);
            } else {
                showError(errorMessage, 'Ошибка регистрации');
                focusFirstInvalidField(allInputs);
            }
        } catch (error) {
            // Проверяем тип ошибки
            if (isNetworkError(error)) {
                showNetworkError(errorMessage, () => form.dispatchEvent(new Event('submit')));
            } else {
                showError(errorMessage, 'Ошибка соединения с сервером');
            }
            console.error('Registration error:', error);
        } finally {
            setButtonLoading(submitButton, false, 'Зарегистрироваться');
        }
    }, { signal: abortController.signal });

    // Фокус: если код из URL → на username, иначе → на invite-code
    requestAnimationFrame(() => {
        if (document.activeElement?.closest('.auth-block')) return;
        if (inviteFromUrl) {
            usernameGroup.input.focus();
        } else {
            inviteCodeGroup.input.focus();
        }
    });

    // Cleanup при удалении из DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node === container || node.contains?.(container)) {
                    abortController.abort();
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return container;
}
