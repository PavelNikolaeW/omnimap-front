/**
 * Настройка поля ввода для захвата горячих клавиш
 * @param {HTMLInputElement} inputElement
 */
function setupHotkeyInput(inputElement) {
    inputElement.setAttribute('autocomplete', 'off');
    inputElement.classList.add('popup-input');

    const keyMapping = {
        'Control': 'ctrl', 'Shift': 'shift', 'Alt': 'alt', 'Meta': 'command',
        'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
        'Escape': 'esc', ' ': 'space'
    };

    const russianToEnglishMap = {
        'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
        'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k', 'д': 'l',
        'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm', 'б': ',', 'ю': '.'
    };

    let modifiers = new Set();
    let mainKey = null;
    let combinationFrozen = false;

    function updateDisplay() {
        const orderedMods = [];
        ['ctrl', 'alt', 'shift', 'command'].forEach(mod => {
            if (modifiers.has(mod)) orderedMods.push(mod);
        });
        inputElement.value = mainKey ? [...orderedMods, mainKey].join('+') : orderedMods.join('+');
    }

    function getMappedKey(e) {
        let key = e.key;
        if (key.length === 1) {
            if (/[а-яё]/i.test(key)) {
                key = russianToEnglishMap[key.toLowerCase()] || null;
                if (!key) return null;
            } else {
                key = key.toLowerCase();
            }
        }
        if (e.code?.startsWith('Digit')) key = e.code.slice(5);
        return keyMapping[e.key] || key;
    }

    inputElement.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (combinationFrozen) {
            modifiers.clear();
            mainKey = null;
            combinationFrozen = false;
        }
        const mappedKey = getMappedKey(e);
        if (!mappedKey) return;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            modifiers.add(mappedKey);
        } else if (!mainKey) {
            mainKey = mappedKey;
        }
        updateDisplay();
    });

    inputElement.addEventListener('keyup', (e) => {
        e.preventDefault();
        const mappedKey = getMappedKey(e);
        if (mappedKey && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) && mainKey === mappedKey) {
            combinationFrozen = true;
        }
        updateDisplay();
    });
}

/**
 * Базовый класс для всех popup-окон
 * Использует единую систему стилей из popup.css
 */
export class Popup {
    /**
     * @param {Object} options
     * @param {string} options.title - Заголовок окна
     * @param {string} options.size - Размер: 'sm' | 'md' | 'lg' | 'xl' | 'full'
     * @param {number} options.width - Ширина в px (переопределяет size)
     * @param {number|string} options.height - Высота в px или 'auto'
     * @param {Array} options.inputs - Конфигурация полей формы
     * @param {string|HTMLElement} options.content - Контент окна
     * @param {Function} options.onSubmit - Callback при подтверждении
     * @param {Function} options.onCancel - Callback при отмене
     * @param {boolean} options.modal - Показывать затемнение
     * @param {boolean} options.draggable - Возможность перетаскивания
     * @param {boolean} options.closeOnOverlay - Закрывать при клике на оверлей
     * @param {boolean} options.closeOnEsc - Закрывать по Escape
     */
    constructor(options = {}) {
        this.options = {
            title: '',
            size: 'md',
            inputs: [],
            content: '',
            onSubmit: null,
            onCancel: null,
            modal: true,
            draggable: true,
            closeOnOverlay: true,
            closeOnEsc: true,
            ...options
        };

        this.setupHotkeyInput = setupHotkeyInput;
        this.inputElements = [];
        this.boundResizeHandler = this.positionPopup.bind(this);
        this.boundKeyHandler = this.handleKeyDown.bind(this);
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;

        this.createPopup();
        this.bindEvents();
    }

    /**
     * Создает структуру popup
     */
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
        this.overlay.className = 'popup-overlay';
        document.body.appendChild(this.overlay);

