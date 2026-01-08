import {dispatch} from "../utils/utils";
import {EVENT_CONNECTION_CLICK, log, newInstance} from "@jsplumb/browser-ui";
import {customPrompt} from "../utils/custom-dialog";
import {
    CONNECTION_TYPES,
    getConnectionConfig,
    isValidConnectionType,
    applyColorToConfig
} from "./connectionTypes";


const SMALL_LAYOUTS = ["xxxs-sq", "xxxs-w", "xxxs-h"];
const MEDIUM_LAYOUTS = ["xxs-sq", "xxs-w", "xxs-h"];

class ArrowManager {
    constructor(jsPlumbInstance) {
        // Инициализация jsPlumb
        this.instance = jsPlumbInstance;
        this.container = document.getElementById('rootContainer');

        // Флаги для управления состоянием
        this.removeArrow = false;
        this.defaultConnector = {
            type: "Flowchart",
            options: {
                stub: 50,
                alwaysRespectStubs: true,
                cornerRadius: 5
            }
        };
        this.defaultPaintStyle = {
            stroke: "#516077",
            strokeWidth: 2,
            outlineStroke: "transparent",
            outlineWidth: 10
        };

        this.defaultOverlays = [
            {type: "Arrow", options: {width: 10, length: 10, location: 1}},
            {type: "Label", options: {label: "", location: 0.5, cssClass: "connection-label", id: "label"}}
        ];
        this.defaultAnchors = ["Continuous", "Continuous"];

        // Подписываемся на глобальные события
        this.subscribeToGlobalEvents();

        // Привязываем обработчик клика по соединению
        this.bindConnectionClickHandler();
    }

    /**
     * Подписываемся на глобальные события для смены флага удаления стрелки и для рисования соединений.
     */
    subscribeToGlobalEvents() {
        window.addEventListener('setRemoveArrow', (event) => {
            this.removeArrow = true
        });

        window.addEventListener('DrawArrows', (e) => {
            this.currentArrows = new Set(e.detail.arrows);
            this.loadConnections(e.detail);
        });

        // Обработчик создания соединения через anchor points
        window.addEventListener('CreateConnectionFromAnchors', (e) => {
            const { sourceId, targetId, sourceAnchor, targetAnchor, connectionType } = e.detail;
            this.createConnectionWithAnchors(sourceId, targetId, sourceAnchor, targetAnchor, connectionType);
        });
    }

    /**
     * Преобразует позицию anchor в формат jsPlumb
     * @param {string} position - Позиция anchor (top, right, bottom, left)
     * @returns {Array} - Массив координат для jsPlumb [x, y, dx, dy]
     */
    anchorPositionToJsPlumb(position) {
        const anchors = {
            top: [0.5, 0, 0, -1],
            right: [1, 0.5, 1, 0],
            bottom: [0.5, 1, 0, 1],
            left: [0, 0.5, -1, 0]
        };
        return anchors[position] || [0.5, 0.5, 0, 0];
    }

    /**
     * Создает соединение с указанными anchor points
     * @param {string} sourceId - ID элемента-источника
     * @param {string} targetId - ID элемента-цели
     * @param {string} sourceAnchor - Позиция anchor на источнике
     * @param {string} targetAnchor - Позиция anchor на цели
     * @param {string} connectionType - Тип соединения
     */
    createConnectionWithAnchors(sourceId, targetId, sourceAnchor, targetAnchor, connectionType = CONNECTION_TYPES.DEFAULT) {
        if (!sourceId || !targetId || sourceId === targetId) return;

        const sourceEl = document.getElementById(sourceId);
        const targetEl = document.getElementById(targetId);
        if (!sourceEl || !targetEl) return;

        const layout = sourceEl?.getAttribute("data-layout");

        // Получаем конфигурацию по типу соединения
        const config = getConnectionConfig(connectionType);

        const connector = this.getConnector(config.connector || this.defaultConnector, layout);
        const paintStyle = this.getPaintStyle(config.paintStyle || this.defaultPaintStyle, layout);
        const overlays = this.getOverlays(config.overlays || this.defaultOverlays, layout);
        const endpoint = this.getEndpoint({type: 'Dot', options: {radius: 4}}, layout);
        const endpointStyle = {fill: paintStyle.stroke || "#456", outlineWidth: 0};

        // Преобразуем anchor позиции
        const anchors = [
            this.anchorPositionToJsPlumb(sourceAnchor),
            this.anchorPositionToJsPlumb(targetAnchor)
        ];

        this.instance.connect({
            source: sourceId,
            target: targetId,
            anchors,
            connector,
            paintStyle,
            overlays,
            endpoint,
            endpointStyle
        });

        // Сохраняем соединение с информацией об anchors
        dispatch("AddConnectionBlock", {
            sourceId,
            targetId,
            connector: config.connector || this.defaultConnector,
            paintStyle: config.paintStyle || this.defaultPaintStyle,
            overlays: config.overlays || this.defaultOverlays,
            anchors,
            endpoint,
            endpointStyle,
            connectionType,
            sourceAnchor,
            targetAnchor
        });
    }

