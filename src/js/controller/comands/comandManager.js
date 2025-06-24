import {commands} from './commands.js';
import hotkeys from 'hotkeys-js';
import {ContextManager} from "./contextManager";
import {uiManager} from "./uiManager";
import {isExcludedElement, throttle} from "../../utils/functions";
import {dispatch} from "../../utils/utils";

hotkeys.filter = function (event) {
    const target = event.target || event.srcElement;
    const tagName = target.tagName.toUpperCase();

    // Разрешаем только esc, даже если фокус в input
    if (event.key === "Escape") return true;

    return !(tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable);
};

export class CommandManager {
    constructor(idRootContainer, breadcrumb, treeNavigation, hotkeysMap = {},) {

        this.commandsById = {}
        this.hotkeysMap = hotkeysMap;
        this.rootContainer = document.getElementById(idRootContainer);
        this.breadcrumb = document.getElementById(breadcrumb)
        this.treeNavigation = document.getElementById(treeNavigation)
        this.controlPanel = document.getElementById('control-panel')
        this.topSidebar = document.getElementById('topSidebar')
        this.ctxManager = new ContextManager(this.rootContainer, this.breadcrumb, this.treeNavigation)
        this.isLink = window.location.href.indexOf('/?') !== -1
        this.selectedText = ''
        this.init()
    }

    init() {
        for (const cmd of commands) {
            this.registerCommand(cmd);
        }
        this.clickOnRootContainerHandlerBound = this.clickOnRootContainerHandler.bind(this)
        this.clickOnControlPanelBound = this.clickOnControlPanel.bind(this)
        this.clickOnTopNavigationBound = this.clickOnTopNavigation.bind(this)

        this.rootContainer.addEventListener('click', this.clickOnRootContainerHandlerBound);
        this.topSidebar.addEventListener('click', this.clickOnTopNavigationBound);
        this.controlPanel.addEventListener('click', this.clickOnControlPanelBound)
        window.addEventListener('ReRegistrationCmd', (e) => {
            this.resetAndReRegisterCommands(e.detail)
        })
        uiManager.renderBtn('normal', this.commandsById)
        window.addEventListener('Login', () => {
            this.resetAndReRegisterCommands(this.hotkeysMap);
        } )

    }

    registerCommand(cmd) {
        if (this.isLink && !cmd.regLink) return

        const id = cmd.id
        this.commandsById[id] = cmd
        if (cmd.defaultHotkey) {
            cmd.currentHotkey = this.hotkeysMap[id] || cmd.defaultHotkey
            this.bindHotkey(id, cmd);
        }
    }

    async resetAndReRegisterCommands(hotkeysMap) {
        // Сначала удаляем привязанные горячие клавиши для всех команд
        this.hotkeysMap = hotkeysMap

        for (const cmdId in this.commandsById) {
            const cmd = this.commandsById[cmdId];
            if (cmd.currentHotkey) {
                hotkeys.unbind(cmd.currentHotkey);
            }
        }
        // Сбрасываем объект команд
        this.commandsById = {};

        // Перерегистрируем команды из исходного списка
        for (const cmd of commands) {
            this.registerCommand(cmd);
        }

        // Перерисовываем кнопки в UI
        uiManager.reRenderBtn(this.commandsById);
    }

    bindHotkey(commandId, cmd) {
        const options = {
            enableInInput: true,
            keyup: cmd.eventType === 'keyup',
            keydown: cmd.eventType !== 'keyup'
        }
        let executeFn = (event, handler) => {
            if (event?.target && event.target.closest('emoji-picker, .emoji-picker-container')) {
                return
            }
            // event && event.preventDefault();
            this.ctxManager.setEvent(event)
            this.ctxManager.setCmd(cmd)
            this.executeCommand(this.ctxManager);
        }
        if (!cmd.throttleDisable) {
            executeFn = throttle(executeFn, 250)
        }
        hotkeys(`${cmd.currentHotkey}`, options, executeFn);
    }

    executeCommand(ctx) {
        const cmdId = ctx.getCmd()
        const cmd = this.commandsById[cmdId];
        if (!cmd) return;
        if (cmdId === 'escape')
            this.commandsById['escape'].execute(ctx)
        else if (cmd.mode.includes(ctx.mode) || cmd.mode.includes('*'))
            cmd.execute(ctx);
        else {
            setTimeout(() => {
                ctx.setCmd('openBlock')
            }, 50)
        }
    }

    clickOnRootContainerHandler(event) {
        const target = event.target
        // переходим по url ссылке
        if (target.tagName === 'A') {
            event.preventDefault();
            if (target.classList.contains('block-tag-link')) {
                dispatch('OpenBlock', {
                    id: target.getAttribute('href').slice(7,),
                    parentHsl: [],
                    isIframe: false,
                    links: []
                });
            } else if (target.href.startsWith('http')) {
                window.open(target.href, '_blank')
            }
        } else if (isExcludedElement(target, 'commandManager', ['body', 'textarea', 'input', 'emoji-picker'])) {
        } else {
            const selection = window.getSelection()
            // позволяем выделять текст курсором
            if (selection && (selection.toString().trim().length > 0 || this.selectedText.length > 0)) {
                this.selectedText = selection.toString().trim()
                return
            }
            if (this.ctxManager.mode === 'cutBlock') {
                this.ctxManager.setCmd('pasteBlock')
            }
            this.ctxManager.isTree = false
            this.executeCommand(this.ctxManager)
        }
    }

    clickOnControlPanel(event) {
        const target = event.target
        if (target.tagName === 'BUTTON') {
            const cmd = this.commandsById[target.id]
            this.ctxManager.isTree = false
            this.ctxManager.setCmd(cmd)
        }
    }

    clickOnTopNavigation(event) {
        const target = event.target
        if (target.classList.contains('top-btn')) {
            const cmd = this.commandsById[target.id]
            this.ctxManager.setCmd(cmd)
        }
    }
}

