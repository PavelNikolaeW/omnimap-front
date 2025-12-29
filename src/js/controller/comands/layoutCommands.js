import { dispatch } from "../../utils/utils";
import { setCmdOpenBlock } from "./cmdUtils";
import { extractBlockId } from "../../actions/selectionActions";
import { LAYOUT_TYPES, LAYOUT_LABELS, LAYOUT_ICONS } from "../../painter/layoutTypes";
import { GridLayoutPopup } from "../popups/gridLayoutPopup";
import { MasonryLayoutPopup } from "../popups/masonryLayoutPopup";

/**
 * Устанавливает layout для блока
 * @param {string} layoutType - тип layout
 * @param {Object} ctx - контекст команды
 * @param {Object} [config] - дополнительная конфигурация (для grid, masonry)
 */
function setBlockLayout(layoutType, ctx, config = null) {
    const blockId = extractBlockId(ctx.blockElement);
    if (!blockId) return;

    const data = { layout: layoutType };

    // Добавляем конфигурацию для специфических типов
    if (config) {
        if (layoutType === LAYOUT_TYPES.GRID && config.rows && config.columns) {
            data.gridConfig = { rows: config.rows, columns: config.columns };
        } else if (layoutType === LAYOUT_TYPES.MASONRY && (config.minChildWidth || config.maxColumns)) {
            data.masonryConfig = config;
        }
    }

    dispatch('UpdateDataBlock', { blockId, data });

    setTimeout(() => {
        setCmdOpenBlock(ctx);
    }, 100);
}

/**
 * Создаёт команду для установки layout
 * @param {string} id - id команды
 * @param {string} layoutType - тип layout
 * @param {string} hotkey - горячая клавиша
 * @param {Object} [config] - конфигурация для grid/masonry
 */
function createLayoutCommand(id, layoutType, hotkey, config = null) {
    const label = LAYOUT_LABELS[layoutType] || layoutType;
    const icon = LAYOUT_ICONS[layoutType] || 'fa-th';

    return {
        id,
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: `Раскладка: ${label}`,
            classes: ['sidebar-button', 'fas', icon, 'fas-lg']
        },
        defaultHotkey: hotkey,
        description: `Установить раскладку "${label}"`,
        execute(ctx) {
            setBlockLayout(layoutType, ctx, config);
        },
        btnExec(ctx) {
            this.execute(ctx);
        }
    };
}

export const layoutCommands = [
    // Базовые layout типы
    createLayoutCommand('layoutDefault', LAYOUT_TYPES.DEFAULT, 'l+d'),
    createLayoutCommand('layoutRows', LAYOUT_TYPES.ROWS, 'l+r'),
    createLayoutCommand('layoutColumns', LAYOUT_TYPES.COLUMNS, 'l+c'),
    createLayoutCommand('layoutTable', LAYOUT_TYPES.TABLE, 'l+t'),

    // Masonry - по хоткею применяет дефолт, по кнопке открывает popup
    {
        id: 'layoutMasonry',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: `Раскладка: ${LAYOUT_LABELS[LAYOUT_TYPES.MASONRY]}`,
            classes: ['sidebar-button', 'fas', LAYOUT_ICONS[LAYOUT_TYPES.MASONRY], 'fas-lg']
        },
        defaultHotkey: 'l+m',
        description: `Установить раскладку "${LAYOUT_LABELS[LAYOUT_TYPES.MASONRY]}"`,
        execute(ctx) {
            // По хоткею применяем дефолтный masonry
            setBlockLayout(LAYOUT_TYPES.MASONRY, ctx);
        },
        btnExec(ctx) {
            // По кнопке открываем popup для настройки
            MasonryLayoutPopup.show(ctx);
        }
    },

    // Grid - по хоткею применяет 2x2, по кнопке открывает popup
    {
        id: 'layoutGrid',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: `Раскладка: ${LAYOUT_LABELS[LAYOUT_TYPES.GRID]}`,
            classes: ['sidebar-button', 'fas', LAYOUT_ICONS[LAYOUT_TYPES.GRID], 'fas-lg']
        },
        defaultHotkey: 'l+g',
        description: `Установить раскладку "${LAYOUT_LABELS[LAYOUT_TYPES.GRID]}"`,
        execute(ctx) {
            // По хоткею применяем дефолтный grid-2x2
            const blockId = extractBlockId(ctx.blockElement);
            if (!blockId) return;
            dispatch('UpdateDataBlock', {
                blockId,
                data: { layout: 'grid-2x2' }
            });
            setTimeout(() => setCmdOpenBlock(ctx), 100);
        },
        btnExec(ctx) {
            // По кнопке открываем popup для настройки
            GridLayoutPopup.show(ctx);
        }
    },

    // Быстрые пресеты для Grid
    {
        id: 'layoutGrid2x2',
        mode: ['normal'],
        defaultHotkey: 'l+2',
        description: 'Сетка 2x2',
        execute(ctx) {
            const blockId = extractBlockId(ctx.blockElement);
            if (!blockId) return;
            dispatch('UpdateDataBlock', {
                blockId,
                data: { layout: 'grid-2x2' }
            });
            setTimeout(() => setCmdOpenBlock(ctx), 100);
        }
    },
    {
        id: 'layoutGrid3x3',
        mode: ['normal'],
        defaultHotkey: 'l+3',
        description: 'Сетка 3x3',
        execute(ctx) {
            const blockId = extractBlockId(ctx.blockElement);
            if (!blockId) return;
            dispatch('UpdateDataBlock', {
                blockId,
                data: { layout: 'grid-3x3' }
            });
            setTimeout(() => setCmdOpenBlock(ctx), 100);
        }
    },
    {
        id: 'layoutGrid4x4',
        mode: ['normal'],
        defaultHotkey: 'l+4',
        description: 'Сетка 4x4',
        execute(ctx) {
            const blockId = extractBlockId(ctx.blockElement);
            if (!blockId) return;
            dispatch('UpdateDataBlock', {
                blockId,
                data: { layout: 'grid-4x4' }
            });
            setTimeout(() => setCmdOpenBlock(ctx), 100);
        }
    }
];

/**
 * Открывает popup для настройки grid layout
 * @param {Object} ctx - контекст команды
 * @param {Object} [currentConfig] - текущая конфигурация { rows, columns }
 */
export function openGridLayoutPopup(ctx, currentConfig = {}) {
    GridLayoutPopup.show(ctx, currentConfig);
}

/**
 * Открывает popup для настройки masonry layout
 * @param {Object} ctx - контекст команды
 * @param {Object} [currentConfig] - текущая конфигурация { minChildWidth, maxColumns }
 */
export function openMasonryLayoutPopup(ctx, currentConfig = {}) {
    MasonryLayoutPopup.show(ctx, currentConfig);
}
