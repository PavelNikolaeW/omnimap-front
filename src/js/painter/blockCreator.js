import gridClassManager from "./gridClassManager";
import cssConverter from "./cssConverter";
import CalcColor from "./calcBlockColor"
import {auth} from './views/auth'
import {registration} from './views/registration'
import {log} from "@jsplumb/browser-ui";
import {styleConfig} from "./styles";


const viewRenderers = {
    'auth': auth,
    'registration': registration,
};

class BlockCreator {
    constructor() {
        this.arrows = new Set()
        this.colorist = new CalcColor()
        this.iframes = new Set()
        this.AllIframes = new Set()
        this.emptyBlocks = new Set()
    }

    createElement(block, parentBlock, screen, depth) {
        const element = this._createElement(block, parentBlock, screen, depth)

        if (block.data?.connections) this.arrows.add({connections: block.data?.connections, layout: block.size.layout})
        return element
    }

    _createElement(block, parentBlock, screen, depth) {
        const view = block.data?.view
        block.data?.arrows?.forEach((arrow) => {
            this.arrows.add(arrow)
        })
        if (block.empty) {
            return this.createEmpty(block, parentBlock, screen, depth)
        } else {
            if (view === 'link') {
                return this.createLink(block, parentBlock, screen, depth)
            } else if (view === 'iframe') {
                return this.createIframe(block, parentBlock)
            } else if (view) {
                return this.createCustomView(block, parentBlock, screen, depth)
            } else {
                return this.create(block, parentBlock, screen, depth)
            }
        }
    }

    create(block, parentBlock, screen, depth) {
        const element = document.createElement('div');
        const customClasses = block.data?.customClasses ? block.data.customClasses : []
        try {
            block.contentEl = this.createContent(element, block)
            this._setBlockGrid(block, parentBlock)
            element.setAttribute('width', `${Math.floor(block.size.width)}`)
            element.setAttribute('height', `${Math.floor(block.size.height)}`)
            element.id = parentBlock.data?.view === 'link' ? `${parentBlock.id}*${block.id}` : block.id;
            if (block.data.customGrid && Object.keys(block.data.customGrid).length) element.setAttribute('blockCustomGrid', '')

            this._setAttributes(element, block)
            this._applyStyles(element, ['block', ...this.styleLayout(block), ...(block.grid), ...(parentBlock.childrenPositions[block.id]), ...customClasses])


            this._applyStyles(block.contentEl, block.contentPosition)

            block.color = this.colorist.calculateColor(element, block, [...parentBlock.color])
        } catch (e) {
            console.log(block)
            console.error(`Не получилось на рисовать блок ${e} ${block.id}`)
        }
        return element
    }

    styleLayout(block) {
        const [size, form] = block.size.layout.split('-')
        const gap = styleConfig[size][form ?? 'table'].gap
        return [block.size.layout, `gap_${this._calculateGap(block.children.length, gap, 2, )}px`]
    }
    _calculateGap(numElements, gapMax, gapMin) {
        // Используем формулу с коэффициентом, определяющим кривую снижения.
        // Чем больше constant, тем медленнее снижается gap для больших блоков.
        const constant = 10;
        // Формула, гарантирующая, что при numElements = 0 будет gapMax, а при бесконечном числе элементов – gapMin.
        return  Math.floor(gapMax - (gapMax - gapMin) * (numElements / (numElements + constant)));
    }

    createLink(block, parentBlock, screen, depth) {
        const element = document.createElement('div');
        const grid = ["grid-template-columns_1fr", "grid-template-rows_1fr"]
        const sourceId = block.data.source
        gridClassManager.calcBlockSize(block, parentBlock)

        element.id = block.id
        element.setAttribute('blockLink', block.data.source)
        element.setAttribute('layout', block.size.layout)

        this._applyStyles(element, ['block-link', ...grid, ...(parentBlock.childrenPositions[block.id])])

        block.data.childOrder = [sourceId]
        block.childrenPositions = {[sourceId]: ['grid-column_1', 'grid-row_1']}
        block.grid = grid
        block.contentEl = null
        block.color = [...parentBlock.color]
        return element
    }

    createIframe(block, parentBlock) {
        if (!this.AllIframes.has(`iframe${block.id}`)) {
            const iframeElement = document.createElement(`iframe`,)
            iframeElement.id = `iframe${block.id}`
            iframeElement.style.position = 'absolute'
            iframeElement.setAttribute('block', '')
            block.data.attributes?.forEach((attr) => {
                iframeElement.setAttribute(attr.name, attr.value)
            })
            document.body.appendChild(iframeElement)
            this.AllIframes.add(`iframe${block.id}`)
        }
        this.iframes.add(block.id)

        const element = document.createElement('div');
        this._setBlockGrid(block, parentBlock)

        element.classList.add('iframe', 'block')
        element.id = block.id
        element.setAttribute('block', '')
        block.color = this.colorist.calculateColor(element, block, [...parentBlock.color])
        this._applyStyles(element, ['block', block.size.layout, ...(block.grid), ...(parentBlock.childrenPositions[block.id])])
        return element
    }

    createEmpty(block, parentBlock, screen, depth) {
        const element = document.createElement('div')

        gridClassManager.calcBlockSize(block, parentBlock)
        this._applyStyles(element, ['block-empty'])
        element.id = block.id;
        element.setAttribute('emptyBlock', '')
        this.emptyBlocks.add(block.id)
        return element
    }

    createContent(element, block) {
        if (block.data?.view === 'link') {
            return null
        }

        const contentElement = document.createElement('div');
        let title = `<titleBlock><b>${block.title}</b></titleBlock>`
        if (block.data.titleIsVisible === false) title = ''

        contentElement.classList.add('defaultContent');
        contentElement.setAttribute('defaultContent', block.title)
        const content = block.data.text ? `<contentBlock>${block.data?.text}</contentBlock>` : '<contentBlock></contentBlock>'
        contentElement.innerHTML = title + content

        block.data.contentAttributes?.forEach(attr => contentElement.setAttribute(attr.name, attr.value))
        block.data.layoutAttributes?.[block.size.layout].forEach(attr => contentElement.setAttribute(attr.name, attr.value))


        element.appendChild(contentElement)

        return contentElement
    }

    _setAttributes(element, block) {
        const layout = block.size.layout

        element.setAttribute('block', '')
        element.setAttribute('layout', layout)

        block.data.attributes?.forEach(attr => element.setAttribute(attr.name, attr.value))
        block.data.layoutAttributes?.[layout].forEach(attr => element.setAttribute(attr.name, attr.value))
    }

    _applyStyles(element, styles) {
        element.classList.add(...styles)
        cssConverter.generateStylesheet(styles)
        cssConverter.applyCssClasses(element, styles)
    }

    createCustomView(block, parent) {
        return viewRenderers[block.data.view](block, parent)
    }

    _setBlockGrid(block, parentBlock) {
        if (block.data.customGrid && Object.keys(block.data.customGrid).length) {
            const customGrid = block.data.customGrid

            block.childrenPositions = customGrid.childrenPositions
            block.grid = customGrid.grid
            block.contentPosition = customGrid.contentPosition
            gridClassManager.manager(block, parentBlock)
        } else {
            let [grid, contentPosition, childrenPositions] = gridClassManager.manager(block, parentBlock)

            block.grid = grid
            block.childrenPositions = childrenPositions
            block.contentPosition = contentPosition
        }
    }
}

const blockCreator = new BlockCreator();
export default blockCreator;
