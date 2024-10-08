export class Queue {
    constructor(initialElements = [], initialCapacity = 64, autoResize = true) {
        const capacity = Math.max(initialCapacity, initialElements.length);
        this._elements = new Array(capacity);
        this._head = 0;
        this._tail = initialElements.length;
        this.autoResize = autoResize;

        for (let i = 0; i < initialElements.length; i++) {
            this._elements[i] = initialElements[i];
        }
    }

    enqueue(value) {
        if (this._tail === this._elements.length) {
            // Расширение массива
            this._resize(this._elements.length << 1);
        }
        this._elements[this._tail++] = value;
    }

    dequeue() {
        if (this.isEmpty()) return undefined;

        const value = this._elements[this._head];
        this._elements[this._head] = undefined; // Освобождение памяти

        this._head = (this._head + 1) % this._elements.length;

        // Сокращение размера, если данных мало и разрешено автоматическое уменьшение
        if (this.autoResize && this.getSize() > 0 && this.getSize() === (this._elements.length >> 2)) {
            this._resize(Math.max(this._elements.length >> 1));
        }

        return value;
    }

    peek() {
        return this.isEmpty() ? undefined : this._elements[this._head];
    }

    isEmpty() {
        return this._tail === this._head;
    }

    getSize() {
        return (this._tail - this._head + this._elements.length) % this._elements.length;
    }

    _resize(newCapacity) {
        const oldElements = this._elements;
        this._elements = new Array(newCapacity);
        const size = this.getSize();

        if (this._head === 0) {
            // Если массив используется линейно, просто копируем срез
            this._elements = oldElements.slice(0, size);
        } else {
            // Иначе выполняем циклическое копирование
            for (let i = 0; i < size; i++) {
                this._elements[i] = oldElements[(this._head + i) % oldElements.length];
            }
        }

        this._head = 0;
        this._tail = size;
    }

    shrinkToFit() {
        // Метод для ручного уменьшения размера массива до текущего количества элементов
        this._resize(this.getSize());
    }
}
