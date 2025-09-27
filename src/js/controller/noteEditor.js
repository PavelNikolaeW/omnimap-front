import TurndownService from 'turndown';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { marked } from 'marked';
import hotkeys from 'hotkeys-js';
import { gfm } from 'turndown-plugin-gfm';
import 'emoji-picker-element';
import { customPrompt } from "../utils/custom-dialog";
import { isMobileOrTablet } from "../utils/functions";

const BLOCK_LINK_PREFIX = 'block:';

export class NoteEditor {
    constructor(containerSelector) {
        this.container = document.getElementById(containerSelector);
        this.blockId = null;
        this.isMobile = isMobileOrTablet();
        this.ctx = null;

        this.editorEl = null;   // <textarea>
        this.previewEl = null;  // <div> для HTML-превью
        this.toolbarEl = null;  // <div> toolbar

        this._setupTurndown();
        this._setupCustomRenderer();
        this._setupSanitizer();
    }

    // ---------- Публичное API ----------
    openEditor(blockId, html, ctx) {
        this.blockId = blockId;
        this.ctx = ctx;

        const markdown = this.turndownService.turndown(html);

        // Очистим контейнер и разметим UI
        this.container.innerHTML = '';
        this.container.classList.add('active');

        this.toolbarEl = this._buildToolbar();
        this.container.appendChild(this.toolbarEl);

        this.editorEl = document.createElement('textarea');
        this.editorEl.className = 'note-editor-textarea';
        this.editorEl.setAttribute('autocorrect', 'on');
        this.editorEl.setAttribute('autocapitalize', 'sentences');
        this.editorEl.setAttribute('spellcheck', 'true');
        this.editorEl.value = markdown;
        this.container.appendChild(this.editorEl);

        this.previewEl = document.createElement('div');
        this.previewEl.className = 'note-editor-preview';
        this.previewEl.style.display = 'none';
        this.container.appendChild(this.previewEl);

        this._setupEditorHotkeys();
        this._setCursorToEndOnce();
    }

    closeEditor(save) {
        if (!this.editorEl) return;

        if (save) {
            const markdown = this._getMarkdown();
            const html = marked(markdown, { renderer: this.customRenderer, mangle: false });
            const sanitized = DOMPurify.sanitize(html, {
                ADD_ATTR: ['block-id', 'style', 'class', 'title', 'alt', 'src', 'href'],
                ADD_TAGS: ['img', 'a', 'bgImage'],
            });
            const highlightedHtml = this._highlightHtml(sanitized);

            const event = new CustomEvent('TextUpdate', {
                detail: { blockId: this.blockId, text: highlightedHtml },
            });

            // восстановим режим
            if (this.ctx) {
                this.ctx.mode = 'normal';
                this.ctx.event = undefined;
            }
            window.dispatchEvent(event);
        }

        // cleanup
        this.container.classList.remove('active');
        this.container.innerHTML = '';
        this.blockId = null;
        this.ctx = null;
        this.editorEl = null;
        this.previewEl = null;
        this.toolbarEl = null;
    }

