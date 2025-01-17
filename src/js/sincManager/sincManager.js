import {UpdateServiceWebSocket} from "./webSocket";
import {dispatch} from "../utils/utils";
import localforage from "localforage";

export class SincManager {
    constructor() {
        const wsUrl = 'ws://localhost:7999/ws';
        this.subscribed = new Set()
        this.toSend = []

        this.webSocket = new UpdateServiceWebSocket(wsUrl);
        this.webSocket.eventListeners.open.push(this.online.bind(this))
        this.webSocket.connect()
    }

    async online() {
        const username = await localforage.getItem('currentUser')
        if (username) {
            const keys = await localforage.keys();
            const pattern = new RegExp(`^Block_.*_${username}$`);
            const blockKeys = keys.filter((key) => pattern.test(key));
            const blockPromises = blockKeys.map((key) => localforage.getItem(key));
            const blocks = await Promise.all(blockPromises);

            const toSend = new Array(blocks.length)
            blocks.forEach((block, i) => {
                toSend[i] = {id: block.id, updated_at: Math.floor(new Date(block.updated_at).getTime() / 1000)}
            })

            if (toSend.length) {
                this.webSocket.getUpdates(toSend);
            }
        }
    }
}