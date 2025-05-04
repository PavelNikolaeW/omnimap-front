import {dispatch} from "../utils/utils";
import {LimitedQueue} from "../utils/limitedQueue";
import api from '../api/api'
import localforage from "localforage";

const ALLOWED_OPERATIONS = {
    'delete-tree': api.removeTree,
    'new-block': api.createBlock,
    'new-tree': api.createTree,
    'create-link-block': api.pasteLinkBlock,
    'edit-block': api.updateBlock,
    'move-block': api.moveBlock,
    'copy-block': api.pasteBlock,
}


export class RedoStack {
    constructor() {
        this.stack = new LimitedQueue(200)

        this.init()
    }

    init() {
        window.addEventListener('RedoStackAdd', (e) => {
            const operation = e.detail.operation
            this.stack.add(operation)
        })
        window.addEventListener('RedoStackReset',() => {
            this.stack.clear()
        })
        window.addEventListener('Redo', () => {
            if (this.stack.size()) {
                const operation = this.stack.pop()
                api.redo(operation.url, operation.data)
                    .then((res) => {
                        if (res.status === 200 || res.status === 201) {
                            this.updateBlocks(operation, res.data)
                        }
                    }).catch(err => console.error(err))

            }
        })
    }

    updateBlocks(operation, data) {
        console.log(operation, data)
        const url = operation.url
        if (url.startsWith('edit-block')) {
            dispatch("UpdateBlocks", {blocks: [data]})
        } else if (url.startsWith('new-tree')) {
            localforage.getItem("currentUser", (err, user) => {
                localforage.getItem(`treeIds${user}`, (err, treeIds) => {
                    treeIds.push(data.id)
                    localforage.setItem(`treeIds${user}`, treeIds, () => {
                        dispatch("UpdateBlocks", {blocks: [data]})
                    })
                })
            })
        } else if (url.startsWith('new-block')) {
            const new_id = data[0].id
            const old_id = operation.responseData[0]['id']
            this.stack.getAll().forEach(op => {
                op.url = op.url.replace(old_id, new_id)
            })
            dispatch("UpdateBlocks", {blocks: data})
        } else if (url.startsWith('copy-block')) {
            this.stack.clear()
            dispatch("UpdateBlocks", {blocks: Object.values(data)})
        } else if (url.startsWith('create-link-block')) {
            dispatch("UpdateBlocks", {blocks: data})
        } else if (url.startsWith('delete-tree')) {
            dispatch('UpdateBlocks', {blocks: [data.parent]})
        } else {
            dispatch("UpdateBlocks", {blocks: data})
        }
    }
}

export class UndoStack {
    constructor(stack) {
        if (!stack)
            this.stack = new LimitedQueue(200)
        else
            this.stack = stack
        this.init()
    }

    init() {
        window.addEventListener('UndoStackAdd', (e) => {
            const operation = e.detail.operation
            if (ALLOWED_OPERATIONS[operation.url.split('/')[0]]) this.stack.add(operation)
        })
        window.addEventListener('Undo', (e) => {
            const operation = this.stack.pop()
            if (operation) {
                api.undo(operation)
                    .then(res => {
                        console.log(JSON.parse(JSON.stringify(res.data)))
                        if (res.status === 200) {
                            dispatch('RedoStackAdd', {operation, blocks: res.data.blocks, removed: res.data.removed})
                            dispatch('UpdateBlocks', {blocks: res.data.blocks, removed: res.data.removed})
                        }
                    })
                    .catch(err => {
                        console.error(err)
                    })
            }
        })
    }
}