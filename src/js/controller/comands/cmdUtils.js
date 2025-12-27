import {dispatch} from "../../utils/utils";
import localforage from "localforage";
import {commands} from "./commands";
import {
    extractParentHsl,
    extractLinkChain,
    resolveBlockId
} from "../../actions/navigationActions";

/**
 * Открыть выбранный блок (используется для Enter и клика)
 */
export function commandOpenBlock(ctx) {
    let blockElement = ctx.blockElement
    if (!blockElement) {
        blockElement = ctx.rootContainer.children[0]
    }
    if (!blockElement) return

    const blockId = resolveBlockId(blockElement, ctx.blockLinkElement)
    const hsl = extractParentHsl(blockElement.parentElement)
    const links = extractLinkChain(blockElement)

    dispatch('OpenBlock', {
        id: blockId,
        parentHsl: hsl,
        isIframe: blockElement.hasAttribute('blockIframe'),
        links: links
    });
}

/**
 * Открыть конкретный блок-элемент
 */
export function openBlock(blockEl, ctx) {
    if (!blockEl) return

    const blockId = resolveBlockId(blockEl, ctx.blockLinkElement)
    const hsl = extractParentHsl(blockEl.parentElement)
    const links = extractLinkChain(blockEl)

    dispatch('OpenBlock', {
        id: blockId,
        parentHsl: hsl,
        isIframe: blockEl.hasAttribute('blockIframe'),
        links: links
    });
}

export async function createEditHotkeyInputs() {
    const inputs = []
    const hotkeysMap = await localforage.getItem('hotkeysMap') // мапа с пеопределенными хоткеями cmdID =
    commands.forEach((cmd, i) => {
        if (cmd.description) {
            const id = cmd.id
            const value = (hotkeysMap && hotkeysMap[id]) ? hotkeysMap[id] : cmd.defaultHotkey
            inputs.push({
                id: id,
                name: id,
                description: cmd.description,
                hotkeys: value,
                defaultHotkey: cmd.defaultHotkey,
            })
        }
    })
    return inputs
}

export function setCmdOpenBlock(ctx) {
    setTimeout(() => {
        ctx.setCmd('openBlock')
    }, 50)
}


export function getBlock(id, callback) {
    localforage.getItem('currentUser', (err, user) => {
        localforage.getItem(`Block_${id}_${user}`, callback)
    })
}

export function getTreeIds(callback) {
    localforage.getItem('currentUser', (err, user) => {
        localforage.getItem(`treeIds${user}`, callback)
    })
}

export function setCurrentTree(tree, callback) {
    localforage.setItem('currentTree', tree, callback)
}
export function getPath(callback) {
    localforage.getItem('currentTree', (err, tree) => {
        localforage.getItem('currentUser', (err, user) => {
            localforage.getItem(`Path_${tree}${user}`, callback)
        })
    })
}

export function getTreePath(tree, callback) {
    localforage.getItem('currentUser', (err, user) => {
        localforage.getItem(`Path_${tree}${user}`, callback)
    })
}

export function savePath(path, callback) {
    localforage.getItem('currentTree', (err, tree) => {
        localforage.getItem('currentUser', (err, user) => {
            localforage.setItem(`Path_${tree}${user}`, path, callback)
        })
    })
}

export function openSibling(siblingIndex, path) {
    getBlock(siblingIndex, (err, sibling) => {
        const pathObj = path.pop(-1)
        if (sibling.data.view === 'link') {
            pathObj.links.push({'linkId': sibling.id, 'linkSource': sibling.data.source})
            getBlock(sibling.data.source, (err, sourceBlock) => {
                savePath(path, () => {
                    dispatch('OpenBlock', {
                        id: sourceBlock.id,
                        parentHsl: pathObj.color,
                        isIframe: false,
                        links: pathObj.links
                    })
                })
            })
        } else {
            savePath(path, () => {
                dispatch('OpenBlock', {
                    id: sibling.id,
                    parentHsl: pathObj.color,
                    isIframe: false,
                    links: pathObj.links
                })
            })
        }
    })
}