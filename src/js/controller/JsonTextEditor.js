import hljs from 'highlight.js';

/**
 * Лёгкий JSON-редактор на textarea + свой тулбар.
 * Повторно использует классы стилей из NoteEditor:
 *   .note-editor-toolbar, .note-editor-textarea, .note-editor-preview
 */
export class JsonTextEditor {
  constructor({ container, initialValue = "{}", onValidate }) {
    this.container = container;           // DOM-элемент, куда монтируем
    this.onValidate = onValidate || null; // (ok:boolean, error?:string) => void

    this.textarea = null;
    this.previewEl = null;
    this.toolbarEl = null;

    this._mount(initialValue);
  }

  // ---------- Публичное API ----------
  getValue() {
    return this.textarea?.value ?? '';
  }

  setValue(text) {
    if (!this.textarea) return;
    const st = this.textarea.scrollTop;
    this.textarea.value = text;
    this.textarea.scrollTop = st;
  }

  focus() {
    this.textarea?.focus();
  }

  destroy() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.textarea = null;
    this.previewEl = null;
    this.toolbarEl = null;
  }

  // ---------- private ----------
  _mount(initialValue) {
    this.container.innerHTML = '';

    // toolbar
    this.toolbarEl = this._buildToolbar();
    this.container.appendChild(this.toolbarEl);

    // editor
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'note-editor-textarea';
    this.textarea.spellcheck = false;
    this.textarea.autocapitalize = 'off';
    this.textarea.autocorrect = 'off';
    this.textarea.value = initialValue;
    this.container.appendChild(this.textarea);

    // preview
    this.previewEl = document.createElement('div');
    this.previewEl.className = 'note-editor-preview';
    this.previewEl.style.display = 'none';
    this.container.appendChild(this.previewEl);

    // hotkeys
    this._setupHotkeys();

    // каретка в конец
    this.textarea.focus();
    const v = this.textarea.value;
    this.textarea.setSelectionRange(v.length, v.length);
  }

  _buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'note-editor-toolbar';

    const add = (title, icon, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${icon}`;
      b.title = title;
      b.addEventListener('click', (e) => { e.preventDefault(); onClick(); this.focus(); });
      bar.appendChild(b);
    };

    // ядро
    add('Форматировать (Beautify)', 'fa fa-magic', () => this._beautify());
    add('Уплотнить (Minify)', 'fa fa-compress', () => this._minify());
    add('Проверить JSON', 'fa fa-check', () => this._validate(true));
    add('Сортировать ключи (shallow)', 'fa fa-sort-alpha-asc', () => this._sortKeys());
    add('Копировать в буфер', 'fa fa-clipboard', () => this._copy());
    add('Превью', 'fa fa-eye', () => this._togglePreview());

    return bar;
  }

  _setupHotkeys() {
    this.textarea.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + S => валидация (пусть попап решит "submit")
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const ok = this._validate(false);
        if (!ok) this._togglePreview(true); // покажем подсветку с ошибкой
        // вызывающий попап сам решит, что делать на submit
        this.textarea.dispatchEvent(new CustomEvent('json-editor-ctrl-s'));
      }

      // Esc — bubbling: пусть попап поймает и закроет
      if (e.key === 'Escape') {
        // ничего не делаем тут, пусть всплывает
      }
    });
  }

  _beautify() {
    try {
      const obj = JSON.parse(this.getValue());
      const pretty = JSON.stringify(obj, null, 2);
      this.setValue(pretty);
      this._notifyValidate(true);
    } catch (err) {
      this._notifyValidate(false, err.message);
    }
  }

  _minify() {
    try {
      const obj = JSON.parse(this.getValue());
      const min = JSON.stringify(obj);
      this.setValue(min);
      this._notifyValidate(true);
    } catch (err) {
      this._notifyValidate(false, err.message);
    }
  }

  _sortKeys() {
    try {
      const obj = JSON.parse(this.getValue());
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const sorted = {};
        Object.keys(obj).sort().forEach(k => { sorted[k] = obj[k]; });
        const pretty = JSON.stringify(sorted, null, 2);
        this.setValue(pretty);
        this._notifyValidate(true);
      }
    } catch (err) {
      this._notifyValidate(false, err.message);
    }
  }

  _copy() {
    const text = this.getValue();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this._flashToolbar();
      });
    } else {
      // fallback
      const ta = this.textarea;
      const selStart = ta.selectionStart, selEnd = ta.selectionEnd;
      ta.select();
      document.execCommand('copy');
      ta.setSelectionRange(selStart, selEnd);
      this._flashToolbar();
    }
  }

  _flashToolbar() {
    this.toolbarEl.style.opacity = '1';
    this.toolbarEl.animate([{ opacity: 1 }, { opacity: 0.9 }], { duration: 250 });
  }

  _togglePreview(forceShow) {
    const show = typeof forceShow === 'boolean'
      ? forceShow
      : this.previewEl.style.display === 'none';

    if (show) {
      const code = document.createElement('code');
      code.className = 'language-json';
      code.textContent = this.getValue();

      const pre = document.createElement('pre');
      pre.appendChild(code);

      this.previewEl.innerHTML = '';
      this.previewEl.appendChild(pre);

      try { hljs.highlightElement(code); } catch {}
    }

    this.previewEl.style.display = show ? 'block' : 'none';
  }

  _validate(showPreviewOnError) {
    try {
      JSON.parse(this.getValue());
      this._notifyValidate(true);
      return true;
    } catch (err) {
      this._notifyValidate(false, err.message);
      if (showPreviewOnError) this._togglePreview(true);
      return false;
    }
  }

  _notifyValidate(ok, errorMsg) {
    if (typeof this.onValidate === 'function') this.onValidate(ok, errorMsg);
  }
}

