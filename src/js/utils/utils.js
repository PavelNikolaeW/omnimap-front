export function dispatch(name, data = {}) {
    console.log(`Dispatching event ${name}`)
    const event = new CustomEvent(name, {
        detail: data
    });
    window.dispatchEvent(event);
}

export function getElementSizeClass(element, size) {
    let width, height

    if (element) {
        width = element.offsetWidth
        height = element.offsetHeight
    } else {
        width = size.width
        height = size.height
    }

    const aspectRatio = Math.abs(width) / Math.abs(height);
    let layout = 'unknown'

    if (aspectRatio >= 0.8 && aspectRatio <= 1.3) { // квадраты
        if (width <= 100) layout = "xxs-sq";
        else if (width <= 200) layout = "xs-sq";
        else if (width <= 300) layout = "s-sq";
        else if (width <= 400) layout = "m-sq";
        else if (width <= 500) layout = "l-sq";
        else if (width <= 600) layout = "xl-sq";
        else layout = "xxl-sq";
    }
    if (aspectRatio > 1.3) { // широкие элементы
        if (height <= 60) layout = "xxxs-w";
        else if (height <= 100) layout = "xxs-w";
        else if (height <= 200) layout = "xs-w";
        else if (height <= 300) layout = "s-w";
        else if (height <= 400) layout = "m-w";
        else if (height <= 500) layout = "l-w";
        else if (height <= 600) layout = "xl-w";
        else layout = "xxl-w";
    }
    if (aspectRatio < 0.8) { // высокие элементы
        if (width <= 40) layout = "xxxs-h";
        else if (width <= 100) layout = "xxs-h";
        else if (width <= 200) layout = "xs-h";
        else if (width <= 300) layout = "s-h";
        else if (width <= 400) layout = "m-h";
        else if (width <= 500) layout = "l-h";
        else if (width <= 600) layout = "xl-h";
        else layout = "xxl-h";
    }
        // console.log(width, height, layout, size)
    return {width, height, layout}
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
