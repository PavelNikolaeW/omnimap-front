import {dispatch} from "../../utils/utils";
import localforage from "localforage";
import {commands} from "./commands";
import {
    extractParentHsl,
    extractLinkChain,
    resolveBlockId
} from "../../actions/navigationActions";
import { localStateManager } from "../../stateLocal/localStateManager";
import { isMobileOrTablet } from "../../utils/functions";

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
    const isIframe = blockElement.hasAttribute('blockIframe')

    // На мобильных сбрасываем blockElement перед навигацией,
    // чтобы команда не сработала на устаревший блок после OpenBlock
    if (isMobileOrTablet()) {
        ctx.cancelTouchActiveReset()
        ctx.removeActiveClass()
        ctx.blockElement = undefined
        ctx.blockLinkElement = undefined
    }

    dispatch('OpenBlock', {
        id: blockId,
        parentHsl: hsl,
        isIframe: isIframe,
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
    const isIframe = blockEl.hasAttribute('blockIframe')

    // На мобильных сбрасываем blockElement перед навигацией,
    // чтобы команда не сработала на устаревший блок после OpenBlock
    if (isMobileOrTablet()) {
        ctx.cancelTouchActiveReset()
        ctx.removeActiveClass()
        ctx.blockElement = undefined
        ctx.blockLinkElement = undefined
    }

    dispatch('OpenBlock', {
        id: blockId,
        parentHsl: hsl,
        isIframe: isIframe,
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
/**
 * Получает текущий path из localStateManager
 * @param {Function} callback - callback(err, path)
 */
export function getPath(callback) {
    // Используем path из памяти вместо чтения из IndexedDB
    const path = localStateManager.getPathSync();
    // Вызываем callback асинхронно для совместимости
    setTimeout(() => {
        callback(null, path);
    }, 0);
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
    if (!siblingIndex || !path || path.length === 0) return;

    getBlock(siblingIndex, (err, sibling) => {
        if (!sibling) return;

        const pathObj = path.pop();
        if (!pathObj) return;

        if (sibling.data?.view === 'link') {
            if (!pathObj.links) pathObj.links = [];
            pathObj.links.push({'linkId': sibling.id, 'linkSource': sibling.data.source})
            getBlock(sibling.data.source, (err, sourceBlock) => {
                if (!sourceBlock) return;
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
                    links: pathObj.links || []
                })
            })
        }
    })
}