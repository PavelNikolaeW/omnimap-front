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
            // href содержит "#block:123", а правило извлекает id после "block:"
            const html = '<a href="block:123" class="block-tag-link" block-id="123">Блок</a>';
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
    });
});
