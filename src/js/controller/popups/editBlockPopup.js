import { Popup } from "./popup";
import { JsonTextEditor } from "../JsonTextEditor";

export class EditBlockPopup extends Popup {
  constructor(options = {}) {
    super({
      title: options.title || "Редактировать JSON",
      size: 'full',
      modal: true,
      draggable: true,
      onSubmit: options.onSubmit,
      onCancel: options.onCancel,
      inputs: [],
      blockData: options.blockData,
    });
  }

  createPopup() {
    super.createPopup();
    this.contentArea.innerHTML = "";

    const container = document.createElement("div");
    container.className = "popup-json-editor";
    this.contentArea.appendChild(container);

    const blockData = this.options.blockData || {};

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

    const initial = JSON.stringify(blockData, null, 2);

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
