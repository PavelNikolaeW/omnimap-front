import { Popup } from "./popup.js";
import {
    importBlocks,
    pollImportStatus,
    parseImportJson,
    validateBlocksPayload,
    formatErrorMessage
} from "../../api/importService.js";
import { dispatch } from "../../utils/utils.js";

/**
 * Названия стадий импорта
 */
const STAGE_LABELS = {
    preparing: 'Подготовка...',
    importing: 'Импорт блоков...',
    notifying: 'Отправка уведомлений...',
    processing: 'Обработка...',
    completed: 'Завершено'
};

/**
 * Popup для импорта блоков из JSON
 */
export class ImportPopup extends Popup {
    constructor(options = {}) {
        super({
            title: options.title || "Импорт блоков",
            size: 'lg',
            modal: true,
            draggable: true,
            onSubmit: null,
            onCancel: options.onCancel,
            inputs: []
        });

        this.parentBlockId = options.parentBlockId || null;
        this.isImporting = false;
    }

    createPopup() {
        super.createPopup();
        this.contentArea.innerHTML = "";
        this.createImportContent();
    }

    createImportContent() {
        const container = document.createElement("div");
        container.className = "popup-form";

        // Описание
        const description = document.createElement("p");
        description.className = "popup-section__description";
        description.textContent = "Вставьте JSON с массивом блоков для импорта или загрузите файл.";
        container.appendChild(description);

        // Секция выбора файла
        const fileSection = document.createElement("div");
        fileSection.className = "import-file-section";

        const fileLabel = document.createElement("span");
        fileLabel.className = "import-file-label";
        fileLabel.textContent = "Загрузить из файла:";
        fileSection.appendChild(fileLabel);

        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = ".json";
        this.fileInput.className = "import-file-input";
        this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
        fileSection.appendChild(this.fileInput);

        container.appendChild(fileSection);

        // Textarea для JSON
        const textareaField = document.createElement("div");
        textareaField.className = "popup-form-field";

        const textareaLabel = document.createElement("label");
        textareaLabel.className = "popup-label";
        textareaLabel.textContent = "JSON данные:";
        textareaField.appendChild(textareaLabel);

        this.jsonInput = document.createElement("textarea");
        this.jsonInput.className = "popup-textarea import-json-input";
        this.jsonInput.placeholder = `[
  {
    "id": "uuid-блока",
    "parent_id": "uuid-родителя или null",
    "title": "Название блока",
    "data": { ... }
  }
]`;
        textareaField.appendChild(this.jsonInput);

        container.appendChild(textareaField);

        // Секция валидационных ошибок
        this.validationErrors = document.createElement("div");
        this.validationErrors.className = "import-validation-errors";
        this.validationErrors.style.display = "none";
        container.appendChild(this.validationErrors);

        // Секция прогресса
        this.progressSection = document.createElement("div");
        this.progressSection.className = "import-progress-section";

        const progressInfo = document.createElement("div");
        progressInfo.className = "import-progress-info";

        this.progressStage = document.createElement("span");
        this.progressStage.className = "import-progress-stage";
        this.progressStage.textContent = "Подготовка...";
        progressInfo.appendChild(this.progressStage);

        this.progressPercent = document.createElement("span");
        this.progressPercent.className = "import-progress-percent";
        this.progressPercent.textContent = "0%";
        progressInfo.appendChild(this.progressPercent);

        this.progressSection.appendChild(progressInfo);

        const progressBar = document.createElement("div");
        progressBar.className = "import-progress-bar";

        this.progressFill = document.createElement("div");
        this.progressFill.className = "import-progress-fill";
        progressBar.appendChild(this.progressFill);

        this.progressSection.appendChild(progressBar);

        this.progressCount = document.createElement("div");
        this.progressCount.className = "import-progress-count";
        this.progressCount.textContent = "";
        this.progressSection.appendChild(this.progressCount);

        container.appendChild(this.progressSection);

        // Секция результатов
        this.resultsSection = document.createElement("div");
        this.resultsSection.className = "import-results-section";
        container.appendChild(this.resultsSection);

        this.contentArea.appendChild(container);
    }

    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = "popup-buttons";

        this.importButton = Popup.createButton("Импортировать", "primary", () => this.handleImport());
        this.cancelButton = Popup.createButton("Закрыть", "secondary", () => this.handleCancel());

