/**
 * Находит наибольший общий делитель (НОД) для двух чисел.
 * Используется алгоритм Евклида.
 * @param {number} a - Первое число.
 * @param {number} b - Второе число.
 * @returns {number} НОД для a и b.
 */
function findGCD(a, b) {
    while (b !== 0) {
        let temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

/**
 * Находит наименьшее общее кратное (НОК) для двух чисел.
 * @param {number} a - Первое число.
 * @param {number} b - Второе число.
 * @returns {number} НОК для a и b.
 */
export function findLCM(a, b) {
    return (a * b) / findGCD(a, b);
}

/**
 * Находит ближайшие корни заданного числа и возвращает найденные нижний и верхний корни.
 * @param {number} number - Число, для которого ищутся ближайшие корни.
 * @returns {Array} Массив, два его ближайших корня.
 */
export function findNearestRoots(number) {
    const root = Math.sqrt(number); // Вычисляем корень числа
    if (Math.floor(root) === root) { // Проверяем, является ли корень целым числом
        return [root, root];
    } else {
        return [Math.floor(root), Math.ceil(root)]; // Находим нижний корень и верхний корень
    }
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    findLCM,
    findNearestRoots,
    sleep,
}





