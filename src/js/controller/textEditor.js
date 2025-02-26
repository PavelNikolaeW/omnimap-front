import EasyMDE from "easymde";
import DOMPurify from 'dompurify';
import TurndownService from "turndown";
import {dispatch} from "../utils/utils";
import hotkeys from "hotkeys-js";

export class EditorText {
    constructor() {
        this.editorEl = document.getElementById('editor-popup');
        this.mdeElement = document.getElementById('editor-textarea');
        this.turndownService = new TurndownService();

        this.contentEl = null;
        this.editor = null;
    }

    // todo сделать конвертацию в html и обратно + вставку кода
    // Метод для очистки содержимого
    sanitizeContent(html) {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'p', 'em', 'strong', 'ul', 'ol', 'li',
                'code', 'pre', 'blockquote', 'br'
            ],
            ALLOWED_ATTR: ['href', 'blockTarget']
        });
    }

    closeEditor(isUpdateText = true) {
        if (!this.editor) return;

        const markdownText = this.editor.value();
        // Удаление лишних пробелов в конце строк
        const cleanedMarkdown = markdownText.replace(/[ \t]+$/gm, '');
        const htmlWithLineBreaks = cleanedMarkdown.replace(/\n/g, '<br>');
        const sanitizedHtml = this.sanitizeContent(this.editor.options.previewRender(htmlWithLineBreaks));

        if (isUpdateText)
            dispatch("TextUpdate", {blockId: this.blockId, text: sanitizedHtml})

        this.editor.toTextArea();
        this.editor = null;
        this.mdeElement.value = '';
        this.editorEl.style.visibility = 'hidden';
    }

    // Метод для инициализации редактора
    initEditor(contentEl, blockId) {
        this.contentEl = contentEl;
        this.blockId = blockId
        this.editorEl.style.visibility = 'visible';

        const htmlContent = contentEl.innerHTML;
        this.mdeElement.value = this.turndownService.turndown(htmlContent).replace(/[ \t]+$/gm, '');

        this.editor = new EasyMDE({
            element: this.mdeElement,
            lineNumbers: true,
            renderingConfig: {
                singleLineBreaks: true,
                codeSyntaxHighlighting: true,
            },
            allowHTML: true,
            toolbar: [
                'heading', 'bold', 'italic', 'strikethrough',
                'code', 'quote',
                'link',
                'preview',
                'ordered-list', 'unordered-list',
                'horizontal-rule', 'guide'
            ],
            forceSync: true, // Обеспечивает синхронизацию содержимого с textarea
        });
        const wrapper = this.editor.codemirror.getWrapperElement();
        wrapper.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'Enter') {
                hotkeys.trigger('shift+enter')
            } else if (e.key === 'Enter') {
                hotkeys.trigger('enter')
            } else if (event.key === 'Escape') {
                hotkeys.trigger('esc')
            }
        })
        this.editor.codemirror.on('focus', this._setCursorToEnd);
        setTimeout(() => {
            this.editor.codemirror.focus();
        }, 0);
    }

    // Приватный метод для установки курсора в конец
    _setCursorToEnd = () => {
        const doc = this.editor.codemirror.getDoc();
        const lastLine = doc.lastLine();
        const lastChar = doc.getLine(lastLine).length;
        doc.setCursor(lastLine, lastChar);
    }
}