import api from "../../api/api";


export function registration(block, parent) {
    // Создаем главный контейнер
    const container = document.createElement('div');
    container.id = 'register-container';

    // Создаем форму
    const form = document.createElement('form');
    form.id = 'register-form';

    // Метка для имени пользователя
    const usernameLabel = document.createElement('label');
    usernameLabel.htmlFor = 'username';
    usernameLabel.innerText = 'Имя пользователя:';
    usernameLabel.classList.add('label');

    // Поле ввода имени пользователя
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.id = 'reg-username';
    usernameInput.name = 'username';
    usernameInput.required = true;
    usernameInput.classList.add('input');

    // Метка для электронной почты
    const emailLabel = document.createElement('label');
    emailLabel.htmlFor = 'email';
    emailLabel.innerText = 'Электронная почта:';
    emailLabel.classList.add('label');

    // Поле ввода электронной почты
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'email';
    emailInput.name = 'email';
    emailInput.required = true;
    emailInput.classList.add('input');

    // Метка для пароля
    const passwordLabel = document.createElement('label');
    passwordLabel.htmlFor = 'password';
    passwordLabel.innerText = 'Пароль:';
    passwordLabel.classList.add('label');

    // Поле ввода пароля
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'req-password';
    passwordInput.name = 'password';
    passwordInput.required = true;
    passwordInput.classList.add('input');

    // Метка для подтверждения пароля
    const confirmPasswordLabel = document.createElement('label');
    confirmPasswordLabel.htmlFor = 'confirm-password';
    confirmPasswordLabel.innerText = 'Подтвердите пароль:';
    confirmPasswordLabel.classList.add('label');

    // Поле ввода подтверждения пароля
    const confirmPasswordInput = document.createElement('input');
    confirmPasswordInput.type = 'password';
    confirmPasswordInput.id = 'confirm-password';
    confirmPasswordInput.name = 'confirm-password';
    confirmPasswordInput.required = true;
    confirmPasswordInput.classList.add('input');

    // Кнопка отправки
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.innerText = 'Зарегистрироваться';
    submitButton.classList.add('button');

    // Добавляем элементы в форму
    form.appendChild(usernameLabel);
    form.appendChild(usernameInput);
    form.appendChild(emailLabel);
    form.appendChild(emailInput);
    form.appendChild(passwordLabel);
    form.appendChild(passwordInput);
    form.appendChild(confirmPasswordLabel);
    form.appendChild(confirmPasswordInput);
    form.appendChild(submitButton);

    // Добавляем форму в контейнер
    container.appendChild(form);

    // Обработчик отправки формы
    form.addEventListener('submit', async function (event) {
        event.preventDefault(); // Предотвращаем перезагрузку страницы
        const username = usernameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Проверка совпадения паролей
        if (password !== confirmPassword) {
            alert('Пароли не совпадают.');
            return;
        }

        try {
            const isRegistered = await api.register({username, email, password});
            console.log(isRegistered)
            if (isRegistered) {
                alert('Успешная регистрация!');
                // Дополнительные действия после успешной регистрации
            } else {
                alert('Ошибка регистрации.');
            }
        } catch (error) {
            console.error('Ошибка при регистрации:', error);
            alert('Произошла ошибка при регистрации.');
        }
    });

    return container;
}