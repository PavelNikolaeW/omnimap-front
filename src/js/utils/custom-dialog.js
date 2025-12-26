// custom-dialog.js
// ES-модуль с фиксом мобильного автозума, скролла и удаления лишнего ввода при открытии по горячим клавишам

// --- Helper: управляем viewport meta для отключения автозума ---
let originalViewportContent;
function disableAutoZoom() {
  const meta = document.querySelector('meta[name=viewport]');
  if (meta) {
    originalViewportContent = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  }
}
function restoreViewport() {
  const meta = document.querySelector('meta[name=viewport]');
  if (meta && originalViewportContent !== undefined) {
    meta.setAttribute('content', originalViewportContent);
    originalViewportContent = undefined;
  }
}

// --- Стили для модального диалога (unified popup design) ---
const styleId = 'custom-dialog-style';
if (!document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
  .custom-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: custom-modal-fade-in 0.15s ease;
  }
  @keyframes custom-modal-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .custom-modal {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    max-width: 90%;
    width: 400px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    animation: custom-modal-scale-in 0.2s ease;
  }
  @keyframes custom-modal-scale-in {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .custom-modal-message {
    margin-bottom: 16px;
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
  }
  .custom-modal-input {
    width: 100%;
    padding: 10px 14px;
    margin-bottom: 16px;
    box-sizing: border-box;
    font-size: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .custom-modal-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }
  .custom-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .custom-modal-buttons button {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .custom-modal-buttons .btn-cancel {
    background: #6b7280;
    color: #fff;
    border: none;
  }
  .custom-modal-buttons .btn-cancel:hover {
    background: #4b5563;
  }
  .custom-modal-buttons .btn-ok {
    background: #3b82f6;
    color: #fff;
    border: none;
  }
  .custom-modal-buttons .btn-ok:hover {
    background: #2563eb;
  }
  @media (max-width: 640px) {
    .custom-modal {
      width: 95%;
      padding: 20px;
    }
    .custom-modal-buttons {
      flex-direction: column;
    }
    .custom-modal-buttons button {
      width: 100%;
    }
  }
  `;
  document.head.appendChild(style);
}

// --- Функция показа модального диалога ---
function showModal({ message, inputDefault, showInput, okText = 'OK', cancelText = 'Cancel' }) {
  return new Promise(resolve => {
    // Отключаем автозум мобильных при фокусе
    disableAutoZoom();

    // Блокируем прокрутку страницы с сохранением позиции
    const scrollY = window.scrollY || window.pageYOffset;
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%' });

    // Создаём оверлей и модалку
    const overlay = document.createElement('div'); overlay.className = 'custom-modal-overlay';
    const modal = document.createElement('div'); modal.className = 'custom-modal';

    // Сообщение
    const msg = document.createElement('div'); msg.className = 'custom-modal-message'; msg.textContent = message || '';
    modal.appendChild(msg);

    // Поле ввода (для prompt)
    let input;
    if (showInput) {
      input = document.createElement('input');
      input.className = 'custom-modal-input'; input.type = 'text'; input.value = typeof inputDefault === 'string' ? inputDefault : '';
      modal.appendChild(input);
    }

    // Кнопки
    const btns = document.createElement('div'); btns.className = 'custom-modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = cancelText;
    cancelBtn.className = 'btn-cancel';
    const okBtn = document.createElement('button');
    okBtn.textContent = okText;
    okBtn.className = 'btn-ok';
    btns.append(cancelBtn, okBtn);
    modal.appendChild(btns);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Фокус на input или OK и очистка возможного лишнего символа
    if (input) {
      input.focus();
      // Запускаем очистку после следующего тика, чтобы убрать символ от хоткея
      setTimeout(() => { input.value = typeof inputDefault === 'string' ? inputDefault : ''; }, 0);
    } else {
      okBtn.focus();
    }

    function cleanup() {
      // Удаляем оверлей
      document.body.removeChild(overlay);
      // Восстанавливаем тело и прокрутку
      Object.assign(document.body.style, { position: '', top: '', width: '' });
      window.scrollTo(0, scrollY);
      // Восстанавливаем viewport meta
      restoreViewport();
    }

    // Обработчики
    okBtn.addEventListener('click', () => { cleanup(); resolve(showInput ? input.value : true); });
    cancelBtn.addEventListener('click', () => { cleanup(); resolve(showInput ? null : false); });
    overlay.addEventListener('keydown', e => {
      // Предотвращаем другие вводы внутри модалки
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    }, true);
  });
}

// --- Экспортируемые функции ---
/** Показывает окно ввода текста. */
export function customPrompt(message, defaultValue = '') {
  return showModal({ message, inputDefault: defaultValue, showInput: true });
}

/** Показывает окно подтверждения. */
export function customConfirm(message) {
  return showModal({ message, showInput: false });
}
