import api from "../api/api";
import {dispatch} from "../utils/utils";


export class SearchWindow {
    constructor() {
        this.searchModal = document.getElementById('searchModal');
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');


        this.searchInput.addEventListener('input', () => {
            const query = this.searchInput.value.toLowerCase();
            if (query) {
                api.searchBlock(query).then((res) => {
                    if (res.status === 200) {
                        const data = res.data
                        this.searchResults.textContent = ''
                        data.results.forEach((el) => {
                            this.searchResults.appendChild(this.createElementResult(el))
                        })
                    }
                }).catch((err) => {
                    console.error(err)
                })
            }
        });
    }

    createElementResult(block) {
        const li = document.createElement('li',);
        const title = `<titleBlock><b>${block.title}</b></titleBlock>`
        const text = `<contentBlock><p>${block.text}</p></contentBlock>`
        li.innerHTML =  title + text
        li.addEventListener('click', () => {
            dispatch('CopyBlock', block)
        })
        return li
    }

    openSearchWindow() {
        this.searchModal.style.display = 'block';
        this.searchInput.focus();
    }

    closeSearchWindow() {
        this.searchModal.style.display = 'none';
        // this.searchInput.value = '';
    }
}