    /**
     * Привязывает обработчик клика по соединениям.
     */
    bindConnectionClickHandler() {
        this.instance.bind(EVENT_CONNECTION_CLICK, (info, originalEvent) => {
            originalEvent.stopPropagation()
            originalEvent.preventDefault()
            if (this.removeArrow) {
                this.deleteConnection(info);
            } else {
                // todo переделать добаление лейбла
                // this.handleConnectionLabel(info);
            }
        });
    }

    /**
     * Обрабатывает установку или удаление лейбла соединения.
     * @param {Object} connection - Объект соединения jsPlumb.
     */
    handleConnectionLabel(connection) {
        const labelOverlay = connection.getOverlay("label");
        const currentLabel = labelOverlay ? labelOverlay.getLabel() : "";
        customPrompt("Введите лейбл для связи:", currentLabel).then(newLabel => {
            if (newLabel === null) {
                // Пользователь отменил ввод
                return;
            }
            if (newLabel.trim() === "") {
                // Если введена пустая строка, удаляем лейбл (если он был)
                if (labelOverlay) {
                    connection.removeOverlay("label");
                    this.updateConnectionLabel(connection.source.id, connection.target.id, "");
                }
            } else {
                // Добавляем или обновляем лейбл
                if (labelOverlay) {
                    labelOverlay.setLabel(newLabel);
                } else {
                    connection.addOverlay(this.createLabelOverlay(newLabel));
                }
                this.updateConnectionLabel(connection.source.id, connection.target.id, newLabel);
            }
        })


    }

    /**
     * Создает конфигурацию оверлея для лейбла.
     * @param {string} label - Текст лейбла.
     */
    createLabelOverlay(label) {
        return {
            type: "Label",
            options: {
                label,
                location: 0.5,
                cssClass: "connection-label",
                id: "label",
            },
        };
    }

    /**
     * Обновляет лейбл соединения в локальном хранилище.
     * @param {string} sourceId - ID источника.
     * @param {string} targetId - ID цели.
     * @param {string} newLabel - Новый лейбл.
     */
    updateConnectionLabel(sourceId, targetId, newLabel) {
        dispatch('AddConnectionBlock', {
            sourceId,
            targetId,
            connector,
            paintStyle,
            overlays,
            anchors,
            endpoint,
            endpointStyle
        })
    }

    /**
     * Удаляет соединение.
     * @param {Object} connection - Объект соединения jsPlumb.
     */
    deleteConnection(connection) {
        dispatch("RemoveConnectionBlock", {
            sourceId: connection.source.id,
            targetId: connection.target.id,
        });
        this.instance.deleteConnection(connection);
    }


