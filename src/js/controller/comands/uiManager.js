import {commands} from "./commands";


export class UIManager {
    constructor() {
        this.mode = undefined
        this.elements = {
            'control-panel': document.getElementById('control-panel'),
            'top-btn-container': document.getElementById('top-btn-container'),
        }
    }

    renderBtn(mode, commandsById) {
        this.mode = mode
        Object.values(commandsById).forEach((cmd) => {
            if (cmd.mode.includes(mode) && cmd.btn) {
                const btn = cmd.btn
                const containerId = btn.containerId
                const element = document.createElement('button')

                element.id = cmd.id
                element.classList.add(...btn.classes)
                if (btn.icons) {
                    btn.icons.forEach((icon) => {
                        const i = document.createElement('i')
                        i.classList.add(...icon)
                        element.appendChild(i)
                    })
                }
                element.setAttribute('title', `${btn.label} [${cmd.currentHotkey}]`)
                this.elements[containerId].appendChild(element)
            }
        })
    }

    reRenderBtn(commandsById) {
        // Очищаем все контейнеры, где расположены кнопки
        Object.keys(this.elements).forEach((containerId) => {
            this.elements[containerId].innerHTML = '';
        });
        // Перерисовываем кнопки, используя сохранённый режим (или 'normal' по умолчанию)
        this.renderBtn(this.mode || 'normal', commandsById);
    }
}

export const uiManager = new UIManager()