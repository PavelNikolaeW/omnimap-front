import { Popup } from './popup';
import { dispatch } from '../../utils/utils';
import { extractBlockId } from '../../actions/selectionActions';
import { LAYOUT_TYPES, DEFAULT_MASONRY_CONFIG } from '../../painter/layoutTypes';

/**
 * Popup для настройки masonry layout
 * Позволяет настроить минимальную ширину элементов и максимальное число колонок
 */
export class MasonryLayoutPopup extends Popup {
    /**
     * @param {Object} options
     * @param {Object} options.ctx - Контекст команды
     * @param {number} options.minChildWidth - Минимальная ширина дочернего элемента
     * @param {number} options.maxColumns - Максимальное количество колонок
     * @param {Function} options.onApply - Callback после применения настроек
     */
    constructor(options = {}) {
        const minChildWidth = options.minChildWidth || DEFAULT_MASONRY_CONFIG.minChildWidth;
        const maxColumns = options.maxColumns || DEFAULT_MASONRY_CONFIG.maxColumns;

        super({
            title: 'Настройка Masonry',
            size: 'sm',
            inputs: [
                {
                    id: 'masonryMinWidth',
                    name: 'minChildWidth',
                    label: 'Мин. ширина элемента (px)',
                    type: 'number',
                    value: minChildWidth.toString(),
                    attributes: { min: '50', max: '500', step: '10' }
                },
                {
                    id: 'masonryMaxColumns',
                    name: 'maxColumns',
                    label: 'Макс. колонок',
                    type: 'number',
                    value: maxColumns.toString(),
                    attributes: { min: '1', max: '8', step: '1' }
                }
            ],
            onSubmit: (data) => this.applyMasonry(data),
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
            { minChildWidth: 100, maxColumns: 4, label: 'Авто' },
            { minChildWidth: 150, maxColumns: 2, label: '2 кол.' },
            { minChildWidth: 100, maxColumns: 3, label: '3 кол.' },
            { minChildWidth: 80, maxColumns: 5, label: '5 кол.' },
            { minChildWidth: 200, maxColumns: 3, label: 'Широкие' },
            { minChildWidth: 80, maxColumns: 6, label: 'Узкие' }
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
     * @param {Object} preset - { minChildWidth, maxColumns }
     */
    applyPreset(preset) {
        this.applyMasonry({
            minChildWidth: preset.minChildWidth.toString(),
            maxColumns: preset.maxColumns.toString()
        });
    }

    /**
     * Применяет настройки masonry к блоку
     * @param {Object} data - { minChildWidth, maxColumns }
     */
    applyMasonry(data) {
        const minChildWidth = parseInt(data.minChildWidth, 10) || DEFAULT_MASONRY_CONFIG.minChildWidth;
        const maxColumns = parseInt(data.maxColumns, 10) || DEFAULT_MASONRY_CONFIG.maxColumns;

        // Валидация
        const validMinWidth = Math.max(50, Math.min(500, minChildWidth));
        const validMaxColumns = Math.max(1, Math.min(8, maxColumns));

        const blockId = this.ctx ? extractBlockId(this.ctx.blockElement) : null;
        if (!blockId) {
            console.warn('MasonryLayoutPopup: blockId not found');
            return;
        }

        dispatch('UpdateDataBlock', {
            blockId,
            data: {
                layout: LAYOUT_TYPES.MASONRY,
                masonryConfig: {
                    minChildWidth: validMinWidth,
                    maxColumns: validMaxColumns
                }
            }
        });

        if (typeof this.onApplyCallback === 'function') {
            this.onApplyCallback({ minChildWidth: validMinWidth, maxColumns: validMaxColumns });
        }
    }

    /**
     * Статический метод для быстрого показа popup
     * @param {Object} ctx - Контекст команды
     * @param {Object} currentConfig - Текущая конфигурация { minChildWidth, maxColumns }
     * @returns {MasonryLayoutPopup}
     */
    static show(ctx, currentConfig = {}) {
        return new MasonryLayoutPopup({
            ctx,
            minChildWidth: currentConfig.minChildWidth,
            maxColumns: currentConfig.maxColumns
        });
    }
}
