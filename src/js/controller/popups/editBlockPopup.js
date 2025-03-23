import {Popup} from "./popup";
import {DynamicObjectEditor} from "./dynamicObjectEditor";

/**
 * Класс попапа с тремя формами:
 * 1) Выбор схемы рендера
 * 2) Редактор (key-value) произвольного объекта/массива
 * 3) Выбор цвета в формате HSL
 */
export class EditBlockPopup extends Popup {
    /**
     * @param {Object} options
     * @param {Object|Array} options.dynamicObject - объект/массив, который пользователь сможет редактировать (форма #2).
     * @param {string[]} options.forbiddenKeys - список служебных ключей, которые запрещено менять или удалять.
     * @param {Function} options.onSubmit - вызывается при нажатии на "Применить", получает финальный объект данных.
     * @param {Function} options.onCancel - вызывается при нажатии на "Отмена".
     */
    constructor(options = {}) {
        super({
            title: options.title || "Настройки",
            modal: true,
            draggable: true,
            onSubmit: options.onSubmit,
            onCancel: options.onCancel,
            inputs: [],
            classPrefix: options.classPrefix || "editBlock-popup",
            dynamicObject: options.dynamicObject,
            forbiddenKeys: options.forbiddenKeys || [],
        });

        // Начальное состояние для схемы рендера (форма #1)
        this.renderScheme = "default"; // "default" | "table" | "horizontal" | "vertical"
        this.tableRows = 2;
        this.tableCols = 2;
        this.tableFill = false;
        this.horizontalRows = 1;
        this.verticalCols = 1;

        // Начальное состояние для HSL (форма #3)
        this.hue = 0;   // 0..360
        this.sat = 50;  // 0..100
        this.light = 50; // 0..100
    }

    /**
     * Переопределяем метод создания попапа, чтобы в content (this.contentArea) нарисовать свои формы.
     */
    createPopup() {
        super.createPopup(); // создаём базовую структуру (оверлей, контейнер, заголовок и т.д.)

        // Очищаем содержимое стандартной contentArea, чтобы вставить три формы
        this.contentArea.innerHTML = "";

        // Рисуем три формы по очереди
        this.renderRenderSchemeForm();
        this.renderDynamicObjectForm();
        this.renderHSLForm();

        // Обновляем позицию попапа (на случай, если контент больше, чем изначально)
        this.positionPopup();
    }

