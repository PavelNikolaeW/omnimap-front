import {Popup} from "./popup";
import {customConfirm} from "../../utils/custom-dialog";

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
        options.size = 'lg';
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
        this.historyContainer.className = "popup-list";
        this.contentArea.appendChild(this.historyContainer);

        // Показываем индикатор загрузки перед тем, как fetchHistory отработает
        this.historyContainer.innerHTML = '<div class="popup-loading"><div class="popup-spinner"></div>Загрузка истории...</div>';

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
                    this.historyContainer.innerHTML = '<div class="popup-message popup-message--error">Ошибка загрузки истории.</div>';
                });
        } else {
            // Если не передали fetchHistory или blockId, считаем, что данных нет
            this.historyContainer.innerHTML = '<div class="popup-list-empty">Нет данных для отображения.</div>';
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
            emptyMsg.className = "popup-list-empty";
            emptyMsg.textContent = "История изменений пуста.";
            this.historyContainer.appendChild(emptyMsg);
            return;
        }

        // Если есть записи, выводим их в списке
        this.historyRecords.forEach((record) => {
            const itemEl = document.createElement("div");
            itemEl.className = "popup-list-item";

            // Можно отображать любую нужную информацию о ревизии
            const infoEl = document.createElement("div");
            infoEl.className = "popup-list-item__content";
            infoEl.innerHTML = `
                <div><strong>Дата:</strong> ${record.history_date}</div>
                <div><strong>Пользователь:</strong> ${record.changed_by || "неизвестно"}</div>
                <div><strong>Тип:</strong> ${record.history_type || "?"}</div>
                <div><strong>Заголовок:</strong> ${record.title || "—"}</div>
            `;
            itemEl.appendChild(infoEl);

            // Кнопка «Откатиться» к этой ревизии
            const revertBtn = document.createElement("button");
            revertBtn.className = "popup-btn popup-btn--primary popup-btn--sm";
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
        const confirmed = await customConfirm(`Откатиться к изменению #${record.history_id} от ${record.history_date}?`);
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
        buttonsContainer.className = "popup-buttons";

        this.cancelButton = Popup.createButton("Закрыть", "secondary", () => this.handleCancel());
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    handleCancel() {
        // Если есть внешний колбэк onCancel
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}