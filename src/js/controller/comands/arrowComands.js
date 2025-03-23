import {getBlock, getPath, openBlock, openSibling, savePath, setCmdOpenBlock} from "./cmdUtils";
import localforage from "localforage";
import {truncate} from "../../utils/functions";
import {dispatch} from "../../utils/utils";

export const arrowCommands = [
    {
        id: 'arrowUp',
        defaultHotkey: 'Up',
        description: 'Перемещает выделение к верхнему блоку',
        mode: ['normal', 'connectToBlock', 'cutBlock'],
        throttleDisable: true,
        execute(ctx) {
            const activeElem = ctx.getActiveElement();
            ctx.setDisActiveBlock(activeElem)
            let parentBlock = activeElem.parentElement.closest('[block]')
            if (parentBlock) {
                ctx.setDisActiveBlock(activeElem)
                ctx.setActiveBlock(parentBlock)
            }
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'arrowDown',
        defaultHotkey: 'down',
        description: 'Перемещает выделение к нижнему блоку',
        mode: ['normal', 'connectToBlock', 'cutBlock'],
        throttleDisable: true,
        execute(ctx) {
            let activeElem = ctx.getActiveElement();
            if (activeElem.hasAttribute('blocklink')) activeElem = activeElem.children[0]

            const childBlocks = activeElem.querySelectorAll(':scope > [block], :scope > [blocklink]');
            if (childBlocks.length > 0) {
                ctx.setDisActiveBlock(activeElem)
                let newActive = childBlocks[0]
                if (newActive.hasAttribute('blockLink'))
                    newActive = newActive.children[0]
                ctx.setActiveBlock(newActive)
            }
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'arrowLeft',
        defaultHotkey: 'left',
        description: 'Перемещает выделение к левому блоку',
        mode: ['normal', 'connectToBlock', 'cutBlock'],
        throttleDisable: true,
        execute(ctx) {
            console.log('left')
            const activeElem = ctx.getActiveElement();
            const parentContainer = activeElem.parentElement;
            ctx.setDisActiveBlock(activeElem)
            if (!parentContainer) return;
            const siblings = Array.from(parentContainer.querySelectorAll(':scope > [block], :scope > [blocklink]'));
            const index = siblings.indexOf(activeElem);
            let newActive = siblings.at(index - 1);
            if (newActive.hasAttribute('blockLink'))
                newActive = newActive.children[0]
            ctx.setActiveBlock(newActive)
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'openLeft',
        defaultHotkey: ',',
        description: 'Открыть соседний левый блок.',
        mode: ['normal'],
        execute(ctx) {
            const rootBlockEl = ctx.rootContainer.children[0]
            getPath((err, path) => {
                getBlock(rootBlockEl.id, (err, block) => {
                    let parentId = block.parent_id
                    if (!parentId) return
                    path.at(-1)?.links?.forEach(link => {
                        if (link.linkSource === block.id) parentId = link.linkId
                    })
                    getBlock(parentId, (err, parent) => {
                        if (parent.data.view === 'link') {
                            getBlock(parent.parent_id, (err, parentLink) => {
                                const children = parentLink.data.childOrder
                                const index = children.indexOf(parent.id)
                                if (index !== -1) {
                                    const beforeIndex = children.at(index - 1)
                                    openSibling(beforeIndex, path)
                                }
                            })
                        } else {
                            const children = parent.data.childOrder
                            const index = children.indexOf(block.id)
                            if (index !== -1) {
                                const beforeIndex = children.at(index - 1)
                                openSibling(beforeIndex, path)
                            }
                        }
                    })
                })
            })
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'openRight',
        defaultHotkey: '.',
        description: 'Открыть соседний правый блок.',
        mode: ['normal'],
        execute(ctx) {
            const rootBlockEl = ctx.rootContainer.children[0]
            getPath((err, path) => {
                getBlock(rootBlockEl.id, (err, block) => {
                    let parentId = block.parent_id
                    if (!parentId) return
                    path.at(-1)?.links?.forEach(link => {
                        if (link.linkSource === block.id) parentId = link.linkId
                    })
                    getBlock(parentId, (err, parent) => {
                        if (parent.data.view === 'link') {
                            getBlock(parent.parent_id, (err, parentLink) => {
                                const children = parentLink.data.childOrder
                                let index = children.indexOf(parent.id)
                                if (index !== -1) {
                                    if (index + 1 === children.length) index = -1
                                    const nextIndex = children.at(index + 1)
                                    openSibling(nextIndex, path)
                                }
                            })
                        } else {
                            const children = parent.data.childOrder
                            let index = children.indexOf(block.id)
                            if (index !== -1) {
                                if (index + 1 === children.length) index = -1
                                const nextIndex = children.at(index + 1)
                                openSibling(nextIndex, path)
                            }
                        }
                    })
                })
            })
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'arrowRight',
        defaultHotkey: 'right',
        description: 'Перемещает выделение к правому блоку',
        mode: ['normal', 'connectToBlock', 'cutBlock'],
        throttleDisable: true,
        execute(ctx) {
            console.log('right')
            const activeElem = ctx.getActiveElement();
            const parentContainer = activeElem.parentElement;
            if (!parentContainer) return;
            ctx.setDisActiveBlock(activeElem)
            const siblings = Array.from(parentContainer.querySelectorAll(':scope > [block], :scope > [blocklink]'));
            let index = siblings.indexOf(activeElem);
            if (index + 1 === siblings.length) index = -1
            let newActive = siblings.at(index + 1);
            if (newActive.hasAttribute('blocklink'))
                newActive = newActive.children[0]
            ctx.setActiveBlock(newActive)
            setCmdOpenBlock(ctx)
        }
    },
    {
        id: 'shiftArrowUp',
        defaultHotkey: 'shift+up',
        description: 'Открывает родительский блок, используя Shift',
        mode: ['normal'],
        execute(ctx) {
            console.log(ctx)
        }
    },
    {
        id: 'shiftArrowDown',
        label: 'Shift + Стрелка Вниз',
        icon: 'fa fa-arrow-down',
        defaultHotkey: 'shift+down',
        description: 'Открывает первый дочерний блок, используя Shift',
        mode: ['normal'],
        execute(ctx) {
            console.log(ctx)
        }
    },
    {
        id: 'shiftArrowLeft',
        label: 'Shift + Стрелка Влево',
        icon: 'fa fa-arrow-left',
        defaultHotkey: 'shift+left',
        description: 'Открывает левый блок, используя Shift',
        mode: ['normal'],
        execute(ctx) {
            console.log(ctx)
        }
    },
    {
        id: 'shiftArrowRight',
        label: 'Shift + Стрелка Вправо',
        icon: 'fa fa-arrow-right',
        defaultHotkey: 'shift+right',
        description: 'Открывает правый блок, используя Shift',
        mode: ['normal'],
        execute(ctx) {
            console.log(ctx)
        }
    },

];