    /**
     * Форма #1: Выбор схемы рендера.
     */
    renderRenderSchemeForm() {
        const formContainer = document.createElement("div");
        formContainer.className = this.getPrefixedClass("render-scheme-form");

        // Заголовок
        const title = document.createElement("h3");
        title.textContent = "Макет";
        formContainer.appendChild(title);

        // Селект выбора схемы
        const schemeContainer = document.createElement("div");
        schemeContainer.className = this.getPrefixedClass("render-scheme-row");

        const schemeLabel = document.createElement("label");
        schemeLabel.textContent = "Выберите схему: ";
        schemeContainer.appendChild(schemeLabel);

        const schemeSelect = document.createElement("select");
        ["default", "table", "horizontal", "vertical"].forEach((val) => {
            const opt = document.createElement("option");
            opt.value = val;
            opt.textContent = val;
            schemeSelect.appendChild(opt);
        });
        schemeSelect.value = this.renderScheme;
        schemeSelect.addEventListener("change", () => {
            this.renderScheme = schemeSelect.value;
            this.updateRenderSchemeVisibility();
        });
        schemeContainer.appendChild(schemeSelect);
        formContainer.appendChild(schemeContainer);

        // Блок для "table"
        const tableFields = document.createElement("div");
        tableFields.className = this.getPrefixedClass("table-fields");

        const colsInput = document.createElement("input");
        colsInput.type = "number";
        colsInput.min = "1";
        colsInput.value = this.tableCols;
        colsInput.placeholder = "Кол-во столбцов";
        colsInput.addEventListener("input", () => {
            this.tableCols = parseInt(colsInput.value, 10) || 1;
        });

        const rowsInput = document.createElement("input");
        rowsInput.type = "number";
        rowsInput.min = "1";
        rowsInput.value = this.tableRows;
        rowsInput.placeholder = "Кол-во строк";
        rowsInput.addEventListener("input", () => {
            this.tableRows = parseInt(rowsInput.value, 10) || 1;
        });

        const fillLabel = document.createElement("label");
        fillLabel.style.marginLeft = "10px";
        const fillCheckbox = document.createElement("input");
        fillCheckbox.type = "checkbox";
        fillCheckbox.checked = this.tableFill;
        fillCheckbox.addEventListener("change", () => {
            this.tableFill = fillCheckbox.checked;
        });
        fillLabel.appendChild(fillCheckbox);
        fillLabel.appendChild(document.createTextNode("Заполнить"));

        // Располагаем в контейнере для "table"
        const tableFieldsRow = document.createElement("div");
        tableFieldsRow.appendChild(document.createTextNode("Столбцы: "));
        tableFieldsRow.appendChild(colsInput);
        tableFieldsRow.appendChild(document.createTextNode("  Строки: "));
        tableFieldsRow.appendChild(rowsInput);
        tableFieldsRow.appendChild(fillLabel);

        tableFields.appendChild(tableFieldsRow);

        // Блок для "horizontal" (только кол-во строк)
        const horizFields = document.createElement("div");
        horizFields.className = this.getPrefixedClass("horizontal-fields");
        const horizInput = document.createElement("input");
        horizInput.type = "number";
        horizInput.min = "1";
        horizInput.value = this.horizontalRows;
        horizInput.placeholder = "Кол-во строк";
        horizInput.addEventListener("input", () => {
            this.horizontalRows = parseInt(horizInput.value, 10) || 1;
        });
        horizFields.appendChild(document.createTextNode("Строки: "));
        horizFields.appendChild(horizInput);

        // Блок для "vertical" (только кол-во столбцов)
        const vertFields = document.createElement("div");
        vertFields.className = this.getPrefixedClass("vertical-fields");
        const vertInput = document.createElement("input");
        vertInput.type = "number";
        vertInput.min = "1";
        vertInput.value = this.verticalCols;
        vertInput.placeholder = "Кол-во столбцов";
        vertInput.addEventListener("input", () => {
            this.verticalCols = parseInt(vertInput.value, 10) || 1;
        });
        vertFields.appendChild(document.createTextNode("Столбцы: "));
        vertFields.appendChild(vertInput);

        // Добавляем всё в formContainer
        formContainer.appendChild(tableFields);
        formContainer.appendChild(horizFields);
        formContainer.appendChild(vertFields);

        // Функция скрыть/показать поля для каждой схемы
        this.updateRenderSchemeVisibility = () => {
            tableFields.style.display = (this.renderScheme === "table") ? "block" : "none";
            horizFields.style.display = (this.renderScheme === "horizontal") ? "block" : "none";
            vertFields.style.display = (this.renderScheme === "vertical") ? "block" : "none";
        };
        this.updateRenderSchemeVisibility();

        this.contentArea.appendChild(formContainer);
    }

    renderDynamicObjectForm() {
        const container = document.createElement("div");
        container.className = this.getPrefixedClass("dynamic-object-form");

        const title = document.createElement("h3");
        title.textContent = "2) Редактор данных (объекты, массивы, примитивы)";
        container.appendChild(title);

        // Создаём экземпляр вынесенного редактора
        this.objectEditor = new DynamicObjectEditor(this.options.dynamicObject, {
            forbiddenKeys: this.options.forbiddenKeys
        });

        // Вызываем рендер в контейнер
        this.objectEditor.render(container);

        this.contentArea.appendChild(container);
    }

