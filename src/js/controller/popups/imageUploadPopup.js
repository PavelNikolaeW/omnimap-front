import { Popup } from "./popup";
import api from "../../api/api";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 4096;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Валидация файла изображения
 * @param {File} file
 * @returns {{valid: boolean, error?: string}}
 */
function validateImageFile(file) {
    if (!file) {
        return { valid: false, error: 'Файл не выбран' };
    }
    if (file.size > MAX_FILE_SIZE) {
        return { valid: false, error: 'Файл слишком большой (макс. 5 MB)' };
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return { valid: false, error: 'Недопустимый формат. Допустимы: JPEG, PNG, GIF, WebP' };
    }
    return { valid: true };
}

/**
 * Проверка размеров изображения
 * @param {File} file
 * @returns {Promise<{valid: boolean, error?: string, width?: number, height?: number}>}
 */
function checkImageDimensions(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
                resolve({ valid: false, error: `Изображение слишком большое (макс. ${MAX_DIMENSION}x${MAX_DIMENSION})` });
            } else {
                resolve({ valid: true, width: img.width, height: img.height });
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            resolve({ valid: false, error: 'Не удалось загрузить изображение' });
        };
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Popup для загрузки изображения в блок
 */
export class ImageUploadPopup extends Popup {
    constructor(options = {}) {
        super({
            title: options.title || "Изображение блока",
            size: 'md',
            modal: true,
            draggable: true,
            onSubmit: options.onSubmit,
            onCancel: options.onCancel,
            inputs: [],
        });

        this.blockId = options.blockId;
        this.currentImage = options.currentImage || null;
        this.onImageChange = options.onImageChange;
        this.selectedFile = null;
        this.isUploading = false;
    }

    createPopup() {
        super.createPopup();
        this.contentArea.innerHTML = "";
        this.contentArea.className = 'popup-content image-upload-content';

        const container = document.createElement("div");
        container.className = "image-upload-container";

        // Сообщение об ошибке
        this.errorContainer = document.createElement("div");
        this.errorContainer.className = "popup-message-container";
        this.errorContainer.style.display = "none";
        this.errorContainer.setAttribute('role', 'alert');
        this.errorContainer.setAttribute('aria-live', 'assertive');
        this.errorMsg = document.createElement("div");
        this.errorMsg.className = "popup-message popup-message--error";
        this.errorContainer.appendChild(this.errorMsg);
        container.appendChild(this.errorContainer);

        // Сообщение об успехе
        this.successContainer = document.createElement("div");
        this.successContainer.className = "popup-message-container";
        this.successContainer.style.display = "none";
        this.successContainer.setAttribute('role', 'status');
        this.successContainer.setAttribute('aria-live', 'polite');
        this.successMsg = document.createElement("div");
        this.successMsg.className = "popup-message popup-message--success";
        this.successContainer.appendChild(this.successMsg);
        container.appendChild(this.successContainer);

        // Превью текущего изображения
        this.previewSection = document.createElement("div");
        this.previewSection.className = "image-upload-preview-section";
        container.appendChild(this.previewSection);

        // Drop zone
        this.dropZone = document.createElement("div");
        this.dropZone.className = "image-upload-dropzone";
        this.dropZone.setAttribute('role', 'button');
        this.dropZone.setAttribute('tabindex', '0');
        this.dropZone.setAttribute('aria-label', 'Область для загрузки изображения. Нажмите или перетащите файл');
        this.dropZone.innerHTML = `
            <div class="image-upload-dropzone-content">
                <i class="fas fa-cloud-upload-alt image-upload-icon" aria-hidden="true"></i>
                <p class="image-upload-text">Перетащите изображение сюда</p>
                <p class="image-upload-subtext">или нажмите для выбора файла</p>
                <p class="image-upload-hint">JPEG, PNG, GIF, WebP • до 5 MB • макс. 4096x4096</p>
            </div>
        `;
        container.appendChild(this.dropZone);

        // Скрытый input для файла
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = ALLOWED_TYPES.join(",");
        this.fileInput.style.display = "none";
        this.fileInput.setAttribute('aria-label', 'Выбор файла изображения');
        container.appendChild(this.fileInput);

        // Прогресс загрузки
        this.progressContainer = document.createElement("div");
        this.progressContainer.className = "image-upload-progress";
        this.progressContainer.style.display = "none";
        this.progressContainer.setAttribute('role', 'progressbar');
        this.progressContainer.setAttribute('aria-valuemin', '0');
        this.progressContainer.setAttribute('aria-valuemax', '100');
        this.progressContainer.setAttribute('aria-valuenow', '0');
        this.progressContainer.setAttribute('aria-label', 'Прогресс загрузки изображения');
        this.progressBar = document.createElement("div");
        this.progressBar.className = "image-upload-progress-bar";
        this.progressText = document.createElement("span");
        this.progressText.className = "image-upload-progress-text";
        this.progressText.textContent = "0%";
        this.progressContainer.appendChild(this.progressBar);
        this.progressContainer.appendChild(this.progressText);
        container.appendChild(this.progressContainer);

        this.contentArea.appendChild(container);

        this.setupEventListeners();
        this.renderCurrentImage();
    }

