import {Popup} from "./popup";
import {log} from "@jsplumb/browser-ui";

export class UrlPopup extends Popup {
    /**
     * @param {Object} options - Опции для настройки окна.
     *   options.urls - массив объектов ссылок вида { name, url } (если уже есть).
     *   options.fetchUrls - (опционально) функция для асинхронной загрузки списка ссылок, возвращает Promise.
     *   options.onCreate - асинхронная функция, создающая ссылку по имени. Принимает (name) и возвращает объект { name, url }.
     *   options.onDelete - асинхронная функция для удаления ссылки, принимает (deletedLink, index).
     *   options.checkName - (опционально) асинхронная функция для проверки доступности имени, принимает (name) и возвращает Promise<boolean>.
     *   Остальные опции передаются базовому классу Popup.
     */
    constructor(options = {}) {
        // Задаём стандартные опции для окна.
        options.title = options.title || "Ссылки";
        options.size = 'md';
        options.modal = true;
        options.draggable = true;
        // Окно не использует стандартную форму (inputs)
        options.inputs = [];
        options.urls = options.urls || [];
        super(options);

        // Локальное хранилище списка ссылок
        this.urls = this.options.urls;
        // Создаем debounced-версию проверки имени (500 мс задержка)
        this.debouncedCheckName = this.debounce(this.checkNameAvailability.bind(this), 500);
    }

    /**
     * Утилита для дебаунсинга функции.
     */
    debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    createPopup() {
        // Создаем базовую разметку: overlay, контейнер, заголовок, кнопки
        super.createPopup();
        // Очищаем область контента для формирования кастомного содержимого
        this.contentArea.innerHTML = "";

        // Создаем контейнер для списка ссылок
        this.urlsContainer = document.createElement("div");
        this.urlsContainer.className = "popup-list";
        this.contentArea.appendChild(this.urlsContainer);
        // Сразу показываем индикатор загрузки
        this.urlsContainer.innerHTML = '<div class="popup-loading"><div class="popup-spinner"></div>Загрузка...</div>';

        // Если задана функция асинхронной загрузки списка ссылок, вызываем её
        if (typeof this.options.fetchUrls === "function") {
            this.options.fetchUrls()
                .then((urls) => {
                    this.options.urls = urls;
                    this.urls = urls;
                    this.renderUrlList();
                })
                .catch((err) => {
                    console.error(err);
                    this.urlsContainer.innerHTML = '<div class="popup-message popup-message--error">Ошибка загрузки данных.</div>';
                });
        } else {
            // Если функция не задана, отображаем то, что уже передано в options.urls
            this.renderUrlList();
        }

        // Создаем секцию для добавления новой ссылки (только поле для ввода имени)
        this.newUrlContainer = document.createElement("div");
        this.newUrlContainer.className = "popup-section";

        // Метка и поле ввода имени
        const nameLabel = document.createElement("label");
        nameLabel.className = "popup-form-label";
        nameLabel.textContent = "Название:";
        this.newUrlContainer.appendChild(nameLabel);

        this.nameInput = document.createElement("input");
        this.nameInput.type = "text";
        this.nameInput.className = "popup-input";
        this.nameInput.placeholder = "Название ссылки. Только латинские буквы, цифры, дефисы и подчеркивания.";
        this.newUrlContainer.appendChild(this.nameInput);

        // Элемент для отображения ошибки проверки имени
        this.nameError = document.createElement("div");
        this.nameError.className = "popup-message popup-message--error";
        this.nameError.style.display = "none";
        this.newUrlContainer.appendChild(this.nameError);

        // Кнопка «Создать» для создания ссылки на основе введённого имени
        this.createButton = document.createElement("button");
        this.createButton.textContent = "Создать";
        this.createButton.className = "popup-btn popup-btn--primary";
        this.newUrlContainer.appendChild(this.createButton);

        this.contentArea.appendChild(this.newUrlContainer);

        // Привязываем обработчики:
        // Дебаунсированная проверка имени при вводе
        this.nameInput.addEventListener("keyup", () => this.debouncedCheckName());
        // Обработка нажатия на кнопку «Создать»
        this.createButton.addEventListener("click", () => this.handleCreate());

        this.positionPopup();
    }

