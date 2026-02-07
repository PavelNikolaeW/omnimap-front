import { LayoutEditorPanel } from "../layoutEditor/LayoutEditorPanel";
import { dispatch } from "../../utils/utils";

/**
 * Команды раскладки блоков
 * Визуальный редактор раскладки заменяет старые команды layoutDefault, layoutRows и т.д.
 */
export const layoutCommands = [
    // Визуальный редактор раскладки
    {
        id: 'openLayoutEditor',
        mode: ['normal'],
        btn: {
            containerId: 'control-panel',
            label: 'Редактор раскладки',
            classes: ['sidebar-button', 'fas', 'fa-grip', 'fas-lg']
        },
        defaultHotkey: 'l+e',
        description: 'Открыть визуальный редактор раскладки с drag-and-drop',
        execute(ctx) {
            dispatch('OpenLayoutEditor');
            LayoutEditorPanel.show(ctx);
        },
        btnExec(ctx) {
            dispatch('OpenLayoutEditor');
            LayoutEditorPanel.show(ctx);
        }
    }
];
