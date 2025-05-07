import {UpdateServiceWebSocket} from "./webSocket";
import {dispatch} from "../utils/utils";
import localforage from "localforage";
import {log} from "@jsplumb/browser-ui";

export class SincManager {
    constructor() {
        const wsUrl = SINC_SERVICE_URL || 'wss://localhost:7999/ws';
        this.subscribed = new Set()
        this.toSend = []

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this))
        this.webSocket.connect()
    }

    async online() {
        try {
            const username = await localforage.getItem('currentUser');
            if (!username) return;

            const pattern = new RegExp(`^Block_.*_${username}$`);
            const toSend = (
                await Promise.all(
                    (await localforage.keys())
                        .filter(key => pattern.test(key))
                        .map(key => localforage.getItem(key))
                )
            )
                .filter(block => block?.id && block?.updated_at)
                .map(block => ({
                    id: block.id,
                    updated_at: Math.floor(new Date(block.updated_at).getTime() / 1000),
                }));
            console.log(toSend)
            if (toSend.length) this.webSocket.getUpdates(toSend);

        } catch (err) {
            console.error('Sync online error:', err.trace);
        }
    }
}