import {UpdateServiceWebSocket} from "./webSocket";

export class SincManager {
    constructor() {
        const wsUrl = 'ws://localhost:7999/ws';
        this.subscribed = new Set()

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.connect()
        this.addEventWebSocketListeners(this.webSocket)
        this.initListeners()
    }

    initListeners() {
        window.addEventListener('SubscribeUpdates', (e) => {
            const blocks = e.detail.blocks
            const toSend = []
            blocks.forEach((block) => {
                if (!this.subscribed.has(block.id)) {
                    this.subscribed.add(block.id)
                    toSend.push(block)
                }
            })
                if (this.webSocket.isConnected) {
                    if (toSend.length) {
                        this.webSocket.subscribe(toSend)
                    }
                }
        })
    }

    addEventWebSocketListeners(updateService) {
        // Добавляем обработчики событий
        updateService.addEventListener('open', () => {
            console.log('Подключение открыто');
        });

        updateService.addEventListener('message', (data) => {
            console.log('Получены обновления:', data);
        });

        updateService.addEventListener('error', (error) => {
            console.error('Ошибка WebSocket:', error);
        });

        updateService.addEventListener('close', (event) => {
            console.log('Подключение закрыто:', event);
        });
    }
}