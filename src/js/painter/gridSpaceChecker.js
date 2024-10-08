class GridSpaceChecker {
    /**
     * Проверяет наличие свободного места в блоке.
     * @param {Object} block - Объект блока
     * @return {number} Оставшееся свободное место в блоке.
     */
    checkBlockSpace(block) {
        const classList = block.classList
        const listChildrenClasses = Array.prototype.concat(Object.values(block.children_position), [Array.from(block.content_classList)])
        const gridSize = this._extractGridSize(classList);
        let totalArea = gridSize.rows * gridSize.columns;

        listChildrenClasses.forEach(childClasses => {
            const cellArea = this._calculateChildArea(childClasses, gridSize);
            totalArea -= cellArea;
        });
        console.log(totalArea)
        return totalArea;
    }

    /**
     * Рассчитывает размер сетки основываясь на классах.
     * @param {string[]} classList - Список классов блока.
     * @return {Object} Размеры сетки.
     */
    _extractGridSize(classList) {
        const gridSize = {rows: 0, columns: 0};

        classList.forEach(className => {
            if (className.startsWith('grid-template-')) {
                const [dimension, value] = GridSpaceChecker._calculateGridDimensions(className);
                gridSize[dimension] = value;
            }
        });

        return gridSize;
    }

    /**
     * Рассчитывает площадь дочернего элемента.
     * @param {string[]} childClasses - Классы дочернего элемента.
     * @param {Object} gridSize - Размеры сетки.
     * @return {number} Площадь дочернего элемента.
     */
    _calculateChildArea(childClasses, gridSize) {
        const cellDimensions = childClasses.map(className => {
            const match = className.match(/grid-(row|column)/);
            return match ? GridSpaceChecker._calculateCellDimension(gridSize, match) : 0;
        }).filter(Boolean);
        return cellDimensions.reduce((acc, val) => acc * val, 1);
    }

    /**
     * Рассчитывает размерность ячейки.
     * @param {Object} gridSize - Размеры сетки.
     * @param {any} match - Результат работы метода match с регулярным выражением.
     * @return {number|null} Размер ячейки.
     */
    static _calculateCellDimension(gridSize, match) {
        const matches = match.input.match(/\d+|M|span/g);
        if (!matches) return null;

        switch (matches.length) {
            case 1:
                return 1;
            case 2:
                return matches[0] === 'span' ? parseInt(matches[1], 10) : parseInt(matches[1], 10) - parseInt(matches[0], 10);
            case 3:
                const dimensionSize = gridSize[`${match[1]}s`];
                return Math.abs(dimensionSize - ((parseInt(matches[0], 10) - 1) + (parseInt(matches[2], 10) - 1)));
            default:
                return null;
        }
    }

    /**
     * Рассчитывает размеры сетки на основе названия класса.
     * @param {string} className - Название класса.
     * @return {Array} Размерность и значение размера сетки.
     */
    static _calculateGridDimensions(className) {
        const match = className.match(/grid-template-(rows|columns)_([^ ]+)/);
        if (!match) return [0, 0];

        const dimension = match[1];
        const value = match[2];
        const repeatMatch = value.match(/repeat(\d+)-1fr/);

        if (repeatMatch) {
            return [dimension, parseInt(repeatMatch[1], 10)];
        }

        const count = value.replace('auto', '1fr').split(/P|px|fr/).filter(Boolean).length;
        return [dimension, count];
    }
}

const gridSpaceChecker = new GridSpaceChecker()

export default gridSpaceChecker
