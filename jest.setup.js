// Mock localforage
jest.mock('localforage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    keys: jest.fn()
}));

// Mock api
jest.mock('./src/js/api/api', () => ({
    default: {
        getTreeBlocks: jest.fn(),
        createBlock: jest.fn(),
        updateBlock: jest.fn(),
        removeTree: jest.fn(),
        moveBlock: jest.fn(),
        pasteBlock: jest.fn(),
        pasteLinkBlock: jest.fn(),
        loadEmpty: jest.fn(),
        createTree: jest.fn(),
        createUrlLink: jest.fn(),
        loadBlockUrl: jest.fn()
    }
}));

// Mock jsPlumb
jest.mock('./src/js/controller/arrowManager', () => ({
    jsPlumbInstance: {
        repaintEverything: jest.fn(),
        deleteEveryConnection: jest.fn(),
        reset: jest.fn()
    }
}));

// Mock Painter
jest.mock('./src/js/painter/painter', () => ({
    Painter: jest.fn().mockImplementation(() => ({
        render: jest.fn()
    }))
}));

// Mock custom-dialog
jest.mock('./src/js/utils/custom-dialog', () => ({
    customConfirm: jest.fn().mockResolvedValue(true)
}));

// Polyfill structuredClone for jsdom (not available in jsdom environment)
if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Global DOM setup
document.body.innerHTML = `
    <div id="rootContainer"></div>
    <div id="sidebar"></div>
    <div id="topSidebar"></div>
    <div id="error-popup" class="hidden">
        <span id="error-message"></span>
    </div>
`;
