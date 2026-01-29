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
    showNetworkError
} from "./authUtils";

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
    // aria-live для скринридеров
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

    // AbortController для cleanup event listeners
    const abortController = new AbortController();

    // Скрываем ошибку при вводе
    const allInputs = [usernameGroup.input, passwordGroup.input];
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            hideError(errorMessage);
            clearFieldError(input);
        }, { signal: abortController.signal });
    });

    // Блокируем всплытие событий (клики не должны открывать блок)
    const stopEvents = ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'];
    stopEvents.forEach(eventType => {
        container.addEventListener(eventType, (e) => {
            e.stopPropagation();
        }, { capture: true, signal: abortController.signal });
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
            // Показываем только inline ошибки — они достаточно информативны
            if (!username) {
                showFieldError(usernameGroup.input, 'Обязательное поле');
            }
            if (!password) {
                showFieldError(passwordGroup.input, 'Обязательное поле');
            }
            focusFirstInvalidField(allInputs);
            return;
        }

        // Показываем спиннер
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
            // Проверяем тип ошибки
            if (isNetworkError(error)) {
                showNetworkError(errorMessage, () => form.dispatchEvent(new Event('submit')));
            } else {
                showError(errorMessage, 'Ошибка соединения с сервером');
            }
            console.error('Login error:', error);
        } finally {
            setButtonLoading(submitButton, false, 'Войти');
        }
    }, { signal: abortController.signal });

    // Фокус на первое поле после рендера (если нет другого активного элемента в auth-block)
    requestAnimationFrame(() => {
        if (document.activeElement?.closest('.auth-block')) return;
        usernameGroup.input.focus();
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
