import {dispatch} from "../utils/utils";

const MAX_COLUMNS = 56; // Максимальное количество колонок
const MAX_ROWS = 56;    // Максимальное количество строк
const MIN_COLSPAN = 1;  // Минимальное количество колонок для блока
const MIN_ROWSPAN = 1;  // Минимальное количество строк для блока

// Конфигурация форм ввода
const inputConfigurations = [
    {label: 'Колонок в родителе', type: 'number', dataType: 'parent-columns', min: MIN_COLSPAN, max: MAX_COLUMNS},
    {label: 'Строк в родителе', type: 'number', dataType: 'parent-rows', min: MIN_ROWSPAN, max: MAX_ROWS},
    {label: 'Начало колонки', type: 'number', dataType: 'col-start', min: 1},
    {label: 'Конец колонки', type: 'number', dataType: 'col-end', min: 1},
    {label: 'Начало строки', type: 'number', dataType: 'row-start', min: 1},
    {label: 'Конец строки', type: 'number', dataType: 'row-end', min: 1},
    {label: 'Разрыв', type: 'number', dataType: 'gap', min: 0},
];

export class BlockEditor {
    constructor(idRootContainer) {
        this.rootContainer = document.getElementById(idRootContainer);
        if (!this.rootContainer) {
            console.error(`[BlockEditor] Корневой контейнер с ID "${idRootContainer}" не найден.`);
            return;
        }
        this.currentBlock = null;
        this.editWindowEl = null;
        this.handlers = {};
        this.bindHandlers();
        this.newParams = {parent: {}}
    }

    bindHandlers() {
        this.handlers.clickHandle = this.clickHandle.bind(this);
        this.handlers.handleInputChange = this.handleInputChange.bind(this);
    }

    setHandlers(currentBlock) {
        this.currentBlock = currentBlock;
        this.rootContainer.addEventListener('click', this.handlers.clickHandle);
    }

    removeHandlers() {
        this.currentBlock = null;
        this.rootContainer.removeEventListener('click', this.handlers.clickHandle);
    }

    clickHandle(e) {

        const targetBlock = this.findParentWithAttribute(e.target)
        if (targetBlock && targetBlock !== this.currentBlock) {
            console.log(targetBlock.parentElement)
            if (targetBlock.parentElement.hasAttribute('blocklink') && targetBlock.parentElement !== this.currentBlock)
                dispatch("SetControlHandlers");
        }
    }

