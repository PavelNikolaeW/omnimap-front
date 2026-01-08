/**
 * Gap Calculation Configuration
 *
 * Конфигурация для расчёта gap (отступов) между дочерними блоками.
 *
 * Формула: gapMax - (gapMax - gapMin) * (n / (n + constant))
 *
 * - При n=0: возвращает gapMax
 * - При n→∞: приближается к gapMin
 * - Constant определяет скорость уменьшения gap
 *   - Больше constant = медленнее уменьшается gap
 *   - Меньше constant = быстрее уменьшается gap
 */

/**
 * Константа для формулы расчёта gap
 *
 * Примеры значений gap при gapMax=10, gapMin=2:
 * - 1 элемент:  constant=10 → gap=9,  constant=5 → gap=8
 * - 5 элементов: constant=10 → gap=7, constant=5 → gap=6
 * - 10 элементов: constant=10 → gap=6, constant=5 → gap=5
 * - 20 элементов: constant=10 → gap=5, constant=5 → gap=4
 * - 50 элементов: constant=10 → gap=4, constant=5 → gap=3
 */
export const GAP_CONSTANT = 10;

/**
 * Минимальный gap между блоками (в пикселях)
 */
export const GAP_MIN = 2;

/**
 * Рассчитать gap на основе количества элементов
 *
 * @param {number} numElements - количество дочерних элементов
 * @param {number} gapMax - максимальный gap (из styleConfig для размера)
 * @param {number} [gapMin=GAP_MIN] - минимальный gap
 * @returns {number} рассчитанный gap в пикселях
 *
 * @example
 * // Для блока с 5 детьми и максимальным gap 10px
 * calculateGap(5, 10) // → 7
 */
export function calculateGap(numElements, gapMax, gapMin = GAP_MIN) {
    return Math.floor(
        gapMax - (gapMax - gapMin) * (numElements / (numElements + GAP_CONSTANT))
    );
}
