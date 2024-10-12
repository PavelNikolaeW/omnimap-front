// список стилей для тестов класса
const styles = [
    'grid-template-columns_1fr__1fr__1fr',
    'grid-template-rows_1fr__2fr',
    'grid-column_1-2',
    'grid-row_2',
    'background-color_red__blue',
    'border_1px__solid__black',
    'padding_10px__20px',
    'font-size_14px',
    'box-shadow_10px__10px__5px__rgba_lp_0__0__0__0_comma_5_rp_',
    'grid-template-areas_header__main__footer',
    'margin_0__auto',
    'color_white',
    'text-align_center',
    'display_flex',
    'justify-content_space__between',
    'align-items_center',
    'flex-direction_column',
    'width_100vw',
    'height_100vh',
    'overflow_hidden',
    'position_relative',
    'top_0',
    'left_0',
    'z-index_9999',
    'opacity_0_comma_5',
    'transition_all__0_comma_3s__ease',
    'transform_translateX__50px',
    'font-family_Arial__sans-serif',
    'line-height_1_comma_5',
    'letter-spacing_0_c_1em',
    'background-image_url_lp__sl_https_c__sl__sl_example.com_sl_image.jpg_lp__rp__rp_',
    'background-size_cover',
    'background-position_center__center',
    'border-radius_50_p_',
    'box-sizing_border-box',
    'cursor_pointer',
    'grid-column_1__-2',
    'grid-row_-1__-3',
    'grid-row_-1',
    'grid-column_-1__-2',
    'grid-row_-1__-3',
    'box-shadow_-10px__-10px__5px__rgba_lp_0__0__0__0_comma_5_rp_'
];

class CSSConverter {
    constructor() {
        this.processedStyles = new Set();
        this.allStyles = new Set();
        this.appliedStyles = new Set();

        window.addEventListener('ApplyClass', (e) => {
            this.generateStylesheet(e.detail.style)
            this.applyCssClasses()
        })
    }

    encodeValue(value) {
        return value
            .replace(/-/g, '--')
            .replace(/:/g, '_c_')
            .replace(/;/g, '_sc_')
            .replace(/\//g, '_sl_')
            .replace(/\*/g, '_st_')
            .replace(/\+/g, '_pl_')
            .replace(/\./g, '_dot_')
            .replace(/#/g, '_hash_')
            .replace(/@/g, '_at_')
            .replace(/!/g, '_ex_')
            .replace(/,/g, '_comma_')
            .replace(/%/g, '_p_')
            .replace(/\(/g, '_lp_')
            .replace(/\)/g, '_rp_')
            .replace(/ /g, '__');
    }

    decodeValue(value) {
        return value
            .replace(/--/g, '-')
            .replace(/_c_/g, ':')
            .replace(/_sc_/g, ';')
            .replace(/_sl_/g, '/')
            .replace(/_st_/g, '*')
            .replace(/_pl_/g, '+')
            .replace(/_dot_/g, '.')
            .replace(/_hash_/g, '#')
            .replace(/_at_/g, '@')
            .replace(/_ex_/g, '!')
            .replace(/_comma_/g, ',')
            .replace(/_p_/g, '%')
            .replace(/_lp_/g, '(')
            .replace(/_rp_/g, ')')
            .replace(/__/g, ' ');
    }

    convertStringToCSS(cssString) {
        if (this.processedStyles.has(cssString)) {
            return '';
        }

        const [property, ...encodedValueParts] = cssString.split('_');
        const encodedValue = encodedValueParts.join('_');
        let cssValue = this.decodeValue(encodedValue);

        if (property === 'grid-column' || property === 'grid-row') {
            const [one, two] = encodedValue.split('__');
            if (one && two) {
                cssValue = `${one} / ${two}`;
            }
        }

        this.processedStyles.add(cssString);
        this.allStyles.add(`.${cssString} { ${property}: ${cssValue}; }`);
    }

    generateStylesheet(stylesArray) {
        stylesArray.forEach(style => {
            this.convertStringToCSS(style);
        });
    }

    applyCssClasses() {
        if (this.allStyles.size === 0) return;

        const newStyles = Array.from(this.allStyles).filter(style => !this.appliedStyles.has(style));

        if (newStyles.length === 0) {
            this.allStyles.clear();
            return;
        }
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(newStyles.join(' '));
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

        newStyles.forEach(style => this.appliedStyles.add(style));
        this.allStyles.clear();


        // console.log(this.appliedStyles)
        // document.adoptedStyleSheets.forEach(sheet => {
        //     console.log([...sheet.cssRules].map(rule => rule.cssText).join('\n'));
        // });

    }
}


const cssConverter = new CSSConverter();

export default cssConverter;
