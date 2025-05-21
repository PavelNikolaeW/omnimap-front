import api from "../../api/api";

export function auth(block, parent) {
    // Создаем главный контейнер
    const container = document.createElement('div');
    container.id = 'login-container';

    // Создаем форму
    const form = document.createElement('form');
    form.id = 'login-form';

    // Метка для имени пользователя
    const usernameLabel = document.createElement('label');
    usernameLabel.htmlFor = 'username';
    usernameLabel.innerText = 'Имя пользователя:';
    usernameLabel.classList.add('label');

    // Поле ввода имени пользователя
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.id = 'username';
    usernameInput.name = 'username';
    usernameInput.required = true;
    usernameInput.classList.add('input');

    // Метка для пароля
    const passwordLabel = document.createElement('label');
    passwordLabel.htmlFor = 'password';
    passwordLabel.innerText = 'Пароль:';
    passwordLabel.classList.add('label');

    // Поле ввода пароля
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'password';
    passwordInput.name = 'password';
    passwordInput.required = true;
    passwordInput.classList.add('input');

    // Кнопка отправки
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.innerText = 'Войти';
    submitButton.classList.add('button');

    // Добавляем элементы в форму
    form.appendChild(usernameLabel);
    form.appendChild(usernameInput);
    form.appendChild(passwordLabel);
    form.appendChild(passwordInput);
    form.appendChild(submitButton);

    // Добавляем форму в контейнер
    container.appendChild(form);

    // Добавляем контейнер в тело документа
    document.body.appendChild(container);

    // Обработчик отправки формы
    form.addEventListener('submit', async function (event) {
        event.preventDefault(); // Предотвращаем перезагрузку страницы
        const username = usernameInput.value;
        const password = passwordInput.value;
        const isAuth = await api.login({username, password})

        // Пример логики авторизации
        if (isAuth) {
            alert('Успешная авторизация!');
        } else {
            alert('Неверное имя пользователя или пароль.');
        }
    });

    return container
}