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
    // console.log( {width: WINDOW_WIDTH, height: WINDOW_HEIGHT})
});
export function getElementSizeClass(element, size, screen = {width: WINDOW_WIDTH, height: WINDOW_HEIGHT}) {
    let width, height;
    if (element) {
        width = element.offsetWidth;
        height = element.offsetHeight;
    } else {
        width = size.width;
        height = size.height;
    }

    // Рассчитываем площадь экрана и элемента
    const screenArea = screen.width * screen.height;
    const elementArea = width * height;
    const areaRatio = elementArea / screenArea;

    let baseSize;
    // Определяем базовый размер по отношению площади.
    // Пороговые значения можно корректировать под конкретный дизайн.
    if (areaRatio > 0.45) {
        baseSize = "xxl";
    } else if (areaRatio > 0.225) {
        baseSize = "xl";
    } else if (areaRatio > 0.1125) {
        baseSize = "l";
    } else if (areaRatio > 0.059) {
        baseSize = "m";
    } else if (areaRatio > 0.024){
        baseSize = "s";
    } else if (areaRatio > 0.012) {
        baseSize = 'xs'
    } else {
        baseSize = 'xxs'
    }

    // Определяем суффикс в зависимости от соотношения сторон
    const aspectRatio = width / height;
    let shapeSuffix;
    if (aspectRatio >= 0.7 && aspectRatio <= 1.45) {
        shapeSuffix = "-sq";
    } else if (aspectRatio > 1.45) {
        shapeSuffix = "-w";
    } else {
        shapeSuffix = "-h";
    }

    return {width, height, layout: baseSize + shapeSuffix};
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
