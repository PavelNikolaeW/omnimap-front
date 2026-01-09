/**
 * ConnectionEditManager - управляет редактированием существующих соединений jsPlumb
 * Позволяет пользователю кликнуть на соединение и изменить его стиль
 *
 * Исправления:
 * - Live-update: изменения применяются сразу без кнопки "Применить"
 * - Панель перемещаемая (drag)
 * - Расширенные настройки для Flowchart/Orthogonal (stub, cornerRadius)
 */
import { dispatch } from '../utils/utils';
import { CONNECTION_TYPES } from './connectionTypes';

class ConnectionEditManager {
    constructor() {
        this.currentConnection = null;
        this.sourceBlockId = null;
        this.targetBlockId = null;
        this.sourceAnchor = null;
        this.targetAnchor = null;
        this.panel = null;
        this.isInitialized = false;

        // Для drag панели
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        // Debounce для сохранения
        this.saveTimeout = null;
        this.SAVE_DEBOUNCE = 300;

        // Лимиты для валидации
        this.LIMITS = {
            strokeWidth: { min: 1, max: 10 },
            stub: { min: 5, max: 100 },
            cornerRadius: { min: 0, max: 20 },
            labelMaxLength: 100
        };
    }

    /**
     * Инициализация после загрузки DOM
     */
    init() {
        if (this.isInitialized) return;

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
        this.deleteBtn = document.getElementById('deleteConnectionEdit');

        // Расширенные настройки
        this.stubInput = document.getElementById('editConnectorStub');
        this.stubValue = document.getElementById('editStubValue');
        this.cornerRadiusInput = document.getElementById('editConnectorCornerRadius');
        this.cornerRadiusValue = document.getElementById('editCornerRadiusValue');
        this.advancedSection = document.getElementById('editAdvancedSection');

        this.bindEvents();
        this.isInitialized = true;
    }

