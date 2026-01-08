/**
 * Size Validator
 *
 * Утилита для проверки корректности расчёта размеров блоков.
 * Сравнивает вычисленные размеры с реальными из getBoundingClientRect().
 */

/**
 * Допустимая погрешность в пикселях
 * (небольшие расхождения возможны из-за округления, border, padding)
 */
const TOLERANCE_PX = 2;

/**
 * Проверить размеры одного блока
 * @param {HTMLElement} element - DOM элемент блока
 * @param {{width: number, height: number}} calculatedSize - вычисленные размеры
 * @returns {{valid: boolean, diff: {width: number, height: number}, calculated: Object, actual: Object}}
 */
export function validateBlockSize(element, calculatedSize) {
    const rect = element.getBoundingClientRect();

    const diff = {
        width: Math.abs(rect.width - calculatedSize.width),
        height: Math.abs(rect.height - calculatedSize.height),
    };

    const valid = diff.width <= TOLERANCE_PX && diff.height <= TOLERANCE_PX;

    return {
        valid,
        diff,
        calculated: { width: calculatedSize.width, height: calculatedSize.height },
        actual: { width: rect.width, height: rect.height },
    };
}

/**
 * Проверить размеры всех блоков на странице
 * @param {Map|Object} blocks - карта блоков с размерами
 * @returns {{valid: boolean, total: number, invalid: number, results: Array}}
 */
export function validateAllBlocks(blocks) {
    const results = [];
    let invalidCount = 0;

    const blocksIterable = blocks instanceof Map ? blocks.values() : Object.values(blocks);

    for (const block of blocksIterable) {
        if (!block.size || !block.id) continue;

        const element = document.getElementById(block.id);
        if (!element) continue;

        const result = validateBlockSize(element, block.size);
        result.blockId = block.id;
        result.layout = block.size.layout;

        if (!result.valid) {
            invalidCount++;
        }

        results.push(result);
    }

    return {
        valid: invalidCount === 0,
        total: results.length,
        invalid: invalidCount,
        results,
    };
}

/**
 * Вывести отчёт валидации в консоль
 * @param {Map|Object} blocks - карта блоков
 */
export function printValidationReport(blocks) {
    const { valid, total, invalid, results } = validateAllBlocks(blocks);

    console.group(`📐 Size Validation Report`);
    console.log(`Total blocks: ${total}`);
    console.log(`Status: ${valid ? '✅ All valid' : `❌ ${invalid} invalid`}`);

    if (!valid) {
        console.group('Invalid blocks:');
        const invalidBlocks = results.filter(r => !r.valid);
        console.table(invalidBlocks.map(r => ({
            id: r.blockId,
            layout: r.layout,
            'calc.W': r.calculated.width.toFixed(1),
            'calc.H': r.calculated.height.toFixed(1),
            'actual.W': r.actual.width.toFixed(1),
            'actual.H': r.actual.height.toFixed(1),
            'diff.W': r.diff.width.toFixed(1),
            'diff.H': r.diff.height.toFixed(1),
        })));
        console.groupEnd();
    }

    console.groupEnd();

    return { valid, total, invalid };
}

/**
 * Создать визуальный оверлей для отладки размеров
 * Показывает расхождения прямо на блоках
 * @param {Map|Object} blocks - карта блоков
 */
export function showSizeDebugOverlay(blocks) {
    // Удаляем предыдущий оверлей
    document.querySelectorAll('.size-debug-overlay').forEach(el => el.remove());

    const { results } = validateAllBlocks(blocks);

    for (const result of results) {
        const element = document.getElementById(result.blockId);
        if (!element) continue;

        const overlay = document.createElement('div');
        overlay.className = 'size-debug-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            font-size: 10px;
            padding: 2px 4px;
            z-index: 9999;
            pointer-events: none;
            background: ${result.valid ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)'};
            color: white;
            font-family: monospace;
        `;

        const diffW = result.diff.width.toFixed(0);
        const diffH = result.diff.height.toFixed(0);
        overlay.textContent = result.valid
            ? '✓'
            : `Δ${diffW}×${diffH}`;

        element.style.position = 'relative';
        element.appendChild(overlay);
    }

    console.log('Debug overlay added. Call hideSizeDebugOverlay() to remove.');
}

/**
 * Убрать отладочный оверлей
 */
export function hideSizeDebugOverlay() {
    document.querySelectorAll('.size-debug-overlay').forEach(el => el.remove());
}

// Экспорт для использования в консоли браузера
if (typeof window !== 'undefined') {
    window.sizeValidator = {
        validateBlockSize,
        validateAllBlocks,
        printValidationReport,
        showSizeDebugOverlay,
        hideSizeDebugOverlay,
    };
}