    // ---------- Init helpers ----------
    _setupTurndown() {
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
        });
        this.turndownService.use(gfm);

        this.turndownService.addRule('customBlockLink', {
            filter: (node) => node.nodeName === 'A' && node.classList.contains('block-tag-link'),
            replacement: (content, node) => {
                const id = node.getAttribute('href').slice(BLOCK_LINK_PREFIX.length);
                return `[${content}](${BLOCK_LINK_PREFIX}${id})`;
            },
        });
    }

    _setupCustomRenderer() {
        this.customRenderer = new marked.Renderer();
        const originalLink = this.customRenderer.link?.bind(this.customRenderer);

        // ссылки
        this.customRenderer.link = ({ href, title, text }) => {
            if (typeof href === 'string' && href.startsWith(BLOCK_LINK_PREFIX)) {
                const id = href.slice(BLOCK_LINK_PREFIX.length);
                const t = text ?? '';
                const titleAttr = title ? ` title="${title}"` : '';
                return `<a href="#${href}" class="block-tag-link" block-id="${id}"${titleAttr}>${t}</a>`;
            }
            return originalLink
                ? originalLink({ href, title, text })
                : `<a href="${href}"${title ? ` title="${title}"` : ''}>${text ?? ''}</a>`;
        };

        // картинки
        this.customRenderer.image = ({ href, title, text }) => {
            const titleAttr = title ? ` title="${title}"` : '';
            const altAttr = text ? ` alt="${text}"` : ' alt=""';
            return `<img src="${href}"${titleAttr}${altAttr} style="max-width:100%; height:auto; display:block;" />`;
        };
    }

    _setupSanitizer() {
        DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
            if (
                data.attrName === 'href' &&
                node.nodeName === 'A' &&
                node.classList?.contains('block-tag-link')
            ) {
                data.keepAttr = true;
            }
        });
    }

    // ---------- Toolbar ----------
    _buildToolbar() {
        const bar = document.createElement('div');
        bar.className = 'note-editor-toolbar';

        const addBtn = (title, iconClass, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn ${iconClass}`;
            btn.title = title;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                onClick();
                this.editorEl?.focus();
            });
            bar.appendChild(btn);
        };

        // === Кнопки ===
        addBtn('Сохранить (Enter)', 'fa fa-floppy-o', () => this.closeEditor(true));
        addBtn('Перенос строки', 'fa fa-level-down', () => this._insertText('\n'));

        addBtn('Полужирный', 'fa fa-bold', () => this._wrapSelection('**', '**'));
        addBtn('Курсив', 'fa fa-italic', () => this._wrapSelection('*', '*'));
        addBtn('Зачеркнутый', 'fa fa-strikethrough', () => this._wrapSelection('~~', '~~'));
        addBtn('Заголовок', 'fa fa-header', () => this._toggleHeading());

        addBtn('Маркированный список', 'fa fa-list-ul', () => this._prefixLines('- '));
        addBtn('Нумерованный список', 'fa fa-list-ol', () => this._makeOrderedList());

        addBtn('Изображение', 'fa fa-picture-o', async () => {
            const url = await customPrompt('URL изображения:');
            if (!url) return;
            const title = await customPrompt('Подпись (необязательно):');
            this._insertText(`![${title || ''}](${url})`);
        });

        addBtn('Ссылка', 'fa fa-link', async () => {
            const url = await customPrompt('URL:');
            if (!url) return;
            const sel = this._getSelectionText();
            const text = sel || (await customPrompt('Текст ссылки:')) || url;
            this._replaceSelection(`[${text}](${url})`);
        });

        addBtn('Ссылка на блок', 'fa fa-link', async () => {
            const id = await customPrompt('Введите ID блока:');
            if (id) this._insertText(`[Блок:](${BLOCK_LINK_PREFIX}${id})`);
        });

        addBtn('Эмодзи', 'fa fa-smile-o', () => this._openEmojiPicker());

        addBtn('Цитата', 'fa fa-quote-right', () => this._prefixLines('> '));
        addBtn('Код', 'fa fa-code', () => this._toggleCode());
        addBtn('Таблица', 'fa fa-table', () => this._insertTable());
        addBtn('Горизонтальная линия', 'fa fa-minus', () => this._insertText('\n\n---\n\n'));

        addBtn('Превью', 'fa fa-eye', () => this._togglePreview(false));
        addBtn('Side-by-side', 'fa fa-columns', () => this._togglePreview(true));

        addBtn('Справка', 'fa fa-question-circle', () => {
            alert(
`Подсказка Markdown:
**жирный**, *курсив*, ~~зачеркнутый~~
# H1, ## H2, ### H3
Списки: "- " или "1. "
Код: \`inline\` или блоки с \`\`\`
Таблица: автоматическая заготовка кнопкой "Таблица"`
            );
        });

        return bar;
    }

    // ---------- Превью ----------
    _togglePreview(sideBySide) {
        const showing = this.previewEl.style.display !== 'none';
        const willShow = !showing;
        if (willShow) {
            const html = marked(this._getMarkdown(), { renderer: this.customRenderer, mangle: false });
            const sanitized = DOMPurify.sanitize(html, {
                ADD_ATTR: ['block-id', 'style', 'class', 'title', 'alt', 'src', 'href'],
                ADD_TAGS: ['img', 'a', 'bgImage'],
            });
            this.previewEl.innerHTML = this._highlightHtml(sanitized);
        }
        this.previewEl.style.display = willShow ? 'block' : 'none';
        this.container.classList.toggle('preview-active', willShow);
        this.container.classList.toggle('side-by-side', willShow && sideBySide);
    }

    _highlightHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        temp.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
        return temp.innerHTML;
    }

    // ---------- Хоткеи ----------
    _setupEditorHotkeys() {
        const onKeyDown = (e) => {
            // Cmd/Ctrl + S -> save
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.closeEditor(true);
                return;
            }

            if (e.key === 'Enter' && !e.shiftKey) {
                if (this.isMobile) {
                    // на мобилке просто перенос строки
                    e.preventDefault();
                    this._insertText('\n');
                } else {
                    // на десктопе — сохранить и закрыть
                    e.preventDefault();
                    try { hotkeys.trigger('enter'); } catch {}
                    this.closeEditor(true);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                try { hotkeys.trigger('esc'); } catch {}
                this.closeEditor(false);
            }
        };

        this.editorEl.addEventListener('keydown', onKeyDown);
        // уберём listener при закрытии — через cleanup в closeEditor мы чистим container.innerHTML,
        // а значит и сам элемент с обработчиком будет удалён
    }

    _setCursorToEndOnce() {
        // фокус и каретка в конец
        this.editorEl.focus();
        const val = this.editorEl.value;
        this.editorEl.setSelectionRange(val.length, val.length);
    }

    // ---------- Операции редактирования ----------
    _getMarkdown() {
        return this.editorEl?.value ?? '';
    }

    _setMarkdown(text) {
        if (!this.editorEl) return;
        const scrollTop = this.editorEl.scrollTop;
        this.editorEl.value = text;
        this.editorEl.scrollTop = scrollTop;
    }

    _getSelectionText() {
        if (!this.editorEl) return '';
        const { selectionStart, selectionEnd, value } = this.editorEl;
        return value.slice(selectionStart, selectionEnd);
    }

    _replaceSelection(newText, selectInserted = false) {
        if (!this.editorEl) return;
        const el = this.editorEl;
        const { selectionStart: start, selectionEnd: end, value } = el;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const next = before + newText + after;
        this._setMarkdown(next);
        const cursorPos = before.length + (selectInserted ? 0 : newText.length);
        el.setSelectionRange(cursorPos, cursorPos);
    }

    _insertText(text) {
        const sel = this._getSelectionText();
        if (!sel) {
            this._replaceSelection(text);
        } else {
            this._replaceSelection(sel + text);
        }
    }

    _wrapSelection(prefix, suffix = prefix) {
        const el = this.editorEl;
        const sel = this._getSelectionText();
        const hasNewline = sel.includes('\n');

        if (!sel) {
            // пустой — вставим маркеры и поставим каретку между
            const placeholder = '';
            const insert = `${prefix}${placeholder}${suffix}`;
            this._replaceSelection(insert);
            const pos = el.selectionStart - suffix.length;
            el.setSelectionRange(pos, pos);
            return;
        }

        // если это многострочный — просто обернём как есть
        const wrapped = `${prefix}${sel}${suffix}`;
        this._replaceSelection(wrapped, true);
        // выделим содержимое без маркеров
        const start = el.selectionStart - wrapped.length + prefix.length;
        const end = el.selectionStart - suffix.length;
        el.setSelectionRange(start, end);
    }

    _prefixLines(prefix) {
        const el = this.editorEl;
        const { selectionStart, selectionEnd, value } = el;

        // расширим выбор до границ строк
        const startLine = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const endLineIdx = value.indexOf('\n', selectionEnd);
        const endLine = endLineIdx === -1 ? value.length : endLineIdx;

        const block = value.slice(startLine, endLine);
        const lines = block.split('\n').map((ln) => (ln.startsWith(prefix) ? ln : prefix + ln));
        const replaced = lines.join('\n');

        const next = value.slice(0, startLine) + replaced + value.slice(endLine);
        const cursorPos = selectionStart + prefix.length;
        this._setMarkdown(next);
        el.setSelectionRange(cursorPos, cursorPos);
    }

    _makeOrderedList() {
        const el = this.editorEl;
        const { selectionStart, selectionEnd, value } = el;

        const startLine = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const endLineIdx = value.indexOf('\n', selectionEnd);
        const endLine = endLineIdx === -1 ? value.length : endLineIdx;

        const block = value.slice(startLine, endLine);
        const lines = block.split('\n');
        const numbered = lines.map((ln, i) => {
            // если уже нумеровано — не дублируем
            if (/^\s*\d+\.\s/.test(ln)) return ln;
            return `${i + 1}. ${ln}`;
        });

        const replaced = numbered.join('\n');
        const next = value.slice(0, startLine) + replaced + value.slice(endLine);
        this._setMarkdown(next);
        el.setSelectionRange(selectionStart + 3, selectionStart + 3);
    }

    _toggleHeading() {
        const el = this.editorEl;
        const { selectionStart, value } = el;

        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineEnd = value.indexOf('\n', selectionStart);
        const end = lineEnd === -1 ? value.length : lineEnd;

        const line = value.slice(lineStart, end);
        // циклим: ### -> #### -> (снять) -> #
        const currentHashes = line.match(/^#{1,6}\s/);
        let newLine;
        if (!currentHashes) {
            newLine = `### ${line}`;
        } else {
            const len = currentHashes[0].trim().length; // количество #
            if (len < 6) {
                newLine = `${'#'.repeat(len + 1)} ${line.replace(/^#{1,6}\s/, '')}`;
            } else {
                newLine = line.replace(/^#{1,6}\s/, ''); // снять
            }
        }

        const next = value.slice(0, lineStart) + newLine + value.slice(end);
        this._setMarkdown(next);
        el.setSelectionRange(selectionStart, selectionStart);
    }

    _toggleCode() {
        const sel = this._getSelectionText();
        if (!sel) {
            // пустой — вставим блок
            this._replaceSelection('\n```\n\n```\n');
            const el = this.editorEl;
            const pos = el.selectionStart - '\n```\n'.length;
            el.setSelectionRange(pos, pos);
            return;
        }
        if (sel.includes('\n')) {
            // блочный код
            const wrapped = `\n\`\`\`\n${sel}\n\`\`\`\n`;
            this._replaceSelection(wrapped);
        } else {
            // inline
            this._wrapSelection('`', '`');
        }
    }

    _insertTable() {
        const table =
`| Колонка 1 | Колонка 2 | Колонка 3 |
|-----------|-----------|-----------|
|           |           |           |
|           |           |           |`;
        const prefix = this._getMarkdown().endsWith('\n') ? '' : '\n';
        this._insertText(prefix + table + '\n');
    }

    // ---------- Emoji ----------
    _openEmojiPicker() {
        if (document.getElementById('emoji-picker')) return;

        const pickerContainer = document.createElement('div');
        pickerContainer.style.position = 'fixed';
        pickerContainer.style.top = '50%';
        pickerContainer.style.left = '50%';
        pickerContainer.style.transform = 'translate(-50%, -50%)';
        pickerContainer.style.zIndex = 1000;
        pickerContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        pickerContainer.style.background = '#fff';
        pickerContainer.style.borderRadius = '8px';
        pickerContainer.style.overflow = 'hidden';

        const picker = document.createElement('emoji-picker');
        picker.id = 'emoji-picker';
        picker.style.width = '300px';
        picker.style.height = '400px';
        pickerContainer.appendChild(picker);
        document.body.appendChild(pickerContainer);

        picker.addEventListener('emoji-click', (event) => {
            const emoji = event.detail.unicode;
            this._replaceSelection(emoji);
            if (pickerContainer.parentNode) pickerContainer.parentNode.removeChild(pickerContainer);
        });

        const handleClickOutside = (e) => {
            if (!pickerContainer.contains(e.target)) {
                if (pickerContainer.parentNode) pickerContainer.parentNode.removeChild(pickerContainer);
                document.removeEventListener('click', handleClickOutside);
            }
        };
        setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
    }
}
