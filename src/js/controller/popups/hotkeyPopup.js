import {Popup} from "./popup";

export class HotkeyPopup extends Popup {
    /**
     * @param {Object} options - Опции для настройки попапа.
     *   options.commands – массив объектов команд с полями:
     *      id – уникальный идентификатор команды,
     *      description – описание команды,
     *      hotkeys – текущие хоткеи (массив или строка),
     *      defaultHotkey – значение по умолчанию (массив или строка)
     *   options.onSubmit – функция, получающая обновлённый список команд.
     *   Остальные опции передаются базовому классу Popup.
     */
    constructor(options = {}) {
        if (!options.commands || !Array.isArray(options.commands)) {
            throw new Error("Необходимо передать массив команд в опциях { commands: [...] }");
        }
        Object.assign(options, {
            title: options.title || "Настройка хоткеев",
            size: 'lg',
            modal: true,
            draggable: true,
            inputs: []
        });
        super(options);
    }

    createPopup() {
        // Вызываем базовую реализацию создания оверлея, контейнера, заголовка и кнопок
        super.createPopup();
        // Очищаем контент (к примеру, удаляем форму)
        this.contentArea.innerHTML = "";
        this.commandsContainer = document.createElement("div");
        this.commandsContainer.className = "hotkey-comands-container";
        this.contentArea.appendChild(this.commandsContainer);
        this.commandElements = {};

        this.options.commands.forEach((command) => {
            this.createCommandBlock(command);
        });
        this.positionPopup();
    }

    createCommandBlock(command) {
        const commandBlock = document.createElement("div");
        commandBlock.className = "popup-section";

        // Заголовок команды
        const label = document.createElement("div");
        label.className = "popup-section__title";
        label.textContent = command.description;
        commandBlock.appendChild(label);

        // Контейнер для инпутов хоткеев
        const inputsContainer = document.createElement("div");
        inputsContainer.className = "popup-form";
        commandBlock.appendChild(inputsContainer);

        // Определяем текущие хоткеи (поддержка массива и строки)
        let hotkeys = [];
        if (Array.isArray(command.hotkeys)) {
            hotkeys = command.hotkeys;
        } else if (typeof command.hotkeys === "string") {
            hotkeys = command.hotkeys
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
        }
        if (hotkeys.length === 0) hotkeys.push("");

        const inputElements = hotkeys.map((hotkey) => {
            const wrapper = this.createHotkeyInputWrapper(command.id, hotkey, inputsContainer);
            inputsContainer.appendChild(wrapper);
            return wrapper.querySelector("input.hotkey-input");
        });

        this.commandElements[command.id] = {
            container: commandBlock,
            inputsContainer,
            inputs: inputElements,
        };

        // Кнопка для добавления нового хоткея
        const addBtn = document.createElement("button");
        addBtn.className = "popup-btn popup-btn--ghost popup-btn--sm";
        addBtn.textContent = "+ Добавить хоткей";
        addBtn.addEventListener("click", () => {
            const wrapper = this.createHotkeyInputWrapper(command.id, "", inputsContainer);
            inputsContainer.appendChild(wrapper);
            const input = wrapper.querySelector("input.hotkey-input");
            this.commandElements[command.id].inputs.push(input);
            this.updateRemoveButtons(command.id);
        });
        commandBlock.appendChild(addBtn);

        this.commandsContainer.appendChild(commandBlock);
        this.updateRemoveButtons(command.id);
    }

    createHotkeyInputWrapper(commandId, hotkeyValue, inputsContainer) {
        const inputWrapper = document.createElement("div");
        inputWrapper.className = "popup-form-field popup-form-field--row";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "popup-input hotkey-input";
        input.value = hotkeyValue;
        input.setAttribute("autocomplete", "off");
        // Настраиваем запись комбинации
        this.setupHotkeyInput(input);
        // Прикрепляем валидацию для проверки дубликатов
        this.attachInputValidation(input);
        inputWrapper.appendChild(input);

        // Элемент для отображения ошибки
        const errorMsg = document.createElement("div");
        errorMsg.className = "popup-message popup-message--error";
        errorMsg.style.display = "none";
        inputWrapper.appendChild(errorMsg);

        // Кнопка удаления
        const removeBtn = document.createElement("button");
        removeBtn.className = "popup-btn popup-btn--danger popup-btn--sm hotkey-remove-btn";
        removeBtn.textContent = "Удалить";
        removeBtn.addEventListener("click", () => {
            inputsContainer.removeChild(inputWrapper);
            const arr = this.commandElements[commandId].inputs;
            const idx = arr.indexOf(input);
            if (idx > -1) arr.splice(idx, 1);
            this.updateRemoveButtons(commandId);
        });
        inputWrapper.appendChild(removeBtn);

        return inputWrapper;
    }

    attachInputValidation(input) {
        input.addEventListener("keyup", () => {
            const value = input.value.trim();
            if (!value) {
                this.removeError(input);
                return;
            }
            const allInputs = this.getAllHotkeyInputs();
            const occurrences = allInputs.filter(
                (inp) => inp.value.trim().toLowerCase() === value.toLowerCase()
            ).length;
            if (occurrences > 1) {
                this.showError(input, "Такой хоткей уже существует!");
            } else {
                this.removeError(input);
            }
        });
    }

    getAllHotkeyInputs() {
        return Object.values(this.commandElements).flatMap((cmd) => cmd.inputs);
    }

    showError(input, message) {
        input.classList.add("popup-input--error");
        const wrapper = input.parentElement;
        const errorMsg = wrapper.querySelector(".popup-message--error");
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.style.display = "block";
        }
    }

    removeError(input) {
        input.classList.remove("popup-input--error");
        const wrapper = input.parentElement;
        const errorMsg = wrapper.querySelector(".popup-message--error");
        if (errorMsg) {
            errorMsg.textContent = "";
            errorMsg.style.display = "none";
        }
    }

    updateRemoveButtons(commandId) {
        const {inputsContainer} = this.commandElements[commandId];
        const wrappers = inputsContainer.querySelectorAll(".popup-form-field--row");
        wrappers.forEach((wrapper) => {
            const removeBtn = wrapper.querySelector(".hotkey-remove-btn");
            if (removeBtn) {
                removeBtn.style.display = wrappers.length > 1 ? "" : "none";
            }
        });
    }

    handleSubmit() {
        // Проверяем наличие ошибок во всех инпутах
        const allInputs = this.getAllHotkeyInputs();
        const hasError = allInputs.some((input) =>
            input.classList.contains("popup-input--error")
        );
        if (hasError) {
            alert("Исправьте ошибки в хоткеях перед сохранением!");
            return;
        }

        const result = {};
        for (const commandId in this.commandElements) {
            const hotkeys = this.commandElements[commandId].inputs
                .map((input) => input.value.trim())
                .filter(Boolean);
            result[commandId] = hotkeys.join(", ");
        }
        if (typeof this.options.onSubmit === "function") {
            this.options.onSubmit(result);
        }
        this.close();
    }

    createSubmitButton() {
        const btn = document.createElement("button");
        btn.textContent = "Сохранить";
        btn.className = "popup-button-submit";
        return btn;
    }
}