import {Popup} from "./popup";

export class HistoryPopup extends Popup {
    /**
     * @param {Object} options - Опции для настройки окна.
     *   options.blockId - обязательный id блока, историю которого хотим посмотреть.
     *   options.fetchHistory(blockId) => Promise<Array> - функция для асинхронной загрузки списка изменений этого блока.
     *   options.revertHistory(blockId, historyId) => Promise - функция для отката к выбранному historyId.
     *   options.onCancel() - (опционально) колбэк при закрытии попапа.
     *   options.title - (опционально) заголовок окна. По умолчанию "История изменений".
     *   Остальные опции (width, height, и т.д.) передаются базовому классу Popup.
     */
    constructor(options = {}) {
        // Задаём некоторые стандартные опции для окна
        options.title = options.title || "История изменений";
        options.modal = true;
        options.draggable = true;
        // Попап не использует стандартную форму (inputs), т.к. он чисто для отображения списка
        options.inputs = [];
        super(options);

        this.blockId = this.options.blockId;
        this.historyRecords = [];
    }

    /**
     * Переопределяем создание разметки попапа, чтобы наполнить контент своим списком.
     */
    createPopup() {
        // Создаём базовую разметку (overlay, container, title, content, buttons)
        super.createPopup();

        // Очищаем область контента для формирования кастомного содержимого
        this.contentArea.innerHTML = "";

        // Контейнер под список изменений
        this.historyContainer = document.createElement("div");
        this.historyContainer.className = "history-list-container";
        this.contentArea.appendChild(this.historyContainer);

        // Показываем индикатор загрузки перед тем, как fetchHistory отработает
        this.historyContainer.innerHTML = "<div>Загрузка истории...</div>";

        // Вызываем асинхронную функцию, получающую список изменений
        console.log(this.options.blockId)
        if (typeof this.options.fetchHistory === "function" && this.options.blockId) {
            this.options.fetchHistory(this.options.blockId)
                .then((historyArray) => {
                    // Сохраняем полученные записи
                    this.historyRecords = historyArray;
                    // Рендерим список
                    this.renderHistoryList();
                })
                .catch((err) => {
                    console.error(err);
                    this.historyContainer.innerHTML = "<div>Ошибка загрузки истории.</div>";
                });
        } else {
            // Если не передали fetchHistory или blockId, считаем, что данных нет
            this.historyContainer.innerHTML = "<div>Нет данных для отображения.</div>";
        }

        this.positionPopup();
    }

    /**
     * Отрисовываем полученный список изменений.
     */
    renderHistoryList() {
        this.historyContainer.innerHTML = "";
        if (!this.historyRecords || this.historyRecords.length === 0) {
            // Если нет записей
            const emptyMsg = document.createElement("div");
            emptyMsg.className = "history-empty-msg";
            emptyMsg.textContent = "История изменений пуста.";
            this.historyContainer.appendChild(emptyMsg);
            return;
        }

        // Если есть записи, выводим их в списке
        this.historyRecords.forEach((record) => {
            const itemEl = document.createElement("div");
            itemEl.className = "history-item";

            // Можно отображать любую нужную информацию о ревизии
            // Например, дату, пользователя, тип изменения и т.д.
            const infoEl = document.createElement("div");
            infoEl.className = "history-info";
            infoEl.innerHTML = `
                <div><strong>Дата:</strong> ${record.history_date}</div>
                <div><strong>Пользователь:</strong> ${record.changed_by || "неизвестно"}</div>
                <div><strong>Тип:</strong> ${record.history_type || "?"}</div>
                <div><strong>Заголовок:</strong> ${record.title || "—"}</div>
            `;
            itemEl.appendChild(infoEl);

            // Кнопка «Откатиться» к этой ревизии
            const revertBtn = document.createElement("button");
            revertBtn.className = "history-revert-button";
            revertBtn.textContent = "Откатиться";
            revertBtn.addEventListener("click", () => this.handleRevert(record));
            itemEl.appendChild(revertBtn);

            this.historyContainer.appendChild(itemEl);
        });

        this.positionPopup();
    }

    /**
     * Обработка нажатия на «Откатиться».
     */
    async handleRevert(record) {
        // Тут можно добавить доп. подтверждение «Вы уверены?» и т.д.
        const confirmed = confirm(`Откатиться к изменению #${record.history_id} от ${record.history_date}?`);
        if (!confirmed) return;

        // Вызываем переданную функцию revertHistory
        if (typeof this.options.revertHistory === "function" && this.options.blockId) {
            try {
                await this.options.revertHistory(this.options.blockId, record.history_id);
                alert("Откат выполнен успешно!");
                // После отката можно заново загрузить историю (чтобы увидеть новую запись)
                // или просто закрыть попап. Ниже вариант перезагрузить список:
                this.options.fetchHistory(this.options.blockId)
                    .then(newHistory => {
                        this.historyRecords = newHistory;
                        this.renderHistoryList();
                    })
                    .catch(err => {
                        console.error("Ошибка при обновлении истории:", err);
                    });
            } catch (err) {
                console.error(err);
                alert("Ошибка при откате: " + err.message || err);
            }
        }
    }

    /**
     * Переопределяем создание «ок»/«отмена» кнопок
     * – нам нужна, по сути, только кнопка «Закрыть».
     */
    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = "history-popup-buttons";

        this.cancelButton = this.createCancelButton();
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    createCancelButton() {
        const btn = document.createElement("button");
        btn.textContent = "Закрыть";
        btn.className = "popup-button-close";
        btn.addEventListener("click", () => this.handleCancel());
        return btn;
    }

    handleCancel() {
        // Если есть внешний колбэк onCancel
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}