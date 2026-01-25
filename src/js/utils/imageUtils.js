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

// initBlockImageHandlers перенесён inline в index.js чтобы избежать tree-shaking
