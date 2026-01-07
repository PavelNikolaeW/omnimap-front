import { dispatch } from "../utils/utils";
import localforage from "localforage";
import { arrowManager } from "./arrowManager";
import { contextManager } from "./comands/contextManager";

/**
 * BlockStyleManager - управление кастомными стилями блоков
 * Позволяет:
 * - Задавать цвет фона и границы
 * - Выбирать форму блока (rounded, pill, diamond, hexagon, и др.)
 * - Настраивать тень
 * - Применять пресеты стилей
 * - Расширенные настройки: цвет текста, размер шрифта, выравнивание, прозрачность
 */
export class BlockStyleManager {
    constructor() {
        this.panel = document.getElementById('blockStylePanel');
        this.currentBlockId = null;

        // Basic tab elements
        this.backgroundInput = document.getElementById('styleBackground');
        this.borderColorInput = document.getElementById('styleBorderColor');
        this.borderSelect = document.getElementById('styleBorder');
        this.shapeSelect = document.getElementById('styleShape');
        this.shadowSelect = document.getElementById('styleShadow');
        this.applyBtn = document.getElementById('applyBlockStyle');
        this.presets = document.querySelectorAll('.style-preset');

        // Advanced tab elements
        this.textColorInput = document.getElementById('styleTextColor');
        this.fontSizeSelect = document.getElementById('styleFontSize');
        this.textAlignSelect = document.getElementById('styleTextAlign');
        this.opacityInput = document.getElementById('styleOpacity');
        this.opacityValue = document.getElementById('styleOpacityValue');
        this.minWidthInput = document.getElementById('styleMinWidth');
        this.minHeightInput = document.getElementById('styleMinHeight');
        this.customClassInput = document.getElementById('styleCustomClass');

        // Tab elements
        this.tabs = document.querySelectorAll('.style-tab');
        this.tabContents = document.querySelectorAll('.style-tab-content');

        this.presetColors = {
            default: { background: '#ffffff', borderColor: '#e5e7eb' },
            blue: { background: '#dbeafe', borderColor: '#93c5fd' },
            green: { background: '#dcfce7', borderColor: '#86efac' },
            yellow: { background: '#fef3c7', borderColor: '#fcd34d' },
            red: { background: '#fee2e2', borderColor: '#fca5a5' },
            purple: { background: '#ede9fe', borderColor: '#c4b5fd' },
            pink: { background: '#fce7f3', borderColor: '#f9a8d4' },
            gray: { background: '#f3f4f6', borderColor: '#9ca3af' }
        };

        this.bindEvents();
    }

    bindEvents() {
        // Применить стиль
        this.applyBtn?.addEventListener('click', () => this.applyStyle());

        // Пресеты
        this.presets?.forEach(preset => {
            preset.addEventListener('click', () => this.applyPreset(preset.dataset.preset));
        });

        // Табы
        this.tabs?.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Обновление значения opacity
        this.opacityInput?.addEventListener('input', () => {
            if (this.opacityValue) {
                this.opacityValue.textContent = `${this.opacityInput.value}%`;
            }
        });

        // Закрытие панели при клике вне неё
        document.addEventListener('click', (e) => {
            if (this.panel?.classList.contains('visible') &&
                !this.panel.contains(e.target) &&
                !e.target.closest('#openStylePanel') &&
                !e.target.closest('#diagramBlockStyle')) {
                this.hide();
            }
        });
    }

    /**
     * Переключить таб
     */
    switchTab(tabName) {
        this.tabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        this.tabContents?.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
    }

    /**
     * Показать панель для блока
     */
    show(blockId, blockElement) {
        this.currentBlockId = blockId;
        this.currentElement = blockElement;
        this.panel?.classList.add('visible');

        // Загрузить текущие стили блока
        this.loadCurrentStyles(blockId);
    }

    /**
     * Скрыть панель
     */
    hide() {
        this.panel?.classList.remove('visible');
        this.currentBlockId = null;
        this.currentElement = null;
    }

    /**
     * Переключить видимость
     */
    toggle(blockId, blockElement) {
        if (this.panel?.classList.contains('visible')) {
            this.hide();
        } else {
            this.show(blockId, blockElement);
        }
    }

