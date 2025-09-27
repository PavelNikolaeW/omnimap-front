import api from "../../../api/api";

class ChatUI {
    constructor({elements = {}, storageKey = 'llm-chat-v1', autotitle = true} = {}) {
        if (!api) throw new Error('ChatUI requires an Api instance');
        this.api = api;
        this.LS_KEY = storageKey;
        this.autotitle = autotitle;

        // Bind DOM (allow overriding for embedding)
        this.dom = {
            wrap: elements.wrap || document.getElementById('llmWrap'),
            openBtn: elements.openBtn || document.getElementById('llmOpenBtn'),
            left: elements.left || document.getElementById('llmLeft'),
            list: elements.list || document.getElementById('llmList'),
            newBtn: elements.newBtn || document.getElementById('llmNew'),
            closeSide: elements.closeSide || document.getElementById('llmCloseSide'),
            titleEl: elements.titleEl || document.getElementById('llmTitle'),
            bodyEl: elements.bodyEl || document.getElementById('llmBody'),
            input: elements.input || document.getElementById('llmInput'),
            sendBtn: elements.sendBtn || document.getElementById('llmSend'),
            insertCtxBtn: elements.insertCtxBtn || document.getElementById('llmInsertCtx'),
            pasteBtn: elements.pasteBtn || document.getElementById('llmPaste'),
            menuBtn: elements.menuBtn || document.getElementById('llmMenu'),
            closeBtn: elements.closeBtn || document.getElementById('llmClose'),
        };

        // State
        this.state = this.#loadState();
        this.streamingReader = null;

        // Wire events (can be omitted if you open/close via external code)
        this.#wireBasics();
        this.renderList();
        this.#ensureCurrent();

        if (this.autotitle) {
            this.#observeAutotitle();
        }
    }

    // ===== Public API =====
    open(ctx) {
        this.ctx = ctx
        this.ctx.mode = 'chat'
        const {wrap, input} = this.dom;
        if (!wrap) return;
        wrap.style.display = 'block';
        input?.focus();
        this.renderList();
        this.#ensureCurrent();
        this.#scrollToBottom();
    }

    close() {
        if (this.ctx.mode === 'chat') {
            this.ctx.mode = 'normal'
            const {wrap} = this.dom;
            if (!wrap) return;
            wrap.style.display = 'none';
            this.#stopStream();
        }
    }

    toggleSidebar() {
        const {left} = this.dom;
        if (!left) return;
        left.classList.toggle('open');
    }

    async send() {
        const {input} = this.dom;
        const text = (input?.innerText || '').trim();
        if (!text) return;

        this.#stopStream();

        const conv = this.#current();
        const userMsg = {id: this.#uid(), role: 'user', content: text, ts: this.#nowISO()};
        conv.msgs.push(userMsg);
        conv.updated_at = this.#nowISO();
        this.#saveState();

        this.#addMsgEl(userMsg);
        input.innerHTML = '';
        input.dataset.empty = '1';

        const asstMsg = {id: this.#uid(), role: 'assistant', content: '', ts: this.#nowISO()};
        conv.msgs.push(asstMsg);
        this.#saveState();
        const bubble = this.#addMsgEl(asstMsg);
        this.#scrollToBottom();

        const payload = {conversation_id: conv.id, message: text, stream: true};

        try {
            const resp = await this.api.send(payload);
            if (resp && resp.ok && resp.headers.get('Content-Type')?.includes('text/event-stream')) {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder('utf-8');
                this.streamingReader = reader;
                let buffer = '';
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, {stream: true});
                    const parts = buffer.split('\n\n');
                    for (let i = 0; i < parts.length - 1; i++) {
                        const line = parts[i].trim();
                        if (line.startsWith('data:')) {
                            const chunk = line.slice(5).trim();
                            if (chunk === '[DONE]') {
                                this.#stopStream();
                                break;
                            }
                            asstMsg.content += chunk;
                            this.#renderMarkdown(bubble, asstMsg.content);
                            this.#scrollToBottom();
                        }
                    }
                    buffer = parts[parts.length - 1];
                }
            } else {
                // JSON fallback
                let data = {};
                try {
                    data = await resp.json();
                } catch {
                }
                const answer = data?.answer || 'Ошибка или пустой ответ.';
                asstMsg.content = answer;
                this.#renderMarkdown(bubble, answer);
            }
        } catch (err) {
            asstMsg.content = 'Сеть недоступна. Попробуйте позже.';
            bubble.textContent = asstMsg.content;
        } finally {
            conv.updated_at = this.#nowISO();
            this.#saveState();
            this.renderList();
        }
    }

