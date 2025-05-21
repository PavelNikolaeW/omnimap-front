import TurndownService from 'turndown';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import SimpleMDE from 'simplemde';
import {marked} from 'marked';
import hotkeys from 'hotkeys-js';
import {gfm} from 'turndown-plugin-gfm';
import 'emoji-picker-element';
import {customPrompt} from "../utils/custom-dialog";
import {isMobileOrTablet} from "../utils/functions";


const BLOCK_LINK_PREFIX = 'block:';

export class NoteEditor {
    constructor(containerSelector) {
        this.container = document.getElementById(containerSelector);
        this.editor = null;
        this.blockId = null;
        this.isMobile = isMobileOrTablet()

        this.#setupTurndown();
        this.#setupCustomRenderer();
        this.#setupSanitizer();
    }

    openEditor(blockId, html, ctx) {
        this.blockId = blockId;
        const markdown = this.turndownService.turndown(html);
        this.container.innerHTML = '';
        this.container.classList.add('active')
        const textarea = document.createElement('textarea');
        this.container.appendChild(textarea);
        this.ctx = ctx
        this.editor = new SimpleMDE({
            element: textarea,
            initialValue: markdown,
            toolbar: this.#getToolbar(),
            inputStyle: this.isMobile ? "textarea" : "contenteditable",
            spellChecker: true,
            autocorrect: "on",
            autocapitalize: "sentences",
            spellcheck: true,
            autofocus: true,
            previewRender: (plainText) =>
                marked(plainText, {renderer: this.customRenderer, mangle: false}),
            renderingConfig: {
                singleLineBreaks: true,
                codeSyntaxHighlighting: true,
            },
        });



        this.#setupEditorHotkeys();
        this.#setCursorToEndOnce();
    }

    closeEditor(save) {
        if (!this.editor) return;

        if (save) {
            const markdown = this.editor.value();
            const html = marked(markdown, {renderer: this.customRenderer, mangle: false});
            const sanitized = DOMPurify.sanitize(html, {
                ADD_ATTR: ['block-id', 'style', 'class', 'title', 'alt', 'src', 'href'],
                ADD_TAGS: ['img', 'a', 'bgImage'],
            });
            const highlightedHtml = this.#highlightHtml(sanitized);

            const event = new CustomEvent('TextUpdate', {
                detail: {
                    blockId: this.blockId,
                    text: highlightedHtml,
                },
            });
            this.ctx.mode = 'normal'
            this.ctx.event = undefined
            window.dispatchEvent(event);
        }

        this.editor.toTextArea();
        this.editor = null;
        this.container.classList.remove('active')
        this.container.innerHTML = '';
        this.blockId = null;
    }

    #setupTurndown() {
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

    #setupCustomRenderer() {
        this.customRenderer = new marked.Renderer();
        const originalLink = this.customRenderer.link;

        // Кастомизация ссылок
        this.customRenderer.link = (argArray) => {
            const {href, text} = argArray

            if (typeof href === 'string' && href.startsWith(BLOCK_LINK_PREFIX)) {
                const id = href.slice(BLOCK_LINK_PREFIX.length);
                return `<a href="#${href}" class="block-tag-link" block-id="${id}">${text}</a>`;
            }
            return originalLink.call(this.customRenderer, argArray);
        };

        // Кастомизация картинок
        this.customRenderer.image = ({href, title, text}) => {
            const titleAttr = title ? ` title="${title}"` : '';
            const altAttr = text ? ` alt="${text}"` : ' alt=""';
            return `<img src="${href}"${titleAttr}${altAttr} style="max-width:100%; height:auto; display:block;" />`;
        };

    }

    #setupSanitizer() {
        DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
            console.log(node, data)
            if (
                data.attrName === 'href' &&
                node.nodeName === 'A' &&
                node.classList.contains('block-tag-link')
            ) {
                data.keepAttr = true;
            }
        });
    }

    #getToolbar() {
        return [
            this.#getSaveButton(),
            {
                name: "newline",
                action: (editor) => {
                    editor.codemirror.replaceSelection("\n");
                    editor.codemirror.focus();
                },
                className: "fa fa-level-down",
                title: "Перенос строки"
            }, "bold", "italic", "strikethrough", "heading", "|",
            "unordered-list", "ordered-list", "|",
            "image", "link", this.#getBlockLinkButton(), "|",
            this.#getEmojiButton(),
            "quote", "code", "table", "horizontal-rule", "|",
            "preview", "side-by-side", "guide"
        ];
    }

    #getBlockLinkButton() {
        return {
            name: "insertBlockLink",
            action: (editor) => {
                customPrompt("Введите ID блока:").then(id => {
                    if (id) {
                        editor.codemirror.replaceSelection(`[Блок:](${BLOCK_LINK_PREFIX}${id})`);
                    }
                })
            },
            className: "fa fa-link",
            title: "Вставить ссылку на блок"
        };
    }

    #getEmojiButton() {
        return {
            name: "emoji",
            action: (editor) => {
                if (document.getElementById('emoji-picker')) return
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
                picker.id = 'emoji-picker'
                picker.style.width = '300px';
                picker.style.height = '400px';
                pickerContainer.appendChild(picker);
                document.body.appendChild(pickerContainer);
                picker.addEventListener('emoji-click', (event) => {
                    const emoji = event.detail.unicode;
                    editor.codemirror.replaceSelection(emoji);
                    // Удаляем контейнер, если он существует
                    if (pickerContainer.parentNode) {
                        pickerContainer.parentNode.removeChild(pickerContainer);
                    }
                });

                const handleClickOutside = (e) => {
                    if (!pickerContainer.contains(e.target)) {
                        if (pickerContainer.parentNode) {
                            pickerContainer.parentNode.removeChild(pickerContainer);
                        }
                        document.removeEventListener('click', handleClickOutside);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', handleClickOutside);
                }, 100);
            },
            className: "fa fa-smile-o",
            title: "Вставить эмодзи"
        };
    }

    #setupEditorHotkeys() {
        this.editor.codemirror.on('keydown', (cm, e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (this.isMobile) {
                    // на мобилке просто вставляем перенос строки
                    e.preventDefault();
                    cm.replaceSelection('\n');
                } else {
                    // на десктопе — сохраняем и закрываем
                    e.preventDefault();
                    hotkeys.trigger('enter');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hotkeys.trigger('esc');
            }
        });
    }

    #setCursorToEndOnce() {
        const setCursor = () => {
            const doc = this.editor.codemirror.getDoc();
            const lastLine = doc.lastLine();
            const lastChar = doc.getLine(lastLine).length;
            doc.setCursor(lastLine, lastChar);
            this.editor.codemirror.off('focus', setCursor);
        };
        this.editor.codemirror.on('focus', setCursor);
    }

    #highlightHtml(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        tempDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        return tempDiv.innerHTML;
    }

    #getSaveButton() {
        return {
            name: "save",
            action: () => {
                this.closeEditor(true);
            },
            className: "fa fa-floppy-o", // иконка сохранения из FontAwesome
            title: "Сохранить Enter"
        };
    }
}
