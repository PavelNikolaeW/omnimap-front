import { Popup } from "./popup";
import { JsonTextEditor } from "../JsonTextEditor";

// Поля которые опасно редактировать вручную
const DANGEROUS_FIELDS = [
  'id',           // Изменение сломает связи
  'parent_id',    // Изменение сломает дерево
  'children',     // Должен совпадать с childOrder
  'updated_at',   // Системное поле
  'forbidden',    // Системный флаг доступа
  'permission',   // Системный уровень прав
  'creator_id',   // ID создателя
];

// Служебные поля которые не нужно показывать
const INTERNAL_FIELDS = [
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

    // Предупреждение об опасных полях
    const warning = document.createElement("div");
    warning.className = "popup-warning";
    warning.innerHTML = `
      <i class="fas fa-exclamation-triangle"></i>
      <span>
        <strong>Внимание:</strong> Поля <code>id</code>, <code>parent_id</code>,
        <code>children</code>, <code>permission</code> — системные.
        Их изменение может привести к ошибкам.
      </span>
    `;
    container.appendChild(warning);

    // Сообщение об ошибке
    this.errorMsgContainer = document.createElement("div");
    this.errorMsgContainer.className = "popup-message-container";
    this.errorMsgContainer.style.display = "none";
    this.errorMsg = document.createElement("div");
    this.errorMsg.className = "popup-message popup-message--error";
    this.errorMsgContainer.appendChild(this.errorMsg);
    container.appendChild(this.errorMsgContainer);

    // Монтируем JSON-редактор
    this.editorHost = document.createElement('div');
    this.editorHost.className = 'note-editor-container';
    container.appendChild(this.editorHost);

    // Формируем данные для редактора
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
   * Подготавливает блок для редактирования
   * Убирает служебные поля, сортирует для удобства
   */
  _prepareBlockForEdit() {
    const fullBlock = this.options.fullBlock;
    if (!fullBlock) {
      // Fallback на старое поведение (только data)
      return this.options.blockData || {};
    }

    // Фильтруем служебные поля
    const result = {};

    // Сначала безопасные поля
    if (fullBlock.title !== undefined) result.title = fullBlock.title;
    if (fullBlock.data !== undefined) result.data = fullBlock.data;
    if (fullBlock.sandbox_mode !== undefined) result.sandbox_mode = fullBlock.sandbox_mode;

    // Потом опасные системные поля
    if (fullBlock.id !== undefined) result.id = fullBlock.id;
    if (fullBlock.parent_id !== undefined) result.parent_id = fullBlock.parent_id;
    if (fullBlock.children !== undefined) result.children = fullBlock.children;
    if (fullBlock.permission !== undefined) result.permission = fullBlock.permission;
    if (fullBlock.creator_id !== undefined) result.creator_id = fullBlock.creator_id;
    if (fullBlock.forbidden !== undefined) result.forbidden = fullBlock.forbidden;
    if (fullBlock.updated_at !== undefined) result.updated_at = fullBlock.updated_at;

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
