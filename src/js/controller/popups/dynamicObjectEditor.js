/**
 * Класс "DynamicObjectEditor" – универсальный редактор для объекта/массива/примитивов.
 * Отображает данные в виде таблиц (key | type | value | delete).
 * - Возможность сворачивать/разворачивать вложенные объекты и массивы.
 * - Возможность выбирать тип значения (string, number, boolean, object, array).
 * - Кнопки "+ Добавить свойство" (для объектов), "+ Добавить элемент" (для массивов).
 * - forbiddenKeys (для тех ключей, которые нельзя удалить или переименовать).
 *
 */

export class DynamicObjectEditor {
    /**
     * @param {*} data - Объект/массив/примитив, который нужно редактировать.
     * @param {Object} options
     * @param {string[]} [options.forbiddenKeys] - Ключи, которые нельзя переименовывать или удалять.
     */
    constructor(data, options = {}) {
        this.data = data;
        this.forbiddenKeys = options.forbiddenKeys || [];
    }

    /**
     * Рендерит редактор внутрь переданного контейнера (HTMLElement).
     * Очищает контейнер и строит структуру заново.
     */
    render(container) {
        this.container = container;
        this.container.innerHTML = "";
        // Применяем общий класс "dynamic-object-editor",
        // который даёт нам базовые стили (см. DynamicObjectEditor.css).
        this.container.classList.add("dynamic-object-editor");

        // Запускаем рекурсивный рендер.
        this._renderData(this.data, this.container, null);
    }

    /**
     * Универсальный метод, определяющий тип данных:
     * - array => _renderArray
     * - object => _renderObject
     * - boolean/number/string => _renderPrimitive (в корне или внутри).
     * @param {*} data
     * @param {HTMLElement} parentEl
     * @param {Object|null} parentRef - Служебная ссылка { parent, key } для обновления данных.
     */
    _renderData(data, parentEl, parentRef) {
        const type = this._detectType(data);

        if (type === "array") {
            this._renderArray(data, parentEl, parentRef);
        } else if (type === "object") {
            this._renderObject(data, parentEl, parentRef);
        } else {
            // Примитив (string/number/boolean).
            // Обычно в корне встречается реже, но на всякий случай сделаем.
            this._renderPrimitive(data, parentEl, parentRef);
        }
    }

