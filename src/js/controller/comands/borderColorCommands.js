import {dispatch} from "../../utils/utils";

const BORDER_COLORS = {
    1: '#E53E3E', // Красный
    2: '#DD6B20', // Оранжевый
    3: '#D69E2E', // Жёлтый
    4: '#38A169', // Зелёный
    5: '#0BC5EA', // Бирюзовый
    6: '#3182CE', // Синий
    7: '#805AD5', // Фиолетовый
    8: '#D53F8C', // Розовый
    9: '#1A202C', // Тёмный
};

const COLOR_NAMES = {
    1: 'красный', 2: 'оранжевый', 3: 'жёлтый', 4: 'зелёный',
    5: 'бирюзовый', 6: 'синий', 7: 'фиолетовый', 8: 'розовый', 9: 'тёмный',
};

function setBorderColor(val, ctx) {
    // Мульти-выделение
    if (ctx.hasMultiSelection()) {
        for (const blockId of ctx.getSelectedBlockIds()) {
            dispatch('SetBorderColor', {blockId, borderColor: val})
        }
        ctx.clearSelection()
        setTimeout(() => { ctx.setCmd('openBlock') }, 300)
        return
    }

    let id = ctx.blockElement?.id
    if (ctx.blockLinkElement) id = ctx.blockLinkElement.getAttribute('blocklink')
    if (id) dispatch('SetBorderColor', {blockId: id, borderColor: val})
    setTimeout(() => {
        ctx.setCmd('openBlock')
    }, 300)
}

export const borderColorCommands = [];

// Shift+1..9 — установить цвет рамки
for (let i = 1; i <= 9; i++) {
    borderColorCommands.push({
        id: `borderColor${i}`,
        defaultHotkey: `shift+${i}`,
        mode: ['normal'],
        eventType: 'keyup',
        description: `Установить ${COLOR_NAMES[i]} цвет рамки`,
        execute(ctx) {
            setBorderColor(BORDER_COLORS[i], ctx);
        }
    });
}

// Shift+0 — убрать рамку
borderColorCommands.push({
    id: 'borderColorRemove',
    defaultHotkey: 'shift+0',
    mode: ['normal'],
    eventType: 'keyup',
    description: 'Убрать цвет рамки',
    execute(ctx) {
        setBorderColor('', ctx);
    }
});