    /**
     * Отрисовывает список ссылок. Если ссылок нет, отображается сообщение.
     */
    renderUrlList() {
        this.urlsContainer.innerHTML = "";
        if (this.options.urls.length > 0) {
            this.options.urls.forEach((item, index) => {
                const urlItem = document.createElement("div");
                urlItem.className = "popup-list-item";

                const contentEl = document.createElement("div");
                contentEl.className = "popup-list-item__content";
                contentEl.innerHTML = `<span style="font-weight: 500;">${item.creator}</span> <span style="color: var(--popup-muted);">${item.url}</span>`;
                urlItem.appendChild(contentEl);

                const deleteButton = document.createElement("button");
                deleteButton.textContent = "Удалить";
                deleteButton.className = "popup-btn popup-btn--danger popup-btn--sm";
                deleteButton.addEventListener("click", () => this.handleDelete(item, index));
                urlItem.appendChild(deleteButton);

                this.urlsContainer.appendChild(urlItem);
            });
        } else {
            const emptyMsg = document.createElement("div");
            emptyMsg.className = "popup-list-empty";
            emptyMsg.textContent = "Ссылок пока нет. Добавьте новую ссылку.";
            this.urlsContainer.appendChild(emptyMsg);
        }
        this.positionPopup();
    }

    checkValidSymbolsInName() {
        this.nameInput.value = this.nameInput.value.trim().replace(/[^a-zA-Z0-9\s]/g, '');
    }

    /**
     * Асинхронно проверяет, доступно ли введенное имя.
     */
    async checkNameAvailability() {
        const name = this.nameInput.value.trim()

        if (!name) {
            this.nameError.style.display = "none";
            return;
        }
        // Локально проверяем, нет ли уже ссылки с таким именем
        const exists = this.options.urls.some(
            (item) => item.name.toLowerCase() === name.toLowerCase()
        );
        if (exists) {
            this.nameError.textContent = "Это название уже используется.";
            this.nameError.style.display = "block";
            return;
        }
        if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
            this.nameError.textContent = "Только латинские буквы, цифры, дефисы и подчеркивания.";
            this.nameError.style.display = "block";
            return
        }
        // Если задана асинхронная функция проверки, вызываем её
        if (typeof this.options.checkName === "function") {
            try {
                const available = await this.options.checkName(name);
                if (!available) {
                    this.nameError.textContent = "Это название уже используется.";
                    this.nameError.style.display = "block";
                    return;
                }
            } catch (err) {
                console.error(err);
                this.nameError.textContent = "Ошибка проверки имени.";
                this.nameError.style.display = "block";
                return;
            }
        }
        this.nameError.textContent = "";
        this.nameError.style.display = "none";
    }

    /**
     * Обрабатывает создание новой ссылки.
     */
    async handleCreate() {
        const name = this.nameInput.value.trim();
        if (!name) {
            alert("Введите название!");
            return;
        }
        // Проверяем на дубликат локально
        const exists = this.options.urls.some(
            (item) => item.name.toLowerCase() === name.toLowerCase()
        );
        if (exists) {
            this.nameError.textContent = "Это название уже используется.";
            this.nameError.style.display = "block";
            return;
        }
        // Асинхронная проверка имени, если функция задана
        if (typeof this.options.checkName === "function") {
            try {
                const available = await this.options.checkName(name);
                if (!available) {
                    this.nameError.textContent = "Это название недоступно.";
                    this.nameError.style.display = "block";
                    return;
                }
            } catch (err) {
                console.error(err);
                this.nameError.textContent = "Ошибка проверки имени.";
                this.nameError.style.display = "block";
                return;
            }
        }
        this.nameError.textContent = "";
        this.nameError.style.display = "none";

        // Если обработчик onCreate задан, вызываем его с именем.
        // Он должен вернуть объект ссылки { name, url }.
        let newLink;
        if (typeof this.options.onCreate === "function") {
            try {
                newLink = await this.options.onCreate(name);
                console.log(newLink)
            } catch (err) {
                console.error(err);
                alert("Ошибка создания ссылки.");
                return;
            }
        }
        // Добавляем новую ссылку в список и обновляем отображение
        this.options.urls.push(newLink);
        this.renderUrlList();
        // Очищаем поле ввода
        this.nameInput.value = "";
    }

    /**
     * Обрабатывает удаление ссылки.
     */
    async handleDelete(item, index) {
        // Оптимистично удаляем ссылку из списка
        const removedLink = this.options.urls.splice(index, 1)[0];
        this.renderUrlList();
        console.log(removedLink)
        if (typeof this.options.onDelete === "function") {
            try {
                await this.options.onDelete(removedLink.blockId, removedLink.name);
            } catch (err) {
                // В случае ошибки возвращаем ссылку обратно
                this.options.urls.splice(index, 0, removedLink);
                this.renderUrlList();
                alert("Ошибка удаления ссылки!");
            }
        }
    }

    /**
     * Переопределяем создание панели кнопок – здесь нужна только кнопка «Закрыть».
     */
    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = "popup-buttons";

        this.cancelButton = Popup.createButton("Закрыть", "secondary", () => this.handleCancel());
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }
}