export default class CalcColor {
    calculateColor(element, block, parentColor) {
        const blockColor = block?.data?.color;
        let hsl = this.getInitialHSL(blockColor, parentColor);
        // console.log(hsl)
        hsl = this.adjustHSL(hsl);

        this.applyColorToElement(element, hsl);

        return hsl;
    }

    // Получение начального значения HSL
    getInitialHSL(blockColor, parentColor) {
        if (parentColor.length === 0 && blockColor === 'default_color') {
            return [210, 0, 50, 0];
        } else if (blockColor && typeof blockColor === 'string' && blockColor !== 'default_color') {
            return blockColor.split(',').map(n => parseInt(n, 10));
        }else if (Array.isArray(blockColor)) {
            return [...blockColor]
        } else if (parentColor.length !== 0) {
            return parentColor;
        }
        return [0, 0, 0, 0];  // дефолтное значение
    }

    // Коррекция значений HSL на основе текущего состояния
    adjustHSL(hsl) {
        if (hsl[2] === 0 || hsl[2] === 100) {
            // Обработка черного или белого цвета с учетом глубины (hsl[3])
            // this.adjustBlackOrWhite(hsl);
        } else {
            // Стандартная коррекция для остальных цветов
        }
            this.adjustColorByDepth(hsl);

        return hsl;
    }

    adjustBlackOrWhite(hsl) {
        switch (hsl[3]) {
            case 0:
                hsl[1] = 0;  // Насыщенность 0
                hsl[2] = hsl[2] === 0 ? 10 : 90;  // Для черного делаем его слегка серым, для белого — слегка темнее
                hsl[3]++;
                break;
            case 1:
                hsl[1] = 0;  // Насыщенность 0
                hsl[2] = hsl[2] === 10 ? 20 : 80;  // Для черного делаем темнее серый, для белого — еще темнее
                hsl[3]++;
                break;
            case 2:
                hsl[1] = 0;
                hsl[2] = hsl[2] === 20 ? 30 : 70;  // Глубже изменяем светлоту
                hsl[3]++;
                break;
            case 3:
                hsl[1] = 0;
                hsl[2] = hsl[2] === 30 ? 40 : 60;  // Максимальная глубина для черного/белого
                hsl[3] = 0;  // Возврат глубины к 0
                break;
        }
    }

// Стандартная коррекция цвета по глубине
    adjustColorByDepth(hsl) {
        switch (hsl[3]) {
            case 0:
                hsl[1] = 90;
                hsl[2] = 90;
                hsl[3]++;
                break;
            case 1:
                hsl[1] = 90;
                hsl[2] = 80;
                hsl[3]++;
                break;
            case 2:
                hsl[1] = 90;
                hsl[2] = 90;
                hsl[3]++;
                break;
            case 3:
                hsl[1] = 80;
                hsl[2] = 70;
                hsl[3] = 0;
                break;
        }
    }

// Применение цвета к элементу
    applyColorToElement(element, hsl) {
        element.setAttribute('hsl', hsl.join(','));
        element.style.backgroundColor = `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;
    }
}