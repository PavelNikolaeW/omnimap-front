import {dispatch} from "../utils/utils";
import {EVENT_CONNECTION_CLICK, log, newInstance} from "@jsplumb/browser-ui";


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
                this.handleConnectionLabel(info);
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
        const newLabel = prompt("Введите лейбл для связи:", currentLabel);

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
        dispatch('AddConnectionBlock', {sourceId, targetId, arrowType: this.currnetConnector, label: newLabel})
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
     */
    completeConnectionToElement(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return;

        const sourceEl = document.getElementById(sourceId);
        const layout = sourceEl.getAttribute("data-layout");

        const connector = this.getConnector(this.defaultConnector, layout);
        const paintStyle = this.getPaintStyle(this.defaultPaintStyle, layout);
        const overlays = this.getOverlays(this.defaultOverlays, layout);
        const endpoint = this.getEndpoint({type: 'Dot', options: {radius: 4}}, layout);
        const endpointStyle = {fill: "#456", outlineWidth: 0};

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
            this.defaultConnector,
            this.defaultPaintStyle,
            this.defaultOverlays,
            this.defaultAnchors,
            endpoint,
            endpointStyle
        );
    }

    /**
     * Сохраняет соединение с полной конфигурацией.
     * @param {string} sourceId
     * @param {string} targetId
     * @param {Object} connector
     * @param {string} label
     * @param {Object} paintStyle
     * @param {Array} overlays
     * @param {Array} anchors
     */
    saveConnection(sourceId, targetId, connector, paintStyle, overlays, anchors, endpoint, endpointStyle) {
        dispatch("AddConnectionBlock", {
            sourceId,
            targetId,
            connector,
            paintStyle,
            overlays,
            anchors,
            endpoint,
            endpointStyle
        });
    }

    /**
     * Загружает и восстанавливает соединения (например, после перерисовки или при инициализации).
     * @param {Object} param0 - Объект с информацией о стрелках.
     */
    loadConnections({arrows}) {
        this.instance.reset();

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

        arrows.forEach(({connections, layout}) => {
            connections.forEach(conn => {
                const src = document.getElementById(conn.sourceId);
                const tgt = document.getElementById(conn.targetId);
                if (!src || !tgt) return;

                const connector = this.getConnector(conn.connector, layout);
                const paintStyle = this.getPaintStyle(conn.paintStyle, layout);
                const overlays = this.getOverlays(conn.overlays, layout);
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
            });
        });
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
