import {dispatch} from "../utils/utils";

export class ArrowManager {
    constructor(jsPlumbInstance) {
        // Инициализация jsPlumb
        this.instance = jsPlumbInstance;
        this.container = document.getElementById('rootContainer')

        this.isCreatingConnection = false;
        this.sourceElementId = null;
        this.removeArrow = false;

        // Событие для установки флага removeArrow
        window.addEventListener('setRemoveArrow', (event) => {
            this.removeArrow = event.detail.remove;
        });

        window.addEventListener('DrawArrows', (e) => {
            // Загрузка существующих соединений
            this.currentArrows = new Set(e.detail.arrows)
            this.loadConnections(e.detail)

            // Обработчик клика по соединению
            this.instance.bind('click', (connection, originalEvent) => {
                if (this.removeArrow) {
                    // Удаляем соединение
                    this.deleteConnection(connection);
                } else {
                    const labelOverlay = connection.getOverlay('label');
                    let currentLabel = labelOverlay ? labelOverlay.getLabel() : '';
                    const newLabel = prompt('Введите лейбл для связи:', currentLabel);

                    if (newLabel === null) {
                        // Пользователь отменил ввод
                        return;
                    } else if (newLabel.trim() === '') {
                        // Удаляем лейбл, если введена пустая строка
                        if (labelOverlay) {
                            connection.removeOverlay('label');
                            this.updateConnectionLabel(connection.sourceId, connection.targetId, '');
                        }
                    } else {
                        // Добавляем или обновляем лейбл
                        if (labelOverlay) {
                            labelOverlay.setLabel(newLabel);
                        } else {
                            connection.addOverlay(['Label', {
                                label: newLabel,
                                location: 0.5,
                                cssClass: 'connection-label',
                                id: 'label'
                            }]);
                        }
                        this.updateConnectionLabel(connection.sourceId, connection.targetId, newLabel);
                    }
                }
            });
        });
    }

    /**
     * Обновляет лейбл соединения в локальном хранилище.
     * @param {string} sourceId - ID элемента-источника.
     * @param {string} targetId - ID элемента-цели.
     * @param {string} newLabel - Новый лейбл.
     */
    updateConnectionLabel(sourceId, targetId, newLabel) {
        let connections = JSON.parse(localStorage.getItem('connections')) || [];
        connections = connections.map(conn => {
            if (conn.source === sourceId && conn.target === targetId) {
                return {...conn, label: newLabel};
            }
            return conn;
        });
        localStorage.setItem('connections', JSON.stringify(connections));
    }

    /**
     * Удаляет соединение между двумя элементами.
     * @param {jsPlumb.Connection} connection - Объект соединения jsPlumb.
     */
    deleteConnection(connection) {
        // Удаляем соединение из jsPlumb
        this.instance.deleteConnection(connection);
        console.log(connection)
        dispatch('RemoveConnectionBlock', {sourceId: connection.sourceId, targetId: connection.targetId})

    }

    /**
     * Начинает процесс создания соединения от заданного элемента.
     * @param {string} sourceElementId - ID элемента-источника.
     */
    startConnectionFromElement(sourceElementId) {
        this.isCreatingConnection = true;
        this.sourceElementId = sourceElementId;
    }

    /**
     * Завершает создание соединения к заданному элементу.
     * @param {string} targetElementId - ID элемента-цели.
     */
    completeConnectionToElement(targetElementId) {
        if (this.isCreatingConnection && this.sourceElementId && targetElementId !== this.sourceElementId) {
            const arrowType = this.currentArrowType || 'Straight';

            // Создаем соединение без лейбла
            const connection = this.instance.connect({
                source: this.sourceElementId,
                target: targetElementId,
                anchor: "AutoDefault",
                connector: arrowType,
                paintStyle: {stroke: '#456', strokeWidth: 2},
                overlays: [
                    ['Arrow', {width: 10, length: 10, location: 1}]
                ]
            });

            // Сохраняем соединение без лейбла
            this.saveConnection(this.sourceElementId, targetElementId, arrowType, '');

            // Сбрасываем состояние
            this.isCreatingConnection = false;
            this.sourceElementId = null;
        }
    }

    /**
     * Сохраняет соединение в локальное хранилище с информацией о типе стрелочки.
     * @param {string} sourceId - ID элемента-источника.
     * @param {string} targetId - ID элемента-цели.
     * @param {string} arrowType - Тип стрелочки.
     * @param {string} label - Лейбл соединения.
     */
    saveConnection(sourceId, targetId, arrowType, label) {
        dispatch('AddConnectionBlock', {sourceId: sourceId, targetId: targetId, arrowType, label})
    }

    /**
     * Загружает и восстанавливает соединения из локального хранилища.
     */
    loadConnections({arrows}) {
        this.instance.reset();

        function isElementFullyVisible(el) {
            if (!el) return false
            const rect = el.getBoundingClientRect();
            const offset = 10; // Смещение для учета border-radius

            return (
                isPointVisible(el, rect.left + offset, rect.top + offset) &&
                isPointVisible(el, rect.right - offset, rect.top + offset) &&
                isPointVisible(el, rect.left + offset, rect.bottom - offset) &&
                isPointVisible(el, rect.right - offset, rect.bottom - offset)
            );
        }

        function isPointVisible(el, x, y) {
            const elementAtPoint = document.elementFromPoint(x, y);
            return el.contains(elementAtPoint) || elementAtPoint === el;
        }

        arrows.forEach(({connections, layout}) => {
            connections.forEach(conn => {
                const t = document.getElementById(conn.targetId)
                const s = document.getElementById(conn.sourceId)

                if (isElementFullyVisible(t) && isElementFullyVisible(s)) {
                    this.instance.connect({
                        source: s,
                        target: t,
                        anchor: "AutoDefault",
                        connector: conn.arrowType || 'Straight',
                        paintStyle: this.getPaintStyle(layout),
                        overlays: [
                            this.getArrowStyle(layout),
                            ...(conn.label ? [['Label', {
                                label: conn.label,
                                location: 0.5,
                                cssClass: 'connection-label',
                                id: 'label'
                            }]] : [])
                        ]
                    });
                }
            });
        })
    }

    getPaintStyle(layout) {
        if (['xxs-sq', "xxxs-w", "xxs-w", "xxxs-h", "xxs-h"].includes(layout)) {
            return {
                stroke: '#456',
                strokeWidth: 1,
                outlineStroke: 'transparent',
                outlineWidth: 10,
            }
        }
        return {
            stroke: '#516077',
            strokeWidth: 2,
            outlineStroke: 'transparent',
            outlineWidth: 10,
        }
    }

    getArrowStyle(layout) {
        if (['xxs-sq', "xxxs-w", "xxs-w", "xxxs-h", "xxs-h"].includes(layout)) {
            return ['Arrow', {width: 5, length: 5, location: 1}]
        }
        return ['Arrow', {width: 10, length: 10, location: 1}]
    }
}
