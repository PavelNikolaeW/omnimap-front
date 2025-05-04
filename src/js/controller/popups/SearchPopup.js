import {Popup} from "./popup";
import {copyToClipboard} from "../../utils/functions";

export class SearchBlocksPopup extends Popup {
    constructor(options = {}) {
        options.title = options.title || "Поиск блоков";
        options.modal = true;
        options.draggable = true;
        options.inputs = [];
        super(options);

        this.initialState = options.initialState || {query: "", everywhere: false, results: []};
        this.searchResults = options.initialState.results || [];
        this.debouncedSearch = this.debounce(this.handleSearch.bind(this), 400);
    }

    createPopup() {
        super.createPopup();
        this.contentArea.innerHTML = "";

        // Контейнер поиска
        this.searchContainer = document.createElement("div");
        this.searchContainer.className = "search-container";

        // Поле ввода
        this.searchInput = document.createElement("input");
        this.searchInput.type = "text";
        this.searchInput.placeholder = "Введите запрос для поиска...";
        this.searchInput.className = "search-input";
        this.searchInput.value = this.options.initialState.query || "";
        this.searchContainer.appendChild(this.searchInput);

        // Чекбокс
        this.searchEverywhereLabel = document.createElement("label");
        this.searchEverywhereLabel.className = "search-checkbox-label";

        this.searchEverywhereCheckbox = document.createElement("input");
        this.searchEverywhereCheckbox.type = "checkbox";
        this.searchEverywhereCheckbox.className = "search-everywhere";
        this.searchEverywhereCheckbox.checked = this.options.initialState.everywhere || false;

        this.searchEverywhereLabel.appendChild(this.searchEverywhereCheckbox);
        this.searchEverywhereLabel.appendChild(document.createTextNode(" Искать везде"));

        this.searchContainer.appendChild(this.searchEverywhereLabel);
        this.contentArea.appendChild(this.searchContainer);

        // Контейнер для результатов
        this.resultsContainer = document.createElement("div");
        this.resultsContainer.className = "search-results-container";
        this.contentArea.appendChild(this.resultsContainer);

        // События
        this.searchInput.addEventListener("input", () => this.debouncedSearch());
        this.searchEverywhereCheckbox.addEventListener("change", () => this.debouncedSearch());

        this.positionPopup();

        // Восстановление результатов
        if (this.options.initialState.results?.length > 0) {
            this.renderResults(this.options.initialState.results);
        }
    }

    positionPopup() {
        this.popupEl.style.width = "90vw";
        this.popupEl.style.height = "85vh";
        this.popupEl.style.left = "50%";
        this.popupEl.style.top = "50%";
        this.popupEl.style.transform = "translate(-50%, -50%)";
        this.popupEl.style.position = "fixed"; // фиксированное позиционирование
    }

    /**
     * Метод обработки поиска
     */
    async handleSearch() {
        const query = this.searchInput.value.trim();
        const searchEverywhere = this.searchEverywhereCheckbox.checked;

        if (!query) {
            this.renderResults([]);
            return;
        }

        if (typeof this.options.onSearch === "function") {
            try {
                const results = await this.options.onSearch(query, searchEverywhere);
                this.searchResults = results;
                this.renderResults(results);
            } catch (err) {
                console.error("Ошибка при поиске:", err);
                this.resultsContainer.innerHTML = "<div class='search-error'>Ошибка при выполнении поиска</div>";
            }
        } else {
            this.resultsContainer.innerHTML = "<div class='search-empty'>Функция поиска не реализована</div>";
        }
    }

    /**
     * Метод отображения результатов поиска
     * @param {Array} blocks - массив объектов блоков
     */
    renderResults(blocks) {
        this.resultsContainer.innerHTML = "";

        if (blocks.length === 0) {
            this.resultsContainer.innerHTML = "<div class='search-empty'>Ничего не найдено</div>";
            return;
        }

        blocks.forEach((block) => {
            const blockEl = document.createElement("div");
            blockEl.className = "search-result-item";

            const title = document.createElement("div");
            title.innerHTML = `<strong>${block.title}</strong>`;

            const description = document.createElement("div");
            description.textContent = block.text || "";

            const actions = document.createElement("div");
            actions.className = "search-result-actions";

            // Кнопка "Открыть"
            const openBtn = document.createElement("button");
            openBtn.textContent = "Открыть";
            openBtn.className = "btn-open";
            openBtn.addEventListener("click", () => {
                if (typeof this.options.onOpen === "function") {
                    this.options.onOpen(block.id);
                    this.handleCancel()
                }
            });

            // Кнопка "Копировать ID"
            const copyBtn = document.createElement("button");
            copyBtn.textContent = "Скопировать ID";
            copyBtn.className = "btn-copy";
            copyBtn.addEventListener("click", () => {
                copyToClipboard(block.id)
            });

            actions.appendChild(openBtn);
            actions.appendChild(copyBtn);

            blockEl.appendChild(title);
            blockEl.appendChild(description);
            blockEl.appendChild(actions);
            this.resultsContainer.appendChild(blockEl);
        });
    }

    createButtons() {
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = "popup-buttons";

        this.cancelButton = this.createCancelButton();
        this.cancelButton.textContent = "Закрыть";
        this.cancelButton.addEventListener("click", () => this.handleCancel());

        buttonsContainer.appendChild(this.cancelButton);
        this.popupEl.appendChild(buttonsContainer);
    }

    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }
}