    /**
     * Загрузить текущие стили блока
     */
    async loadCurrentStyles(blockId) {
        // Извлекаем чистый blockId если передан полный ID
        const cleanId = blockId?.includes('*') ? blockId.split('*').pop() : blockId;
        const block = await this.getBlock(cleanId);
        const styles = block?.data?.customStyles || {};

        // Basic tab
        if (this.backgroundInput) this.backgroundInput.value = styles.background || '#ffffff';
        if (this.borderColorInput) this.borderColorInput.value = styles.borderColor || '#e5e7eb';
        if (this.borderSelect) this.borderSelect.value = styles.border || '';
        if (this.shapeSelect) this.shapeSelect.value = styles.shape || '';
        if (this.shadowSelect) this.shadowSelect.value = styles.shadow || '';

        // Advanced tab
        if (this.textColorInput) this.textColorInput.value = styles.textColor || '#000000';
        if (this.fontSizeSelect) this.fontSizeSelect.value = styles.fontSize || '';
        if (this.textAlignSelect) this.textAlignSelect.value = styles.textAlign || '';
        if (this.opacityInput) {
            this.opacityInput.value = styles.opacity || 100;
            if (this.opacityValue) this.opacityValue.textContent = `${styles.opacity || 100}%`;
        }
        if (this.minWidthInput) this.minWidthInput.value = styles.minWidth || '';
        if (this.minHeightInput) this.minHeightInput.value = styles.minHeight || '';
        if (this.customClassInput) this.customClassInput.value = styles.customClass || '';

        // Снять выделение с пресетов
        this.presets?.forEach(p => p.classList.remove('active'));
    }

    /**
     * Валидация и ограничение числового значения
     * @param {string|number} value - входное значение
     * @param {number} min - минимум
     * @param {number} max - максимум
     * @param {number|null} defaultVal - значение по умолчанию
     * @returns {number|null}
     */
    clampNumericValue(value, min, max, defaultVal = null) {
        if (value === '' || value === null || value === undefined) return defaultVal;
        const num = parseInt(value, 10);
        if (isNaN(num)) return defaultVal;
        return Math.max(min, Math.min(max, num));
    }

    /**
     * Применить выбранный стиль к блоку
     */
    async applyStyle() {
        if (!this.currentBlockId) return;

        const styles = {
            // Basic
            background: this.backgroundInput?.value,
            borderColor: this.borderColorInput?.value,
            border: this.borderSelect?.value,
            shape: this.shapeSelect?.value,
            shadow: this.shadowSelect?.value,
            // Advanced
            textColor: this.textColorInput?.value,
            fontSize: this.fontSizeSelect?.value,
            textAlign: this.textAlignSelect?.value,
            // Numeric values with bounds validation
            opacity: this.clampNumericValue(this.opacityInput?.value, 10, 100, null),
            minWidth: this.clampNumericValue(this.minWidthInput?.value, 0, 2000, null),
            minHeight: this.clampNumericValue(this.minHeightInput?.value, 0, 2000, null),
            customClass: this.customClassInput?.value || null
        };

        // Удалить пустые значения
        Object.keys(styles).forEach(key => {
            if (styles[key] === '' || styles[key] === null) {
                delete styles[key];
            }
        });

        // Обновить данные блока
        dispatch('UpdateBlockStyles', {
            blockId: this.currentBlockId,
            customStyles: styles
        });

        // Применить стили сразу к элементу для немедленного отображения
        this.applyStylesToElement(this.currentElement, styles);
    }

    /**
     * Применить пресет
     */
    applyPreset(presetName) {
        const preset = this.presetColors[presetName];
        if (!preset) return;

        this.backgroundInput.value = preset.background;
        this.borderColorInput.value = preset.borderColor;

        // Выделить активный пресет
        this.presets?.forEach(p => {
            p.classList.toggle('active', p.dataset.preset === presetName);
        });
    }

