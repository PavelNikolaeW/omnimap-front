/**
 * Actions Layer - точка входа
 *
 * Экспортирует все actions для использования в приложении.
 * Этот слой отделяет бизнес-логику от UI (comandManager).
 */

// Block CRUD operations
export {
    createBlock,
    createIframeBlock,
    createBlockSmart,
    updateBlockTitle,
    updateBlockText,
    updateBlockColor,
    updateBlockData,
    setBlockIframe,
    deleteBlock,
    moveBlock,
    copyBlocks,
    linkBlocks,
    createTree,
    createPublicLink,
    updateBlockGrid,
    addConnection,
    removeConnection
} from './blockActions';

// Navigation
export {
    getCurrentUser,
    getCurrentTree,
    setCurrentTree,
    getTreeIds,
    saveTreeIds,
    addTreeId,
    removeTreeId,
    getPath,
    savePath,
    removePath,
    getBlock,
    getCurrentScreen,
    navigateInto,
    navigateBack,
    navigateToLevel,
    switchTree,
    switchTreeByIndex,
    initTreePath,
    extractParentHsl,
    extractLinkChain,
    resolveBlockId
} from './navigationActions';

// Selection & Modes
export {
    MODES,
    copyBlockId,
    getBlockIdFromClipboard,
    startCutBlock,
    completeCutBlock,
    startConnectBlocks,
    completeConnectBlocks,
    extractBlockId,
    extractParentId,
    isModeAllowed,
    toggleMode,
    resetToNormalMode,
    createSelectionState,
    updateSelectionOnClick,
    clearSelection
} from './selectionActions';
