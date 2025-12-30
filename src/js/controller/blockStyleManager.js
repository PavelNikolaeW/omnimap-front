import { dispatch } from "../utils/utils";
import localforage from "localforage";

/**
 * BlockStyleManager - управление кастомными стилями блоков
 * Позволяет:
 * - Задавать цвет фона и границы
 * - Выбирать форму блока (rounded, pill, diamond, hexagon)
 * - Настраивать тень
 * - Применять пресеты стилей
 */
export class BlockStyleManager {
    constructor() {
        this.panel = document.getElementById('blockStylePanel');
        this.currentBlockId = null;

        // Элементы управления
        this.backgroundInput = document.getElementById('styleBackground');
        this.borderColorInput = document.getElementById('styleBorderColor');
        this.borderSelect = document.getElementById('styleBorder');
        this.shapeSelect = document.getElementById('styleShape');
        this.shadowSelect = document.getElementById('styleShadow');
        this.applyBtn = document.getElementById('applyBlockStyle');
        this.presets = document.querySelectorAll('.style-preset');

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

        // Закрытие панели при клике вне неё
        document.addEventListener('click', (e) => {
            if (this.panel?.classList.contains('visible') &&
                !this.panel.contains(e.target) &&
                !e.target.closest('#openStylePanel')) {
                this.hide();
            }
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
        const block = await this.getBlock(blockId);
        const styles = block?.data?.customStyles || {};

        this.backgroundInput.value = styles.background || '#ffffff';
        this.borderColorInput.value = styles.borderColor || '#e5e7eb';
        this.borderSelect.value = styles.border || '';
        this.shapeSelect.value = styles.shape || '';
        this.shadowSelect.value = styles.shadow || '';

        // Снять выделение с пресетов
        this.presets?.forEach(p => p.classList.remove('active'));
    }

    /**
     * Применить выбранный стиль к блоку
     */
    async applyStyle() {
        if (!this.currentBlockId) return;

        const styles = {
            background: this.backgroundInput.value,
            borderColor: this.borderColorInput.value,
            border: this.borderSelect.value,
            shape: this.shapeSelect.value,
            shadow: this.shadowSelect.value
        };

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
     * Применить стили к DOM элементу
     */
    applyStylesToElement(element, styles) {
        if (!element) return;

        // Background
        if (styles.background) {
            element.style.backgroundColor = styles.background;
        }

        // Border color
        if (styles.borderColor) {
            element.style.borderColor = styles.borderColor;
        }

        // Border style через data-атрибут
        element.removeAttribute('data-block-border');
        if (styles.border) {
            element.setAttribute('data-block-border', styles.border);
        }

        // Shape через data-атрибут
        element.removeAttribute('data-block-shape');
        if (styles.shape) {
            element.setAttribute('data-block-shape', styles.shape);
        }

        // Shadow через data-атрибут
        element.removeAttribute('data-block-shadow');
        if (styles.shadow) {
            element.setAttribute('data-block-shadow', styles.shadow);
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
 */
export class ConnectionStyleManager {
    constructor() {
        this.panel = document.getElementById('connectionPanel');
        this.isConnecting = false;
        this.sourceBlockId = null;

        // Элементы управления
        this.typeSelect = document.getElementById('connectorType');
        this.colorInput = document.getElementById('connectorColor');
        this.widthInput = document.getElementById('connectorWidth');
        this.sourceAnchorSelect = document.getElementById('connectorSourceAnchor');
        this.targetAnchorSelect = document.getElementById('connectorTargetAnchor');
        this.arrowStartCheckbox = document.getElementById('connectorArrowStart');
        this.arrowEndCheckbox = document.getElementById('connectorArrowEnd');
        this.dashedCheckbox = document.getElementById('connectorDashed');
        this.createBtn = document.getElementById('createConnection');

        this.bindEvents();
    }

    bindEvents() {
        this.createBtn?.addEventListener('click', () => this.startConnectionMode());

        // Закрытие панели при клике вне неё
        document.addEventListener('click', (e) => {
            if (this.panel?.classList.contains('visible') &&
                !this.panel.contains(e.target) &&
                !e.target.closest('#openConnectionPanel')) {
                this.hide();
            }
        });
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
        this.isConnecting = true;
        this.sourceBlockId = null;
        this.hide();

        // Добавить подсказку
        dispatch('SetConnectionMode', {
            active: true,
            style: this.getConnectionStyle()
        });
    }

    /**
     * Получить настройки стиля соединения
     */
    getConnectionStyle() {
        const sourceAnchor = this.sourceAnchorSelect?.value || 'Continuous';
        const targetAnchor = this.targetAnchorSelect?.value || 'Continuous';

        return {
            connector: {
                type: this.typeSelect?.value || 'Flowchart',
                options: {
                    stub: 50,
                    alwaysRespectStubs: true,
                    cornerRadius: 5
                }
            },
            paintStyle: {
                stroke: this.colorInput?.value || '#516077',
                strokeWidth: parseInt(this.widthInput?.value || '2', 10),
                dashstyle: this.dashedCheckbox?.checked ? '4 2' : undefined,
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

        if (this.arrowEndCheckbox?.checked) {
            overlays.push({
                type: 'Arrow',
                options: { width: 10, length: 10, location: 1 }
            });
        }

        if (this.arrowStartCheckbox?.checked) {
            overlays.push({
                type: 'Arrow',
                options: { width: 10, length: 10, location: 0, direction: -1 }
            });
        }

        // Всегда добавляем label
        overlays.push({
            type: 'Label',
            options: { label: '', location: 0.5, cssClass: 'connection-label', id: 'label' }
        });

        return overlays;
    }

    /**
     * Отменить режим соединения
     */
    cancelConnectionMode() {
        this.isConnecting = false;
        this.sourceBlockId = null;
        dispatch('SetConnectionMode', { active: false });
    }
}

// Singleton instances
export const blockStyleManager = new BlockStyleManager();
export const connectionStyleManager = new ConnectionStyleManager();
