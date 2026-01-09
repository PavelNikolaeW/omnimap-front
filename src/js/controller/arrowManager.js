import {dispatch} from "../utils/utils";
import {EVENT_CONNECTION_CLICK, log, newInstance} from "@jsplumb/browser-ui";
import {customPrompt} from "../utils/custom-dialog";
import {
    CONNECTION_TYPES,
    getConnectionConfig,
    isValidConnectionType,
    applyColorToConfig
} from "./connectionTypes";
import {connectionEditManager} from "./connectionEditManager";


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
     * @param {string} position - Позиция anchor (12 позиций: top-left, top-center, etc.)
     * @returns {Array} - Массив координат для jsPlumb [x, y, dx, dy]
     */
    anchorPositionToJsPlumb(position) {
        const anchors = {
            // Верхняя сторона
            'top-left': [0.25, 0, 0, -1],
            'top-center': [0.5, 0, 0, -1],
            'top': [0.5, 0, 0, -1],  // alias для совместимости
            'top-right': [0.75, 0, 0, -1],
            // Правая сторона
            'right-top': [1, 0.25, 1, 0],
            'right-center': [1, 0.5, 1, 0],
            'right': [1, 0.5, 1, 0],  // alias
            'right-bottom': [1, 0.75, 1, 0],
            // Нижняя сторона
            'bottom-right': [0.75, 1, 0, 1],
            'bottom-center': [0.5, 1, 0, 1],
            'bottom': [0.5, 1, 0, 1],  // alias
            'bottom-left': [0.25, 1, 0, 1],
            // Левая сторона
            'left-bottom': [0, 0.75, -1, 0],
            'left-center': [0, 0.5, -1, 0],
            'left': [0, 0.5, -1, 0],  // alias
            'left-top': [0, 0.25, -1, 0]
        };
        return anchors[position] || [0.5, 0.5, 0, 0];
    }

    /**
     * Унифицированный метод создания соединения с опциональными anchor points
     * @param {string} sourceId - ID элемента-источника
     * @param {string} targetId - ID элемента-цели
     * @param {string} connectionType - Тип соединения (из CONNECTION_TYPES)
     * @param {string|null} sourceAnchor - Позиция anchor на источнике или null для auto ("Continuous")
     * @param {string|null} targetAnchor - Позиция anchor на цели или null для auto ("Continuous")
     * @param {string|null} color - Цвет соединения (опционально)
     */
    createConnection(sourceId, targetId, connectionType = CONNECTION_TYPES.DEFAULT, sourceAnchor = null, targetAnchor = null, color = null) {
        if (!sourceId || !targetId) return;

        // Разрешить self-loop только для StateMachine типа
        if (sourceId === targetId && connectionType !== CONNECTION_TYPES.STATEMACHINE) {
            return;
        }

        const sourceEl = document.getElementById(sourceId);
        const targetEl = document.getElementById(targetId);
        if (!sourceEl || !targetEl) return;

        const layout = sourceEl?.getAttribute("data-layout");

        // Получаем конфигурацию по типу соединения
        let config = getConnectionConfig(connectionType);

        // Применяем цвет если указан
        if (color) {
            config = applyColorToConfig(config, color);
        }

        // Определяем anchors: конкретная позиция или "Continuous" для auto
        const anchors = [
            sourceAnchor ? this.anchorPositionToJsPlumb(sourceAnchor) : "Continuous",
            targetAnchor ? this.anchorPositionToJsPlumb(targetAnchor) : "Continuous"
        ];

        const connector = this.getConnector(config.connector || this.defaultConnector, layout);
        const paintStyle = this.getPaintStyle(config.paintStyle || this.defaultPaintStyle, layout);
        const overlays = this.getOverlays(config.overlays || this.defaultOverlays, layout);
        const endpoint = this.getEndpoint({type: 'Dot', options: {radius: 4}}, layout);
        const endpointStyle = {fill: paintStyle.stroke || "#456", outlineWidth: 0};

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
            color,
            sourceAnchor,  // Сохраняем имя позиции для восстановления
            targetAnchor
        });
    }

    /**
     * Создает соединение с указанными anchor points (делегирует createConnection)
     * @param {string} sourceId - ID элемента-источника
     * @param {string} targetId - ID элемента-цели
     * @param {string} sourceAnchor - Позиция anchor на источнике
     * @param {string} targetAnchor - Позиция anchor на цели
     * @param {string} connectionType - Тип соединения
     */
    createConnectionWithAnchors(sourceId, targetId, sourceAnchor, targetAnchor, connectionType = CONNECTION_TYPES.DEFAULT) {
        this.createConnection(sourceId, targetId, connectionType, sourceAnchor, targetAnchor, null);
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
                // Показать панель редактирования соединения
                connectionEditManager.show(info);
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
     * Завершает создание соединения к целевому элементу (делегирует createConnection)
     * Использует auto-anchors ("Continuous") для автоматического позиционирования
     * @param {string} sourceId - ID элемента-источника.
     * @param {string} targetId - ID элемента-цели.
     * @param {string} connectionType - Тип соединения (из CONNECTION_TYPES).
     * @param {string} color - Цвет соединения (опционально).
     * @param {string|null} sourceAnchor - Опциональная позиция anchor на источнике
     * @param {string|null} targetAnchor - Опциональная позиция anchor на цели
     */
    completeConnectionToElement(sourceId, targetId, connectionType = CONNECTION_TYPES.DEFAULT, color = null, sourceAnchor = null, targetAnchor = null) {
        this.createConnection(sourceId, targetId, connectionType, sourceAnchor, targetAnchor, color);
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

        // Проверка видимости учитывает overflow родителей.
        // Элемент должен быть видим в viewport И внутри всех родительских
        // контейнеров со скроллом (overflow: auto/scroll/hidden).
        const isVisible = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            // Элемент должен иметь размеры > 0
            if (r.width <= 0 || r.height <= 0) return false;

            // Проверяем видимость внутри всех родителей с overflow
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
                const style = getComputedStyle(parent);
                const overflow = style.overflow + style.overflowX + style.overflowY;
                // Если родитель имеет overflow (не visible), проверяем bounds
                if (overflow.includes('auto') || overflow.includes('scroll') || overflow.includes('hidden')) {
                    const parentRect = parent.getBoundingClientRect();
                    // Элемент должен быть хотя бы частично видим внутри родителя
                    if (r.bottom <= parentRect.top || r.top >= parentRect.bottom ||
                        r.right <= parentRect.left || r.left >= parentRect.right) {
                        return false;
                    }
                }
                parent = parent.parentElement;
            }

            // Элемент должен быть хотя бы частично в viewport
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            return r.bottom > 0 && r.top < viewportHeight && r.right > 0 && r.left < viewportWidth;
        };

        arrows.forEach(({connections, layout}) => {
            connections.forEach(conn => {
                const src = document.getElementById(conn.sourceId);
                const tgt = document.getElementById(conn.targetId);

                if (src && tgt && isVisible(src) && isVisible(tgt)) {
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
