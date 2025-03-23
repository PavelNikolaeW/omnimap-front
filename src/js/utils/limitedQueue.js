export class LimitedMapQueue {
    // очередь с ограниченным размером первым пришёл – первым вышел

    constructor(limit) {
        this.limit = limit;
        this.queue = new Map();
    }

    set(key, value) {
        if (this.queue.has(key)) {
            // удаляем существующий ключ, чтобы обновить его позицию
            this.queue.delete(key);
        } else if (this.queue.size >= this.limit) {
            // Удаляем самый старый элемент (первый добавленный)
            const oldestKey = this.queue.keys().next().value;
            this.queue.delete(oldestKey);
        }
        this.queue.set(key, value);
    }

    get(key) {
        return this.queue.get(key);
    }

    delete(key) {
        return this.queue.delete(key);
    }

    entries() {
        return Array.from(this.queue.entries());
    }
}

export class LimitedQueue {
    constructor(limit) {
        this.limit = limit;
        this.queue = new Map();
    }

    add(item) {
        if (this.queue.size >= this.limit) {
            // Удаляем самый старый элемент
            const oldestKey = this.queue.keys().next().value;
            this.queue.delete(oldestKey);
        }
        const key = Symbol();
        this.queue.set(key, item);
    }

    pop() {
        if (this.queue.size === 0) {
            return null;
        }
        const latestKey = Array.from(this.queue.keys()).pop();
        const item = this.queue.get(latestKey);
        this.queue.delete(latestKey);
        return item;
    }

    getAll() {
        return Array.from(this.queue.values());
    }

    clear() {
        this.queue.clear();
    }

    size() {
        return this.queue.size;
    }
}
