/**
 * Простой mutex для предотвращения race conditions при concurrent операциях.
 * Используется для блокировки операций с блоками (moveBlock, createBlock и т.д.)
 *
 * @class OperationLock
 * @example
 * const lock = new OperationLock();
 * const release = await lock.acquire('parent:123');
 * try {
 *     // критическая секция
 * } finally {
 *     release();
 * }
 */
class OperationLock {
    /**
     * @param {number} [defaultTimeout=30000] - Таймаут по умолчанию (мс)
     */
    constructor(defaultTimeout = 30000) {
        /** @type {Map<string, Promise<void>>} */
        this.locks = new Map();
        /** @type {number} */
        this.defaultTimeout = defaultTimeout;
    }

    /**
     * Получает блокировку для указанного ключа.
     * Ждёт завершения предыдущей операции, если блокировка уже захвачена.
     * @param {string} key - Ключ блокировки (например, 'parent:uuid')
     * @param {number} [timeoutMs] - Таймаут ожидания (мс), по умолчанию defaultTimeout
     * @returns {Promise<Function>} Функция для освобождения блокировки
     */
    async acquire(key, timeoutMs) {
        const timeout = timeoutMs ?? this.defaultTimeout;
        const startTime = Date.now();

        // Ждём завершения предыдущей операции для этого ключа
        while (this.locks.has(key)) {
            // Проверяем таймаут
            if (Date.now() - startTime > timeout) {
                console.warn(`⚠️ Lock timeout for key: ${key}, forcing release`);
                this.locks.delete(key); // Принудительно освобождаем застрявший lock
                break;
            }
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

    /**
     * Принудительно освобождает все блокировки (для cleanup)
     */
    releaseAll() {
        this.locks.clear();
    }
}

// Синглтон для блокировки операций с блоками
export const blockOperationLock = new OperationLock();

export { OperationLock };
