import {commands} from './commands.js';
import hotkeys from 'hotkeys-js';
import {ContextManager} from "./contextManager";
import {uiManager} from "./uiManager";
import {throttle} from "../../utils/functions";

export class CommandManager {
    constructor(idRootContainer, breadcrumb, treeNavigation, hotkeysMap = {}) {
        this.commandsById = {}
        this.hotkeysMap = hotkeysMap;
        this.rootContainer = document.getElementById(idRootContainer);
        this.breadcrumb = document.getElementById(breadcrumb)
        this.treeNavigation = document.getElementById(treeNavigation)
        this.controlPanel = document.getElementById('control-panel')
        this.topSidebar = document.getElementById('topSidebar')
        this.ctxManager = new ContextManager(this.rootContainer, this.breadcrumb, this.treeNavigation)
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

        window.addEventListener('ShowedBlocks', () => {
            this.rootContainer.addEventListener('click', this.clickOnRootContainerHandlerBound);
            this.topSidebar.addEventListener('click', this.clickOnTopNavigationBound);
            this.controlPanel.addEventListener('click', this.clickOnControlPanelBound)
        })
        window.addEventListener('ReRegistrationCmd', (e) => {
            this.resetAndReRegisterCommands(e.detail)
        })
        uiManager.renderBtn('normal', this.commandsById)

    }

    registerCommand(cmd) {
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
            event && event.preventDefault();
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
            window.open(target.href, '_blank')
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
            this.executeCommand(this.ctxManager)
        }
    }

    clickOnControlPanel(event) {
        const target = event.target
        if (target.tagName === 'BUTTON') {
            const cmd = this.commandsById[target.id]
            this.ctxManager.setCmd(cmd)
        }
    }
    clickOnTopNavigation(event) {
        const target = event.target
         if (target.classList.contains('top-btn')) {
             console.log('cklick')
            const cmd = this.commandsById[target.id]
            this.ctxManager.setCmd(cmd)
        }
    }
}

