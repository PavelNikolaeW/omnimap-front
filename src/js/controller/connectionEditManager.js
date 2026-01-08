/**
 * ConnectionEditManager - управляет редактированием существующих соединений jsPlumb
 * Позволяет пользователю кликнуть на соединение и изменить его стиль
 */
import { dispatch } from '../utils/utils';
import { CONNECTION_TYPES } from './connectionTypes';

class ConnectionEditManager {
    constructor() {
        this.currentConnection = null;
        this.sourceBlockId = null;
        this.targetBlockId = null;
        this.panel = null;

        // Лимиты для валидации
        this.LIMITS = {
            strokeWidth: { min: 1, max: 10 },
            labelMaxLength: 100
        };
    }

    /**
     * Инициализация после загрузки DOM
     */
    init() {
        this.panel = document.getElementById('connectionEditPanel');
        if (!this.panel) return;

        this.typeSelect = document.getElementById('editConnectorType');
        this.colorInput = document.getElementById('editConnectorColor');
        this.widthInput = document.getElementById('editConnectorWidth');
        this.widthValue = document.getElementById('editWidthValue');
        this.dashStyleSelect = document.getElementById('editConnectorDashStyle');
        this.arrowStartCheckbox = document.getElementById('editArrowStart');
        this.arrowEndCheckbox = document.getElementById('editArrowEnd');
        this.labelInput = document.getElementById('editConnectorLabel');
        this.applyBtn = document.getElementById('applyConnectionEdit');
        this.deleteBtn = document.getElementById('deleteConnectionEdit');

        this.bindEvents();
    }

