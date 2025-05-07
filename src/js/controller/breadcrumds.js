import localforage from "localforage";
import {BaseController} from "./baseController";
import {dispatch} from "../utils/utils";
import CalcColor from "../painter/calcBlockColor";
import {getPath} from "./comands/cmdUtils";

function shortenText(str, maxLength = 15) {
    if (!str) return "";
    // Если текст длиннее maxLength, обрезаем и добавляем троеточие
    if (str.length > maxLength) {
        return str.substring(0, maxLength - 3) + "...";
    }
    return str;
}


export class Breadcrumbs extends BaseController {
    constructor() {
        super()
        this.chainblocks = [];
        this.mapLinks = undefined
        this.container = document.getElementById("breadcrumb");

        this.setCurrentUser();
        this.init();
        this.colorist = new CalcColor()

    }

    init() {
        window.addEventListener("ShowedBlocks", this.renderBreadcrumbs.bind(this));
        this.container.addEventListener('click', this.openBlock.bind(this))

    }

    openBlock(e) {
        const crumb = e.target;
        if (crumb.hasAttribute('blockId')) {
            let parentHsl = crumb.getAttribute('parentHsl').split(',').map(Number)
            if (parentHsl.length === 1) parentHsl = []
            this.openCrumb = true
            dispatch('OpenBlock', {
                id: crumb.getAttribute('blockId'),
                parentHsl: parentHsl,
                isIframe: false,
                links: []
            });
        }
    }

    renderBreadcrumbs(e) {
        const path = [...e.detail.path];
        const chainblocks = this.chainblocks
        const lastBlock = path.at(-1);
        const blockId = lastBlock.blockId;
        const buffer = []
        this.mapLinks = {}
        for (let i = 0; i < chainblocks.length; i++) {
            buffer[i] = chainblocks[i].id
            if (chainblocks[i].id === blockId) {
                break
            }
        }
        if (this.openCrumb) {
            this.openCrumb = false
        } else {
            buffer.push(blockId)
        }
        for (let i = path.length - 1; i >= 0; i--) {
            const pathObj = path[i]
            if (buffer.includes(pathObj.blockId)) {
                const links = pathObj.links
                if (links && links.length) {
                    links.forEach(link => this.mapLinks[link.linkSource] = link.linkId)
                }
            }
        }

        if (!this.user) {
            this.setCurrentUser()
            setTimeout(() => {
                if (blockId) this.getChainBlocks(blockId);
            }, 100)
        } else {
            if (blockId) this.getChainBlocks(blockId);
        }
    }

    getBlock(id, callback) {
        localforage.getItem(`Block_${id}_${this.user}`, callback.bind(this))
    }

    getChainBlocks(id) {
        this.chainblocks = [];
        this.getBlock(id, this.cycle);
    }

    cycle(err, block) {
        if (err) {
            console.error("Ошибка при получении блока:", err);
            return;
        }
        if (block) {
            this.chainblocks.push(block);

            if (block.parent_id && block.parent_id !== 'None') {
                let id = block.parent_id
                // ищем родителя ссылки а не исходного блока
                if (Object.hasOwn(this.mapLinks, block.id)) id = this.mapLinks[block.id]
                this.getBlock(id, this.cycle);
            } else {
                // Когда нет родителя — переходим к отрисовке
                this.drawBreadcrumbs();
            }
        }
    }

    drawBreadcrumbs() {
        if (!this.container) {
            console.warn("Элемент #breadcrumb не найден!");
            return;
        }

        // Очищаем контейнер
        this.container.innerHTML = "";

        // Разворачиваем, если хотим «сверху вниз»
        const reversed = [...this.chainblocks].reverse();

        let parentColor = []
        reversed.forEach((block, index) => {
            console.log(block)
            if (block.data.view !== 'link') {
                // Полное название для подсказки
                const fullTitle = block.title || `${block.id}`;
                // Сокращённое название для отображения в крошках
                const shortTitle = index < reversed.length - 1 ? shortenText(fullTitle, 15) : fullTitle

                // Создаём элемент-крошку
                const crumb = document.createElement("span");
                crumb.classList.add("breadcrumb-item");
                crumb.textContent = shortTitle;
                crumb.setAttribute('blockId', block.id)
                crumb.setAttribute('parentHsl', parentColor.join(','))
                parentColor = this.colorist.calculateColor(crumb, block, [...parentColor])
                crumb.setAttribute("title", fullTitle);
                this.container.appendChild(crumb);

                if (index < reversed.length - 1) {
                    const separator = document.createElement("span");
                    separator.classList.add("separator");
                    separator.textContent = "";
                    this.container.appendChild(separator);
                }
            }
        });
        setTimeout(() => {
            this.container.scrollLeft = this.container.scrollWidth;
        }, 150); // или 100 мс, если всё ещё глючит
    }
}