        if (this.options.closeOnOverlay) {
            this.overlay.addEventListener('click', () => this.handleCancel());
        }
    }

    createContainer() {
        this.popupEl = document.createElement('div');
        this.popupEl.className = 'popup-container';

        // Применяем размер
        if (this.options.width) {
            this.popupEl.style.width = `${this.options.width}px`;
        } else if (this.options.size) {
            this.popupEl.classList.add(`popup-container--${this.options.size}`);
        }

        if (this.options.height && this.options.height !== 'auto') {
            this.popupEl.style.height = `${this.options.height}px`;
        }
    }

    createTitle() {
        if (!this.options.title) return;

        this.titleBar = document.createElement('div');
        this.titleBar.className = 'popup-title';
        if (this.options.draggable) {
            this.titleBar.classList.add('popup-title--draggable');
        }

        const titleText = document.createElement('span');
        titleText.className = 'popup-title__text';
        titleText.textContent = this.options.title;
        this.titleBar.appendChild(titleText);

        this.popupEl.appendChild(this.titleBar);
    }

    createContent() {
        this.contentArea = document.createElement('div');
        this.contentArea.className = 'popup-content';

        if (this.options.content) {
            if (typeof this.options.content === 'string') {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = this.options.content;
                this.contentArea.appendChild(wrapper);
            } else if (this.options.content instanceof HTMLElement) {
                this.contentArea.appendChild(this.options.content);
            }
        }

        this.popupEl.appendChild(this.contentArea);
    }

    createForm() {
        if (!this.options.inputs?.length) return;

        this.formEl = document.createElement('div');
        this.formEl.className = 'popup-form';
        this.inputElements = [];

        this.options.inputs.forEach((config, index) => {
            const field = this.createFormField(config, index);
            this.formEl.appendChild(field.container);
            this.inputElements.push(field.input);
        });

        this.contentArea.appendChild(this.formEl);
    }

    createFormField(config, index) {
        const container = document.createElement('div');
        container.className = 'popup-form-field';

        const inputId = config.id || `popup_input_${index}`;
        const inputName = config.name || inputId;

        if (config.label) {
            const label = document.createElement('label');
            label.className = 'popup-form-label';
            label.htmlFor = inputId;
            label.textContent = config.label;
            container.appendChild(label);
        }

        let inputEl;
        if (config.type === 'textarea') {
            inputEl = document.createElement('textarea');
            inputEl.className = 'popup-textarea';
        } else if (config.type === 'select') {
            inputEl = document.createElement('select');
            inputEl.className = 'popup-select';
            (config.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.value === config.value) option.selected = true;
                inputEl.appendChild(option);
            });
        } else {
            inputEl = document.createElement('input');
            inputEl.className = 'popup-input';
            inputEl.type = config.type === 'hotkey' ? 'text' : (config.type || 'text');
        }

        inputEl.id = inputId;
        inputEl.name = inputName;
        if (config.placeholder) inputEl.placeholder = config.placeholder;
        if (config.value && inputEl.tagName !== 'SELECT') inputEl.value = config.value;
        if (config.required) inputEl.required = true;

        if (config.attributes) {
            Object.entries(config.attributes).forEach(([key, value]) => {
                inputEl.setAttribute(key, value);
            });
        }

        if (config.type === 'hotkey') {
            this.setupHotkeyInput(inputEl);
        }

        container.appendChild(inputEl);

        return {
            container,
            input: { name: inputName, element: inputEl, type: config.type }
        };
    }

    createButtons() {
        const container = document.createElement('div');
        container.className = 'popup-buttons';

        this.submitButton = this.createSubmitButton();
        this.cancelButton = this.createCancelButton();

        this.submitButton.addEventListener('click', () => this.handleSubmit());
        this.cancelButton.addEventListener('click', () => this.handleCancel());

        container.appendChild(this.submitButton);
        container.appendChild(this.cancelButton);
        this.popupEl.appendChild(container);
    }

    createSubmitButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'popup-btn popup-btn--primary';
        btn.textContent = 'OK';
        return btn;
    }

    createCancelButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'popup-btn popup-btn--secondary';
        btn.textContent = 'Отмена';
        return btn;
    }

    positionPopup() {
        this.popupEl.style.visibility = 'hidden';
        this.popupEl.style.display = 'flex';

        requestAnimationFrame(() => {
            const rect = this.popupEl.getBoundingClientRect();
            const w = window.innerWidth;
            const h = window.innerHeight;

            const left = Math.max(10, (w - rect.width) / 2);
            const top = Math.max(10, (h - rect.height) / 2);

            this.popupEl.style.left = `${left}px`;
            this.popupEl.style.top = `${top}px`;
            this.popupEl.style.visibility = 'visible';
        });
    }

    bindEvents() {
        if (this.options.draggable && this.titleBar) {
            this.titleBar.addEventListener('mousedown', this.onMouseDown.bind(this));
            this.titleBar.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        }

        window.addEventListener('resize', this.boundResizeHandler);

        if (this.options.closeOnEsc) {
            document.addEventListener('keydown', this.boundKeyHandler);
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.handleCancel();
        }
    }

    onMouseDown(e) {
        this.startDrag(e.clientX, e.clientY);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);
    }

    onMouseMove(e) {
        this.moveDrag(e.clientX, e.clientY);
    }

    onMouseUp() {
        this.endDrag();
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }

    onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);

        this.boundTouchMove = this.onTouchMove.bind(this);
        this.boundTouchEnd = this.onTouchEnd.bind(this);
        document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
        document.addEventListener('touchend', this.boundTouchEnd);
    }

    onTouchMove(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.moveDrag(touch.clientX, touch.clientY);
    }

    onTouchEnd() {
        this.endDrag();
        document.removeEventListener('touchmove', this.boundTouchMove);
        document.removeEventListener('touchend', this.boundTouchEnd);
    }

    startDrag(x, y) {
        this.isDragging = true;
        const rect = this.popupEl.getBoundingClientRect();
        this.offsetX = x - rect.left;
        this.offsetY = y - rect.top;
    }

    moveDrag(x, y) {
        if (!this.isDragging) return;
        let newLeft = x - this.offsetX;
        let newTop = y - this.offsetY;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - this.popupEl.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - this.popupEl.offsetHeight));
        this.popupEl.style.left = `${newLeft}px`;
        this.popupEl.style.top = `${newTop}px`;
    }

    endDrag() {
        this.isDragging = false;
    }

    /**
     * Собирает данные из формы
     */
    getFormData() {
        const data = {};
        this.inputElements.forEach(({ name, element, type }) => {
            data[name] = type === 'file' ? element.files : element.value;
        });
        return data;
    }

    handleSubmit() {
        const data = this.getFormData();
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

    /**
     * Показывает сообщение в popup
     * @param {string} message
     * @param {'error'|'success'|'warning'|'info'} type
     */
    showMessage(message, type = 'error') {
        let msgContainer = this.contentArea.querySelector('.popup-message-container');
        if (!msgContainer) {
            msgContainer = document.createElement('div');
            msgContainer.className = 'popup-message-container';
            this.contentArea.insertBefore(msgContainer, this.contentArea.firstChild);
        }

        msgContainer.innerHTML = '';
        const msgEl = document.createElement('div');
        msgEl.className = `popup-message popup-message--${type}`;
        msgEl.textContent = message;
        msgContainer.appendChild(msgEl);
    }

    /**
     * Скрывает сообщение
     */
    hideMessage() {
        const msgContainer = this.contentArea.querySelector('.popup-message-container');
        if (msgContainer) {
            msgContainer.innerHTML = '';
        }
    }

    /**
     * Закрывает popup и очищает ресурсы
     */
    close() {
        this.popupEl?.remove();
        this.overlay?.remove();
        window.removeEventListener('resize', this.boundResizeHandler);
        document.removeEventListener('keydown', this.boundKeyHandler);
    }

    /**
     * Хелпер для создания кнопки
     * @param {string} text
     * @param {string} variant - 'primary' | 'secondary' | 'danger' | 'success' | 'ghost'
     * @param {Function} onClick
     */
    static createButton(text, variant = 'secondary', onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `popup-btn popup-btn--${variant}`;
        btn.textContent = text;
        if (onClick) btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Хелпер для создания инпута
     * @param {string} type
     * @param {Object} options
     */
    static createInput(type = 'text', options = {}) {
        const input = document.createElement('input');
        input.type = type;
        input.className = 'popup-input';
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.value) input.value = options.value;
        if (options.id) input.id = options.id;
        if (options.name) input.name = options.name;
        return input;
    }

    /**
     * Хелпер для создания селекта
     * @param {Array} options - [{value, label}]
     * @param {string} selectedValue
     */
    static createSelect(options = [], selectedValue) {
        const select = document.createElement('select');
        select.className = 'popup-select';
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.value === selectedValue) option.selected = true;
            select.appendChild(option);
        });
        return select;
    }

    // Legacy support - для обратной совместимости
    getPrefixedClass(className) {
        return `popup-${className}`;
    }
}