    setupEventListeners() {
        // Click на dropzone
        this.dropZone.addEventListener('click', () => {
            if (!this.isUploading) {
                this.fileInput.click();
            }
        });

        // Keyboard support for dropzone
        this.dropZone.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !this.isUploading) {
                e.preventDefault();
                this.fileInput.click();
            }
        });

        // Drag & Drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.isUploading) {
                this.dropZone.classList.add('dragover');
            }
        });

        this.dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            if (this.isUploading) return;

            const file = e.dataTransfer.files[0];
            if (file) {
                this.handleFileSelect(file);
            }
        });

        // File input change
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files[0];
            if (file) {
                this.handleFileSelect(file);
            }
        });
    }

    async handleFileSelect(file) {
        this.hideMessages();

        // Валидация типа и размера
        const basicValidation = validateImageFile(file);
        if (!basicValidation.valid) {
            this.showError(basicValidation.error);
            return;
        }

        // Проверка размеров изображения
        const dimensionCheck = await checkImageDimensions(file);
        if (!dimensionCheck.valid) {
            this.showError(dimensionCheck.error);
            return;
        }

        this.selectedFile = file;
        await this.uploadFile(file);
    }

    async uploadFile(file) {
        this.isUploading = true;
        this.showProgress();
        this.dropZone.classList.add('uploading');

        try {
            const result = await api.uploadBlockImage(this.blockId, file, (progress) => {
                this.updateProgress(progress);
            });

            this.currentImage = result;
            this.renderCurrentImage();
            this.showSuccess('Изображение успешно загружено');

            if (this.onImageChange) {
                this.onImageChange(result);
            }
        } catch (error) {
            this.showError(error.message || 'Ошибка загрузки изображения');
        } finally {
            this.isUploading = false;
            this.hideProgress();
            this.dropZone.classList.remove('uploading');
            this.fileInput.value = '';
        }
    }

    renderCurrentImage() {
        this.previewSection.innerHTML = '';

        if (!this.currentImage) {
            this.previewSection.style.display = 'none';
            return;
        }

        this.previewSection.style.display = 'block';

        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-upload-preview';

        // Thumbnail
        const thumbnail = document.createElement('img');
        thumbnail.src = this.currentImage.thumbnail_url || this.currentImage.url;
        thumbnail.alt = this.currentImage.filename;
        thumbnail.className = 'image-upload-thumbnail';
        thumbnail.addEventListener('click', () => this.openFullsize());
        previewContainer.appendChild(thumbnail);

        // Info
        const info = document.createElement('div');
        info.className = 'image-upload-info';
        info.innerHTML = `
            <p class="image-upload-filename">${this.currentImage.filename}</p>
            <p class="image-upload-dimensions">${this.currentImage.width} × ${this.currentImage.height} px</p>
            <p class="image-upload-size">${this.formatFileSize(this.currentImage.size)}</p>
        `;
        previewContainer.appendChild(info);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'image-upload-actions';

        const viewBtn = Popup.createButton('Просмотр', 'secondary', () => this.openFullsize());
        viewBtn.classList.add('popup-btn--sm');
        actions.appendChild(viewBtn);

        const deleteBtn = Popup.createButton('Удалить', 'danger', () => this.deleteImage());
        deleteBtn.classList.add('popup-btn--sm');
        actions.appendChild(deleteBtn);

        previewContainer.appendChild(actions);

        this.previewSection.appendChild(previewContainer);
    }

    openFullsize() {
        if (!this.currentImage || !this.currentImage.url) return;

        // Создаём overlay для полноразмерного просмотра
        const overlay = document.createElement('div');
        overlay.className = 'image-fullsize-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Просмотр изображения');

        const closeOverlay = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeydown);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeOverlay();
            }
        };

        overlay.addEventListener('click', closeOverlay);
        document.addEventListener('keydown', handleKeydown);

        const img = document.createElement('img');
        img.src = this.currentImage.url;
        img.className = 'image-fullsize-img';
        img.alt = this.currentImage.filename || 'Изображение блока';
        img.addEventListener('click', (e) => e.stopPropagation());

        const closeBtn = document.createElement('button');
        closeBtn.className = 'image-fullsize-close';
        closeBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
        closeBtn.setAttribute('aria-label', 'Закрыть просмотр');
        closeBtn.addEventListener('click', closeOverlay);

        overlay.appendChild(img);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        // Focus on close button for keyboard users
        closeBtn.focus();
    }

    async deleteImage() {
        if (!this.currentImage) return;

        this.hideMessages();

        try {
            await api.deleteBlockImage(this.blockId);
            this.currentImage = null;
            this.renderCurrentImage();
            this.showSuccess('Изображение удалено');

            if (this.onImageChange) {
                this.onImageChange(null);
            }
        } catch (error) {
            this.showError(error.message || 'Ошибка удаления изображения');
        }
    }

    showProgress() {
        this.progressContainer.style.display = 'flex';
        this.updateProgress(0);
    }

    hideProgress() {
        this.progressContainer.style.display = 'none';
    }

    updateProgress(percent) {
        this.progressBar.style.width = `${percent}%`;
        this.progressText.textContent = `${percent}%`;
        this.progressContainer.setAttribute('aria-valuenow', percent);
    }

    showError(message) {
        this.errorMsg.textContent = message;
        this.errorContainer.style.display = 'block';
        this.successContainer.style.display = 'none';
    }

    showSuccess(message) {
        this.successMsg.textContent = message;
        this.successContainer.style.display = 'block';
        this.errorContainer.style.display = 'none';
    }

    hideMessages() {
        this.errorContainer.style.display = 'none';
        this.successContainer.style.display = 'none';
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    createButtons() {
        const container = document.createElement("div");
        container.className = "popup-buttons";

        this.closeButton = Popup.createButton("Закрыть", "secondary", () => this.handleCancel());
        container.appendChild(this.closeButton);

        this.popupEl.appendChild(container);
    }

    handleSubmit() {
        this.close();
    }

    handleCancel() {
        if (typeof this.options.onCancel === "function") {
            this.options.onCancel();
        }
        this.close();
    }
}
