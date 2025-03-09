export const arrowCommands = [
    {
        id: 'arrowUp',
        label: 'Стрелка Вверх',
        icon: 'fa fa-arrow-up', // иконка условная
        defaultHotkey: 'Up',
        description: 'Перемещает выделение к верхнему блоку',
        mode: ['normal', 'move'],
        execute(context) {
            const activeElem = context.getActiveElement();
            // Ищем ближайшего родителя с атрибутом block
            const parentBlock = activeElem.parentElement ? activeElem.parentElement.closest('[block]') : null;
            console.log(parentBlock)
            console.log(activeElem)
            if (parentBlock) {
                context.removeActiveClass();
                context.blockElement = parentBlock;
                context.blockLinkElement = null;
                context.addActiveClass();
            }

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
            const activeElem = context.getActiveElement();
            // Ищем только прямых потомков с атрибутом block
            const childBlocks = activeElem.querySelectorAll(':scope > [block]');
            if (childBlocks.length > 0) {
                context.removeActiveClass();
                // Обновляем текущий выделенный элемент
                context.blockElement = childBlocks[0];
                context.blockLinkElement = null;
                context.addActiveClass();
            }
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
            const activeElem = context.getActiveElement();
            const parentContainer = activeElem.parentElement;
            if (!parentContainer) return;
            // Получаем прямых потомков родительского элемента с атрибутом block
            const siblings = Array.from(parentContainer.querySelectorAll(':scope > [block]'));
            const index = siblings.indexOf(activeElem);
            if (index > 0) {
                const newActive = siblings[index - 1];
                context.removeActiveClass();
                context.blockElement = newActive;
                context.blockLinkElement = null;
                context.addActiveClass();
            }
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
            const activeElem = context.getActiveElement();
            const parentContainer = activeElem.parentElement;
            if (!parentContainer) return;
            // Получаем прямых потомков родительского элемента с атрибутом block
            const siblings = Array.from(parentContainer.querySelectorAll(':scope > [block]'));
            const index = siblings.indexOf(activeElem);
            if (index < siblings.length - 1) {
                const newActive = siblings[index + 1];
                context.removeActiveClass();
                context.blockElement = newActive;
                context.blockLinkElement = null;
                context.addActiveClass();
            }
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