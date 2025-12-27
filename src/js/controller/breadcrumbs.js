import localforage from "localforage";
import { BaseController } from "./baseController";
import { dispatch } from "../utils/utils";
import CalcColor from "../painter/calcBlockColor";

/**
 * Сокращает текст до указанной длины, добавляя троеточие
 * @param {string} str - исходный текст
 * @param {number} maxLength - максимальная длина
 * @returns {string} - сокращенный текст
 */
function shortenText(str, maxLength = 15) {
    if (!str) return "";
    if (str.length > maxLength) {
        return str.substring(0, maxLength - 3) + "...";
    }
    return str;
}

/**
 * Breadcrumbs - компонент навигационных хлебных крошек.
 * Отображает цепочку блоков от корня до текущего блока.
 * Поддерживает навигацию по ссылкам (link blocks).
 */
export class Breadcrumbs extends BaseController {
    constructor() {
        super();
        this.container = document.getElementById("breadcrumb");
        this.colorist = new CalcColor();
        this.init();
    }

    init() {
        window.addEventListener("ShowedBlocks", this.handleShowedBlocks.bind(this));
        this.container.addEventListener("click", this.handleCrumbClick.bind(this));
    }

    /**
     * Обработчик клика по хлебной крошке
     */
    handleCrumbClick(e) {
        const crumb = e.target;
        if (!crumb.hasAttribute("blockId")) return;

        const blockId = crumb.getAttribute("blockId");
        const parentHslAttr = crumb.getAttribute("parentHsl");
        const parentHsl = parentHslAttr ? parentHslAttr.split(",").map(Number) : [];

        dispatch("OpenBlock", {
            id: blockId,
            parentHsl: parentHsl.length === 1 ? [] : parentHsl,
            isIframe: false,
            links: []
        });
    }

    /**
     * Обработчик события ShowedBlocks - строит карту ссылок и запускает построение крошек
     */
    async handleShowedBlocks(e) {
        const path = e.detail.path;
        if (!path || path.length === 0) return;

        const lastBlock = path[path.length - 1];
        const blockId = lastBlock.blockId;
        if (!blockId) return;

        // Строим карту ссылок: sourceBlockId -> linkBlockId
        // Это нужно для корректной навигации по родителям ссылок
        const linkMap = this.buildLinkMap(path);

        // Убеждаемся что пользователь загружен
        if (!this.user) {
            try {
                await this.waitForUser();
            } catch (err) {
                console.error("Не удалось получить пользователя для breadcrumbs:", err);
                return;
            }
        }

        // Строим и отрисовываем цепочку
        const chain = await this.buildBlockChain(blockId, linkMap);
        this.renderCrumbs(chain);
    }

    /**
     * Ожидает загрузки текущего пользователя с таймаутом
     * @param {number} timeout - максимальное время ожидания в мс (по умолчанию 5000)
     * @returns {Promise<void>}
     */
    waitForUser(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error("Timeout waiting for user"));
            }, timeout);

            this.setCurrentUser(() => {
                clearTimeout(timeoutId);
                resolve();
            });
        });
    }

    /**
     * Строит карту ссылок из path
     * @param {Array} path - путь из ShowedBlocks
     * @returns {Map<string, string>} - Map<sourceBlockId, linkBlockId>
     */
    buildLinkMap(path) {
        const linkMap = new Map();
        for (const pathItem of path) {
            if (pathItem.links && pathItem.links.length > 0) {
                for (const link of pathItem.links) {
                    linkMap.set(link.linkSource, link.linkId);
                }
            }
        }
        return linkMap;
    }

    /**
     * Получает блок из IndexedDB
     * @param {string} id - ID блока
     * @returns {Promise<Object|null>} - блок или null
     */
    async getBlock(id) {
        try {
            return await localforage.getItem(`Block_${id}_${this.user}`);
        } catch (err) {
            console.error("Ошибка при получении блока:", err);
            return null;
        }
    }

    /**
     * Строит цепочку блоков от текущего до корня
     * @param {string} startBlockId - ID начального блока
     * @param {Map<string, string>} linkMap - карта ссылок
     * @returns {Promise<Array>} - цепочка блоков (от текущего к корню)
     */
    async buildBlockChain(startBlockId, linkMap) {
        const chain = [];
        let currentId = startBlockId;

        while (currentId) {
            const block = await this.getBlock(currentId);
            if (!block) break;

            chain.push(block);

            // Определяем следующий родительский ID
            // Если блок - ссылка, используем родителя ссылки из linkMap
            const parentId = block.parent_id;
            if (!parentId || parentId === "None") break;

            // Ищем родителя ссылки, а не исходного блока
            currentId = linkMap.has(block.id) ? linkMap.get(block.id) : parentId;
        }

        return chain;
    }

    /**
     * Отрисовывает хлебные крошки
     * @param {Array} chain - цепочка блоков (от текущего к корню)
     */
    renderCrumbs(chain) {
        if (!this.container) {
            console.warn("Элемент #breadcrumb не найден!");
            return;
        }

        this.container.innerHTML = "";

        // Разворачиваем: от корня к текущему
        const crumbs = [...chain].reverse();
        let parentColor = [];

        crumbs.forEach((block, index) => {
            // Пропускаем блоки-ссылки (link view)
            if (block.data.view === "link") return;

            const isLast = index === crumbs.length - 1;
            const fullTitle = block.title || block.id;
            const shortTitle = isLast ? fullTitle : shortenText(fullTitle, 15);

            const crumb = this.createCrumbElement(block, shortTitle, fullTitle, parentColor);
            parentColor = this.colorist.calculateColor(crumb, block, [...parentColor]);
            this.container.appendChild(crumb);

            // Добавляем разделитель (кроме последнего элемента)
            if (!isLast) {
                const separator = document.createElement("span");
                separator.classList.add("separator");
                this.container.appendChild(separator);
            }
        });

        // Прокручиваем к концу
        requestAnimationFrame(() => {
            this.container.scrollLeft = this.container.scrollWidth;
        });
    }

    /**
     * Создает DOM-элемент хлебной крошки
     */
    createCrumbElement(block, shortTitle, fullTitle, parentColor) {
        const crumb = document.createElement("span");
        crumb.classList.add("breadcrumb-item");
        crumb.textContent = shortTitle;
        crumb.setAttribute("blockId", block.id);
        crumb.setAttribute("parentHsl", parentColor.join(","));
        crumb.setAttribute("title", fullTitle);
        return crumb;
    }

    render() {
        // Метод для совместимости с BaseController
        // Фактическая отрисовка происходит через handleShowedBlocks
    }
}