    /**
     * Привязать события
     */
    bindEvents() {
        // Apply button
        this.applyBtn?.addEventListener('click', () => {
            this.applyChanges();
        });

        // Delete button
        this.deleteBtn?.addEventListener('click', () => {
            this.deleteConnection();
        });

        // Width value display
        this.widthInput?.addEventListener('input', () => {
            if (this.widthValue) {
                this.widthValue.textContent = `${this.widthInput.value}px`;
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (this.panel?.classList.contains('visible') &&
                !this.panel.contains(e.target) &&
                !e.target.closest('.jtk-connector')) {
                this.hide();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel?.classList.contains('visible')) {
                this.hide();
            }
        });
    }

    /**
     * Показать панель редактирования для соединения
     * @param {Connection} connection - jsPlumb connection object
     */
    show(connection) {
        if (!this.panel) {
            this.init();
        }
        if (!this.panel) {
            console.warn('ConnectionEditPanel not found in DOM');
            return;
        }

        this.currentConnection = connection;
        this.sourceBlockId = connection.source?.id;
        this.targetBlockId = connection.target?.id;

        this.populatePanel();
        this.highlightConnection();
        this.panel.classList.add('visible');
    }

    /**
     * Заполнить панель текущими значениями соединения
     */
    populatePanel() {
        if (!this.currentConnection) return;

        const paintStyle = this.currentConnection.paintStyle || {};
        const connector = this.currentConnection.connector;

        // Цвет
        if (this.colorInput) {
            this.colorInput.value = paintStyle.stroke || '#516077';
        }

        // Толщина
        if (this.widthInput) {
            this.widthInput.value = paintStyle.strokeWidth || 2;
        }
        if (this.widthValue) {
            this.widthValue.textContent = `${paintStyle.strokeWidth || 2}px`;
        }

        // Стиль линии (dash)
        if (this.dashStyleSelect) {
            this.dashStyleSelect.value = paintStyle.dashstyle || '';
        }

        // Тип коннектора
        if (this.typeSelect && connector) {
            const connectorType = connector.type || 'Flowchart';
            this.typeSelect.value = connectorType;
        }

        // Стрелки - проверить overlay'и
        const overlays = this.currentConnection.getOverlays ? this.currentConnection.getOverlays() : {};
        let hasStartArrow = false;
        let hasEndArrow = false;
        let labelText = '';

        Object.values(overlays).forEach(overlay => {
            if (overlay.type === 'Arrow') {
                const location = overlay.location;
                if (location === 0) hasStartArrow = true;
                if (location === 1) hasEndArrow = true;
            }
            if (overlay.type === 'Label' && overlay.getLabel) {
                labelText = overlay.getLabel() || '';
            }
        });

        if (this.arrowStartCheckbox) {
            this.arrowStartCheckbox.checked = hasStartArrow;
        }
        if (this.arrowEndCheckbox) {
            this.arrowEndCheckbox.checked = hasEndArrow;
        }
        if (this.labelInput) {
            this.labelInput.value = labelText;
        }
    }

    /**
     * Применить изменения к соединению
     */
    applyChanges() {
        if (!this.currentConnection) return;

        const config = this.getConfigFromPanel();

        // Применить стили через jsPlumb API
        if (this.currentConnection.setPaintStyle) {
            this.currentConnection.setPaintStyle(config.paintStyle);
        }

        // Обновить overlay'и
        this.updateOverlays(config.overlays);

        // Сохранить изменения в data model
        dispatch('UpdateConnectionBlock', {
            sourceId: this.sourceBlockId,
            targetId: this.targetBlockId,
            connector: config.connector,
            paintStyle: config.paintStyle,
            overlays: config.overlays
        });

        this.hide();
    }

    /**
     * Получить конфигурацию из панели
     */
    getConfigFromPanel() {
        const color = this.colorInput?.value || '#516077';
        const strokeWidth = this.clampNumeric(
            this.widthInput?.value,
            this.LIMITS.strokeWidth.min,
            this.LIMITS.strokeWidth.max,
            2
        );
        const dashstyle = this.dashStyleSelect?.value || undefined;
        const connectorType = this.typeSelect?.value || 'Flowchart';

        // Connector options based on type
        let connectorOptions = {};
        switch (connectorType) {
            case 'Flowchart':
                connectorOptions = { stub: 50, alwaysRespectStubs: true, cornerRadius: 5 };
                break;
            case 'Bezier':
                connectorOptions = { curviness: 100 };
                break;
            case 'Orthogonal':
                connectorOptions = { stub: 30, cornerRadius: 5, alwaysRespectStubs: true };
                break;
            case 'StateMachine':
                connectorOptions = { margin: 5, curviness: 10, proximityLimit: 80 };
                break;
            default:
                connectorOptions = {};
        }

        return {
            connector: {
                type: connectorType,
                options: connectorOptions
            },
            paintStyle: {
                stroke: color,
                strokeWidth,
                dashstyle,
                outlineStroke: 'transparent',
                outlineWidth: 10
            },
            overlays: this.buildOverlaysFromPanel(color)
        };
    }

    /**
     * Построить overlay'и из панели
     */
    buildOverlaysFromPanel(color) {
        const overlays = [];
        const arrowEnd = this.arrowEndCheckbox?.checked;
        const arrowStart = this.arrowStartCheckbox?.checked;
        let label = this.labelInput?.value || '';

        // Санитизация и ограничение длины label
        if (label.length > this.LIMITS.labelMaxLength) {
            label = label.substring(0, this.LIMITS.labelMaxLength);
        }
        label = this.sanitizeText(label);

        if (arrowEnd) {
            overlays.push({
                type: 'Arrow',
                options: { width: 10, length: 10, location: 1 }
            });
        }
        if (arrowStart) {
            overlays.push({
                type: 'Arrow',
                options: { width: 10, length: 10, location: 0, direction: -1 }
            });
        }
        overlays.push({
            type: 'Label',
            options: { label, location: 0.5, cssClass: 'connection-label', id: 'label' }
        });

        return overlays;
    }

    /**
     * Обновить overlay'и соединения
     */
    updateOverlays(overlays) {
        if (!this.currentConnection) return;

        // Удалить существующие overlay'и
        if (this.currentConnection.getOverlays) {
            const existing = this.currentConnection.getOverlays();
            Object.keys(existing).forEach(id => {
                try {
                    this.currentConnection.removeOverlay(id);
                } catch (e) {
                    // Ignore if overlay doesn't exist
                }
            });
        }

        // Добавить новые overlay'и
        if (this.currentConnection.addOverlay) {
            overlays.forEach((ov, i) => {
                this.currentConnection.addOverlay({
                    type: ov.type,
                    options: {
                        ...ov.options,
                        id: ov.type === 'Label' ? 'label' : `overlay_${i}`
                    }
                });
            });
        }
    }

    /**
     * Удалить текущее соединение
     */
    deleteConnection() {
        if (!this.currentConnection) return;

        // Диспатчим событие удаления
        dispatch('RemoveConnectionBlock', {
            sourceId: this.sourceBlockId,
            targetId: this.targetBlockId
        });

        // Удаляем соединение из jsPlumb
        // arrowManager.deleteConnection будет вызван через event
        const instance = this.currentConnection._jsPlumb?.instance;
        if (instance && instance.deleteConnection) {
            instance.deleteConnection(this.currentConnection);
        }

        this.hide();
    }

    /**
     * Подсветить выбранное соединение
     */
    highlightConnection() {
        const canvas = this.currentConnection?.connector?.canvas;
        if (canvas) {
            canvas.classList.add('connection-selected');
        }
    }

    /**
     * Убрать подсветку с соединения
     */
    unhighlightConnection() {
        const canvas = this.currentConnection?.connector?.canvas;
        if (canvas) {
            canvas.classList.remove('connection-selected');
        }
    }

    /**
     * Скрыть панель редактирования
     */
    hide() {
        this.unhighlightConnection();
        this.panel?.classList.remove('visible');
        this.currentConnection = null;
        this.sourceBlockId = null;
        this.targetBlockId = null;
    }

    /**
     * Санитизация текста для предотвращения XSS
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
     */
    clampNumeric(value, min, max, defaultVal) {
        const num = parseInt(value, 10);
        if (isNaN(num)) return defaultVal;
        return Math.max(min, Math.min(max, num));
    }
}

export const connectionEditManager = new ConnectionEditManager();
