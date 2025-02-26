export const arrowCommands = [
    {
        id: 'arrowUp',
        label: 'Стрелка Вверх',
        icon: 'fa fa-arrow-up', // иконка условная
        defaultHotkey: 'ArrowUp',
        description: 'Перемещает выделение к верхнему блоку',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'arrowDown',
        label: 'Стрелка Вниз',
        icon: 'fa fa-arrow-down',
        defaultHotkey: 'down',
        description: 'Перемещает выделение к нижнему блоку',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'arrowLeft',
        label: 'Стрелка Влево',
        icon: 'fa fa-arrow-left',
        defaultHotkey: 'left',
        description: 'Перемещает выделение к левому блоку',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'arrowRight',
        label: 'Стрелка Вправо',
        icon: 'fa fa-arrow-right',
        defaultHotkey: 'right',
        description: 'Перемещает выделение к правому блоку',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'shiftArrowUp',
        label: 'Shift + Стрелка Вверх',
        icon: 'fa fa-arrow-up', // Можно условно использовать ту же иконку
        defaultHotkey: 'shift+up',
        description: 'Открывает родительский блок, используя Shift',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'shiftArrowDown',
        label: 'Shift + Стрелка Вниз',
        icon: 'fa fa-arrow-down',
        defaultHotkey: 'shift+down',
        description: 'Открывает первый дочерний блок, используя Shift',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'shiftArrowLeft',
        label: 'Shift + Стрелка Влево',
        icon: 'fa fa-arrow-left',
        defaultHotkey: 'shift+left',
        description: 'Открывает левый блок, используя Shift',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },
    {
        id: 'shiftArrowRight',
        label: 'Shift + Стрелка Вправо',
        icon: 'fa fa-arrow-right',
        defaultHotkey: 'shift+right',
        description: 'Открывает правый блок, используя Shift',
        mode: ['normal', 'move'],
        execute(context) {
            console.log(context)
        }
    },

];