    /**
     * Валидация CSS класса для предотвращения XSS
     * Разрешены только буквы, цифры, дефисы и подчёркивания
     */
    validateCssClass(className) {
        if (!className || typeof className !== 'string') return null;
        // Разрешаем только безопасные символы: a-z, A-Z, 0-9, -, _
        const sanitized = className.trim();
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(sanitized)) {
            console.warn('Invalid CSS class name:', className);
            return null;
        }
        // Максимальная длина класса
        if (sanitized.length > 50) {
            console.warn('CSS class name too long:', className);
            return null;
        }
        return sanitized;
    }

    /**
     * Применить стили к DOM элементу с кэшированием для избежания избыточных DOM операций
     * @param {HTMLElement} element - DOM элемент
     * @param {Object} styles - объект стилей
     * @param {boolean} force - принудительно применить все стили (без проверки кэша)
     */
    applyStylesToElement(element, styles, force = false) {
        if (!element) return;

        // Используем requestAnimationFrame для батчинга DOM операций
        requestAnimationFrame(() => {
            this._applyStylesSync(element, styles, force);
        });
    }

    /**
     * Синхронное применение стилей с dirty-checking
     * @private
     */
    _applyStylesSync(element, styles, force = false) {
        if (!element) return;

        // Background - проверяем изменилось ли значение
        if (styles.background && (force || element.style.backgroundColor !== styles.background)) {
            element.style.backgroundColor = styles.background;
        }

        // Border color
        if (styles.borderColor && (force || element.style.borderColor !== styles.borderColor)) {
            element.style.borderColor = styles.borderColor;
        }

        // Border style через data-атрибут
        const currentBorder = element.getAttribute('data-block-border') || '';
        const newBorder = styles.border || '';
        if (force || currentBorder !== newBorder) {
            if (newBorder) {
                element.setAttribute('data-block-border', newBorder);
            } else if (currentBorder) {
                element.removeAttribute('data-block-border');
            }
        }

        // Shape через data-атрибут
        const currentShape = element.getAttribute('data-block-shape') || '';
        const newShape = styles.shape || '';
        if (force || currentShape !== newShape) {
            if (newShape) {
                element.setAttribute('data-block-shape', newShape);
            } else if (currentShape) {
                element.removeAttribute('data-block-shape');
            }
        }

        // Shadow через data-атрибут
        const currentShadow = element.getAttribute('data-block-shadow') || '';
        const newShadow = styles.shadow || '';
        if (force || currentShadow !== newShadow) {
            if (newShadow) {
                element.setAttribute('data-block-shadow', newShadow);
            } else if (currentShadow) {
                element.removeAttribute('data-block-shadow');
            }
        }

        // Text color
        if (styles.textColor && (force || element.style.color !== styles.textColor)) {
            element.style.color = styles.textColor;
        }

        // Font size через data-атрибут
        const currentFontSize = element.getAttribute('data-block-font-size') || '';
        const newFontSize = styles.fontSize || '';
        if (force || currentFontSize !== newFontSize) {
            if (newFontSize) {
                element.setAttribute('data-block-font-size', newFontSize);
            } else if (currentFontSize) {
                element.removeAttribute('data-block-font-size');
            }
        }

        // Text align через data-атрибут
        const currentTextAlign = element.getAttribute('data-block-text-align') || '';
        const newTextAlign = styles.textAlign || '';
        if (force || currentTextAlign !== newTextAlign) {
            if (newTextAlign) {
                element.setAttribute('data-block-text-align', newTextAlign);
            } else if (currentTextAlign) {
                element.removeAttribute('data-block-text-align');
            }
        }

        // Opacity
        const newOpacity = (styles.opacity && styles.opacity < 100) ? String(styles.opacity / 100) : '';
        if (force || element.style.opacity !== newOpacity) {
            element.style.opacity = newOpacity;
        }

        // Min width
        const newMinWidth = styles.minWidth ? `${styles.minWidth}px` : '';
        if (force || element.style.minWidth !== newMinWidth) {
            element.style.minWidth = newMinWidth;
        }

        // Min height
        const newMinHeight = styles.minHeight ? `${styles.minHeight}px` : '';
        if (force || element.style.minHeight !== newMinHeight) {
            element.style.minHeight = newMinHeight;
        }

        // Custom class (with XSS validation)
        const prevCustomClass = element.getAttribute('data-custom-class') || '';
        const validatedClass = styles.customClass ? this.validateCssClass(styles.customClass) : null;
        const newCustomClass = validatedClass || '';

        if (force || prevCustomClass !== newCustomClass) {
            if (prevCustomClass) {
                element.classList.remove(prevCustomClass);
                element.removeAttribute('data-custom-class');
            }
            if (newCustomClass) {
                element.classList.add(newCustomClass);
                element.setAttribute('data-custom-class', newCustomClass);
            }
        }
    }

    /**
     * Получить блок из localforage
     */
    async getBlock(id) {
        const user = await localforage.getItem('currentUser');
        return await localforage.getItem(`Block_${id}_${user}`);
    }
}

