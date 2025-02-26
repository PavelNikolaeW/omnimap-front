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

export function validURL(str) {
    try {
        new URL(str);
        return true;
    } catch (err) {
        return false;
    }
}

export function truncate(str, maxLen) {
    if (str.length <= maxLen) return str
    return str.slice(0, maxLen) + "."
}

export function isValidUUID(uuid) {
    // Регулярное выражение для проверки валидности UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

export function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed"; // Избегаем прокрутки страницы
        textarea.style.opacity = "0"; // Делаем невидимым
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");

        } catch (err) {
            console.error("Ошибка при копировании: ", err);
        }
        document.body.removeChild(textarea);
    }
}

export async function getClipboardText() {
    console.log('test')
    if (navigator.clipboard && window.isSecureContext) {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                console.log("Текст из буфера обмена:", text);
                return text;
            }
        } catch (err) {
            console.warn("Ошибка при получении текста через Clipboard API:", err);
        }
    }

    const textarea = document.createElement("textarea");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();

    try {
        document.execCommand("paste");
        const text = textarea.value;
        document.body.removeChild(textarea);

        if (text) {
            console.log("Текст из буфера обмена (устаревший способ):", text);
            return text;
        }
    } catch (err) {
        console.warn("Ошибка при вставке через execCommand:", err);
        document.body.removeChild(textarea);
    }

    const userText = prompt("Вставьте текст сюда (CTRL+V):", "");
    if (userText) {
        console.log("Текст, введённый пользователем:", userText);
        return userText;
    }

    console.error("Не удалось получить текст из буфера обмена.");
    return null;
}

export function hexToHSL(hex) {
    // Удаляем символ '#' если он присутствует
    hex = hex.replace('#', '');

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // нет оттенка, насыщенность = 0
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    const lPercent = Math.round(l * 100);

    return `hsl(${h}, ${s}%, ${lPercent}%)`;
}

export default {
    findLCM,
    findNearestRoots,
    sleep,
    validURL,
    truncate,
    isValidUUID,
    copyToClipboard,
    getClipboardText,
    hexToHSL
}