    /**
     * Привязать события
     */
    bindEvents() {
        // Delete button
        this.deleteBtn?.addEventListener('click', () => {
            this.deleteConnection();
        });

        // Live-update для всех полей
        this.typeSelect?.addEventListener('change', () => {
            this.toggleAdvancedSettings();
            this.applyChangesLive();
        });

        this.colorInput?.addEventListener('input', () => this.applyChangesLive());

        this.widthInput?.addEventListener('input', () => {
            if (this.widthValue) {
                this.widthValue.textContent = `${this.widthInput.value}px`;
            }
            this.applyChangesLive();
        });

        this.dashStyleSelect?.addEventListener('change', () => this.applyChangesLive());

        this.arrowStartCheckbox?.addEventListener('change', () => this.applyChangesLive());
        this.arrowEndCheckbox?.addEventListener('change', () => this.applyChangesLive());

        this.labelInput?.addEventListener('input', () => this.applyChangesLive());

        // Расширенные настройки
        this.stubInput?.addEventListener('input', () => {
            if (this.stubValue) {
                this.stubValue.textContent = `${this.stubInput.value}px`;
            }
            this.applyChangesLive();
        });

        this.cornerRadiusInput?.addEventListener('input', () => {
            if (this.cornerRadiusValue) {
                this.cornerRadiusValue.textContent = `${this.cornerRadiusInput.value}px`;
            }
            this.applyChangesLive();
        });

        // Drag для панели
        this.setupDrag();

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel?.classList.contains('visible')) {
                this.hide();
            }
        });

        // Предотвратить закрытие при клике на панель
        this.panel?.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Настроить drag для панели
     */
    setupDrag() {
        const header = this.panel?.querySelector('h4');
        if (!header) return;

        header.style.cursor = 'move';
        header.style.userSelect = 'none';

        header.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const rect = this.panel.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;

            // Ограничить в пределах окна
            const maxX = window.innerWidth - this.panel.offsetWidth;
            const maxY = window.innerHeight - this.panel.offsetHeight;

            this.panel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            this.panel.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
            this.panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    /**
     * Показать/скрыть расширенные настройки в зависимости от типа
     */
    toggleAdvancedSettings() {
        const type = this.typeSelect?.value;
        const showAdvanced = type === 'Flowchart';

        if (this.advancedSection) {
            this.advancedSection.style.display = showAdvanced ? 'block' : 'none';
        }
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

        // Получить anchor info из connection endpoints
        this.sourceAnchor = this.getAnchorNameFromEndpoint(connection.endpoints?.[0]);
        this.targetAnchor = this.getAnchorNameFromEndpoint(connection.endpoints?.[1]);

        this.populatePanel();
        this.toggleAdvancedSettings();
        this.highlightConnection();

        // Сбросить позицию панели
        this.panel.style.right = '20px';
        this.panel.style.top = '100px';
        this.panel.style.left = 'auto';

        this.panel.classList.add('visible');
    }

    /**
     * Получить имя anchor из endpoint jsPlumb
     * Конвертирует координаты [x, y, dx, dy] в имя позиции
     */
    getAnchorNameFromEndpoint(endpoint) {
        if (!endpoint?.anchor) return null;

        const anchor = endpoint.anchor;
        // jsPlumb anchor может быть объектом с x, y или массивом
        const x = anchor.x ?? anchor[0];
        const y = anchor.y ?? anchor[1];

        if (x === undefined || y === undefined) return null;

        // Маппинг координат на имена anchor
        // Top side: y = 0
        if (y === 0 || y < 0.1) {
            if (x <= 0.3) return 'top-left';
            if (x <= 0.6) return 'top-center';
            return 'top-right';
        }
        // Bottom side: y = 1
        if (y === 1 || y > 0.9) {
            if (x >= 0.7) return 'bottom-right';
            if (x >= 0.4) return 'bottom-center';
            return 'bottom-left';
        }
        // Left side: x = 0
        if (x === 0 || x < 0.1) {
            if (y >= 0.7) return 'left-bottom';
            if (y >= 0.4) return 'left-center';
            return 'left-top';
        }
        // Right side: x = 1
        if (x === 1 || x > 0.9) {
            if (y <= 0.3) return 'right-top';
            if (y <= 0.6) return 'right-center';
            return 'right-bottom';
        }

        return null; // Continuous anchor или неизвестная позиция
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

        // Расширенные настройки - stub и cornerRadius из connector options
        const connectorOptions = connector?.options || {};
        if (this.stubInput) {
            this.stubInput.value = connectorOptions.stub || 30;
        }
        if (this.stubValue) {
            this.stubValue.textContent = `${connectorOptions.stub || 30}px`;
        }
        if (this.cornerRadiusInput) {
            this.cornerRadiusInput.value = connectorOptions.cornerRadius || 5;
        }
        if (this.cornerRadiusValue) {
            this.cornerRadiusValue.textContent = `${connectorOptions.cornerRadius || 5}px`;
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
     * Применить изменения сразу (live-update)
     */
    applyChangesLive() {
        if (!this.currentConnection) return;

        const config = this.getConfigFromPanel();

        // Применить стили через jsPlumb API
        if (this.currentConnection.setPaintStyle) {
            this.currentConnection.setPaintStyle(config.paintStyle);
        }

        // Обновить overlay'и
        this.updateOverlays(config.overlays);

        // Debounce сохранения в data model
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            // Guard против stale операций после закрытия панели
            if (!this.currentConnection) return;
            dispatch('UpdateConnectionBlock', {
                sourceId: this.sourceBlockId,
                targetId: this.targetBlockId,
                connector: config.connector,
                paintStyle: config.paintStyle,
                overlays: config.overlays
            });
        }, this.SAVE_DEBOUNCE);
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

        // Расширенные настройки
        const stub = this.clampNumeric(
            this.stubInput?.value,
            this.LIMITS.stub.min,
            this.LIMITS.stub.max,
            30
        );
        const cornerRadius = this.clampNumeric(
            this.cornerRadiusInput?.value,
            this.LIMITS.cornerRadius.min,
            this.LIMITS.cornerRadius.max,
            5
        );

        // Connector options based on type
        let connectorOptions = {};
        switch (connectorType) {
            case 'Flowchart':
                connectorOptions = {
                    stub: stub,
                    alwaysRespectStubs: false, // false для близких блоков
                    cornerRadius: cornerRadius,
                    midpoint: 0.5
                };
                break;
            case 'Bezier':
                connectorOptions = { curviness: 100 };
                break;
            case 'Straight':
                connectorOptions = {};
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

        // Диспатчим событие удаления с anchor info для точного удаления
        dispatch('RemoveConnectionBlock', {
            sourceId: this.sourceBlockId,
            targetId: this.targetBlockId,
            sourceAnchor: this.sourceAnchor,
            targetAnchor: this.targetAnchor
        });

        // Удаляем соединение из jsPlumb
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
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.unhighlightConnection();
        this.panel?.classList.remove('visible');
        this.currentConnection = null;
        this.sourceBlockId = null;
        this.targetBlockId = null;
        this.sourceAnchor = null;
        this.targetAnchor = null;
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
