import { Popup } from "./popup";
import { JsonTextEditor } from "../JsonTextEditor";

// Системные поля - только для просмотра, нельзя редактировать
const READONLY_FIELDS = [
  'id',           // Идентификатор блока
  'parent_id',    // Родительский блок
  'children',     // Дочерние блоки
  'updated_at',   // Время обновления
  'forbidden',    // Флаг запрета доступа
  'permission',   // Уровень прав
  'creator_id',   // ID создателя
  'sandbox_mode', // Режим sandbox
];

// Служебные поля которые не нужно показывать вообще
const HIDDEN_FIELDS = [
  '_childOrderVersion',
  '_lastRenderedVersion',
  'childrenPositions',
  'grid',
  'color',
  'contentEl',
  'size',
  'contentPosition',
];

export class EditBlockPopup extends Popup {
  constructor(options = {}) {
    super({
      title: options.title || "Редактировать блок",
      size: 'full',
      modal: true,
      draggable: true,
      onSubmit: options.onSubmit,
      onCancel: options.onCancel,
      inputs: [],
      blockData: options.blockData,
      fullBlock: options.fullBlock,  // Весь блок для редактирования
      blockId: options.blockId,
    });
  }

  createPopup() {
    super.createPopup();
    this.contentArea.innerHTML = "";

    const container = document.createElement("div");
    container.className = "popup-json-editor";
    this.contentArea.appendChild(container);

    // Системная информация (только для просмотра)
    const readonlyInfo = this._createReadonlySection();
    if (readonlyInfo) {
      container.appendChild(readonlyInfo);
    }

    // Сообщение об ошибке
    this.errorMsgContainer = document.createElement("div");
    this.errorMsgContainer.className = "popup-message-container";
    this.errorMsgContainer.style.display = "none";
    this.errorMsg = document.createElement("div");
    this.errorMsg.className = "popup-message popup-message--error";
    this.errorMsgContainer.appendChild(this.errorMsg);
    container.appendChild(this.errorMsgContainer);

    // Заголовок редактируемой секции
    const editLabel = document.createElement("div");
    editLabel.className = "popup-section-label";
    editLabel.textContent = "Редактируемые поля:";
    container.appendChild(editLabel);

    // Монтируем JSON-редактор
    this.editorHost = document.createElement('div');
    this.editorHost.className = 'note-editor-container';
    container.appendChild(this.editorHost);

    // Формируем данные для редактора (только редактируемые поля)
    const blockToEdit = this._prepareBlockForEdit();
    const initial = JSON.stringify(blockToEdit, null, 2);

    this.editor = new JsonTextEditor({
      container: this.editorHost,
      initialValue: initial,
      onValidate: (ok, err) => {
        if (ok) {
          this.errorMsgContainer.style.display = "none";
          this.errorMsg.textContent = "";
        } else {
          this.errorMsg.textContent = "Ошибка JSON: " + err;
          this.errorMsgContainer.style.display = "block";
        }
      },
    });

    // хоткей Ctrl/Cmd+S из редактора — трактуем как "Применить"
    this.editorHost.addEventListener('json-editor-ctrl-s', () => this.handleSubmit());
  }

  /**
   * Создаёт секцию с readonly системной информацией
   */
  _createReadonlySection() {
    const fullBlock = this.options.fullBlock;
    if (!fullBlock) return null;

    const section = document.createElement("div");
    section.className = "popup-readonly-section";

    const label = document.createElement("div");
    label.className = "popup-section-label";
    label.innerHTML = '<i class="fas fa-lock"></i> Системные поля (только чтение):';
    section.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "popup-readonly-grid";

    // Показываем только существующие поля
    const fieldsToShow = [
      { key: 'id', label: 'ID' },
      { key: 'parent_id', label: 'Родитель' },
      { key: 'permission', label: 'Права' },
      { key: 'sandbox_mode', label: 'Sandbox' },
      { key: 'creator_id', label: 'Создатель' },
      { key: 'updated_at', label: 'Обновлён' },
    ];

    for (const { key, label } of fieldsToShow) {
      const value = fullBlock[key];
      if (value === undefined || value === null || value === false) continue;

      const item = document.createElement("div");
      item.className = "popup-readonly-item";

      const labelEl = document.createElement("span");
      labelEl.className = "popup-readonly-label";
      labelEl.textContent = label + ':';

      const valueEl = document.createElement("span");
      valueEl.className = "popup-readonly-value";
      valueEl.textContent = this._formatValue(key, value);
      valueEl.title = String(value); // Полное значение в tooltip

      item.appendChild(labelEl);
      item.appendChild(valueEl);
      grid.appendChild(item);
    }

    section.appendChild(grid);
    return section;
  }

  /**
   * Форматирует значение для отображения
   */
  _formatValue(key, value) {
    if (key === 'id' || key === 'parent_id' || key === 'creator_id') {
      // Сокращаем UUID
      const str = String(value);
      return str.length > 12 ? str.slice(0, 8) + '...' : str;
    }
    if (key === 'updated_at') {
      // Форматируем дату
      try {
        const date = new Date(value);
        return date.toLocaleString('ru-RU', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  /**
   * Подготавливает блок для редактирования
   * Возвращает только редактируемые поля (title, data без childOrder)
   */
  _prepareBlockForEdit() {
    const fullBlock = this.options.fullBlock;
    if (!fullBlock) {
      // Fallback на старое поведение (только data)
      return this.options.blockData || {};
    }

    // Только редактируемые поля
    const result = {};
    if (fullBlock.title !== undefined) result.title = fullBlock.title;

    // data без защищённых полей (childOrder)
    if (fullBlock.data !== undefined) {
      const { childOrder, ...editableData } = fullBlock.data;
      result.data = editableData;
      // Сохраняем оригинальный childOrder для восстановления при сохранении
      this._originalChildOrder = childOrder;
    }

    return result;
  }

  createButtons() {
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "popup-buttons";

    this.submitButton = Popup.createButton("Применить", "primary", () => this.handleSubmit());
    this.cancelButton = Popup.createButton("Отмена", "secondary", () => this.handleCancel());

    buttonsContainer.appendChild(this.submitButton);
    buttonsContainer.appendChild(this.cancelButton);
    this.popupEl.appendChild(buttonsContainer);
  }

  handleSubmit() {
    const value = this.editor.getValue();
    try {
      const parsed = JSON.parse(value);

      // Восстанавливаем защищённые поля в data
      if (parsed.data && this._originalChildOrder !== undefined) {
        parsed.data.childOrder = this._originalChildOrder;
      }

      if (typeof this.options.onSubmit === "function") {
        this.options.onSubmit(parsed);
      }
      this.close();
    } catch (err) {
      this.errorMsg.textContent = "Ошибка JSON: " + err.message;
      this.errorMsgContainer.style.display = "block";
    }
  }

  handleCancel() {
    if (typeof this.options.onCancel === "function") {
      this.options.onCancel();
    }
    this.close();
  }
}
