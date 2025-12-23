import { Popup } from "./popup";
import { JsonTextEditor } from "../JsonTextEditor";

export class EditBlockPopup extends Popup {
  constructor(options = {}) {
    super({
      title: options.title || "Редактировать JSON",
      modal: true,
      draggable: true,
      onSubmit: options.onSubmit,
      onCancel: options.onCancel,
      inputs: [],
      classPrefix: options.classPrefix || "edit-json-popup",
      blockData: options.blockData,
    });
  }

  createPopup() {
    super.createPopup();
    this.contentArea.innerHTML = "";

    const container = document.createElement("div");
    container.className = this.getPrefixedClass("json-editor");
    this.contentArea.appendChild(container);

    const blockData = this.options.blockData || {};

    // Сообщение об ошибке
    this.errorMsg = document.createElement("div");
    this.errorMsg.style.color = "red";
    this.errorMsg.style.marginTop = "10px";
    this.errorMsg.style.display = "none";
    container.appendChild(this.errorMsg);

    // Монтируем наш JSON-редактор
    this.editorHost = document.createElement('div');
    this.editorHost.className = 'note-editor-container'; // для общих стилей (не обязательно)
    container.appendChild(this.editorHost);

    const initial = JSON.stringify(blockData, null, 2);

    this.editor = new JsonTextEditor({
      container: this.editorHost,
      initialValue: initial,
      onValidate: (ok, err) => {
        if (ok) {
          this.errorMsg.style.display = "none";
          this.errorMsg.textContent = "";
        } else {
          this.errorMsg.textContent = "Ошибка JSON: " + err;
          this.errorMsg.style.display = "block";
        }
      },
    });

    // хоткей Ctrl/Cmd+S из редактора — трактуем как "Применить"
    this.editorHost.addEventListener('json-editor-ctrl-s', () => this.handleSubmit());
  }

  createButtons() {
    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = this.getPrefixedClass("buttons");

    this.submitButton = document.createElement("button");
    this.submitButton.textContent = "Применить";
    this.submitButton.className = this.getPrefixedClass("button-submit");
    this.submitButton.addEventListener("click", () => this.handleSubmit());
    buttonsContainer.appendChild(this.submitButton);

    this.cancelButton = document.createElement("button");
    this.cancelButton.textContent = "Отмена";
    this.cancelButton.className = this.getPrefixedClass("button-cancel");
    this.cancelButton.addEventListener("click", () => this.handleCancel());
    buttonsContainer.appendChild(this.cancelButton);

    this.popupEl.appendChild(buttonsContainer);

    // Закрытие по Esc (пусть ловит весь попап)
    this.popupEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.handleCancel();
    });
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
      this.errorMsg.style.display = "block";
    }
  }

  handleCancel() {
    if (typeof this.options.onCancel === "function") {
      this.options.onCancel();
    }
    this.close();
  }
}
