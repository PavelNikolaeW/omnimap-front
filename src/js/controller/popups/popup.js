/**
 * Поведение:
 * - При фокусе поле очищается.
 * - Пока основная (немодификаторная) клавиша не отпущена, можно добавлять модификаторы в любом порядке.
 * - Если модификатор был нажат ДО или ПОСЛЕ основной клавиши — итоговая комбинация учитывает их.
 * - Как только основная клавиша отпущена, комбинация фиксируется и больше не меняется.
 * - При повторном вводе предыдущая комбинация заменяется.
 *
 * Итоговое значение имеет формат, понятный hotkeys‑js (например, "ctrl+up").
 *
 * @param {HTMLInputElement} inputElement – элемент инпута.
 */
function setupHotkeyInput(inputElement) {
    // Отключаем автозаполнение для инпута
    inputElement.setAttribute('autocomplete', 'off');

    // Таблица соответствий для приведения имен клавиш к формату hotkeys‑js.
    const keyMapping = {
        'Control': 'ctrl',
        'Shift': 'shift',
        'Alt': 'alt',
        'Meta': 'command',
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        'Escape': 'esc',
        ' ': 'space'
    };

    // Таблица соответствий для преобразования русских букв (QWERTY‑раскладка) в английские.
    const russianToEnglishMap = {
        'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
        'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l',
        'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm', 'б': ',', 'ю': '.'
    };

    // Множество для модификаторов, которые были нажаты хотя бы раз в рамках комбинации.
    let modifiers = new Set();
    let mainKey = null;            // основная (немодификаторная) клавиша
    let nonModifierHeld = false;   // флаг: основная клавиша зажата
    let combinationFrozen = false; // флаг: комбинация зафиксирована (после отпускания основной клавиши)

    // Функция обновления отображения комбинации в инпуте.
    function updateDisplay() {
        const orderedMods = [];
        // Стандартный порядок модификаторов для hotkeys‑js.
        ['ctrl', 'alt', 'shift', 'command'].forEach(mod => {
            if (modifiers.has(mod)) orderedMods.push(mod);
        });
        const parts = mainKey ? [...orderedMods, mainKey] : orderedMods;
        inputElement.value = parts.join('+');
    }

    // Нормализация названия клавиши с учётом цифр и преобразования русских символов.
    function getMappedKey(e) {
        let key = e.key;

        // Если клавиша является одиночным символом, проверяем, не русская ли это буква.
        if (key.length === 1) {
            // Если буква русская, пытаемся получить соответствие.
            if (/[а-яё]/i.test(key)) {
                const lowerKey = key.toLowerCase();
                if (russianToEnglishMap[lowerKey]) {
                    key = russianToEnglishMap[lowerKey];
                } else {
                    // Если соответствия нет, можно заблокировать ввод.
                    return null;
                }
            } else {
                // Если это английская буква — приводим к нижнему регистру.
                key = key.toLowerCase();
            }
        }

        // Если нажата цифра с использованием e.code (например, Digit1)
        if (e.code && e.code.startsWith('Digit')) {
            key = e.code.slice(5);
        }

        // Если для данной клавиши есть специальное соответствие.
        return keyMapping[e.key] || key;
    }

    inputElement.addEventListener('keydown', (e) => {
        e.preventDefault();

        // Если комбинация уже зафиксирована, начинаем ввод новой комбинации.
        if (combinationFrozen) {
            modifiers.clear();
            mainKey = null;
            nonModifierHeld = false;
            combinationFrozen = false;
        }

        const mappedKey = getMappedKey(e);
        // Если mappedKey равен null — это недопустимый символ (например, русская буква без соответствия),
        // поэтому просто не обрабатываем его.
        if (!mappedKey) return;

        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            // При нажатии модификатора — всегда добавляем его в набор.
            modifiers.add(mappedKey);
        } else {
            // Если нажата немодификаторная клавиша — устанавливаем её как основную (однократно).
            if (!mainKey) {
                mainKey = mappedKey;
            }
            nonModifierHeld = true;
        }
        updateDisplay();
    });

    inputElement.addEventListener('keyup', (e) => {
        e.preventDefault();
        const mappedKey = getMappedKey(e);
        if (!mappedKey) return;

        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            // Отпускание основной клавиши фиксирует комбинацию.
            if (mainKey === mappedKey) {
                nonModifierHeld = false;
                combinationFrozen = true;
            }
        }
        // Для модификаторов ничего не делаем – они остаются зафиксированными.
        updateDisplay();
    });
}

