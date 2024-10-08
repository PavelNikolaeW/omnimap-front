export const styleConfig = {
    table: {
        table: { padding: 2, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    xxxs: {
        sq: { padding: 2, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 2, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'center', writingMode: 'horizontal-tb' },
        h:  { padding: 2, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'left', writingMode: 'vertical-rl' }
    },
    xxs: {
        sq: { padding: 6, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'center', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '12px', fontWeight: 'bold', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    xs: {
        sq: { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'center', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    s: {
        sq: { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    m: {
        sq: { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    l: {
        sq: { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    xl: {
        sq: { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        h:  { padding: 6, gap: 4, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    },
    xxl: {
        sq: { padding: 10, gap: 7, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        w:  { padding: 10, gap: 7, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' },
        h:  { padding: 10, gap: 7, fontSize: '14px', fontWeight: 'normal', textAlign: 'left', writingMode: 'horizontal-tb' }
    }
};

// Функция для генерации стилей на основе конфигурации
function generateStyles(config) {
    const sizes = Object.keys(config);
    let styles = '';

    sizes.forEach(size => {
        const forms = Object.keys(config[size]);
        forms.forEach(form => {
            const { padding, gap, fontSize, fontWeight, textAlign, writingMode } = config[size][form];
            styles += `
                .${size}-${form} {
                    font-weight: ${fontWeight};
                    gap: ${gap}px;
                    padding: ${padding}px;
                    font-size: ${fontSize};
                    text-align: ${textAlign};
                    writing-mode: ${writingMode};
                }
            `;
        });
    });

    return styles;
}


export function addedSizeStyles() {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(generateStyles(styleConfig));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

