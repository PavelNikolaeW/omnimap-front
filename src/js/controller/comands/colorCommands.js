import {dispatch} from "../../utils/utils";
import {log} from "@jsplumb/browser-ui";

function setColor(val, ctx) {
    let id = ctx.blockElement?.id
    if (ctx.blockLinkElement) id = ctx.blockLinkElement.getAttribute('blocklink')
    if (id) dispatch('SetHueBlock', {blockId: id, hue: val})
    setTimeout(() => {
        ctx.setCmd('openBlock')
    }, 300)
}

const allDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Конфигурация базовых цветов для цифр 1–9.
// hue – оттенок, baseS и baseL – базовые значения насыщённости и яркости.
const baseColorConfigs = {
    '1': {hue: 0, baseS: 65, baseL: 65},
    '2': {hue: 30, baseS: 90, baseL: 70},
    '3': {hue: 60, baseS: 90, baseL: 70},
    '4': {hue: 110, baseS: 90, baseL: 70},
    '5': {hue: 170, baseS: 90, baseL: 70},
    '6': {hue: 200, baseS: 90, baseL: 70},
    '7': {hue: 250, baseS: 90, baseL: 70},
    '8': {hue: 280, baseS: 90, baseL: 70},
    '9': {hue: 320, baseS: 90, baseL: 70},
};

// Поправки для вариантов – 4 варианта для каждого базового цвета.
// Они применяются по порядку к базовым значениям насыщённости и яркости.
const variantAdjustments = [
    {deltaS: 0, deltaL: 0},
    {deltaS: 0, deltaL: -9},
    {deltaS: 0, deltaL: -18},
    {deltaS: 0, deltaL: -27},
    {deltaS: 0, deltaL: -36},
    {deltaS: 0, deltaL: -45},
    {deltaS: -10, deltaL: -54},
    {deltaS: -20, deltaL: -63},
    {deltaS: -40, deltaL: -72},
];

// Ограничивает value между min и max.
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Функция возвращает массив вариантов для базового ключа: все цифры, отличные от baseKey,
// у которых чётность совпадает с чётностью baseKey.
function getSameParityVariantKeys(baseKey) {
    return allDigits.filter(key => key !== baseKey);
}

// Утилита для создания команды.
function createCommand(id, defaultHotkey, defaultValue) {
    return {
        id,
        defaultHotkey,
        mode: ['normal'],
        eventType: 'keyup',
        defaultValue,
        execute(ctx) {
            setColor(this.defaultValue, ctx);
        }
    };
}

export const colorCommands = [];

// Генерируем команды для базовых цветов 1–9.
// Для каждого базового цвета создаются только пары вида "base+variant", где base и variant имеют одинаковую чётность.
Object.keys(baseColorConfigs).forEach(baseKey => {
    const config = baseColorConfigs[baseKey];
    const variantKeys = getSameParityVariantKeys(baseKey);
    variantKeys.shift()
    // Сортируем по числовому значению для стабильного порядка (например, для "1" получим: ["3", "5", "7", "9"])
    variantKeys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    variantKeys.push('0')
    variantKeys.forEach((vKey, index) => {
        const adjustment = variantAdjustments[index] || {deltaS: 0, deltaL: 0};
        const newS = clamp(config.baseS + adjustment.deltaS, 0, 100);
        const newL = clamp(config.baseL + adjustment.deltaL, 0, 100);
        colorCommands.push(createCommand(
            `color${baseKey}.${vKey}`,
            `${baseKey}+${vKey}`,
            [config.hue, newS, newL, 0]
        ));
    });
});

// Специальная команда для цифры 0 (например, сброс цвета).
colorCommands.push(createCommand(
    'colorDefault',
    '0',
    'default_color'
));

colorCommands.push(createCommand(
    'colorReset',
    '-',
    ''
))
colorCommands.push(createCommand(
    'colorWhite',
    'c+w',
    'white'
))
colorCommands.push(createCommand(
    'colorDark',
    'c+d',
    'dark'
))