        buttonsContainer.appendChild(this.importButton);
        buttonsContainer.appendChild(this.cancelButton);
        this.popupEl.appendChild(buttonsContainer);
    }

    /**
     * Обработка выбора файла
     */
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.jsonInput.value = e.target.result;
            this.hideValidationErrors();
        };
        reader.onerror = () => {
            this.showValidationErrors("Ошибка чтения файла");
        };
        reader.readAsText(file);
    }

    /**
     * Запуск импорта
     */
    async handleImport() {
        if (this.isImporting) return;

        const jsonString = this.jsonInput.value.trim();
        if (!jsonString) {
            this.showValidationErrors("Введите JSON данные");
            return;
        }

        // Парсинг JSON
        const parseResult = parseImportJson(jsonString);
        if (!parseResult.success) {
            this.showValidationErrors(parseResult.error);
            return;
        }

        // Валидация
        const validation = validateBlocksPayload(parseResult.data);
        if (!validation.valid) {
            this.showValidationErrors(validation.errors.join('\n'));
            return;
        }

        // Добавляем parent_id если указан
        let blocks = parseResult.data;
        if (this.parentBlockId) {
            blocks = blocks.map(block => {
                if (block.parent_id === null || block.parent_id === undefined) {
                    return { ...block, parent_id: this.parentBlockId };
                }
                return block;
            });
        }

        this.hideValidationErrors();
        this.startImport(blocks);
    }

    /**
     * Запуск процесса импорта
     */
    async startImport(blocks) {
        this.isImporting = true;
        this.importButton.disabled = true;
        this.jsonInput.disabled = true;
        this.fileInput.disabled = true;

        this.showProgress();
        this.updateProgress({ stage: 'preparing', percent: 0, processed: 0, total: blocks.length });

        try {
            // Отправка на импорт
            const { task_id } = await importBlocks(blocks);

            // Polling статуса
            const result = await pollImportStatus(
                task_id,
                (progress) => this.updateProgress(progress)
            );

            // Показ результатов
            this.showResults(result);

            // Обновляем блоки на экране
            if (result.created_count > 0 || result.updated_count > 0) {
                dispatch('ShowBlocks');
            }

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isImporting = false;
            this.importButton.disabled = false;
            this.jsonInput.disabled = false;
            this.fileInput.disabled = false;
        }
    }

    /**
     * Показать секцию прогресса
     */
    showProgress() {
        this.progressSection.classList.add('visible');
        this.resultsSection.classList.remove('visible');
        this.progressFill.classList.remove('success', 'error');
    }

    /**
     * Обновить прогресс
     */
    updateProgress({ stage, percent, processed, total }) {
        this.progressStage.textContent = STAGE_LABELS[stage] || stage;
        this.progressPercent.textContent = `${Math.round(percent)}%`;
        this.progressFill.style.width = `${percent}%`;

        if (total > 0) {
            this.progressCount.textContent = `${processed} / ${total} блоков`;
        }

        // Стилизация стадии
        this.progressStage.className = 'import-progress-stage';
        if (stage === 'preparing') {
            this.progressStage.classList.add('stage-preparing');
        } else if (stage === 'importing') {
            this.progressStage.classList.add('stage-importing');
        } else if (stage === 'notifying') {
            this.progressStage.classList.add('stage-notifying');
        }
    }

    /**
     * Показать результаты импорта
     */
    showResults(result) {
        this.progressFill.style.width = '100%';
        this.progressFill.classList.add('success');
        this.progressStage.textContent = 'Завершено';
        this.progressPercent.textContent = '100%';

        this.resultsSection.innerHTML = '';
        this.resultsSection.classList.add('visible');

        // Статистика успеха
        const successDiv = document.createElement('div');
        successDiv.className = 'import-results-success';

        const createdStat = this.createStatElement(result.created_count || 0, 'Создано');
        const updatedStat = this.createStatElement(result.updated_count || 0, 'Обновлено');

        successDiv.appendChild(createdStat);
        successDiv.appendChild(updatedStat);
        this.resultsSection.appendChild(successDiv);

        // Проблемные блоки
        const problemBlocks = result.problem_blocks || [];
        if (problemBlocks.length > 0) {
            const errorList = document.createElement('div');
            errorList.className = 'import-error-list';

            const errorTitle = document.createElement('div');
            errorTitle.className = 'import-error-title';
            errorTitle.textContent = `Проблемы (${problemBlocks.length}):`;
            errorList.appendChild(errorTitle);

            problemBlocks.forEach(({ block_id, code }) => {
                const item = document.createElement('div');
                item.className = 'import-error-item';

                const idSpan = document.createElement('span');
                idSpan.className = 'import-error-block-id';
                idSpan.textContent = block_id;
                idSpan.title = block_id;

                const codeSpan = document.createElement('span');
                codeSpan.className = 'import-error-code';
                codeSpan.textContent = formatErrorMessage(code);

                item.appendChild(idSpan);
                item.appendChild(codeSpan);
                errorList.appendChild(item);
            });

            this.resultsSection.appendChild(errorList);
        }
    }

    /**
     * Создать элемент статистики
     */
    createStatElement(value, label) {
        const stat = document.createElement('div');
        stat.className = 'import-result-stat';

        const valueEl = document.createElement('span');
        valueEl.className = 'import-result-value';
        valueEl.textContent = value;

        const labelEl = document.createElement('span');
        labelEl.className = 'import-result-label';
        labelEl.textContent = label;

        stat.appendChild(valueEl);
        stat.appendChild(labelEl);
        return stat;
    }

    /**
     * Показать ошибку
     */
    showError(message) {
        this.progressFill.style.width = '100%';
        this.progressFill.classList.add('error');
        this.progressStage.textContent = 'Ошибка';

        this.resultsSection.innerHTML = '';
        this.resultsSection.classList.add('visible');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'import-error-list';

        const errorTitle = document.createElement('div');
        errorTitle.className = 'import-error-title';
        errorTitle.textContent = message;

        errorDiv.appendChild(errorTitle);
        this.resultsSection.appendChild(errorDiv);
    }

    /**
     * Показать ошибки валидации
     */
    showValidationErrors(message) {
        this.validationErrors.textContent = message;
        this.validationErrors.style.display = "block";
    }

    /**
     * Скрыть ошибки валидации
     */
    hideValidationErrors() {
        this.validationErrors.style.display = "none";
    }

    handleCancel() {
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}
