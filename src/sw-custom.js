/**
 * Кастомный код для Service Worker
 * Этот файл импортируется в сгенерированный Workbox SW
 */

// Константы для Background Sync
const SYNC_TAG = 'omnimap-sync';
const QUEUE_KEY = 'offlineOperationsQueue';

/**
 * Открывает IndexedDB для работы с очередью
 */
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('localforage', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Получает очередь операций из IndexedDB
 */
async function getQueue() {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['keyvaluepairs'], 'readonly');
            const store = transaction.objectStore('keyvaluepairs');
            const request = store.get(QUEUE_KEY);

            request.onerror = () => resolve([]);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result : []);
            };
        });
    } catch (error) {
        console.error('[SW] Error getting queue:', error);
        return [];
    }
}

/**
 * Сохраняет очередь операций в IndexedDB
 */
async function saveQueue(queue) {
    try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['keyvaluepairs'], 'readwrite');
            const store = transaction.objectStore('keyvaluepairs');
            const request = store.put(queue, QUEUE_KEY);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('[SW] Error saving queue:', error);
    }
}

/**
 * Выполняет операцию с API
 */
async function executeOperation(operation, backendUrl) {
    const { type, data } = operation;

    const headers = {
        'Content-Type': 'application/json',
    };

    // Получаем токен из cookies (через fetch к странице приложения не работает)
    // Вместо этого используем credential: 'include' для передачи cookies

    let url, method, body;

    switch (type) {
        case 'createBlock':
            url = `${backendUrl}/api/v1/new-block/${data.parentId}/`;
            method = 'POST';
            body = JSON.stringify({ title: data.title, data: data.blockData });
            break;

        case 'updateBlock':
            url = `${backendUrl}/api/v1/edit-block/${data.id}/`;
            method = 'POST';
            body = JSON.stringify(data.blockData);
            break;

        case 'deleteBlock':
            url = `${backendUrl}/api/v1/delete-tree/${data.id}/`;
            method = 'DELETE';
            break;

        case 'moveBlock':
            url = `${backendUrl}/api/v1/move-block/${data.oldParentId}/${data.newParentId}/${data.blockId}/`;
            method = 'POST';
            body = JSON.stringify({ childOrder: data.childOrder });
            break;

        case 'createTree':
            url = `${backendUrl}/api/v1/new-tree/`;
            method = 'POST';
            body = JSON.stringify({ title: data.title });
            break;

        default:
            throw new Error(`Unknown operation type: ${type}`);
    }

    const response = await fetch(url, {
        method,
        headers,
        body,
        credentials: 'include', // Передаём cookies для авторизации
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Обрабатывает очередь операций при Background Sync
 */
async function processQueueInBackground() {
    console.log('[SW] Processing background sync queue...');

    const queue = await getQueue();
    if (queue.length === 0) {
        console.log('[SW] Queue is empty');
        return;
    }

    console.log(`[SW] Processing ${queue.length} operations`);

    // Определяем backend URL (можно передать через сообщение или хранить)
    const backendUrl = 'https://omnimap.ru'; // TODO: сделать настраиваемым

    const failedOperations = [];

    for (const operation of queue) {
        try {
            await executeOperation(operation, backendUrl);
            console.log('[SW] Operation succeeded:', operation.type);
        } catch (error) {
            console.error('[SW] Operation failed:', operation.type, error);

            operation.retryCount = (operation.retryCount || 0) + 1;
            operation.lastError = error.message;

            // Максимум 3 попытки
            if (operation.retryCount < 3) {
                failedOperations.push(operation);
            } else {
                console.error('[SW] Operation permanently failed:', operation);
            }
        }
    }

    await saveQueue(failedOperations);

    // Уведомляем клиентов о завершении синхронизации
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'SYNC_COMPLETED',
            successCount: queue.length - failedOperations.length,
            failedCount: failedOperations.length,
        });
    });
}

// Обработчик активации Service Worker
self.addEventListener('activate', event => {
    console.log('[SW] Service Worker activated');
    // Немедленно захватываем всех клиентов (включая текущую страницу)
    event.waitUntil(self.clients.claim());
});

// Обработчик Background Sync события
self.addEventListener('sync', event => {
    console.log('[SW] Sync event:', event.tag);

    if (event.tag === SYNC_TAG) {
        event.waitUntil(processQueueInBackground());
    }
});

// Обработчик сообщений от клиентов
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'TRIGGER_SYNC') {
        console.log('[SW] Manual sync trigger received');
        processQueueInBackground();
    }

    if (event.data && event.data.type === 'SET_BACKEND_URL') {
        // Можно сохранить URL в IndexedDB для использования в sync
        console.log('[SW] Backend URL set:', event.data.url);
    }

    if (event.data && event.data.type === 'CHECK_UPDATES') {
        // Проверяем обновления SW при восстановлении соединения
        console.log('[SW] Check updates requested');
        self.registration.update().catch(err => {
            console.warn('[SW] Update check failed:', err);
        });
    }

    if (event.data && event.data.type === 'SKIP_WAITING') {
        // Принудительная активация нового Service Worker
        console.log('[SW] Skip waiting requested - activating new version');
        self.skipWaiting();
    }
});

console.log('[SW] Custom service worker code loaded');
