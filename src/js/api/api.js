import axios from 'axios';
import Cookies from 'js-cookie';
import {dispatch} from "../utils/utils";

class Api {
    constructor() {
        // Настройка базового URL и создание экземпляра axios
        this.errorMessage = '';
        this.api = axios.create({
            // baseURL: 'http://omnimap.ru/api/v1/',
            baseURL: 'http://127.0.0.1:8000/api/v1/',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Добавление интерцептора запроса для вставки JWT в заголовки
        this.api.interceptors.request.use(config => {
            this.setLoading(true)
            const token = Cookies.get('access');
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            return config;
        }, error => {
            return Promise.reject(error);
        });

        // Добавление интерцептора ответа для обработки истечения токена
        this.api.interceptors.response.use(response => {
            this.setLoading(false)
            return response
        }, async error => {
            const originalRequest = error.config;
            this.setLoading(false)

            if (error.response.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                try {
                    const tokenRefreshed = await this.refreshToken();
                    if (tokenRefreshed) {
                        return this.api(originalRequest);
                    }
                } catch (refreshError) {
                    return Promise.reject(refreshError);
                }
            }
            if (error.response.status >= 400) {
                dispatch("ShowError", error)
            }
            return Promise.reject(error);
        });
    }

    setLoading(value) {
        dispatch('SetLoading', value);
    }

    // Метод для обновления токена
    async refreshToken() {
        const refresh = Cookies.get('refresh');
        if (refresh) {
            return await this.api.post('/token/refresh/', {refresh})
                .then(res => {
                    if (res.status === 200) {
                        const {access} = res.data;
                        Cookies.set('access', access);
                        return true;
                    }
                }).catch(err => {
                    console.log(err)
                    return false;
                })
        }
        return false;
    }

    // Метод для регистрации
    async register(userData) {
        return this.api.post('/register/', userData).then((res) => {
            if (res.status === 201) {
                const {access, refresh, user_id} = res.data;
                Cookies.set('access', access, {expires: 30});
                Cookies.set('refresh', refresh, {expires: 30});
                dispatch('InitUser', {user: user_id})
                return true
            }
        }).catch(err => {
            console.error(err)
        })
    }

    async login(credentials) {
        return this.api.post('/login/', credentials)
            .then(res => {
                if (res.status === 200) {
                    const {access, refresh, user_id} = res.data;
                    Cookies.set('access', access, {expires: 30});
                    Cookies.set('refresh', refresh, {expires: 30});
                    dispatch('Login', {user: user_id})
                    return true;
                }
            }).catch(err => {
                console.error(err)
                return false;
            })
    }

    logout() {
        Cookies.remove('access');
        Cookies.remove('refresh');
        dispatch('Logout')
        delete this.api.defaults.headers.common['Authorization'];
    }

    async createBlock(parentId, title = '', data = {}) {
        return await this.api.post(`new-block/${parentId}/`, {title, data})
    }

    async getTreeBlocks() {
        const response = await this.api.get('/load-trees/')
        const data = response.data
        const treeIds = Object.keys(data);
        const blocks = new Map();

        // Сливаем все деревья
        treeIds.forEach(treeId => {
            const tree = data[treeId];
            if (typeof tree === 'object' && tree !== null) {
                Object.entries(tree).forEach(([key, value]) => {
                    blocks.set(key, value);
                });
            }
        });
        return {treeIds, blocks}
    }

    removeBlock({removeId, parentId}) {
        return this.api.delete(`/delete-child/${parentId}/${removeId}/`, )
    }
    removeTree(blockId) {
        return this.api.delete(`/delete-tree/${blockId}/`)
    }

    pasteBlock(data) {
        return this.api.post('copy-block/', data)
    }

    pasteLinkBlock({dest, src}) {
        console.log({dest, src})
        return this.api.post(`create-link-block/${dest}/${src[0]}/`)
    }

    loadEmpty(block_ids) {
        return this.api.post('load-empty/', {block_ids})
    }


    async verifyToken(data) {
        return this.api.post('token/verify/', data)
    }

    updateBlock(id, data) {
        return this.api.post(`edit-block/${id}/`, data)
    }

    getAccessList(blockId) {
        return this.api.get(`access/${blockId}/`)
    }

    updateAccess(blockId, data) {
        return this.api.post(`access/${blockId}/`, data)
    }


    moveBlock(blockId, {old_parent_id, new_parent_id, childOrder}) {
        return this.api.post(`move-block/${old_parent_id}/${new_parent_id}/${blockId}/`, {childOrder})
    }

    searchBlock(query, isPublic = false) {
        return this.api.get(`search-block/?q=${query}&include_public=${isPublic}`)
    }

    checkStatusTask(task_id) {
        return this.api.get(`tasks/${task_id}/`)
    }

}

const api = new Api('http://0.0.0.0:7999')

export default api




/**
 * Функция для проверки статуса задачи
 * @param {string} taskId - ID задачи
 * @param {number} interval - Интервал опроса (в мс)
 * @param {number} timeout - Максимальное время ожидания (в мс)
 * @returns {Promise<object>} - Результат выполнения задачи или ошибка при истечении времени
 */
export async function pollTaskStatus(taskId, interval = 1000, timeout = 60000) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkStatus = async () => {
            try {
                const response = await api.checkStatusTask(taskId);
                if (response.data.status === 'SUCCESS') {
                    resolve();
                } else if (response.data.status === 'ERROR') {
                    reject(new Error('Task finished with error status'));
                } else if (Date.now() - startTime >= timeout) {
                    reject(new Error('Task status polling timed out'));
                } else {
                    // Если статус ещё в процессе, ждем
                    setTimeout(checkStatus, interval);
                }
            } catch (error) {
                reject(new Error(`Failed to check task status: ${error.message}`));
            }
        };

        checkStatus();
    });
}