/**
 * Утилиты для работы с изображениями
 */

/**
 * Открывает полноэкранный просмотр изображения
 * @param {string} imageUrl - URL изображения для показа
 * @param {string} [alt='Изображение'] - Alt текст для изображения
 */
export function openFullsizeImage(imageUrl, alt = 'Изображение') {
    if (!imageUrl) return;

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
    img.src = imageUrl;
    img.className = 'image-fullsize-img';
    img.alt = alt;
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

/**
 * Инициализирует обработчики двойного клика на изображениях в блоках
 * Должен вызываться один раз при инициализации приложения
 */
export function initBlockImageHandlers() {
    // Используем делегирование событий на rootContainer
    const rootContainer = document.getElementById('rootContainer');
    if (!rootContainer) return;

    rootContainer.addEventListener('dblclick', (e) => {
        // Проверяем клик по изображению блока
        const imageContainer = e.target.closest('.block-image-container');
        if (!imageContainer) return;

        // Получаем URL полноразмерного изображения
        const fullsizeUrl = imageContainer.getAttribute('data-fullsize-url');
        if (!fullsizeUrl) return;

        // Предотвращаем открытие блока
        e.preventDefault();
        e.stopPropagation();

        // Получаем alt текст из img
        const img = imageContainer.querySelector('.block-image');
        const alt = img?.alt || 'Изображение блока';

        openFullsizeImage(fullsizeUrl, alt);
    });
}
