export class Queue {
    constructor(initialElements = [], initialCapacity = 64, autoResize = true) {
        const capacity = Math.max(initialCapacity, initialElements.length);
        this._elements = new Array(capacity);
        this._capacity = capacity;
        this._size = initialElements.length;
        this._head = 0;
        this._tail = initialElements.length % capacity;
        this.autoResize = autoResize;
        this._initialCapacity = initialCapacity;

        for (let i = 0; i < initialElements.length; i++) {
            this._elements[i] = initialElements[i];
        }
    }

    enqueue(value) {
        if (this._size === this._capacity) {
            this._resize(this._capacity << 1);
        }
        this._elements[this._tail] = value;
        this._tail = (this._tail + 1) % this._capacity;
        this._size++;
    }

    dequeue() {
        if (this.isEmpty()) return undefined;

        const value = this._elements[this._head];
        this._elements[this._head] = undefined; // Освобождение памяти
        this._head = (this._head + 1) % this._capacity;
        this._size--;

        // Сокращение размера массива при необходимости
        if (
            this.autoResize &&
            this._size > 0 &&
            this._size === (this._capacity >> 2) &&
            (this._capacity >> 1) >= this._initialCapacity
        ) {
            this._resize(this._capacity >> 1);
        }
        return value;
    }

    peek() {
        return this.isEmpty() ? undefined : this._elements[this._head];
    }

    isEmpty() {
        return this._size === 0;
    }

    getSize() {
        return this._size;
    }

    _resize(newCapacity) {
        const newElements = new Array(newCapacity);
        for (let i = 0; i < this._size; i++) {
            newElements[i] = this._elements[(this._head + i) % this._capacity];
        }
        this._elements = newElements;
        this._capacity = newCapacity;
        this._head = 0;
        this._tail = this._size;
    }

    shrinkToFit() {
        this._resize(Math.max(this._size, this._initialCapacity));
    }
}
