import {getBlock, getPath, openBlock, openSibling, savePath, setCmdOpenBlock} from "./cmdUtils";

import {dispatch} from "../../utils/utils";

function handleBlockCommand(ctx, direction, action, sign) {
    let el = ctx.blockElement;
    let parentEl = el?.parentNode;

    if (parentEl && parentEl.hasAttribute('blocklink')) {
        parentEl = parentEl.parentNode;
        el = ctx.blockLinkElement;
    }
    if (el && parentEl && parentEl.hasAttribute('blockcustomgrid')) {
        const parentId = parentEl.id.split('*').at(-1)
        getBlock(parentId, (err, block) => {
            ctx.diagramUtils[action](el.id, direction, block.data.customGrid, parentId, sign === 'plus');
        });
    }

    setCmdOpenBlock(ctx);
}

export const arrowCommands = [
    {
        id: 'arrowUp',
        regLink: true,
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
        regLink: true,
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
        regLink: true,
        defaultHotkey: 'left',
        description: 'Перемещает выделение к левому блоку',
        mode: ['normal', 'connectToBlock', 'cutBlock'],
        throttleDisable: true,
        execute(ctx) {
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
        regLink: true,
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
        regLink: true,
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
        regLink: true,
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
        description: 'Перемещает блок вверх внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'up', 'moveBlock');
        }
    },
    {
        id: 'shiftArrowDown',
        defaultHotkey: 'shift+down',
        description: 'Перемещает блок вниз внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'down', 'moveBlock');
        }
    },
    {
        id: 'shiftArrowLeft',
        defaultHotkey: 'shift+left',
        description: 'Перемещает блок влево внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'left', 'moveBlock');
        }
    },
    {
        id: 'shiftArrowRight',
        defaultHotkey: 'shift+right',
        description: 'Перемещает блок вправо внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'right', 'moveBlock');
        }
    },
    {
        id: 'plusArrowUp',
        defaultHotkey: '=+up',
        description: 'Растягивает блок вверх внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'up', 'stretchBlock', 'plus');
        }
    },
    {
        id: 'plusArrowDown',
        defaultHotkey: '=+down',
        description: 'Растягивает блок вниз внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'down', 'stretchBlock', 'plus');
        }
    },
    {
        id: 'plusArrowLeft',
        defaultHotkey: '=+left',
        description: 'Растягивает блок влево внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'left', 'stretchBlock', 'plus');
        }
    },
    {
        id: 'plusArrowRight',
        defaultHotkey: '=+right',
        description: 'Растягивает блок вправо внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'right', 'stretchBlock', 'plus');
        }
    },
    {
        id: 'minusArrowUp',
        defaultHotkey: 'shift+=+up',
        description: 'Сжимает блок вверх внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'up', 'stretchBlock', 'minus');
        }
    },
    {
        id: 'minusArrowDown',
        defaultHotkey: 'shift+=+down',
        description: 'Сжимает блок вниз внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'down', 'stretchBlock', 'minus');
        }
    },
    {
        id: 'minusArrowLeft',
        defaultHotkey: 'shift+=+left',
        description: 'Сжимает блок влево внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'left', 'stretchBlock', 'minus');
        }
    },
    {
        id: 'minusArrowRight',
        defaultHotkey: 'shift+=+right',
        description: 'Сжимает блок вправо внутри диаграммы',
        mode: ['normal'],
        throttleDisable: true,
        execute(ctx) {
            handleBlockCommand(ctx, 'right', 'stretchBlock', 'minus');
        }
    },
];