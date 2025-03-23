export default class CalcColor {
    constructor(options = {}) {
        this.defaultBase = options.defaultBase || [230, 50, 70, 0];
        this.adjustments = options.adjustments || {
            0: {deltaS: +10, deltaL: +20, next: 1},
            1: {deltaS: -5, deltaL: -10, next: 2},
            2: {deltaS: +5, deltaL: +10, next: 3},
            3: {deltaS: -10, deltaL: -20, next: 0}
        };
    }

    calculateColor(element, block, parentBaseColor) {
        const baseColor = this.getInitialBaseColor(block, parentBaseColor);
        const computed = this.computeColor(baseColor);

        this.applyColorToElement(element, computed, block);
        return computed;
    }

    getInitialBaseColor(block, parentBaseColor) {
        const blockColor = block?.data?.color;
        if (parentBaseColor.length > 0 && blockColor === 'default_color') {
            const hsl = this.defaultBase.slice();
            hsl[3] = parentBaseColor[3];
            return hsl;
        }
        if (parentBaseColor.length > 0 && blockColor === 'white') {
            return [0, 0, 100, parentBaseColor[3]];
        }
        if (parentBaseColor.length > 0 && blockColor === 'dark') {
            return [5, 5, 20, parentBaseColor[3]];
        }
        if (blockColor && blockColor !== 'default_color') {
            let parts;
            if (typeof blockColor === 'string') {
                parts = blockColor.split(',').map(n => parseInt(n, 10));
            } else if (Array.isArray(blockColor)) {
                parts = blockColor.slice();
            }
            if (parts.length < 4) {
                parts[3] = 0;
            }
            return parts;
        } else if (parentBaseColor && parentBaseColor.length === 4) {
            const newDepth = (parentBaseColor[3] + 1) % 4;
            return [parentBaseColor[0], parentBaseColor[1], parentBaseColor[2], newDepth];
        }
        return this.defaultBase.slice();
    }

    computeColor(base) {
        const depth = base[3];
        const adjust = this.adjustments[depth] || {deltaS: 0, deltaL: 0};
        const h = base[0];

        if (base[1] <= 29 && base[2] <= 30) {
            const s = this.clamp(base[1] + adjust.deltaS, 0, 29);
            const l = this.clamp(base[2] + (adjust.deltaL * 0.5), 0, 30);
            return [h, s, l, depth];
        }
        if (base[1] <= 11 && base[2] >= 91) {
            const s = this.clamp(base[1] + adjust.deltaS, 0, 10);
            const l = this.clamp(base[2] + (adjust.deltaL * 0.5), 91, 100);
            return [h, s, l, depth];
        }

        const s = this.clamp(base[1] + adjust.deltaS, 30, 100);
        const l = this.clamp(base[2] + adjust.deltaL, 10, 90);
        return [h, s, l, depth];
    }

    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    applyColorToElement(element, computed, block) {
        const [h, s, l] = computed;
        element.setAttribute('hsl', computed.join(','))
        element.style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
        const customColor = block.data?.style?.color
        element.style.color = (customColor !== undefined) ? customColor : this.getAdaptiveTextColor(h, s, l);
    }

    getAdaptiveTextColor(h, s, l) {
        // Обработка белого фона: если насыщенность минимальна и яркость очень высокая, используем почти чёрный текст
        if (s <= 11 && l >= 91) {
            return `hsl(0, 0%, 10%)`;
        }
        // Обработка насыщенного красного фона: если оттенок близок к 0° или 360°, насыщенность высокая и яркость в среднем диапазоне,
        // выбираем почти белый текст для лучшей читаемости.
        if ((h < 15 || h > 345) && s >= 80 && l >= 40 && l <= 60) {
            return `hsl(0, 0%, 95%)`;
        }

        // Общая адаптивная логика с учётом оттенка.
        let textH = h;
        let textS, textL;

        // Корректировка оттенка: для теплых оттенков (0-60, 300-360) сдвигаем в сторону холодных (на +30°),
        // для холодных (180-300) – наоборот (на -30°)
        let hueOffset = 0;
        if ((h >= 0 && h < 60) || (h >= 300 && h <= 360)) {
            hueOffset = 30;
        } else if (h >= 180 && h < 300) {
            hueOffset = -30;
        }
        textH = (h + hueOffset + 360) % 360;

        // Корректирующий коэффициент для более тонкой настройки
        let adjustmentFactor = 1;
        if (h < 30 || h > 330) {
            adjustmentFactor = 0.9;
        } else if (h >= 210 && h <= 270) {
            adjustmentFactor = 1.1;
        }

        // Расчет насыщенности и яркости текста для обеспечения контраста
        if (l < 40) {
            // Для темного фона увеличиваем яркость текста
            textS = Math.max(5, Math.min(30, s * 0.5 * adjustmentFactor));
            textL = Math.min(l + 70 * adjustmentFactor, 95);
        } else {
            // Для светлого фона уменьшаем яркость текста
            textS = Math.max(5, Math.min(30, s * 0.5 * adjustmentFactor));
            textL = Math.max(l - 70 * adjustmentFactor, 5);
        }
        return `hsl(${textH}, ${textS}%, ${textL}%)`;
    }
}