    /**
     * Завершает создание соединения к целевому элементу.
     * @param {string} sourceId - ID элемента-источника.
     * @param {string} targetId - ID элемента-цели.
     * @param {string} connectionType - Тип соединения (из CONNECTION_TYPES).
     * @param {string} color - Цвет соединения (опционально).
     */
    completeConnectionToElement(sourceId, targetId, connectionType = CONNECTION_TYPES.DEFAULT, color = null) {
        if (!sourceId || !targetId || sourceId === targetId) return;

        const sourceEl = document.getElementById(sourceId);
        const layout = sourceEl?.getAttribute("data-layout");

        // Получаем конфигурацию по типу соединения
        let config = getConnectionConfig(connectionType);

        // Применяем цвет если указан
        if (color) {
            config = applyColorToConfig(config, color);
        }

        const connector = this.getConnector(config.connector || this.defaultConnector, layout);
        const paintStyle = this.getPaintStyle(config.paintStyle || this.defaultPaintStyle, layout);
        const overlays = this.getOverlays(config.overlays || this.defaultOverlays, layout);
        const endpoint = this.getEndpoint({type: 'Dot', options: {radius: 4}}, layout);
        const endpointStyle = {fill: paintStyle.stroke || "#456", outlineWidth: 0};

        this.instance.connect({
            source: sourceId,
            target: targetId,
            anchors: this.defaultAnchors,
            connector,
            paintStyle,
            overlays,
            endpoint,
            endpointStyle
        });

        this.saveConnection(
            sourceId,
            targetId,
            config.connector || this.defaultConnector,
            config.paintStyle || this.defaultPaintStyle,
            config.overlays || this.defaultOverlays,
            this.defaultAnchors,
            endpoint,
            endpointStyle,
            connectionType,
            color
        );
    }

    /**
     * Сохраняет соединение с полной конфигурацией.
     * @param {string} sourceId
     * @param {string} targetId
     * @param {Object} connector
     * @param {Object} paintStyle
     * @param {Array} overlays
     * @param {Array} anchors
     * @param {Object} endpoint
     * @param {Object} endpointStyle
     * @param {string} connectionType - Тип соединения
     * @param {string} color - Цвет соединения
     */
    saveConnection(sourceId, targetId, connector, paintStyle, overlays, anchors, endpoint, endpointStyle, connectionType = null, color = null) {
        dispatch("AddConnectionBlock", {
            sourceId,
            targetId,
            connector,
            paintStyle,
            overlays,
            anchors,
            endpoint,
            endpointStyle,
            connectionType,
            color
        });
    }

    /**
     * Загружает и восстанавливает соединения (например, после перерисовки или при инициализации).
     * @param {Object} param0 - Объект с информацией о стрелках.
     */
    loadConnections({arrows}) {
        this.instance.reset();

        // DEBUG: Детальная проверка видимости с логированием
        const checkVisibility = (el, elementId) => {
            if (!el) return { visible: false, reason: 'element is null' };
            const r = el.getBoundingClientRect();
            const o = 10;
            const corners = [
                { name: 'top-left', x: r.left + o, y: r.top + o },
                { name: 'top-right', x: r.right - o, y: r.top + o },
                { name: 'bottom-left', x: r.left + o, y: r.bottom - o },
                { name: 'bottom-right', x: r.right - o, y: r.bottom - o },
            ];

            const failedCorners = [];
            for (const corner of corners) {
                const at = document.elementFromPoint(corner.x, corner.y);
                const isOk = el.contains(at) || at === el;
                if (!isOk) {
                    failedCorners.push({
                        corner: corner.name,
                        x: corner.x,
                        y: corner.y,
                        foundElement: at ? `${at.tagName}#${at.id || '(no-id)'}.${at.className || '(no-class)'}` : 'null',
                    });
                }
            }

            if (failedCorners.length > 0) {
                return {
                    visible: false,
                    reason: 'corners obscured',
                    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                    failedCorners
                };
            }
            return { visible: true };
        };

        const isVisible = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect(), o = 10;
            return [
                [r.left + o, r.top + o],
                [r.right - o, r.top + o],
                [r.left + o, r.bottom - o],
                [r.right - o, r.bottom - o],
            ].every(([x, y]) => {
                const at = document.elementFromPoint(x, y);
                return el.contains(at) || at === el;
            });
        };

        // DEBUG: Статистика
        let totalConnections = 0;
        let drawnConnections = 0;
        let skippedConnections = [];

