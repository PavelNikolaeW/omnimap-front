import {dispatch} from "../utils/utils";
import {EVENT_CONNECTION_CLICK, log} from "@jsplumb/browser-ui";

export class ArrowManager {
    constructor(jsPlumbInstance) {
        // todo сделать выбор типа соединения
        // Инициализация jsPlumb
        this.instance = jsPlumbInstance;
        this.container = document.getElementById('rootContainer');

        // Флаги для управления состоянием
        this.isCreatingConnection = false;
        this.sourceElementId = null;
        this.removeArrow = false;
        this.currentArrows = new Set();
        this.currentArrowType = "Straight"; // можно расширить для поддержки разных типов стрелок
        // this.currnetConnector = {type: this.currentArrowType}
        this.currnetConnector = {
            type: "Flowchart",
            options: {
                stub: 50,          // отступ от элемента
                alwaysRespectStubs: true,
                cornerRadius: 5    // сглаживает углы
            }
        }


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
            this.removeArrow = event.detail.remove;
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
     * Инициирует процесс создания соединения, запоминая ID источника.
     * @param {string} sourceElementId - ID элемента-источника.
     */
    startConnectionFromElement(sourceElementId) {
        this.isCreatingConnection = true;
        this.sourceElementId = sourceElementId;
    }

    /**
     * Завершает создание соединения к целевому элементу.
     * @param {string} targetElementId - ID элемента-цели.
     */
    completeConnectionToElement(targetElementId) {
        if (
            this.isCreatingConnection &&
            this.sourceElementId &&
            targetElementId !== this.sourceElementId
        ) {
            const connection = this.instance.connect({
                source: this.sourceElementId,
                target: targetElementId,
                anchors: ["AutoDefault", "AutoDefault"],
                connector: this.currnetConnector,
                paintStyle: {stroke: "#456", strokeWidth: 2},
                overlays: [
                    {
                        type: "Arrow",
                        options: {
                            width: 10,
                            length: 10,
                            location: 1,
                        },
                    },
                ],
            });

            this.saveConnection(this.sourceElementId, targetElementId, this.currnetConnector, "");
            this.isCreatingConnection = false;
            this.sourceElementId = null;
        }
    }

    /**
     * Сохраняет соединение (диспатчит событие для дальнейшей обработки).
     * @param {string} sourceId - ID источника.
     * @param {string} targetId - ID цели.
     * @param {string} connector - Тип соединителя.
     * @param {string} label - Лейбл соединения.
     */
    saveConnection(sourceId, targetId, connector, label) {
        dispatch("AddConnectionBlock", {sourceId, targetId, connector, label});
    }

    /**
     * Загружает и восстанавливает соединения (например, после перерисовки или при инициализации).
     * @param {Object} param0 - Объект с информацией о стрелках.
     */
    loadConnections({arrows}) {
        // Сброс всех существующих соединений
        this.instance.reset();

        // Функции проверки видимости элементов
        const isElementFullyVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const offset = 10; // смещение для учета border-radius
            return (
                isPointVisible(el, rect.left + offset, rect.top + offset) &&
                isPointVisible(el, rect.right - offset, rect.top + offset) &&
                isPointVisible(el, rect.left + offset, rect.bottom - offset) &&
                isPointVisible(el, rect.right - offset, rect.bottom - offset)
            );
        };

        const isPointVisible = (el, x, y) => {
            const elementAtPoint = document.elementFromPoint(x, y);
            return el.contains(elementAtPoint) || elementAtPoint === el;
        };

        // Восстанавливаем каждое соединение
        arrows.forEach(({connections, layout}) => {
            connections.forEach(conn => {
                const sourceEl = document.getElementById(conn.sourceId);
                const targetEl = document.getElementById(conn.targetId);

                if (isElementFullyVisible(sourceEl) && isElementFullyVisible(targetEl)) {
                    const overlays = [
                        {
                            type: "Arrow",
                            options: {
                                width: 10,
                                length: 10,
                                location: 1,
                            },
                        },
                    ];

                    if (conn.label) {
                        overlays.push({
                            type: "Label",
                            options: {
                                label: conn.label,
                                location: 0.5,
                                cssClass: "connection-label",
                                id: "label",
                            },
                        });
                    }
                    let connector = this.currnetConnector
                    if (conn.connector) {
                        connector = conn.connector
                    }


                    this.instance.connect({
                        source: sourceEl,
                        target: targetEl,
                        anchors: ["Continuous", "Continuous"],
                        connector: connector,
                        // connector: {
                        //     type: "Flowchart",
                        //     options: {
                        //         stub: 50,          // отступ от элемента
                        //         alwaysRespectStubs: true,
                        //         cornerRadius: 5    // сглаживает углы
                        //     }
                        // },
                        paintStyle: this.getPaintStyle(layout),
                        overlays,
                    });
                }
            });
        });
    }

    /**
     * Возвращает стиль отрисовки соединения в зависимости от layout.
     * @param {string} layout - Идентификатор типа layout.
     */
    getPaintStyle(layout) {
        const thinLayouts = ["xxs-sq", "xxxs-w", "xxs-w", "xxxs-h", "xxs-h"];
        if (thinLayouts.includes(layout)) {
            return {
                stroke: "#456",
                strokeWidth: 1,
                outlineStroke: "transparent",
                outlineWidth: 10,
            };
        }
        return {
            stroke: "#516077",
            strokeWidth: 2,
            outlineStroke: "transparent",
            outlineWidth: 10,
        };
    }

    /**
     * Возвращает конфигурацию для оверлея со стрелкой в зависимости от layout.
     * @param {string} layout - Идентификатор типа layout.
     */
    getArrowStyle(layout) {
        const thinLayouts = ["xxs-sq", "xxxs-w", "xxs-w", "xxxs-h", "xxs-h"];
        if (thinLayouts.includes(layout)) {
            return {
                type: "Arrow",
                options: {width: 5, length: 5, location: 1},
            };
        }
        return {
            type: "Arrow",
            options: {width: 10, length: 10, location: 1},
        };
    }
}
