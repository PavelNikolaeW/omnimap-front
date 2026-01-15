/**
 * Утилиты для работы с CSS Grid классами диаграмм
 */

/**
 * Парсит размер grid из массива CSS классов
 *
 * Формат классов:
 * - grid-template-columns_1fr__1fr__1fr__ (3 колонки)
 * - grid-template-rows_auto__1fr__1fr__1fr__ (auto для контента + 3 строки блоков)
 *
 * @param {Array<string>} gridClasses - массив CSS классов grid
 * @param {Object} defaults - значения по умолчанию { cols: 1, rows: 1 }
 * @returns {{ cols: number, rows: number }} - размер grid
 */
export function parseGridSize(gridClasses, defaults = { cols: 1, rows: 1 }) {
    if (!gridClasses || !Array.isArray(gridClasses)) {
        return { cols: defaults.cols, rows: defaults.rows };
    }

    const colsClass = gridClasses.find(cls => cls?.startsWith('grid-template-columns_'));
    const rowsClass = gridClasses.find(cls => cls?.startsWith('grid-template-rows_'));

    // Считаем количество 1fr (columns не имеют auto, rows имеют auto для контента)
    const cols = colsClass ? (colsClass.match(/1fr/g) || []).length : defaults.cols;
    // Для rows считаем только 1fr - это строки для блоков (auto - content row)
    const rows = rowsClass ? (rowsClass.match(/1fr/g) || []).length : defaults.rows;

    return {
        cols: Math.max(1, cols),
        rows: Math.max(1, rows)
    };
}
