import { SIZE_THRESHOLDS, ASPECT_RATIO, SHAPES, SIZE_ORDER } from '../painter/config/sizeConfig.js';

export function dispatch(name, data = {}) {
    console.log(`Dispatching event ${name}`)
    const event = new CustomEvent(name, {
        detail: data
    });
    window.dispatchEvent(event);
}

let WINDOW_WIDTH = window.innerWidth
let WINDOW_HEIGHT = window.innerHeight
window.addEventListener('resize', () => {
    WINDOW_WIDTH = window.innerWidth
    WINDOW_HEIGHT = window.innerHeight
});

/**
 * Определить размерный класс элемента
 *
 * @param {HTMLElement|null} element - DOM элемент (если null, используется size)
 * @param {{width: number, height: number}} size - размеры (если element не передан)
 * @param {{width: number, height: number}} screen - размеры экрана
 * @returns {{width: number, height: number, layout: string}} размеры и layout класс
 */
export function getElementSizeClass(element, size, screen = { width: WINDOW_WIDTH, height: WINDOW_HEIGHT }) {
    let width, height;
    if (element) {
        width = element.offsetWidth;
        height = element.offsetHeight;
    } else {
        width = size.width;
        height = size.height;
    }

    const screenArea = screen.width * screen.height;
    const elementArea = width * height;
    const areaRatio = elementArea / screenArea;

    // Определяем базовый размер по порогам из конфигурации
    const baseSize = calculateBaseSize(areaRatio);

    // Определяем форму по соотношению сторон
    const shapeSuffix = calculateShape(width / height);

    return { width, height, layout: baseSize + shapeSuffix };
}

/**
 * Определить базовый размер по отношению площади
 * @param {number} areaRatio - отношение площади элемента к экрану
 * @returns {string} размер (xxl, xl, l, m, s, xs, xxs, xxxs)
 */
function calculateBaseSize(areaRatio) {
    for (const size of SIZE_ORDER) {
        const threshold = SIZE_THRESHOLDS[size];
        if (threshold !== undefined && areaRatio > threshold) {
            return size;
        }
    }
    return 'xxxs';
}

/**
 * Определить форму элемента по соотношению сторон
 * @param {number} aspectRatio - width / height
 * @returns {string} суффикс формы (-sq, -w, -h)
 */
function calculateShape(aspectRatio) {
    if (aspectRatio >= ASPECT_RATIO.SQUARE_MIN && aspectRatio <= ASPECT_RATIO.SQUARE_MAX) {
        return `-${SHAPES.SQUARE}`;
    }
    if (aspectRatio > ASPECT_RATIO.SQUARE_MAX) {
        return `-${SHAPES.WIDE}`;
    }
    return `-${SHAPES.TALL}`;
}


// Общий объект для накопления времени работы всех функций
let performanceReport = {};

// Декоратор для автоматического замера времени выполнения функции
export function measurePerformance(fnName, fn) {
    return function (...args) {
        const startTime = performance.now();
        const result = fn.apply(this, args);  // Выполняем функцию
        const endTime = performance.now();

        // Сохраняем время выполнения функции в отчет
        if (!performanceReport[fnName]) {
            performanceReport[fnName] = 0;
        }
        performanceReport[fnName] += (endTime - startTime);

        return result;  // Возвращаем результат вызова оригинальной функции
    };
}

export function printTimer() {
    console.log(performanceReport)
}

export function resetTimer() {
    performanceReport = {}
}

export function checkClass(el, clas) {
    while (el.parentNode) {
        if (el.classList.contains(clas)) {
            return true
        }
        el = el.parentNode
    }
}