    /**
     * Форма #3: Выбор цвета в формате HSL (три ползунка + поле отображения + строка для копирования).
     */
    renderHSLForm() {
        const container = document.createElement("div");
        container.className = this.getPrefixedClass("hsl-form");

        const title = document.createElement("h3");
        title.textContent = "3) Выбор цвета (HSL)";
        container.appendChild(title);

        // Контейнер для слайдеров
        const slidersContainer = document.createElement("div");
        slidersContainer.style.marginBottom = "1em";

        // Hue
        const hueLabel = document.createElement("label");
        hueLabel.textContent = "Hue (0-360): ";
        const hueInput = document.createElement("input");
        hueInput.type = "range";
        hueInput.min = "0";
        hueInput.max = "360";
        hueInput.value = this.hue;
        hueInput.addEventListener("input", () => {
            this.hue = parseInt(hueInput.value, 10);
            updateColor();
        });
        hueLabel.appendChild(hueInput);

        // Saturation
        const satLabel = document.createElement("label");
        satLabel.textContent = "S (0-100): ";
        satLabel.style.marginLeft = "10px";
        const satInput = document.createElement("input");
        satInput.type = "range";
        satInput.min = "0";
        satInput.max = "100";
        satInput.value = this.sat;
        satInput.addEventListener("input", () => {
            this.sat = parseInt(satInput.value, 10);
            updateColor();
        });
        satLabel.appendChild(satInput);

        // Lightness
        const lightLabel = document.createElement("label");
        lightLabel.textContent = "L (0-100): ";
        lightLabel.style.marginLeft = "10px";
        const lightInput = document.createElement("input");
        lightInput.type = "range";
        lightInput.min = "0";
        lightInput.max = "100";
        lightInput.value = this.light;
        lightInput.addEventListener("input", () => {
            this.light = parseInt(lightInput.value, 10);
            updateColor();
        });
        lightLabel.appendChild(lightInput);

        // Добавляем в контейнер
        slidersContainer.appendChild(hueLabel);
        slidersContainer.appendChild(satLabel);
        slidersContainer.appendChild(lightLabel);

        // Превью цвета
        const colorPreview = document.createElement("div");
        colorPreview.style.width = "60px";
        colorPreview.style.height = "30px";
        colorPreview.style.border = "1px solid #ccc";
        colorPreview.style.display = "inline-block";
        colorPreview.style.marginLeft = "10px";
        colorPreview.title = "Превью HSL";

        // Поле для копирования HSL
        const hslInput = document.createElement("input");
        hslInput.type = "text";
        hslInput.style.marginLeft = "10px";
        hslInput.size = 9; // под "360,100,100"
        hslInput.addEventListener("change", () => {
            const parts = hslInput.value.split(",").map((p) => parseInt(p.trim(), 10));
            if (parts.length === 3 && parts.every((num) => !isNaN(num))) {
                this.hue = Math.max(0, Math.min(360, parts[0]));
                this.sat = Math.max(0, Math.min(100, parts[1]));
                this.light = Math.max(0, Math.min(100, parts[2]));
                hueInput.value = this.hue;
                satInput.value = this.sat;
                lightInput.value = this.light;
                updateColor();
            } else {
                hslInput.value = `${this.hue},${this.sat},${this.light}`;
            }
        });

        // Функция обновления цвета
        const updateColor = () => {
            const h = this.hue;
            const s = this.sat;
            const l = this.light;
            colorPreview.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
            hslInput.value = `${h},${s},${l}`;
        };
        // Инициализация
        updateColor();

        slidersContainer.appendChild(colorPreview);
        slidersContainer.appendChild(hslInput);

        container.appendChild(slidersContainer);
        this.contentArea.appendChild(container);
    }

    /**
     * Переопределяем кнопки внизу (Применить / Отмена).
     */
    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = this.getPrefixedClass("buttons");

        // Кнопка "Применить"
        this.submitButton = document.createElement("button");
        this.submitButton.textContent = "Применить";
        this.submitButton.className = this.getPrefixedClass("button-submit");
        this.submitButton.addEventListener("click", () => this.handleSubmit());
        buttonsContainer.appendChild(this.submitButton);

        // Кнопка "Отмена"
        this.cancelButton = document.createElement("button");
        this.cancelButton.textContent = "Отмена";
        this.cancelButton.className = this.getPrefixedClass("button-cancel");
        this.cancelButton.addEventListener("click", () => this.handleCancel());
        buttonsContainer.appendChild(this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    /**
     * Собираем итоговые данные и вызываем колбэк onSubmit из options.
     */
    handleSubmit() {
        // Формируем итоговый объект
        const finalData = {
            renderScheme: this.renderScheme,
            table: {
                rows: this.tableRows,
                cols: this.tableCols,
                fill: this.tableFill,
            },
            horizontal: {
                rows: this.horizontalRows,
            },
            vertical: {
                cols: this.verticalCols,
            },
            dynamicObject: this.options.dynamicObject, // пользователь мог что-то изменить в форме
            hsl: {
                hue: this.hue,
                saturation: this.sat,
                lightness: this.light,
            }
        };

        if (typeof this.options.onSubmit === "function") {
            this.options.onSubmit(finalData);
        }
        this.close();
    }

    /**
     * Закрываем окно, вызываем onCancel при необходимости.
     */
    handleCancel() {
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}