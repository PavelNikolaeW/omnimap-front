import { Popup } from './popup';
import { dispatch } from '../../utils/utils';
import { extractBlockId } from '../../actions/selectionActions';
import { LAYOUT_TYPES, LAYOUT_LABELS, formatLayoutString } from '../../painter/layoutTypes';

/**
 * Popup для настройки grid layout
 * Позволяет выбрать количество строк и колонок для сетки
 */
export class GridLayoutPopup extends Popup {
    /**
     * @param {Object} options
     * @param {Object} options.ctx - Контекст команды
     * @param {number} options.rows - Текущее количество строк (по умолчанию 2)
     * @param {number} options.columns - Текущее количество колонок (по умолчанию 2)
     * @param {Function} options.onApply - Callback после применения настроек
     */
    constructor(options = {}) {
        const rows = options.rows || 2;
        const columns = options.columns || 2;

        super({
            title: 'Настройка сетки',
            size: 'sm',
            inputs: [
                {
                    id: 'gridRows',
                    name: 'rows',
                    label: 'Строки',
                    type: 'number',
                    value: rows.toString(),
                    attributes: { min: '1', max: '12', step: '1' }
                },
                {
                    id: 'gridColumns',
                    name: 'columns',
                    label: 'Колонки',
                    type: 'number',
                    value: columns.toString(),
                    attributes: { min: '1', max: '12', step: '1' }
                }
            ],
            onSubmit: (data) => this.applyGrid(data),
            modal: true,
            closeOnEsc: true
        });

        this.ctx = options.ctx;
        this.onApplyCallback = options.onApply;
        this.addPresetButtons();
    }

    /**
     * Добавляет кнопки быстрого выбора пресетов
     */
    addPresetButtons() {
        const presetsContainer = document.createElement('div');
        presetsContainer.className = 'popup-presets';
        presetsContainer.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;';

        const presets = [
            { rows: 2, columns: 2, label: '2x2' },
            { rows: 3, columns: 3, label: '3x3' },
            { rows: 2, columns: 3, label: '2x3' },
            { rows: 3, columns: 2, label: '3x2' },
            { rows: 4, columns: 4, label: '4x4' },
            { rows: 2, columns: 4, label: '2x4' }
        ];

        presets.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'popup-btn popup-btn--ghost';
            btn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
            btn.textContent = preset.label;
            btn.addEventListener('click', () => this.applyPreset(preset));
            presetsContainer.appendChild(btn);
        });

        // Вставляем пресеты перед формой
        if (this.formEl) {
            this.contentArea.insertBefore(presetsContainer, this.formEl);
        } else {
            this.contentArea.appendChild(presetsContainer);
        }
    }

    /**
     * Применяет пресет и закрывает popup
     * @param {Object} preset - { rows, columns }
     */
    applyPreset(preset) {
        this.applyGrid({
            rows: preset.rows.toString(),
            columns: preset.columns.toString()
        });
    }

    /**
     * Применяет настройки grid к блоку
     * @param {Object} data - { rows, columns }
     */
    applyGrid(data) {
        const rows = parseInt(data.rows, 10) || 2;
        const columns = parseInt(data.columns, 10) || 2;

        // Валидация
        const validRows = Math.max(1, Math.min(12, rows));
        const validColumns = Math.max(1, Math.min(12, columns));

        const blockId = this.ctx ? extractBlockId(this.ctx.blockElement) : null;
        if (!blockId) {
            console.warn('GridLayoutPopup: blockId not found');
            return;
        }

        const layoutString = formatLayoutString(LAYOUT_TYPES.GRID, {
            rows: validRows,
            columns: validColumns
        });

        dispatch('UpdateDataBlock', {
            blockId,
            data: { layout: layoutString }
        });

        if (typeof this.onApplyCallback === 'function') {
            this.onApplyCallback({ rows: validRows, columns: validColumns });
        }
    }

    /**
     * Статический метод для быстрого показа popup
     * @param {Object} ctx - Контекст команды
     * @param {Object} currentConfig - Текущая конфигурация { rows, columns }
     * @returns {GridLayoutPopup}
     */
    static show(ctx, currentConfig = {}) {
        return new GridLayoutPopup({
            ctx,
            rows: currentConfig.rows,
            columns: currentConfig.columns
        });
    }
}
