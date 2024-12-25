// selectionManager.js
export class SelectionManager {
  constructor() {
    this.disableClass = 'no-select';
    this.timer = null;
    this.isDisabled = false;
  }

  disableSelection(duration) {
    if (this.isDisabled) {
      // Если выделение уже отключено, сбросим текущий таймер
      clearTimeout(this.timer);
    } else {
      // Отключаем выделение
      document.body.classList.add(this.disableClass);
      this.isDisabled = true;
    }

    // Устанавливаем новый таймер для включения выделения
    this.timer = setTimeout(() => {
      this.enableSelection();
    }, duration);
  }

  enableSelection() {
    if (this.isDisabled) {
      document.body.classList.remove(this.disableClass);
      this.isDisabled = false;
      this.timer = null;
    }
  }

  cancelDisable() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.isDisabled) {
      this.enableSelection();
    }
  }
}

// Экспортируем экземпляр менеджера
const selectionManager = new SelectionManager();
export default selectionManager;