    insertContext() {
        const sel = window.getSelection();
        let txt = sel && sel.toString().trim();
        if (!txt) {
            const region = document.querySelector('[data-chat-context], main article, article, main');
            if (region) txt = region.innerText.trim().slice(0, 4000);
        }
        if (txt) {
            const payload = `

> Контекст со страницы: “${document.title}” — ${location.href}
> ---
${txt}`;
            this.#appendToInput(payload);
        }
    }

    async pasteFromClipboard() {
        try {
            const txt = await navigator.clipboard.readText();
            if (txt) this.#appendToInput(txt);
        } catch {
        }
    }

    // ===== Private helpers =====
    #wireBasics() {
        const {openBtn, closeBtn, menuBtn, closeSide, newBtn, sendBtn, insertCtxBtn, pasteBtn, input} = this.dom;

        openBtn?.addEventListener('click', () => this.open());
        closeBtn?.addEventListener('click', () => this.close());
        menuBtn?.addEventListener('click', () => this.toggleSidebar());
        closeSide?.addEventListener('click', () =>  this.toggleSidebar());
        newBtn?.addEventListener('click', () => {
            this.#createConversation();
            this.renderList();
            this.renderThread();
        });
        sendBtn?.addEventListener('click', () => this.send());
        insertCtxBtn?.addEventListener('click', () => this.insertContext());
        pasteBtn?.addEventListener('click', () => this.pasteFromClipboard());

