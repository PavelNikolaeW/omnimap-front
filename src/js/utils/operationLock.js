/**
 * Простой mutex для предотвращения race conditions при concurrent операциях.
 * Используется для блокировки операций с блоками (moveBlock, createBlock и т.д.)
 */
class OperationLock {
    constructor() {
        /** @type {Map<string, Promise<void>>} */
        this.locks = new Map();
    }

    /**
     * Получает блокировку для указанного ключа.
     * Ждёт завершения предыдущей операции, если блокировка уже захвачена.
     * @param {string} key - Ключ блокировки (например, 'parent:uuid')
     * @returns {Promise<Function>} Функция для освобождения блокировки
     */
    async acquire(key) {
        // Ждём завершения предыдущей операции для этого ключа
        while (this.locks.has(key)) {
            await this.locks.get(key);
        }

        let release;
        const promise = new Promise(resolve => { release = resolve; });
        this.locks.set(key, promise);

        return () => {
            this.locks.delete(key);
            release();
        };
    }

    /**
     * Проверяет, захвачена ли блокировка для ключа
     * @param {string} key - Ключ блокировки
     * @returns {boolean}
     */
    isLocked(key) {
        return this.locks.has(key);
    }

    /**
     * Получает количество активных блокировок
     * @returns {number}
     */
    get activeLocksCount() {
        return this.locks.size;
    }
}

// Синглтон для блокировки операций с блоками
export const blockOperationLock = new OperationLock();

export { OperationLock };