export class Popup {
    constructor(options = {}) {
        // Настройки по умолчанию объединяются с переданными опциями
        this.options = {
            title: '',
            inputs: [],
            content: '',
            onSubmit: null,
            onCancel: null,
            modal: true,
            draggable: true,
            classPrefix: 'popup',
            ...options
        };

        this.prefix = this.options.classPrefix;

        // Настройка hotkey-инпутов
        this.setupHotkeyInput = setupHotkeyInput;
        this.inputElements = [];

        // Привязанные обработчики для событий
        this.boundResizeHandler = this.positionPopup.bind(this);
        this.boundMouseMove = null;
        this.boundMouseUp = null;
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;

        this.createPopup();
        this.bindEvents();
    }

    getPrefixedClass(className) {
        return `${this.prefix}-${className}`;
    }

    createPopup() {
        this.createOverlay();
        this.createContainer();
        this.createTitle();
        this.createContent();
        this.createForm();
        this.createButtons();
        document.body.appendChild(this.popupEl);
        this.positionPopup();
    }

    createOverlay() {
        if (!this.options.modal) return;
        this.overlay = document.createElement('div');
        this.overlay.className = this.getPrefixedClass('overlay');
        Object.assign(this.overlay.style, {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9998
        });
        document.body.appendChild(this.overlay);
        this.overlay.addEventListener('click', () => {
            if (typeof this.options.onCancel === 'function') {
                this.options.onCancel();
            }
            this.close();
        });
    }

    createContainer() {
        this.popupEl = document.createElement('div');
        this.popupEl.className = this.getPrefixedClass('container');
        console.log('kek')
        Object.assign(this.popupEl.style, {
            position: 'fixed',
            zIndex: 9999,
            maxWidth: '90%',
            width: `${this.options.width}px`,
            height: this.options.height === 'auto'
                ? 'auto'
                : `${this.options.height}px`,
            background: '#fff',
            borderRadius: '8px',
            padding: '1em'
        });
    }

    createTitle() {
        if (this.options.title) {
            this.titleBar = document.createElement('div');
            this.titleBar.textContent = this.options.title;
            this.titleBar.className = this.getPrefixedClass('title');
            if (this.options.draggable) {
                this.titleBar.style.cursor = 'move';
            }
            this.popupEl.appendChild(this.titleBar);
        }
    }

    createContent() {
        this.contentArea = document.createElement('div');
        this.contentArea.className = this.getPrefixedClass('content');

        if (this.options.content) {
            if (typeof this.options.content === 'string') {
                const contentWrapper = document.createElement('div');
                contentWrapper.innerHTML = this.options.content;
                this.contentArea.appendChild(contentWrapper);
            } else if (this.options.content instanceof HTMLElement) {
                this.contentArea.appendChild(this.options.content);
            }
        }

        // Настройка прокрутки в зависимости от высоты окна
        if (this.options.height === 'auto') {
            this.contentArea.style.overflowY = 'auto';
        } else {
            const headerHeight = this.titleBar ? this.titleBar.offsetHeight : 0;
            const buttonsHeight = 50; // приблизительная высота блока с кнопками
            const availableHeight = this.options.height - headerHeight - buttonsHeight;
            if (availableHeight > 0) {
                this.contentArea.style.overflowY = 'auto';
                this.contentArea.style.maxHeight = `${availableHeight}px`;
            }
        }
        this.popupEl.appendChild(this.contentArea);
    }