        arrows.forEach(({connections, layout}) => {
            connections.forEach(conn => {
                totalConnections++;
                const src = document.getElementById(conn.sourceId);
                const tgt = document.getElementById(conn.targetId);

                // DEBUG: Проверяем причину пропуска
                if (!src || !tgt || !isVisible(src) || !isVisible(tgt)) {
                    const skipInfo = {
                        sourceId: conn.sourceId,
                        targetId: conn.targetId,
                        layout,
                        srcFound: !!src,
                        tgtFound: !!tgt,
                    };
                    if (src) skipInfo.srcVisibility = checkVisibility(src, conn.sourceId);
                    if (tgt) skipInfo.tgtVisibility = checkVisibility(tgt, conn.targetId);
                    skippedConnections.push(skipInfo);
                }

                if (src && tgt && isVisible(src) && isVisible(tgt)) {
                    drawnConnections++;
                    // Если есть сохранённый тип соединения, используем его конфигурацию
                    let config = null;
                    if (conn.connectionType && isValidConnectionType(conn.connectionType)) {
                        config = getConnectionConfig(conn.connectionType);
                        if (conn.color) {
                            config = applyColorToConfig(config, conn.color);
                        }
                    }

                    const connector = this.getConnector(
                        config?.connector || conn.connector || this.defaultConnector,
                        layout
                    );
                    const paintStyle = this.getPaintStyle(
                        config?.paintStyle || conn.paintStyle || this.defaultPaintStyle,
                        layout
                    );
                    const overlays = this.getOverlays(
                        config?.overlays || conn.overlays || this.defaultOverlays,
                        layout
                    );
                    const endpoint = this.getEndpoint(conn.endpoint, layout);
                    const endpointStyle = conn.endpointStyle;
                    const anchors = conn.anchors || this.defaultAnchors;

                    this.instance.connect({
                        source: src,
                        target: tgt,
                        connector,
                        paintStyle,
                        overlays,
                        endpoint,
                        endpointStyle,
                        anchors
                    });
                }
            });
        });

        // DEBUG: Выводим статистику
        if (totalConnections > 0) {
            console.group('🔗 Arrow Debug: loadConnections');
            console.log(`Total: ${totalConnections}, Drawn: ${drawnConnections}, Skipped: ${skippedConnections.length}`);
            if (skippedConnections.length > 0) {
                console.warn('Skipped connections:');
                skippedConnections.forEach((skip, i) => {
                    console.groupCollapsed(`  [${i + 1}] ${skip.sourceId} → ${skip.targetId}`);
                    console.log('Layout:', skip.layout);
                    console.log('Source in DOM:', skip.srcFound);
                    console.log('Target in DOM:', skip.tgtFound);
                    if (skip.srcVisibility) console.log('Source visibility:', skip.srcVisibility);
                    if (skip.tgtVisibility) console.log('Target visibility:', skip.tgtVisibility);
                    console.groupEnd();
                });
            }
            console.groupEnd();
        }
    }

    getLayoutFactor(layout) {
        if (SMALL_LAYOUTS.includes(layout)) return 0.3;
        if (MEDIUM_LAYOUTS.includes(layout)) return 0.75;
        return 1;
    }

    clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    getConnector(origConnector = {}, layout) {
        const connector = this.clone(origConnector);
        const f = this.getLayoutFactor(layout);

        if (connector.options) {
            for (const key in connector.options) {
                if (typeof connector.options[key] === 'number') {
                    connector.options[key] = connector.options[key] * f;
                }
            }
        }
        return connector;
    }

    getPaintStyle(origStyle = {}, layout) {
        const style = {...origStyle};
        const f = this.getLayoutFactor(layout);

        ['strokeWidth', 'outlineWidth'].forEach(prop => {
            if (typeof style[prop] === 'number') {
                style[prop] = style[prop] * f;
            }
        });
        return style;
    }

    getOverlays(origOverlays = [], layout) {
        const f = this.getLayoutFactor(layout);
        return origOverlays.map(ov => {
            const copy = this.clone(ov);
            if (copy.type === 'Arrow' && copy.options) {
                ['width', 'length'].forEach(prop => {
                    if (typeof copy.options[prop] === 'number') {
                        copy.options[prop] = copy.options[prop] * f;
                    }
                });
            }
            return copy;
        });
    }

    getEndpoint(origEndpoint = {type: 'Dot', options: {radius: 4}}, layout) {
        const ep = this.clone(origEndpoint);
        const f = this.getLayoutFactor(layout);

        if (ep.options && typeof ep.options.radius === 'number') {
            ep.options.radius = ep.options.radius * f;
        }
        return ep;
    }
}

const container = document.getElementById('rootContainer')
export const jsPlumbInstance = newInstance({
    container: container,
    connector: {type: "Straight"},
    endpoint: {type: "Dot"},
    paintStyle: {stroke: "#456", strokeWidth: 2},
    endpointStyle: {fill: "#456", radius: 2},
});

export const arrowManager = new ArrowManager(jsPlumbInstance)