/**
 * ConnectionStyleManager - управление стилями соединений
 * Интегрируется с системой команд для создания стрелок
 * Поддерживает все возможности jsPlumb для создания разнообразных соединений
 */
export class ConnectionStyleManager {
    constructor() {
        this.panel = document.getElementById('connectionPanel');
        this.isConnecting = false;
        this.sourceBlockId = null;
        this.sourceElement = null;
        this.customStyle = null;

        // Лимиты для числовых значений
        this.LIMITS = {
            strokeWidth: { min: 1, max: 10 },
            cornerRadius: { min: 0, max: 50 },
            labelMaxLength: 100
        };

        // Элементы управления
        this.typeSelect = document.getElementById('connectorType');
        this.colorInput = document.getElementById('connectorColor');
        this.widthInput = document.getElementById('connectorWidth');
        this.widthValue = document.getElementById('connectorWidthValue');
        this.dashStyleSelect = document.getElementById('connectorDashStyle');
        this.cornerRadiusInput = document.getElementById('connectorCornerRadius');
        this.cornerRadiusValue = document.getElementById('connectorCornerRadiusValue');
        this.sourceAnchorSelect = document.getElementById('connectorSourceAnchor');
        this.targetAnchorSelect = document.getElementById('connectorTargetAnchor');
        this.arrowStartCheckbox = document.getElementById('connectorArrowStart');
        this.arrowEndCheckbox = document.getElementById('connectorArrowEnd');
        this.arrowStyleSelect = document.getElementById('connectorArrowStyle');
        this.labelInput = document.getElementById('connectorLabel');
        this.createBtn = document.getElementById('createConnection');

        // Presets
        this.presetButtons = document.querySelectorAll('.connection-preset');
        this.colorPresets = document.querySelectorAll('.color-preset');

        this.bindEvents();
    }

