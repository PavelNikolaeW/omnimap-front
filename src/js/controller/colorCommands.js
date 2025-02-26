import {dispatch} from "../utils/utils";

function setColor(val, ctx) {
    let id = ctx.blockElement.id
    if (ctx.blockLinkElement) id = ctx.blockLinkElement.getAttribute('blocklink')
    console.log({blockId: id, hue: val})
    dispatch('SetHueBlock', {blockId: id, hue: val})
    setTimeout(() => {
        ctx.setCmd('openBlock')
    }, 300)
}

export const colorCommands = [
    {
        id: 'color1',
        defaultHotkey: '1',
        mode: ['normal',],
        defaultValue: '0',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color2',
        defaultHotkey: '2',
        mode: ['normal',],
        defaultValue: '30',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color3',
        defaultHotkey: '3',
        mode: ['normal',],
        defaultValue: '60',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color4',
        defaultHotkey: '4',
        mode: ['normal',],
        defaultValue: '90',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color5',
        defaultHotkey: '5',
        mode: ['normal',],
        defaultValue: '120',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color6',
        defaultHotkey: '6',
        mode: ['normal',],
        defaultValue: '330',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color7',
        defaultHotkey: '7',
        mode: ['normal',],
        defaultValue: '240',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color8',
        defaultHotkey: '8',
        mode: ['normal',],
        defaultValue: '270',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color9',
        defaultHotkey: '9',
        mode: ['normal',],
        defaultValue: '300',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    }, {
        id: 'color0',
        defaultHotkey: '0',
        mode: ['normal',],
        defaultValue: 'default_color',
        execute(ctx) {
            setColor(this.defaultValue, ctx)
        }
    },
]