import { Popup } from "./popup";
import api from "../../api/api";
import { getDefaultImageSettings, getSafeColor } from "../../utils/imageSettingsDefaults";

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

        // Настройки отображения картинки (всегда используем дефолты, настройки инициализируются в renderCurrentImage)
        this.currentSettings = this.getDefaultSettings();

        // AbortController для очистки event listeners
        this.settingsAbortController = null;

        // Debounced версия applySettings для слайдеров
        this.debouncedApplySettings = this._debounce(() => this.applySettings(), 100);
    }

    /**
     * Дефолтные настройки отображения картинки
     */
    getDefaultSettings() {
        return getDefaultImageSettings();
    }

    /**
     * Debounce функция для предотвращения частых вызовов
     * @param {Function} fn - функция для debounce
     * @param {number} delay - задержка в мс
     */
    _debounce(fn, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    /**
     * Очистка event listeners настроек
     */
    cleanupSettingsListeners() {
        if (this.settingsAbortController) {
            this.settingsAbortController.abort();
            this.settingsAbortController = null;
        }
    }

    /**
     * Создание HTML для секции настроек
     */
    createSettingsHtml() {
        const fitModes = [
            { id: 'auto', icon: 'fa-magic', title: 'Авто' },
            { id: 'cover', icon: 'fa-expand', title: 'Заполнить' },
            { id: 'contain', icon: 'fa-compress-arrows-alt', title: 'Вписать' },
            { id: 'fill', icon: 'fa-arrows-alt', title: 'Растянуть' },
            { id: 'original', icon: 'fa-image', title: 'Оригинал' }
        ];

        const positions = [
            'top-left', 'top-center', 'top-right',
            'center-left', 'center', 'center-right',
            'bottom-left', 'bottom-center', 'bottom-right'
        ];

        return `
            <div class="image-settings-title">Настройки отображения</div>

            <!-- Live Preview -->
            <div class="image-live-preview" data-testid="image-live-preview">
                <div class="image-live-preview__block">
                    <img class="image-live-preview__img" src="" alt="Preview" />
                    <div class="image-live-preview__overlay"></div>
                </div>
            </div>

            <!-- Режим отображения -->
            <div class="image-setting-group">
                <label class="image-setting-label">Режим</label>
                <div class="image-fit-presets">
                    ${fitModes.map(m => `
                        <button type="button"
                            class="image-fit-preset${m.id === this.currentSettings.fitMode ? ' active' : ''}"
                            data-fit="${m.id}"
                            title="${m.title}"
                            data-testid="fit-mode-${m.id}">
                            <i class="fas ${m.icon}"></i>
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Позиция -->
            <div class="image-setting-group">
                <label class="image-setting-label">Позиция</label>
                <div class="image-position-grid">
                    ${positions.map(pos => `
                        <button type="button"
                            class="image-position-btn${pos === this.currentSettings.position ? ' active' : ''}"
                            data-position="${pos}"
                            title="${this.getPositionTitle(pos)}"
                            data-testid="position-${pos}">
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Background режим -->
            <div class="image-setting-group">
                <label class="image-setting-checkbox">
                    <input type="checkbox"
                        id="imageBackgroundMode"
                        ${this.currentSettings.background.enabled ? 'checked' : ''}
                        data-testid="background-mode-toggle">
                    <span>Как фон блока</span>
                </label>
                <div class="image-background-settings" style="display: ${this.currentSettings.background.enabled ? 'block' : 'none'};">
                    <div class="image-setting-row">
                        <label>Прозрачность</label>
                        <input type="range"
                            id="imageOpacity"
                            min="0" max="100"
                            value="${this.currentSettings.background.opacity}"
                            data-testid="opacity-slider">
                        <span class="image-setting-value" data-for="imageOpacity">${this.currentSettings.background.opacity}%</span>
                    </div>
                    <div class="image-setting-row">
                        <label>Размытие</label>
                        <input type="range"
                            id="imageBlur"
                            min="0" max="20"
                            value="${this.currentSettings.background.blur}"
                            data-testid="blur-slider">
                        <span class="image-setting-value" data-for="imageBlur">${this.currentSettings.background.blur}px</span>
                    </div>
                    <div class="image-setting-row">
                        <label>Яркость</label>
                        <input type="range"
                            id="imageBrightness"
                            min="0" max="200"
                            value="${this.currentSettings.background.brightness ?? 100}"
                            data-testid="brightness-slider">
                        <span class="image-setting-value" data-for="imageBrightness">${this.currentSettings.background.brightness ?? 100}%</span>
                    </div>
                    <div class="image-setting-row">
                        <label>Контрастность</label>
                        <input type="range"
                            id="imageContrast"
                            min="0" max="200"
                            value="${this.currentSettings.background.contrast ?? 100}"
                            data-testid="contrast-slider">
                        <span class="image-setting-value" data-for="imageContrast">${this.currentSettings.background.contrast ?? 100}%</span>
                    </div>
                    <div class="image-setting-row">
                        <label>Насыщенность</label>
                        <input type="range"
                            id="imageSaturation"
                            min="0" max="200"
                            value="${this.currentSettings.background.saturation ?? 100}"
                            data-testid="saturation-slider">
                        <span class="image-setting-value" data-for="imageSaturation">${this.currentSettings.background.saturation ?? 100}%</span>
                    </div>
                    <div class="image-setting-row">
                        <label>Оверлей</label>
                        <input type="color"
                            id="imageOverlayColor"
                            value="${this.currentSettings.background.overlayColor || '#000000'}"
                            data-testid="overlay-color">
                        <input type="range"
                            id="imageOverlayOpacity"
                            min="0" max="100"
                            value="${this.currentSettings.background.overlayOpacity}"
                            data-testid="overlay-opacity-slider">
                        <span class="image-setting-value" data-for="imageOverlayOpacity">${this.currentSettings.background.overlayOpacity}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Получить название позиции для tooltip
     */
    getPositionTitle(position) {
        const titles = {
            'top-left': 'Сверху слева',
            'top-center': 'Сверху по центру',
            'top-right': 'Сверху справа',
            'center-left': 'По центру слева',
            'center': 'По центру',
            'center-right': 'По центру справа',
            'bottom-left': 'Снизу слева',
            'bottom-center': 'Снизу по центру',
            'bottom-right': 'Снизу справа'
        };
        return titles[position] || position;
    }

    /**
     * Настройка обработчиков событий для настроек
     */
    setupSettingsListeners() {
        if (!this.settingsSection) return;

        // Очищаем старые listeners
        this.cleanupSettingsListeners();
        this.settingsAbortController = new AbortController();
        const { signal } = this.settingsAbortController;

        // Fit mode presets
        this.settingsSection.querySelectorAll('.image-fit-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFitMode(btn.dataset.fit);
            }, { signal });
        });

        // Position grid
        this.settingsSection.querySelectorAll('.image-position-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setPosition(btn.dataset.position);
            }, { signal });
        });

        // Background mode toggle
        const bgToggle = this.settingsSection.querySelector('#imageBackgroundMode');
        bgToggle?.addEventListener('change', (e) => {
            this.toggleBackgroundSettings(e.target.checked);
        }, { signal });

        // Range sliders - используем debounce для applySettings
        ['imageOpacity', 'imageBlur', 'imageBrightness', 'imageContrast', 'imageSaturation', 'imageOverlayOpacity'].forEach(id => {
            const input = this.settingsSection.querySelector(`#${id}`);
            input?.addEventListener('input', (e) => {
                this.updateSliderValue(id, e.target.value);
                this.updateCurrentSettings();
                this.updateLivePreview();
                this.debouncedApplySettings(); // debounced версия
            }, { signal });
        });

        // Overlay color - также используем debounce
        const colorInput = this.settingsSection.querySelector('#imageOverlayColor');
        colorInput?.addEventListener('input', () => {
            this.updateCurrentSettings();
            this.updateLivePreview();
            this.debouncedApplySettings(); // debounced версия
        }, { signal });
    }

    /**
     * Установить режим отображения
     */
    setFitMode(fitMode) {
        this.currentSettings.fitMode = fitMode;

        // Обновить UI
        this.settingsSection.querySelectorAll('.image-fit-preset').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.fit === fitMode);
        });

        this.updateLivePreview();
        this.applySettings();
    }

    /**
     * Установить позицию
     */
    setPosition(position) {
        this.currentSettings.position = position;

        // Обновить UI
        this.settingsSection.querySelectorAll('.image-position-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.position === position);
        });

        this.updateLivePreview();
        this.applySettings();
    }

    /**
     * Переключить настройки background режима
     */
    toggleBackgroundSettings(enabled) {
        this.currentSettings.background.enabled = enabled;

        const bgSettings = this.settingsSection.querySelector('.image-background-settings');
        if (bgSettings) {
            bgSettings.style.display = enabled ? 'block' : 'none';
        }

        this.updateLivePreview();
        this.applySettings();
    }

    /**
     * Обновить отображение значения слайдера
     */
    updateSliderValue(inputId, value) {
        const valueEl = this.settingsSection.querySelector(`.image-setting-value[data-for="${inputId}"]`);
        if (!valueEl) return;

        if (inputId === 'imageBlur') {
            valueEl.textContent = `${value}px`;
        } else {
            valueEl.textContent = `${value}%`;
        }
    }

    /**
     * Обновить текущие настройки из UI
     */
    updateCurrentSettings() {
        const opacity = this.settingsSection.querySelector('#imageOpacity');
        const blur = this.settingsSection.querySelector('#imageBlur');
        const brightness = this.settingsSection.querySelector('#imageBrightness');
        const contrast = this.settingsSection.querySelector('#imageContrast');
        const saturation = this.settingsSection.querySelector('#imageSaturation');
        const overlayColor = this.settingsSection.querySelector('#imageOverlayColor');
        const overlayOpacity = this.settingsSection.querySelector('#imageOverlayOpacity');

        if (opacity) this.currentSettings.background.opacity = parseInt(opacity.value);
        if (blur) this.currentSettings.background.blur = parseInt(blur.value);
        if (brightness) this.currentSettings.background.brightness = parseInt(brightness.value);
        if (contrast) this.currentSettings.background.contrast = parseInt(contrast.value);
        if (saturation) this.currentSettings.background.saturation = parseInt(saturation.value);
        if (overlayColor) this.currentSettings.background.overlayColor = overlayColor.value;
        if (overlayOpacity) this.currentSettings.background.overlayOpacity = parseInt(overlayOpacity.value);
    }

    /**
     * Обновить live preview
     */
    updateLivePreview() {
        const previewImg = this.settingsSection?.querySelector('.image-live-preview__img');
        const overlay = this.settingsSection?.querySelector('.image-live-preview__overlay');

        const previewUrl = this.getPreviewUrl();
        if (!previewImg || !this.currentImage || !this.currentSettings || !previewUrl) return;

        // Установить картинку
        previewImg.src = previewUrl;

        // Применить fit mode
        previewImg.style.objectFit = this.getFitModeCSS(this.currentSettings.fitMode);
        previewImg.style.objectPosition = this.getPositionCSS(this.currentSettings.position);

        // Background режим
        if (this.currentSettings.background?.enabled) {
            previewImg.style.opacity = this.currentSettings.background.opacity / 100;

            // Собираем CSS filter из нескольких значений
            const filters = [];
            const blur = this.currentSettings.background.blur || 0;
            const brightness = this.currentSettings.background.brightness ?? 100;
            const contrast = this.currentSettings.background.contrast ?? 100;
            const saturation = this.currentSettings.background.saturation ?? 100;

            if (blur > 0) filters.push(`blur(${blur}px)`);
            if (brightness !== 100) filters.push(`brightness(${brightness / 100})`);
            if (contrast !== 100) filters.push(`contrast(${contrast / 100})`);
            if (saturation !== 100) filters.push(`saturate(${saturation / 100})`);

            previewImg.style.filter = filters.length > 0 ? filters.join(' ') : 'none';

            if (overlay) {
                // Валидация цвета для защиты от CSS injection
                overlay.style.backgroundColor = getSafeColor(this.currentSettings.background.overlayColor, '#000000');
                overlay.style.opacity = this.currentSettings.background.overlayOpacity / 100;
                overlay.style.display = 'block';
            }
        } else {
            previewImg.style.opacity = 1;
            previewImg.style.filter = 'none';
            if (overlay) overlay.style.display = 'none';
        }
    }

    /**
     * Получить CSS значение для fitMode
     */
    getFitModeCSS(fitMode) {
        const map = {
            'auto': 'contain',
            'cover': 'cover',
            'contain': 'contain',
            'fill': 'fill',
            'original': 'none'
        };
        return map[fitMode] || 'contain';
    }

    /**
     * Получить CSS значение для position
     */
    getPositionCSS(position) {
        const map = {
            'top-left': 'top left',
            'top-center': 'top center',
            'top-right': 'top right',
            'center-left': 'center left',
            'center': 'center center',
            'center-right': 'center right',
            'bottom-left': 'bottom left',
            'bottom-center': 'bottom center',
            'bottom-right': 'bottom right'
        };
        return map[position] || 'center center';
    }

    /**
     * Применить настройки (auto-apply)
     */
    applySettings() {
        if (!this.currentImage) return;

        // Обновляем настройки в currentImage
        this.currentImage.settings = { ...this.currentSettings };

        // Сохраняем settings на сервер
        api.updateBlockImageSettings(this.blockId, this.currentSettings)
            .catch(err => {
                console.error('Failed to save image settings:', err);
            });

        // Отправляем изменения локально
        if (this.onImageChange) {
            this.onImageChange(this.currentImage);
        }
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
        this.previewSection.setAttribute('data-testid', 'image-upload-preview');
        container.appendChild(this.previewSection);

        // Секция настроек отображения (HTML создаётся в renderCurrentImage после инициализации)
        this.settingsSection = document.createElement("div");
        this.settingsSection.className = "image-settings-section";
        this.settingsSection.style.display = 'none';
        this.settingsSection.setAttribute('data-testid', 'image-settings');
        container.appendChild(this.settingsSection);

        // Drop zone
        this.dropZone = document.createElement("div");
        this.dropZone.className = "image-upload-dropzone";
        this.dropZone.setAttribute('role', 'button');
        this.dropZone.setAttribute('tabindex', '0');
        this.dropZone.setAttribute('aria-label', 'Область для загрузки изображения. Нажмите или перетащите файл');
        this.dropZone.setAttribute('data-testid', 'image-upload-dropzone');
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
        this.fileInput.setAttribute('data-testid', 'image-upload-input');
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

        // Настройки отображения картинки
        this.setupSettingsListeners();
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

            // Добавляем дефолтные настройки к новому изображению
            result.settings = this.getDefaultSettings();
            this.currentImage = result;
            this.currentSettings = result.settings;
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

    /**
     * Получить URL превью изображения (поддержка старого и нового формата)
     */
    getPreviewUrl() {
        if (!this.currentImage) {
            console.debug('ImageUploadPopup: no currentImage');
            return null;
        }
        const url = this.currentImage.thumbnail_url ||
               this.currentImage.variants?.thumb?.url ||
               this.currentImage.url ||
               this.currentImage.variants?.original?.url;
        if (!url) {
            console.warn('ImageUploadPopup: currentImage exists but no URL found:', this.currentImage);
        }
        return url;
    }

    /**
     * Получить URL оригинала (поддержка старого и нового формата)
     */
    getOriginalUrl() {
        if (!this.currentImage) return null;
        return this.currentImage.url ||
               this.currentImage.variants?.original?.url ||
               this.getPreviewUrl();
    }

    renderCurrentImage() {
        this.previewSection.innerHTML = '';

        // Проверяем наличие изображения (поддержка старого и нового формата)
        const previewUrl = this.getPreviewUrl();
        if (!this.currentImage || !previewUrl) {
            this.previewSection.style.display = 'none';
            this.settingsSection.style.display = 'none';
            return;
        }

        this.previewSection.style.display = 'block';

        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-upload-preview';

        // Thumbnail
        const thumbnail = document.createElement('img');
        thumbnail.src = previewUrl;
        thumbnail.alt = this.currentImage.filename || 'Image';
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

        // Показать секцию настроек и инициализировать
        this.settingsSection.style.display = 'block';
        // Мержим настройки с дефолтами для защиты от неполных данных
        const defaults = this.getDefaultSettings();
        const savedSettings = this.currentImage.settings || {};
        this.currentSettings = {
            fitMode: savedSettings.fitMode || defaults.fitMode,
            position: savedSettings.position || defaults.position,
            background: {
                ...defaults.background,
                ...(savedSettings.background || {})
            }
        };
        this.settingsSection.innerHTML = this.createSettingsHtml();
        this.setupSettingsListeners();
        this.updateLivePreview();
    }

    openFullsize() {
        const originalUrl = this.getOriginalUrl();
        if (!this.currentImage || !originalUrl) return;

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
        img.src = originalUrl;
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

    /**
     * Закрытие popup с очисткой listeners
     */
    close() {
        this.cleanupSettingsListeners();
        super.close();
    }
}