        // contenteditable placeholder + keyboard
        if (input) {
            input.addEventListener('input', () => {
                input.dataset.empty = input.innerText.trim().length === 0 ? '1' : '';
            });
            input.addEventListener('blur', () => {
                input.dataset.empty = input.innerText.trim().length === 0 ? '1' : '';
            });
            input.dataset.empty = '1';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.send();
                }
            });
        }
    }

    #appendToInput(txt) {
        const {input} = this.dom;
        const sel = window.getSelection();
        input?.focus();
        document.execCommand('insertText', false, txt);
        if (sel && sel.rangeCount) {
            sel.collapse(input.lastChild || input, 1);
        }
        if (input) input.dataset.empty = input.innerText.trim() ? '' : '1';
    }

    #ensureCurrent() {
        if (!this.state.current || !this.state.convs.find(c => c.id === this.state.current)) {
            this.#createConversation();
        }
        const cur = this.#current();
        if (this.dom.titleEl) this.dom.titleEl.textContent = cur.title || 'Новый диалог';
    }

    #createConversation() {
        const id = this.#uid();
        const conv = {id, title: 'Новый диалог', created_at: this.#nowISO(), updated_at: this.#nowISO(), msgs: []};
        this.state.convs.unshift(conv);
        this.state.current = id;
        this.#saveState();
    }

    #current() {
        return this.state.convs.find(c => c.id === this.state.current) || this.state.convs[0];
    }

    renderList() {
        const {list} = this.dom;
        if (!list) return;
        list.innerHTML = '';
        this.state.convs.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'llm-item' + (conv.id === this.state.current ? ' active' : '');
            item.innerHTML = `<div class="llm-ava">💬</div>
        <div style="min-width:0">
          <div class="llm-item-title" title="${conv.title}">${conv.title}</div>
          <div class="llm-item-time">${this.#fmtTime(conv.updated_at)}</div>
        </div>
        <div style="margin-left:auto; display:flex; gap:6px">
          <button class="llm-btn" data-act="rename">✎</button>
          <button class="llm-btn" data-act="delete">🗑</button>
        </div>`;
            item.addEventListener('click', (e) => {
                const act = e.target?.dataset?.act;
                if (act === 'delete') {
                    e.stopPropagation();
                    if (confirm('Удалить диалог?')) {
                        this.state.convs = this.state.convs.filter(x => x.id !== conv.id);
                        if (this.state.current === conv.id) this.state.current = this.state.convs[0]?.id || null;
                        this.#saveState();
                        this.renderList();
                        this.renderThread();
                    }
                    return;
                }
                if (act === 'rename') {
                    e.stopPropagation();
                    const t = prompt('Название диалога', conv.title) || conv.title;
                    conv.title = t;
                    conv.updated_at = this.#nowISO();
                    this.#saveState();
                    this.renderList();
                    return;
                }
                this.state.current = conv.id;
                this.#saveState();
                this.renderList();
                this.renderThread();
                this.dom.left?.classList.remove('open');
            });
            list.appendChild(item);
        });
    }

    renderThread() {
        const {bodyEl, titleEl} = this.dom;
        if (!bodyEl) return;
        bodyEl.innerHTML = '';
        const conv = this.#current();
        if (!conv) return;
        if (titleEl) titleEl.textContent = conv.title || 'Новый диалог';
        conv.msgs.forEach(m => this.#addMsgEl(m));
        this.#scrollToBottom();
    }

    #addMsgEl(m) {
        const {bodyEl} = this.dom;
        if (!bodyEl) return;
        const row = document.createElement('div');
        row.className = 'llm-msg ' + (m.role === 'user' ? 'llm-user' : 'llm-assistant');
        const ava = document.createElement('div');
        ava.className = 'llm-ava';
        ava.textContent = m.role === 'user' ? '👤' : '🤖';
        const bubble = document.createElement('div');
        bubble.className = 'llm-bubble';
        this.#renderMarkdown(bubble, m.content || '');
        row.appendChild(ava);
        row.appendChild(bubble);
        bodyEl.appendChild(row);
        return bubble;
    }

    #renderMarkdown(el, text) {
        try {
            if (window.marked) {
                el.innerHTML = marked.parse(text || '');
                el.querySelectorAll('pre code').forEach(block => {
                    try {
                        window.hljs?.highlightElement(block);
                    } catch {
                    }
                });
            } else {
                el.textContent = text || '';
            }
        } catch {
            el.textContent = text || '';
        }
    }

    #scrollToBottom() {
        const {bodyEl} = this.dom;
        if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    #stopStream() {
        if (this.streamingReader && this.streamingReader.cancel) {
            try {
                this.streamingReader.cancel();
            } catch {
            }
        }
        this.streamingReader = null;
    }

    #observeAutotitle() {
        const {bodyEl} = this.dom;
        if (!bodyEl) return;
        const mo = new MutationObserver(() => {
            const conv = this.#current();
            if (!conv) return;
            if (conv.title === 'Новый диалог') {
                const firstUser = conv.msgs.find(m => m.role === 'user');
                if (firstUser) {
                    conv.title = (firstUser.content || 'Диалог').slice(0, 40);
                    this.#saveState();
                    this.renderList();
                    if (this.dom.titleEl) this.dom.titleEl.textContent = conv.title;
                }
            }
        });
        mo.observe(bodyEl, {childList: true, subtree: true});
    }

    // ==== Storage & utils ====
    #loadState() {
        try {
            return JSON.parse(localStorage.getItem(this.LS_KEY)) || {convs: [], current: null};
        } catch {
            return {convs: [], current: null};
        }
    }

    #saveState() {
        localStorage.setItem(this.LS_KEY, JSON.stringify(this.state));
    }

    #uid() {
        return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    }

    #nowISO() {
        return new Date().toISOString();
    }

    #fmtTime(iso) {
        return new Date(iso).toLocaleString();
    }
}

// Instantiate and expose control helpers
(function initChat() {
    const chat = new ChatUI();
    // Expose for external UI buttons
    window.openChat = (ctx) => chat.open(ctx);
    window.closeChat = (ctx) => chat.close(ctx);
    window.getChat = () => chat; // gives access to send(), insertContext(), etc.
})();