    createForm() {
        this.formEl = document.createElement('div');
        this.formEl.className = this.getPrefixedClass('form');
        this.inputElements = [];

        this.options.inputs.forEach((inputConfig, index) => {
            const fieldContainer = document.createElement('div');
            fieldContainer.className = this.getPrefixedClass('form-field');
            const inputId = inputConfig.id || `popup_input_${index}`;
            const inputName = inputConfig.name || inputId;

            if (inputConfig.label) {
                const labelEl = document.createElement('label');
                labelEl.textContent = inputConfig.label;
                labelEl.htmlFor = inputId;
                labelEl.className = this.getPrefixedClass('form-label');
                fieldContainer.appendChild(labelEl);
            }

            const inputEl = document.createElement('input');
            inputEl.type = inputConfig.type === 'hotkey' ? 'text' : (inputConfig.type || 'text');
            inputEl.id = inputId;
            inputEl.name = inputName;
            if (inputConfig.placeholder) inputEl.placeholder = inputConfig.placeholder;
            if (inputConfig.value) inputEl.value = inputConfig.value;
            if (inputConfig.attributes && typeof inputConfig.attributes === 'object') {
                Object.keys(inputConfig.attributes).forEach(attr => {
                    inputEl.setAttribute(attr, inputConfig.attributes[attr]);
                });
            }
            fieldContainer.appendChild(inputEl);
            this.formEl.appendChild(fieldContainer);

            // Если это поле типа hotkey – применяем дополнительную настройку
            if (inputConfig.type === 'hotkey' && typeof this.setupHotkeyInput === 'function') {
                this.setupHotkeyInput(inputEl);
            }
            this.inputElements.push({name: inputName, element: inputEl, type: inputConfig.type});
        });

        this.contentArea.appendChild(this.formEl);
    }

    createButtons() {
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = this.getPrefixedClass('buttons');

        this.submitButton = this.createSubmitButton();
        this.cancelButton = this.createCancelButton();
        buttonsContainer.append(this.submitButton, this.cancelButton);

        this.popupEl.appendChild(buttonsContainer);
    }

    createSubmitButton() {
        const btn = document.createElement('button');
        btn.textContent = 'ОК';
        btn.className = this.getPrefixedClass('button-submit');
        return btn;
    }

    createCancelButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Отмена';
        btn.className = this.getPrefixedClass('button-cancel');
        return btn;
    }

    positionPopup() {
        this.popupEl.style.visibility = 'hidden';
        this.popupEl.style.display = 'flex';

        requestAnimationFrame(() => {
            const rect = this.popupEl.getBoundingClientRect();
            const w = window.innerWidth, h = window.innerHeight;
            // адаптивная ширина для мобил
            if (w < 480) {
                this.popupEl.style.width = `${Math.floor(w * 0.9)}px`;
            }
            let left = Math.max(10, (w - rect.width) / 2);
            let top = Math.max(10, (h - rect.height) / 2);
            this.popupEl.style.left = `${left}px`;
            this.popupEl.style.top = `${top}px`;
            this.popupEl.style.visibility = 'visible';
        });
    }

    bindEvents() {
        if (this.options.draggable && this.titleBar) {
            this.titleBar.addEventListener('mousedown', this.onMouseDown.bind(this));
        }
        window.addEventListener('resize', this.boundResizeHandler);
    }

    onMouseDown(e) {
        this.isDragging = true;
        const rect = this.popupEl.getBoundingClientRect();
        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;

        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        let newLeft = e.clientX - this.offsetX;
        let newTop = e.clientY - this.offsetY;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - this.popupEl.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - this.popupEl.offsetHeight));
        this.popupEl.style.left = `${newLeft}px`;
        this.popupEl.style.top = `${newTop}px`;
    }

    onMouseUp() {
        this.isDragging = false;
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
            this.boundMouseMove = null;
        }
        if (this.boundMouseUp) {
            document.removeEventListener('mouseup', this.boundMouseUp);
            this.boundMouseUp = null;
        }
    }

    handleSubmit() {
        const data = {};
        this.inputElements.forEach(({name, element, type}) => {
            data[name] = type === 'file' ? element.files : element.value;
        });
        if (typeof this.options.onSubmit === 'function') {
            this.options.onSubmit(data);
        }
        this.close();
    }

    handleCancel() {
        if (typeof this.options.onCancel === 'function') {
            this.options.onCancel();
        }
        this.close();
    }

    close() {
        if (this.popupEl?.parentNode) {
            this.popupEl.parentNode.removeChild(this.popupEl);
        }
        if (this.overlay?.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        window.removeEventListener('resize', this.boundResizeHandler);
        if (this.boundMouseMove) {
            document.removeEventListener('mousemove', this.boundMouseMove);
            this.boundMouseMove = null;
        }
        if (this.boundMouseUp) {
            document.removeEventListener('mouseup', this.boundMouseUp);
            this.boundMouseUp = null;
        }
    }
}