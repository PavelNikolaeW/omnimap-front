import axios from 'axios';
import Cookies from 'js-cookie';
import {dispatch} from "../utils/utils";

class Api {
    constructor() {
        // Настройка базового URL и создание экземпляра axios
        this.isLoading = false;
        this.errorMessage = '';


        this.api = axios.create({
            baseURL: 'http://127.0.0.1:8000/api/v1/',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Добавление интерцептора запроса для вставки JWT в заголовки
        this.api.interceptors.request.use(config => {
            const token = Cookies.get('access');
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
            return config;
        }, error => {
            return Promise.reject(error);
        });

        // Добавление интерцептора ответа для обработки истечения токена
        this.api.interceptors.response.use(response => response, async error => {
            const originalRequest = error.config;
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
            return Promise.reject(error);
        });
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

    async createBlock(parentId, title = '') {
        return await this.api.post(`new-block/${parentId}/`, {title})
    }

    async getRootBlock() {
        const blocks = await this.api.get('/root-block/')
        return new Map(Object.entries(blocks.data))
    }

    removeBlock(data) {
        return this.api.delete(`/remove-block/`, {data})
    }

    pasteBlock(data) {
        return this.api.post('copy-block/', data)
    }

    pasteLinkBlock(data) {
        return this.api.post('create-link-block/', data)
    }

    loadEmpty(block_ids) {
        return this.api.post('load-empty/', {block_ids})
    }


    async verifyToken(data) {
        return this.api.post('token/verify/', data)
    }

    updateBlock(id, data) {
        console.log(data)
        return this.api.post(`edit-block/${id}/`, data)
    }

    getAccessList(blockId) {
        return this.api.get(`access/${blockId}/`)
    }

    updateAccess(blockId, data) {
        return this.api.post(`access/${blockId}/`, data)
    }

    removeAccess(blockId, data) {
        return this.api.delete(`access/${blockId}/`, data)
    }

    moveBlock(blockId, data) {
        console.log(data)
        return this.api.post(`move-block/${blockId}/`, data)
    }

    searchBlock(query, isPublic = false) {
        return this.api.get(`search-block/?q=${query}&include_public=${isPublic}`)
    }

}

const api = new Api()

export default api