    openEditWindow(element) {
        this.closeEditWindow(); // Закрываем предыдущее окно, если оно открыто
        if (!element.parentElement || element.parentElement.id === 'rootContainer') return
        this.setHandlers(element);
        this.newParams = {parent: {}}

        // Создаём окно редактирования
        const windowEl = document.createElement('div');
        windowEl.classList.add('resize-edit-window');
        windowEl.style.position = 'absolute';
        this.editWindowEl = windowEl;

        // Заголовок окна
        const header = this.createElement('div', 'resize-window-header', 'Редактирование размеров');
        windowEl.appendChild(header);

        // Контейнер для форм
        const inputsContainer = this.createElement('div', 'resize-inputs-container');

        const {columns, rows} = this.getGridSize(element.parentElement);
        const {colStart, colEnd, rowStart, rowEnd} = this.getBlockGridInfo(element);

        const computedStyle = window.getComputedStyle(element);
        const gapValue = parseInt(computedStyle.getPropertyValue('gap').replace('px', ''), 10) || 0;

        // Получаем текущий оттенок цвета из data-атрибута или устанавливаем по умолчанию
        let currentHue = parseInt(element.getAttribute('data-hue'), 10);
        if (isNaN(currentHue)) {
            // Если data-hue не установлен, попробуем вычислить из цвета фона
            currentHue = this.getHueFromComputedStyle(computedStyle.backgroundColor) || 0;
            element.setAttribute('data-hue', currentHue);
        }

        const defaultValues = {
            'parent-columns': columns,
            'parent-rows': rows,
            'col-start': colStart,
            'col-end': colEnd,
            'row-start': rowStart,
            'row-end': rowEnd,
            'gap': gapValue,
            'hue': currentHue,
        };

        // Создание полей ввода
        inputConfigurations.forEach(config => {
            const inputWrapper = this.createElement('div', 'input-wrapper');

            const label = this.createElement('label', 'resize-label', config.label, {
                for: `${config.dataType}-input`,
            });

            const input = this.createElement('input', 'resize-input', null, {
                type: config.type,
                id: `${config.dataType}-input`,
                'data-type': config.dataType,
                value: defaultValues[config.dataType],
                min: config.min !== undefined ? config.min : undefined,
                max: config.max !== undefined ? config.max : undefined,
            });

            inputWrapper.appendChild(label);
            inputWrapper.appendChild(input);
            inputsContainer.appendChild(inputWrapper);
        });

        // Добавляем элементы для выбора оттенка цвета
        const hueWrapper = this.createElement('div', 'input-wrapper');

        const hueLabel = this.createElement('label', 'resize-label', 'Оттенок цвета', {
            for: 'hue-slider',
        });

        const hueSlider = this.createElement('input', 'resize-hue-slider', null, {
            type: 'range',
            id: 'hue-slider',
            'data-type': 'hue-slider',
            min: 0,
            max: 360,
            value: defaultValues['hue'],
        });

        const hueInput = this.createElement('input', 'resize-hue-input', null, {
            type: 'number',
            id: 'hue-input',
            'data-type': 'hue-input',
            min: 0,
            max: 360,
            value: defaultValues['hue'],
        });
        const resetBtn = this.createElement('button', 'reset-btn', 'Сброс позиций', {
            id: 'resetGridBtn'
        })
        resetBtn.addEventListener('click', (e) => {
            this.resetGridBlock(element)
        })

        inputsContainer.appendChild(resetBtn)
        hueWrapper.appendChild(hueLabel);
        hueWrapper.appendChild(hueSlider);
        hueWrapper.appendChild(hueInput);
        inputsContainer.appendChild(hueWrapper);
        hueWrapper.addEventListener('click', (e) => {
            e.stopPropagation()
        })

        // Добавляем обработчики для синхронизации ползунка и поля ввода
        hueSlider.addEventListener('input', (e) => {
            hueInput.value = e.target.value;
            this.handleHueChange(e.target.value, element);
        });

        hueInput.addEventListener('input', (e) => {
            let value = e.target.value;
            if (value === '') return;
            if (value < 0) value = 0;
            if (value > 360) value = 360;
            hueSlider.value = value;
            e.target.value = value;
            this.handleHueChange(value, element);
        });

        // Добавляем общий обработчик событий для полей ввода
        inputsContainer.addEventListener('input', this.handlers.handleInputChange);

        // Контейнер для кнопок перемещения
        const buttonsContainer = this.createElement('div', 'move-buttons-container');

        const directions = ['↑', '↓', '←', '→'];
        directions.forEach(dir => {
            const button = this.createElement('button', 'arrow-button', dir, {
                'data-direction': dir,
                type: 'button',
            });
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.moveBlock(element, dir);
            });
            buttonsContainer.appendChild(button);
        });

        if (!window.arrowKeyListener)
            this.ArrowListener = (event) => {
                const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

                if (arrowKeys.includes(event.key)) {
                    this.moveBlock(element, event.key);
                }
            }
            window.addEventListener('keydown', this.ArrowListener);
            window.arrowKeyListener = this.ArrowListener;

        inputsContainer.appendChild(buttonsContainer);
        windowEl.appendChild(inputsContainer);
        document.body.appendChild(windowEl);

        // Позиционируем окно рядом с элементом
        this.positionEditWindow(element, windowEl);

        // Добавляем функциональность перетаскивания окна
        this.makeDraggable(windowEl, header);
    }

    /**
     * Создание элемента с классом и текстовым содержимым
     * @param {string} tag - HTML тег
     * @param {string} className - Класс элемента
     * @param {string|null} textContent - Текстовое содержимое
     * @param {Object} attributes - Дополнительные атрибуты
     * @returns {HTMLElement}
     */
    createElement(tag, className, textContent = null, attributes = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (textContent) el.textContent = textContent;
        Object.keys(attributes).forEach(attr => {
            el.setAttribute(attr, attributes[attr]);
        });
        return el;
    }

    /**
     * Обработка изменения оттенка цвета
     * @param {number} hue - Новое значение оттенка
     * @param {HTMLElement} element - Блок, цвет которого нужно изменить
     */
    handleHueChange(hue, element) {
        // Обновляем data-атрибут
        element.setAttribute('data-hue', hue);
        // Устанавливаем новый цвет фона на основе HSL
        element.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
        // Дополнительно можно отправить событие через dispatch, если требуется
        this.newParams.hue = hue
        // dispatch("SetHueBlock", { blockId: element.id, hue });
    }

    /**
     * Извлечение оттенка (hue) из значения background-color в формате rgb или rgba
     * @param {string} rgbString - Строка цвета в формате rgb или rgba
     * @returns {number|null} - Значение оттенка или null, если не удалось определить
     */
    getHueFromComputedStyle(rgbString) {
        const rgb = rgbString.match(/\d+/g).map(Number);
        if (rgb.length < 3) return null;
        return this.rgbToHue(rgb[0], rgb[1], rgb[2]);
    }

    /**
     * Конвертация RGB в Hue
     * @param {number} r - Красный канал (0-255)
     * @param {number} g - Зелёный канал (0-255)
     * @param {number} b - Синий канал (0-255)
     * @returns {number} - Значение оттенка (0-360)
     */
    rgbToHue(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        const d = max - min;
        if (d === 0) {
            h = 0;
        } else if (max === r) {
            h = ((g - b) / d) % 6;
        } else if (max === g) {
            h = (b - r) / d + 2;
        } else {
            h = (r - g) / d + 4;
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        return h;
    }

    /**
     * Функция позиционирования окна редактирования рядом с элементом.
     * @param {HTMLElement} element - Элемент, рядом с которым нужно разместить окно.
     * @param {HTMLElement} windowEl - Само окно редактирования.
     */
    positionEditWindow(element, windowEl) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const elementRect = element.getBoundingClientRect();
        const windowRect = windowEl.getBoundingClientRect();

        let top = elementRect.top;
        let left = elementRect.right + 10;

        if (left + windowRect.width > viewportWidth) {
            left = elementRect.left - windowRect.width - 10;
        }

        if (top + windowRect.height > viewportHeight) {
            top = viewportHeight - windowRect.height - 10;
        }

        if (top < 0) {
            top = 10;
        }

        if (left < 0) {
            left = 10;
        }

        windowEl.style.top = `${top + window.scrollY}px`;
        windowEl.style.left = `${left + window.scrollX}px`;
    }

    closeEditWindow() {
        if (this.editWindowEl) {
            document.body.removeChild(this.editWindowEl);
            this.editWindowEl = null;
        }
        if (this.currentBlock && (Object.values(this.newParams).length > 1 || Object.values(this.newParams.parent).length))
            dispatch('UpdateBlockParams', {element: this.currentBlock, newParams: this.newParams})
        this.removeHandlers();
        window.removeEventListener('keydown', window.arrowKeyListener);
        delete window.arrowKeyListener
    }

    makeDraggable(element, handle) {
        let posX = 0, posY = 0, mouseX = 0, mouseY = 0;

        const dragMouseMove = (e) => {
            e.preventDefault();
            posX = mouseX - e.clientX;
            posY = mouseY - e.clientY;
            mouseX = e.clientX;
            mouseY = e.clientY;
            element.style.top = (element.offsetTop - posY) + "px";
            element.style.left = (element.offsetLeft - posX) + "px";
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', dragMouseMove);
            document.removeEventListener('mouseup', stopDrag);
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            mouseX = e.clientX;
            mouseY = e.clientY;
            document.addEventListener('mousemove', dragMouseMove);
            document.addEventListener('mouseup', stopDrag);
        });
    }

    handleInputChange(e) {
        const input = e.target;
        if (input.classList.contains('resize-input')) {
            const element = this.currentBlock;
            const handler = this.inputHandlers[input.dataset.type];
            if (handler) {
                handler.call(this, input, element);
            }
        }
    }

    // Объект сопоставления типов данных с функциями обработки
    inputHandlers = {
        'parent-columns': function (input, element) {
            const value = parseInt(input.value, 10);
            if (isNaN(value) || value < MIN_COLSPAN || value > MAX_COLUMNS) return;
            const parent = element.parentElement;
            const currentRows = this.getGridSize(parent).rows;
            this.setParentGridSize(parent, value, currentRows);
        },
        'parent-rows': function (input, element) {
            const value = parseInt(input.value, 10);
            if (isNaN(value) || value < MIN_ROWSPAN || value > MAX_ROWS) return;
            const parent = element.parentElement;
            const currentCols = this.getGridSize(parent).columns;
            this.setParentGridSize(parent, currentCols, value);
        },
        'col-start': function (input, element) {
            this.updateBlockGridInfo(element);
        },
        'col-end': function (input, element) {
            this.updateBlockGridInfo(element);
        },
        'row-start': function (input, element) {
            this.updateBlockGridInfo(element);
        },
        'row-end': function (input, element) {
            this.updateBlockGridInfo(element);
        },
        'gap': (input, element) => {
            this.updateGap(element);
        },
    };

    resetGridBlock(element) {
        const parent = element.parentElement

        if (parent.id !== 'rootContainer')
            dispatch('UpdateDataBlock', {blockId: parent.id, data: {'customGrid': {'reset': true}}})
    }

    updateGap(element) {
        const gapInput = this.editWindowEl.querySelector('#gap-input');
        const gap = parseInt(gapInput.value, 10);
        element.style.gap = `${gap}px`
        if (!isNaN(gap)) {
            this.newParams.gap = `gap_${gap}px`
        }
    }

    moveBlock(element, direction) {
        const blockInfo = this.getBlockGridInfo(element);
        let {colStart, colEnd, rowStart, rowEnd} = blockInfo;
        console.log(direction)
        switch (direction) {
            case '↑':
            case'ArrowUp':
                if (rowStart > 1) {
                    rowStart -= 1;
                    rowEnd -= 1;
                }
                break;
            case '↓':
            case'ArrowDown':
                if (rowEnd < MAX_ROWS) {
                    rowStart += 1;
                    rowEnd += 1;
                }
                break;
            case '←':
            case 'ArrowLeft':
                if (colStart > 1) {
                    colStart -= 1;
                    colEnd -= 1;
                }
                break;
            case '→':
            case 'ArrowRight':
                if (colEnd < MAX_COLUMNS) {
                    colStart += 1;
                    colEnd += 1;
                }
                break;
            default:
                break;
        }

        const newGridInfo = {
            colStart,
            colSpan: colEnd - colStart,
            rowStart,
            rowSpan: rowEnd - rowStart
        };

        this.setBlockGridInfo(element, newGridInfo);
        this.updateInputs(element);
    }

    updateInputs(element) {
        const {columns, rows} = this.getGridSize(element.parentElement);
        const {colStart, colEnd, rowStart, rowEnd} = this.getBlockGridInfo(element);

        const currentHue = parseInt(element.getAttribute('data-hue'), 10) || 0;

        const inputValues = {
            'parent-columns': columns,
            'parent-rows': rows,
            'col-start': colStart,
            'col-end': colEnd,
            'row-start': rowStart,
            'row-end': rowEnd,
            'gap': parseInt(window.getComputedStyle(element).getPropertyValue('gap').replace('px', ''), 10) || 0,
            'hue': currentHue,
        };

        Object.keys(inputValues).forEach(dataType => {
            if (dataType === 'hue') {
                const hueSlider = this.editWindowEl.querySelector('#hue-slider');
                const hueInput = this.editWindowEl.querySelector('#hue-input');
                if (hueSlider && hueInput) {
                    hueSlider.value = inputValues[dataType];
                    hueInput.value = inputValues[dataType];
                }
            } else {
                const input = this.editWindowEl.querySelector(`#${dataType}-input`);
                if (input) {
                    input.value = inputValues[dataType];
                }
            }
        });
    }

    /**
     * Обновление информации о сетке блока на основе введённых значений
     * @param {HTMLElement} element - Блок, сетку которого необходимо обновить
     */
    updateBlockGridInfo(element) {
        const colStart = parseInt(this.editWindowEl.querySelector('#col-start-input').value, 10);
        const colEnd = parseInt(this.editWindowEl.querySelector('#col-end-input').value, 10);
        const rowStart = parseInt(this.editWindowEl.querySelector('#row-start-input').value, 10);
        const rowEnd = parseInt(this.editWindowEl.querySelector('#row-end-input').value, 10);

        if (
            isNaN(colStart) || isNaN(colEnd) ||
            isNaN(rowStart) || isNaN(rowEnd)
        ) {
            return;
        }

        if (
            colStart < 1 || colEnd <= colStart || colEnd > MAX_COLUMNS ||
            rowStart < 1 || rowEnd <= rowStart || rowEnd > MAX_ROWS
        ) {
            return;
        }

        const newGridInfo = {
            colStart: colStart,
            colSpan: colEnd - colStart,
            rowStart: rowStart,
            rowSpan: rowEnd - rowStart
        };

        this.setBlockGridInfo(element, newGridInfo);
    }

    getGridSize(parent) {
        const classes = parent.className.split(' ');
        const gridColsClass = classes.find(c => c.startsWith('grid-template-columns_'));
        const gridRowsClass = classes.find(c => c.startsWith('grid-template-rows_'));

        const columns = gridColsClass ? gridColsClass.split('__').length - 1 : 12;
        const rows = gridRowsClass ? gridRowsClass.split('__').length - 1 : 12;

        return {columns, rows};
    }

    getBlockGridInfo(block) {
        const classes = block.className.split(' ');
        const colClass = classes.find(c => c.startsWith('grid-column_'));
        const rowClass = classes.find(c => c.startsWith('grid-row_'));

        let colStart = 1, colEnd = 2, rowStart = 1, rowEnd = 2;

        if (colClass) {
            const parts = colClass.replace('grid-column_', '').split('__').map(Number);
            [colStart, colEnd] = parts.length === 1 ? [parts[0], parts[0] + 1] : parts;
        }

        if (rowClass) {
            const parts = rowClass.replace('grid-row_', '').split('__').map(Number);
            [rowStart, rowEnd] = parts.length === 1 ? [parts[0], parts[0] + 1] : parts;
        }

        return {
            colStart,
            colEnd,
            colSpan: colEnd - colStart,
            rowStart,
            rowEnd,
            rowSpan: rowEnd - rowStart
        };
    }

    setBlockGridInfo(block, info) {
        block.className = block.className
            .split(' ')
            .filter(c => !(c.startsWith('grid-column_') || c.startsWith('grid-row_')))
            .join(' ');

        const colClass = `grid-column_${info.colStart}__${info.colStart + info.colSpan}`;
        const rowClass = `grid-row_${info.rowStart}__${info.rowStart + info.rowSpan}`;
        dispatch('ApplyClass', {style: [colClass, rowClass]});
        // Добавляем новые классы сетки
        block.classList.add(colClass);
        block.classList.add(rowClass);
        this.newParams.parent.element = block.parentElement
        this.newParams.parent.childrenPositions = {
            id: block.id, childPosition: [colClass, rowClass]
        }

    }

    setParentGridSize(parent, newCols, newRows) {
        // Ограничиваем максимальное количество колонок и строк
        newCols = Math.min(newCols, MAX_COLUMNS);
        newRows = Math.min(newRows, MAX_ROWS);

        // Меняем контент
        const contentEl = parent.querySelector('div[defaultContent]');
        let contentClass = '';
        if (contentEl) {
            contentEl.className = contentEl.className.split(' ').filter(c => !c.startsWith('grid-column')).join(' ');
            contentClass = `grid-column_1_sl_${newCols + 1}`;
            contentEl.classList.add(contentClass);
        }

        // Удаляем существующие классы сетки
        parent.className = parent.className
            .split(' ')
            .filter(c => !(c.startsWith('grid-template-columns_') || c.startsWith('grid-template-rows_')))
            .join(' ');

        // Создаём новые строки для колонок и строк
        const newColsClasses = Array(newCols).fill('1fr').join('__');
        const newRowsClasses = Array(newRows - 1).fill('1fr').join('__');
        const colClass = `grid-template-columns_${newColsClasses}__`;
        const rowClass = `grid-template-rows_auto__${newRowsClasses}__`;
        dispatch('ApplyClass', {style: [colClass, rowClass, contentClass]});

        // Добавляем новые классы сетки
        parent.classList.add(colClass);
        parent.classList.add(rowClass);
        this.newParams.parent.element = parent
        this.newParams.parent.grid = [colClass, rowClass]
        this.newParams.parent.contentPosition = [contentClass]
    }

    findParentWithAttribute(el, attributeName = 'block') {
        while (el && el !== document.documentElement) {
            if (el.hasAttribute(attributeName)) {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
}
