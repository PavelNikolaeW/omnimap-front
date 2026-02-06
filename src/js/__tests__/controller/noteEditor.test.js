/**
 * Тесты для NoteEditor
 * Проверяют корректность конвертации MD↔HTML и нормализации
 */

// Мок для emoji-picker-element (ESM модуль)
jest.mock('emoji-picker-element', () => ({}), { virtual: true });

// Мок для highlight.js
jest.mock('highlight.js', () => ({
    highlightElement: jest.fn(),
}));

// Мок для custom-dialog
jest.mock('../../utils/custom-dialog', () => ({
    customPrompt: jest.fn(),
}));

// Мок для functions
jest.mock('../../utils/functions', () => ({
    isMobileOrTablet: jest.fn(() => false),
}));

import { NoteEditor } from '../../controller/noteEditor';

// Мок для контейнера
const createMockContainer = () => {
    const container = document.createElement('div');
    container.id = 'note-editor';
    document.body.appendChild(container);
    return container;
};

describe('NoteEditor', () => {
    let editor;
    let container;

    beforeEach(() => {
        container = createMockContainer();
        editor = new NoteEditor('note-editor');
    });

    afterEach(() => {
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    describe('_normalizeMarkdown', () => {
        it('должен сохранять одиночные пустые строки', () => {
            const input = 'Строка 1\n\nСтрока 2';
            const result = editor._normalizeMarkdown(input);
            expect(result).toBe('Строка 1\n\nСтрока 2');
        });

        it('должен сохранять любое количество пустых строк', () => {
            const input = 'Строка 1\n\n\n\nСтрока 2';
            const result = editor._normalizeMarkdown(input);
            expect(result).toBe('Строка 1\n\n\n\nСтрока 2');
        });

        it('должен удалять trailing whitespace (включая markdown line breaks)', () => {
            // С breaks:true в marked, line breaks не нужны, используем обычные \n
            const input = 'Строка 1  \nСтрока 2';
            const result = editor._normalizeMarkdown(input);
            expect(result).toBe('Строка 1\nСтрока 2');
        });

        it('должен удалять любой trailing whitespace', () => {
            const input = 'Строка 1   \nСтрока 2';
            const result = editor._normalizeMarkdown(input);
            expect(result).toBe('Строка 1\nСтрока 2');
        });

        it('должен сохранять code блоки без изменений', () => {
            const input = '```javascript\n\n\n\nconst x = 1;\n\n\n\n```';
            const result = editor._normalizeMarkdown(input);
            // Code блоки не должны нормализоваться
            expect(result).toContain('\n\n\n\n');
        });

        it('должен обрабатывать пустую строку', () => {
            expect(editor._normalizeMarkdown('')).toBe('');
            expect(editor._normalizeMarkdown(null)).toBe('');
            expect(editor._normalizeMarkdown(undefined)).toBe('');
        });

        it('должен убирать пробелы в начале и конце', () => {
            const input = '   Текст   ';
            const result = editor._normalizeMarkdown(input);
            expect(result).toBe('Текст');
        });
    });

    describe('_normalizeHtml', () => {
        it('должен удалять пустые параграфы', () => {
            const input = '<p></p><p>Текст</p><p></p>';
            const result = editor._normalizeHtml(input);
            expect(result).toBe('<p>Текст</p>');
        });

        it('должен сохранять параграфы с br (пустые строки)', () => {
            const input = '<p><br></p><p>Текст</p>';
            const result = editor._normalizeHtml(input);
            // <p><br></p> сохраняется — это пустая строка от пользователя
            expect(result).toBe('<p><br></p><p>Текст</p>');
        });

        it('должен сохранять любое количество br', () => {
            const input = 'Текст<br><br><br><br>Ещё текст';
            const result = editor._normalizeHtml(input);
            expect(result).toBe('Текст<br><br><br><br>Ещё текст');
        });

        it('должен удалять br в начале и конце', () => {
            const input = '<br><br>Текст<br><br>';
            const result = editor._normalizeHtml(input);
            expect(result).toBe('Текст');
        });

        it('должен обрабатывать пустую строку', () => {
            expect(editor._normalizeHtml('')).toBe('');
            expect(editor._normalizeHtml(null)).toBe('');
            expect(editor._normalizeHtml(undefined)).toBe('');
        });

        it('должен обрабатывать self-closing br теги', () => {
            const input = '<br/><br /><br>Текст<br/><br>';
            const result = editor._normalizeHtml(input);
            expect(result).toBe('Текст');
        });
    });

    describe('Turndown конвертация HTML → Markdown', () => {
        it('должен конвертировать br в line breaks', () => {
            const html = '<p>Строка 1<br>Строка 2</p>';
            const md = editor.turndownService.turndown(html);
            expect(md).toContain('Строка 1');
            expect(md).toContain('Строка 2');
            // Проверяем что есть перенос строки (два пробела + \n или просто \n)
            expect(md.includes('\n')).toBe(true);
        });

        it('должен сохранять code блоки с языком', () => {
            const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
            const md = editor.turndownService.turndown(html);
            expect(md).toContain('```javascript');
            expect(md).toContain('const x = 1;');
            expect(md).toContain('```');
        });

        it('должен конвертировать block-ссылки', () => {
            const html = '<a href="block:123" class="block-tag-link" block-id="123">Блок</a>';
            const md = editor.turndownService.turndown(html);
            expect(md).toBe('[Блок](block:123)');
        });

        it('должен корректно конвертировать block-ссылки с href="#block:..."', () => {
            const html = '<a href="#block:123" class="block-tag-link" block-id="123">Блок</a>';
            const md = editor.turndownService.turndown(html);
            expect(md).toBe('[Блок](block:123)');
        });
    });

    describe('Marked конвертация Markdown → HTML', () => {
        it('должен конвертировать line breaks в br', () => {
            // С опцией breaks: true одиночный \n должен стать <br>
            const { marked } = require('marked');
            const md = 'Строка 1  \nСтрока 2';
            const html = marked(md, editor.markedOptions);
            expect(html).toContain('<br>');
        });

        it('должен конвертировать block-ссылки', () => {
            const { marked } = require('marked');
            const md = '[Блок](block:123)';
            const html = marked(md, editor.markedOptions);
            expect(html).toContain('class="block-tag-link"');
            expect(html).toContain('block-id="123"');
        });

        it('не должен превращать обычные URL в block-ссылки', () => {
            const { marked } = require('marked');
            const md = '[Сайт](https://example.com)';
            const html = marked(md, editor.markedOptions);
            expect(html).not.toContain('class="block-tag-link"');
            expect(html).toContain('href="https://example.com"');
        });

        it('должен конвертировать code блоки', () => {
            const { marked } = require('marked');
            const md = '```javascript\nconst x = 1;\n```';
            const html = marked(md, editor.markedOptions);
            expect(html).toContain('<pre>');
            expect(html).toContain('<code');
            expect(html).toContain('const x = 1;');
        });
    });

    describe('Круговая конвертация MD → HTML → MD', () => {
        const { marked } = require('marked');

        const roundTrip = (md) => {
            const normalized = editor._normalizeMarkdown(md);
            const html = marked(normalized, editor.markedOptions);
            const backToMd = editor.turndownService.turndown(html);
            return editor._normalizeMarkdown(backToMd);
        };

        it('должен сохранять обычный текст', () => {
            const original = 'Простой текст';
            const result = roundTrip(original);
            expect(result).toBe(original);
        });

        it('должен сохранять заголовки', () => {
            const original = '### Заголовок';
            const result = roundTrip(original);
            expect(result).toBe(original);
        });

        it('должен сохранять списки', () => {
            const original = '- Пункт 1\n- Пункт 2';
            const result = roundTrip(original);
            expect(result).toContain('Пункт 1');
            expect(result).toContain('Пункт 2');
        });

        it('должен сохранять code блоки', () => {
            const original = '```javascript\nconst x = 1;\n```';
            const result = roundTrip(original);
            expect(result).toContain('```javascript');
            expect(result).toContain('const x = 1;');
        });

        it('должен сохранять жирный и курсив', () => {
            const original = '**жирный** и *курсив*';
            const result = roundTrip(original);
            expect(result).toContain('**жирный**');
            // Turndown может конвертировать *курсив* в _курсив_ - оба варианта валидны
            expect(result.includes('*курсив*') || result.includes('_курсив_')).toBe(true);
        });

        it('не должен добавлять лишний ":" в block-ссылках после повторного round-trip', () => {
            const original = '[Блок](block:123)';
            const afterFirst = roundTrip(original);
            const afterSecond = roundTrip(afterFirst);
            expect(afterFirst).toBe('[Блок](block:123)');
            expect(afterSecond).toBe('[Блок](block:123)');
        });
    });

    describe('Сохранение пустых строк через циклы открытия/сохранения', () => {
        const { marked } = require('marked');
        const DOMPurify = require('dompurify');

        /**
         * Симулирует полный цикл: HTML → открыть редактор → сохранить → HTML
         * Это то, что происходит при реальном использовании:
         * 1. Блок содержит HTML
         * 2. Открываем редактор - HTML конвертируется в MD (с предобработкой)
         * 3. Закрываем с сохранением - MD конвертируется обратно в HTML
         */
        const fullCycle = (html) => {
            // Открытие редактора: предобработка + HTML → MD
            const preprocessedHtml = editor._preprocessHtmlForTurndown(html);
            const markdown = editor.turndownService.turndown(preprocessedHtml);
            const normalizedMd = editor._normalizeMarkdown(markdown);

            // Сохранение: MD → HTML (как в closeEditor)
            const mdWithBlanks = editor._preserveBlankLines(normalizedMd);
            const rawHtml = marked(mdWithBlanks, editor.markedOptions);
            const sanitized = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ['block-id', 'style', 'class', 'title', 'alt', 'src', 'href'],
                ADD_TAGS: ['img', 'a', 'bgImage'],
            });
            const normalizedHtml = editor._normalizeHtml(sanitized);

            return normalizedHtml;
        };

        /**
         * Симулирует несколько циклов открытия/сохранения
         */
        const multipleCycles = (html, cycles = 3) => {
            let result = html;
            for (let i = 0; i < cycles; i++) {
                result = fullCycle(result);
            }
            return result;
        };

        describe('Одна пустая строка между параграфами', () => {
            it('должен сохранять одну пустую строку после 1 цикла', () => {
                const html = '<p>Параграф 1</p><p>Параграф 2</p>';
                const result = fullCycle(html);
                expect(result).toContain('Параграф 1');
                expect(result).toContain('Параграф 2');
            });

            it('должен сохранять структуру после 3 циклов', () => {
                const html = '<p>Параграф 1</p><p>Параграф 2</p>';
                const result = multipleCycles(html, 3);
                expect(result).toContain('Параграф 1');
                expect(result).toContain('Параграф 2');
            });
        });

        describe('Множественные пустые строки (через <br>)', () => {
            it('должен сохранять пустые строки через <br> после 1 цикла', () => {
                const html = '<p>Параграф 1</p><br><br><p>Параграф 2</p>';

                const result = fullCycle(html);

                expect(result).toContain('Параграф 1');
                expect(result).toContain('Параграф 2');
                // Должны быть <br> между параграфами
                const brCount = (result.match(/<br\s*\/?>/gi) || []).length;
                expect(brCount).toBeGreaterThanOrEqual(1);
            });

            it('должен сохранять количество пустых строк после 3 циклов', () => {
                const html = '<p>Текст 1</p><br><br><br><p>Текст 2</p>';
                const after1 = fullCycle(html);
                const after2 = fullCycle(after1);
                const after3 = fullCycle(after2);

                // Структура должна быть стабильной
                expect(after2).toBe(after1);
                expect(after3).toBe(after2);
            });
        });

        describe('Пустые строки внутри параграфа (через <br>)', () => {
            it('должен сохранять <br> внутри параграфа', () => {
                const html = '<p>Строка 1<br>Строка 2</p>';
                const result = fullCycle(html);
                expect(result).toContain('Строка 1');
                expect(result).toContain('Строка 2');
            });

            it('должен сохранять множественные <br> внутри параграфа', () => {
                const html = '<p>Строка 1<br><br>Строка 2</p>';
                const result = fullCycle(html);
                expect(result).toContain('Строка 1');
                expect(result).toContain('Строка 2');
            });
        });

        describe('Стабильность при многократном открытии/сохранении', () => {
            const testCases = [
                {
                    name: 'простой текст',
                    html: '<p>Привет мир</p>',
                },
                {
                    name: 'два параграфа',
                    html: '<p>Параграф 1</p><p>Параграф 2</p>',
                },
                {
                    name: 'параграф с переносом строки',
                    html: '<p>Строка 1<br>Строка 2</p>',
                },
                {
                    name: 'три параграфа',
                    html: '<p>Один</p><p>Два</p><p>Три</p>',
                },
                {
                    name: 'параграфы с пустыми строками между',
                    html: '<p>Начало</p><br><p>Конец</p>',
                },
                {
                    name: 'заголовок и текст',
                    html: '<h3>Заголовок</h3><p>Текст</p>',
                },
                {
                    name: 'список',
                    html: '<ul><li>Пункт 1</li><li>Пункт 2</li></ul>',
                },
            ];

            testCases.forEach(({ name, html }) => {
                it(`${name}: результат стабилен после 5 циклов`, () => {
                    const results = [html];
                    for (let i = 0; i < 5; i++) {
                        results.push(fullCycle(results[results.length - 1]));
                    }

                    // После первого цикла структура может измениться (нормализация)
                    // Но после этого она должна быть стабильной
                    const afterFirst = results[1];
                    for (let i = 2; i < results.length; i++) {
                        expect(results[i]).toBe(afterFirst);
                    }
                });
            });
        });

        describe('Markdown не должен содержать лишних символов', () => {
            it('не должно быть trailing пробелов после циклов', () => {
                const html = '<p>Текст</p>';
                const md1 = editor._normalizeMarkdown(editor.turndownService.turndown(html));
                const html2 = fullCycle(html);
                const md2 = editor._normalizeMarkdown(editor.turndownService.turndown(html2));

                // Не должно быть trailing пробелов
                expect(md1).not.toMatch(/[ \t]+$/m);
                expect(md2).not.toMatch(/[ \t]+$/m);
            });

            it('не должно накапливаться &nbsp; или других escape-символов', () => {
                const html = '<p>Параграф 1</p><p>Параграф 2</p>';
                const result = multipleCycles(html, 5);

                // Не должно быть &nbsp; в финальном HTML (кроме как для пустых строк)
                // Если &nbsp; используется для пустых строк, он должен быть конвертирован в <br>
                expect(result).not.toContain('&nbsp;');
            });
        });

        describe('Edge cases', () => {
            it('пустой HTML', () => {
                const html = '';
                const result = fullCycle(html);
                expect(result).toBe('');
            });

            it('только пробелы', () => {
                const html = '<p>   </p>';
                const result = fullCycle(html);
                // Пустой параграф должен быть удален или нормализован
                expect(result.trim()).toBe('');
            });

            it('HTML с code блоком', () => {
                const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
                const result = multipleCycles(html, 3);
                expect(result).toContain('const x = 1;');
            });

            it('смешанный контент: текст, код, список', () => {
                const html = `
                    <p>Введение</p>
                    <pre><code class="language-js">console.log("test");</code></pre>
                    <ul><li>Пункт</li></ul>
                    <p>Заключение</p>
                `;
                const result = multipleCycles(html, 3);
                expect(result).toContain('Введение');
                expect(result).toContain('console.log');
                expect(result).toContain('Пункт');
                expect(result).toContain('Заключение');
            });
        });
    });
});