    bindEvents() {
        this.createBtn?.addEventListener('click', () => this.startConnectionMode());

        // Presets
        this.presetButtons?.forEach(btn => {
            btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
        });

        // Color presets
        this.colorPresets?.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.colorInput) {
                    this.colorInput.value = btn.dataset.color;
                }
            });
        });

        // Width value display
        this.widthInput?.addEventListener('input', () => {
            if (this.widthValue) {
                this.widthValue.textContent = `${this.widthInput.value}px`;
            }
        });

        // Corner radius value display
        this.cornerRadiusInput?.addEventListener('input', () => {
            if (this.cornerRadiusValue) {
                this.cornerRadiusValue.textContent = `${this.cornerRadiusInput.value}px`;
            }
        });

        // Закрытие панели при клике вне неё
        document.addEventListener('click', (e) => {
            if (this.panel?.classList.contains('visible') &&
                !this.panel.contains(e.target) &&
                !e.target.closest('#openConnectionPanel')) {
                this.hide();
            }
        });

        // Слушатель клика для завершения соединения
        document.addEventListener('click', (e) => {
            if (!this.isConnecting) return;

            const blockElement = e.target.closest('[block], [blocklink]');
            if (!blockElement) return;

            this.handleBlockClick(blockElement);
        });

        // Отмена по Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isConnecting) {
                this.cancelConnectionMode();
            }
        });
    }

    /**
     * Применить пресет соединения
     */
    applyPreset(presetName) {
        // Сбросить активный класс
        this.presetButtons?.forEach(btn => btn.classList.remove('active'));

        // Установить активный пресет
        const activeBtn = document.querySelector(`.connection-preset[data-preset="${presetName}"]`);
        activeBtn?.classList.add('active');

        // Применить настройки пресета
        switch (presetName) {
            case 'default':
                this.typeSelect.value = 'Flowchart';
                this.dashStyleSelect.value = '';
                this.arrowStartCheckbox.checked = false;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'arrow';
                break;
            case 'dashed':
                this.typeSelect.value = 'Flowchart';
                this.dashStyleSelect.value = '4 2';
                this.arrowStartCheckbox.checked = false;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'arrow';
                break;
            case 'curved':
                this.typeSelect.value = 'Bezier';
                this.dashStyleSelect.value = '';
                this.arrowStartCheckbox.checked = false;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'arrow';
                break;
            case 'double':
                this.typeSelect.value = 'Flowchart';
                this.dashStyleSelect.value = '';
                this.arrowStartCheckbox.checked = true;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'arrow';
                break;
            case 'inheritance':
                this.typeSelect.value = 'Flowchart';
                this.dashStyleSelect.value = '';
                this.arrowStartCheckbox.checked = false;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'hollow-arrow';
                break;
            case 'composition':
                this.typeSelect.value = 'Flowchart';
                this.dashStyleSelect.value = '';
                this.arrowStartCheckbox.checked = true;
                this.arrowEndCheckbox.checked = true;
                this.arrowStyleSelect.value = 'diamond';
                break;
        }
    }

    /**
     * Показать панель
     */
    show() {
        this.panel?.classList.add('visible');
    }

    /**
     * Скрыть панель
     */
    hide() {
        this.panel?.classList.remove('visible');
    }

    /**
     * Переключить видимость
     */
    toggle() {
        if (this.panel?.classList.contains('visible')) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Начать режим создания соединения
     */
    startConnectionMode() {
        // Получить текущий выбранный блок
        const ctx = contextManager.getContext();
        const activeBlockId = ctx.blockId;
        const activeElement = ctx.blockElement || ctx.blockLinkElement;

        if (!activeBlockId || !activeElement) {
            console.warn('Выберите блок-источник перед созданием соединения');
            return;
        }

        this.isConnecting = true;
        this.sourceBlockId = activeElement.id;
        this.sourceElement = activeElement;
        this.customStyle = this.getConnectionStyle();
        this.hide();

        // Визуальная индикация режима
        this.sourceElement.classList.add('block-selected');
        document.body.style.cursor = 'crosshair';

        // Показать подсказку
        this.showHint('Кликните на целевой блок для создания соединения (Escape для отмены)');
    }

    /**
     * Обработать клик на блок в режиме соединения
     */
    handleBlockClick(blockElement) {
        if (!this.isConnecting || !this.sourceBlockId) return;

        const targetId = blockElement.id;

        // Нельзя соединить блок с самим собой
        if (targetId === this.sourceBlockId) return;

        // Определить тип соединения
        let connectionType = 'DEFAULT';
        if (this.connectionType === 'dashed') {
            connectionType = 'DASHED';
        } else if (this.connectionType === 'double') {
            connectionType = 'DOUBLE';
        }

        // Создать соединение
        arrowManager.completeConnectionToElement(
            this.sourceBlockId,
            targetId,
            connectionType,
            this.customStyle?.paintStyle?.stroke
        );

        // Очистить режим
        this.finishConnectionMode();
    }

    /**
     * Завершить режим соединения
     */
    finishConnectionMode() {
        if (this.sourceElement) {
            this.sourceElement.classList.remove('block-selected');
        }
        document.body.style.cursor = '';
        this.hideHint();

        this.isConnecting = false;
        this.sourceBlockId = null;
        this.sourceElement = null;
        this.customStyle = null;
        this.connectionType = null;
    }

    /**
     * Отменить режим соединения
     */
    cancelConnectionMode() {
        this.finishConnectionMode();
    }

    /**
     * Показать подсказку
     */
    showHint(message) {
        let hint = document.getElementById('connection-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'connection-hint';
            hint.style.cssText = `
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 4px;
                z-index: 10000;
                font-size: 14px;
            `;
            document.body.appendChild(hint);
        }
        hint.textContent = message;
        hint.style.display = 'block';
    }

    /**
     * Скрыть подсказку
     */
    hideHint() {
        const hint = document.getElementById('connection-hint');
        if (hint) {
            hint.style.display = 'none';
        }
    }

    /**
     * Санитизация текста для предотвращения XSS
     * Экранирует HTML-спецсимволы
     * @param {string} text - входной текст
     * @returns {string} - безопасный текст
     */
    sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Валидация и ограничение числового значения
     * @param {string|number} value - входное значение
     * @param {number} min - минимум
     * @param {number} max - максимум
     * @param {number} defaultVal - значение по умолчанию
     * @returns {number}
     */
    clampNumeric(value, min, max, defaultVal) {
        const num = parseInt(value, 10);
        if (isNaN(num)) return defaultVal;
        return Math.max(min, Math.min(max, num));
    }

    /**
     * Получить настройки стиля соединения
     */
    getConnectionStyle() {
        const sourceAnchor = this.sourceAnchorSelect?.value || 'Continuous';
        const targetAnchor = this.targetAnchorSelect?.value || 'Continuous';
        const connectorType = this.typeSelect?.value || 'Flowchart';
        const cornerRadius = this.clampNumeric(
            this.cornerRadiusInput?.value,
            this.LIMITS.cornerRadius.min,
            this.LIMITS.cornerRadius.max,
            5
        );

        // Connector options based on type
        const connectorOptions = connectorType === 'Flowchart'
            ? { stub: 50, alwaysRespectStubs: true, cornerRadius }
            : connectorType === 'Bezier'
            ? { curviness: 100 }
            : {};

        const strokeWidth = this.clampNumeric(
            this.widthInput?.value,
            this.LIMITS.strokeWidth.min,
            this.LIMITS.strokeWidth.max,
            2
        );

        return {
            connector: {
                type: connectorType,
                options: connectorOptions
            },
            paintStyle: {
                stroke: this.colorInput?.value || '#516077',
                strokeWidth,
                dashstyle: this.dashStyleSelect?.value || undefined,
                outlineStroke: 'transparent',
                outlineWidth: 10
            },
            overlays: this.buildOverlays(),
            anchors: [sourceAnchor, targetAnchor],
            endpoint: { type: 'Dot', options: { radius: 4 } },
            endpointStyle: {
                fill: this.colorInput?.value || '#516077',
                outlineWidth: 0
            }
        };
    }

    /**
     * Построить оверлеи (стрелки)
     */
    buildOverlays() {
        const overlays = [];
        const color = this.colorInput?.value || '#516077';
        const arrowStyle = this.arrowStyleSelect?.value || 'arrow';

        const getOverlayConfig = (location, direction = 1) => {
            const baseOptions = {
                width: 10,
                length: 10,
                location,
                direction
            };

            switch (arrowStyle) {
                case 'diamond':
                    return {
                        type: 'Diamond',
                        options: {
                            width: 12,
                            length: 12,
                            location,
                            paintStyle: { fill: color }
                        }
                    };
                case 'disc':
                    return {
                        type: 'PlainArrow',
                        options: {
                            width: 8,
                            length: 8,
                            location,
                            paintStyle: { fill: color },
                            foldback: 0.1
                        }
                    };
                case 'square':
                    return {
                        type: 'Diamond',
                        options: {
                            width: 10,
                            length: 10,
                            location,
                            paintStyle: { fill: color }
                        }
                    };
                case 'hollow-arrow':
                    return {
                        type: 'Arrow',
                        options: {
                            ...baseOptions,
                            foldback: 0.7,
                            paintStyle: { fill: 'white', stroke: color, strokeWidth: 2 }
                        }
                    };
                case 'hollow-diamond':
                    return {
                        type: 'Diamond',
                        options: {
                            width: 12,
                            length: 12,
                            location,
                            paintStyle: { fill: 'white', stroke: color, strokeWidth: 2 }
                        }
                    };
                default:
                    return {
                        type: 'Arrow',
                        options: baseOptions
                    };
            }
        };

        if (this.arrowEndCheckbox?.checked !== false) {
            overlays.push(getOverlayConfig(1, 1));
        }

        if (this.arrowStartCheckbox?.checked) {
            overlays.push(getOverlayConfig(0, -1));
        }

        // Label - sanitize and limit length to prevent XSS
        let labelText = this.labelInput?.value || '';
        if (labelText.length > this.LIMITS.labelMaxLength) {
            labelText = labelText.substring(0, this.LIMITS.labelMaxLength);
        }
        labelText = this.sanitizeText(labelText);

        overlays.push({
            type: 'Label',
            options: {
                label: labelText,
                location: 0.5,
                cssClass: 'connection-label',
                id: 'label'
            }
        });

        return overlays;
    }
}

// Singleton instances
export const blockStyleManager = new BlockStyleManager();
export const connectionStyleManager = new ConnectionStyleManager();
