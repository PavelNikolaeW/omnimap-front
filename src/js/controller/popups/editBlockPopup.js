import { Popup } from "./popup";
import SimpleMDE from "simplemde";
import "simplemde/dist/simplemde.min.css";

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

        const textarea = document.createElement("textarea");
        container.appendChild(textarea);
        this.contentArea.appendChild(container);
        const clearObject = {}
        const blockData = this.options.blockData

        // const deniedFields = ['childOrder', 'customGrid', 'text'];
        const deniedFields = [];
        for (const key of Object.keys(blockData)) {
            if (!deniedFields.includes(key)) clearObject[key] = blockData[key]
        }
        // Init SimpleMDE
        this.editor = new SimpleMDE({
            element: textarea,
            initialValue: JSON.stringify(clearObject, null, 4),
            spellChecker: false,
            status: false,
            autofocus: true,
            lineWrapping: true,
            tabSize: 2,
            renderingConfig: {
                codeSyntaxHighlighting: true,
            },
            toolbar: ["undo", "redo", "|", "guide"],
        });

        this.errorMsg = document.createElement("div");
        this.errorMsg.style.color = "red";
        this.errorMsg.style.marginTop = "10px";
        this.errorMsg.style.display = "none";
        container.appendChild(this.errorMsg);
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
    }

    handleSubmit() {
        const value = this.editor.value();

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