    /**
     * Рендер массива: создаём таблицу (индекс | тип | значение | delete) + кнопка "Добавить элемент".
     */
    _renderArray(arr, parentEl, parentRef) {
        // Таблица
        const table = document.createElement("table");
        table.classList.add("dynamic-object-editor-table");

        // Заголовок таблицы
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Индекс", "Тип", "Значение", ""].forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col;
            th.classList.add("dynamic-object-editor-th");
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Тело
        const tbody = document.createElement("tbody");
        arr.forEach((item, index) => {
            const row = this._renderArrayRow(arr, index, item, () => reRender());
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        parentEl.appendChild(table);

        // Кнопка "Добавить элемент"
        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Добавить элемент";
        addBtn.classList.add("dynamic-object-editor-btn");
        addBtn.style.marginLeft = "20px"; // Можно вынести в CSS, но иногда удобно сразу здесь
        addBtn.addEventListener("click", () => {
            // По умолчанию добавляем пустую строку
            arr.push("");
            reRender();
        });
        parentEl.appendChild(addBtn);

        // Локальная функция для пересоздания таблицы
        const self = this;

        function reRender() {
            parentEl.innerHTML = "";
            self._renderArray(arr, parentEl, parentRef);
        }
    }

    /**
     * Рендер одной строки массива (index | type | value | delete).
     */
    _renderArrayRow(arrayRef, index, value, reRender) {
        const tr = document.createElement("tr");

        // Создаём ячейки
        const tdIndex = this._createCell(`[${index}]`);
        tr.appendChild(tdIndex);

        // Селект типа (string, number, boolean, object, array)
        const tdType = this._createCell("");
        const typeSelect = this._createTypeSelect(value, (newType) => {
            arrayRef[index] = this._initValueByType(newType);
            reRender();
        });
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        // Ячейка для значения
        const tdValue = this._createCell("");
        this._renderValueCell(value, tdValue, arrayRef, index, reRender);
        tr.appendChild(tdValue);

        // Кнопка "Удалить"
        const tdDel = this._createCell("");
        const delBtn = document.createElement("button");
        delBtn.textContent = "Удалить";
        delBtn.classList.add("dynamic-object-editor-btn");
        delBtn.addEventListener("click", () => {
            arrayRef.splice(index, 1);
            reRender();
        });
        tdDel.appendChild(delBtn);
        tr.appendChild(tdDel);

        return tr;
    }

    /**
     * Рендер объекта: таблица (key | type | value | delete) + кнопка "Добавить свойство".
     */
    _renderObject(obj, parentEl, parentRef) {
        const table = document.createElement("table");
        table.classList.add("dynamic-object-editor-table");

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Ключ", "Тип", "Значение", ""].forEach((col) => {
            const th = document.createElement("th");
            th.textContent = col;
            th.classList.add("dynamic-object-editor-th");
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        Object.entries(obj).forEach(([key, val]) => {
            const row = this._renderObjectRow(obj, key, val, () => reRender());
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        parentEl.appendChild(table);

        // Кнопка "Добавить свойство"
        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Добавить свойство";
        addBtn.classList.add("dynamic-object-editor-btn");
        addBtn.style.marginLeft = "20px";
        addBtn.addEventListener("click", () => {
            // Находим уникальный ключ
            let newKey = "newKey";
            let counter = 1;
            while (obj[newKey] !== undefined) {
                newKey = "newKey" + counter++;
            }
            obj[newKey] = "";
            reRender();
        });
        parentEl.appendChild(addBtn);

        // Функция пересоздания
        const self = this;

        function reRender() {
            parentEl.innerHTML = "";
            self._renderObject(obj, parentEl, parentRef);
        }
    }

    /**
     * Одна строка таблицы для объекта (key | type | value | delete).
     */
    _renderObjectRow(objRef, oldKey, value, reRender) {
        const tr = document.createElement("tr");

        // 1) Key
        const tdKey = this._createCell("");
        const keyInput = document.createElement("input");
        keyInput.type = "text";
        keyInput.value = oldKey;
        keyInput.classList.add("dynamic-object-editor-input");
        if (this.forbiddenKeys.includes(oldKey)) {
            keyInput.disabled = true;
        }
        keyInput.addEventListener("change", () => {
            if (this.forbiddenKeys.includes(oldKey)) {
                keyInput.value = oldKey;
                return;
            }
            const newKey = keyInput.value;
            if (newKey !== oldKey) {
                objRef[newKey] = value;
                delete objRef[oldKey];
                reRender();
            }
        });
        tdKey.appendChild(keyInput);
        tr.appendChild(tdKey);

        // 2) Тип
        const tdType = this._createCell("");
        const typeSelect = this._createTypeSelect(value, (newType) => {
            objRef[oldKey] = this._initValueByType(newType);
            reRender();
        });
        tdType.appendChild(typeSelect);
        tr.appendChild(tdType);

        // 3) Value
        const tdValue = this._createCell("");
        this._renderValueCell(value, tdValue, objRef, oldKey, reRender);
        tr.appendChild(tdValue);

        // 4) Delete
        const tdDel = this._createCell("");
        if (!this.forbiddenKeys.includes(oldKey)) {
            const delBtn = document.createElement("button");
            delBtn.textContent = "Удалить";
            delBtn.classList.add("dynamic-object-editor-btn");
            delBtn.addEventListener("click", () => {
                delete objRef[oldKey];
                reRender();
            });
            tdDel.appendChild(delBtn);
        }
        tr.appendChild(tdDel);

        return tr;
    }

    /**
     * Рендерит примитив (string/number/boolean), если он попался «в корне» (редкая ситуация),
     * или просто можно использовать, если нужно.
     */
    _renderPrimitive(value, parentEl, parentRef) {
        const row = document.createElement("div");
        row.classList.add("dynamic-object-editor-primitive-row");

        const label = document.createElement("span");
        label.textContent = "Значение: ";
        row.appendChild(label);

        // Если хотите строго делить на boolean, number и string — можно добавить логику,
        // но для простоты оставим как text:
        const input = document.createElement("input");
        input.type = "text";
        input.value = String(value);
        input.classList.add("dynamic-object-editor-input");
        input.addEventListener("change", () => {
            parentRef.parent[parentRef.key] = input.value;
        });
        row.appendChild(input);

        parentEl.appendChild(row);
    }

    /**
     * Вложенный рендер для object/array. Для примитивов — инпут или чекбокс.
     * Вызывается внутри строк таблиц (_renderObjectRow, _renderArrayRow).
     */
    _renderValueCell(value, cellEl, parentData, parentKey, reRender) {
        const type = this._detectType(value);

        if (type === "object" || type === "array") {
            // Кнопка "Раскрыть"
            const toggleBtn = document.createElement("button");
            toggleBtn.textContent = "Раскрыть";
            toggleBtn.classList.add("dynamic-object-editor-btn");

            const nestedContainer = document.createElement("div");
            nestedContainer.classList.add("dynamic-object-editor-nested");
            nestedContainer.style.display = "none";

            toggleBtn.addEventListener("click", () => {
                if (nestedContainer.style.display === "none") {
                    nestedContainer.style.display = "block";
                    toggleBtn.textContent = "Свернуть";
                } else {
                    nestedContainer.style.display = "none";
                    toggleBtn.textContent = "Раскрыть";
                }
            });

            cellEl.appendChild(toggleBtn);
            cellEl.appendChild(nestedContainer);

            // Рендерим вложенный объект/массив
            this._renderData(value, nestedContainer, {parent: parentData, key: parentKey});
        } else if (type === "boolean") {
            // Для boolean – чекбокс
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = Boolean(value);
            checkbox.addEventListener("change", () => {
                parentData[parentKey] = checkbox.checked;
            });
            cellEl.appendChild(checkbox);
        } else {
            // number или string
            const input = document.createElement("input");
            input.type = "text";
            input.value = String(value);
            input.classList.add("dynamic-object-editor-input");
            input.addEventListener("change", () => {
                if (type === "number") {
                    const parsed = parseFloat(input.value);
                    parentData[parentKey] = isNaN(parsed) ? 0 : parsed;
                } else {
                    parentData[parentKey] = input.value;
                }
            });
            cellEl.appendChild(input);
        }
    }

    /**
     * Создаёт <td> с классом.
     */
    _createCell(content) {
        const td = document.createElement("td");
        td.classList.add("dynamic-object-editor-td");
        if (typeof content === "string") {
            td.textContent = content;
        }
        return td;
    }

    /**
     * Создаёт селект для выбора типа (string, number, boolean, object, array).
     */
    _createTypeSelect(currentValue, onChange) {
        const typeSelect = document.createElement("select");
        typeSelect.classList.add("dynamic-object-editor-select");

        ["string", "number", "boolean", "object", "array"].forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = t;
            typeSelect.appendChild(opt);
        });

        typeSelect.value = this._detectType(currentValue);
        typeSelect.addEventListener("change", () => {
            onChange(typeSelect.value);
        });

        return typeSelect;
    }

    /**
     * Вычисляем тип значения:
     */
    _detectType(value) {
        if (Array.isArray(value)) return "array";
        if (value !== null && typeof value === "object") return "object";
        if (typeof value === "boolean") return "boolean";
        if (typeof value === "number") return "number";
        return "string";
    }

    /**
     * Возвращает «пустое» значение для выбранного типа.
     */
    _initValueByType(type) {
        switch (type) {
            case "number":
                return 0;
            case "boolean":
                return false;
            case "object":
                return {};
            case "array":
                return [];
            default:
                return ""; // string
        }
    }
}