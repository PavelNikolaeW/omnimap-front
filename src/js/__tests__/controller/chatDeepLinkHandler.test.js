/**
 * Тесты для chatDeepLinkHandler
 */

// Мокаем модули до импорта
jest.mock('../../api/chatApi.js', () => ({
    __esModule: true,
    default: {
        getConversations: jest.fn(),
        getChatGroup: jest.fn()
    }
}));

jest.mock('../../controller/popups/conversationView.js', () => ({
    ConversationView: jest.fn()
}));

jest.mock('../../controller/popups/groupChatView.js', () => ({
    GroupChatView: jest.fn()
}));

import chatApi from '../../api/chatApi.js';
import { ConversationView } from '../../controller/popups/conversationView.js';
import { GroupChatView } from '../../controller/popups/groupChatView.js';
import {
    openDirectChatById,
    openGroupChatById,
    generateChatDeepLink
} from '../../controller/chatDeepLinkHandler.js';

describe('chatDeepLinkHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('openDirectChatById', () => {
        it('should open chat with provided username', async () => {
            await openDirectChatById(456, 'ProvidedUser');

            expect(ConversationView).toHaveBeenCalledWith({
                user_id: 456,
                username: 'ProvidedUser'
            });
        });

        it('should fetch username from conversations if not provided', async () => {
            chatApi.getConversations.mockResolvedValue({
                data: [{ user_id: 789, username: 'FetchedUser' }]
            });

            await openDirectChatById(789);

            expect(chatApi.getConversations).toHaveBeenCalled();
            expect(ConversationView).toHaveBeenCalledWith({
                user_id: 789,
                username: 'FetchedUser'
            });
        });

        it('should use fallback username if not found', async () => {
            chatApi.getConversations.mockResolvedValue({
                data: []
            });

            await openDirectChatById(999);

            expect(ConversationView).toHaveBeenCalledWith({
                user_id: 999,
                username: 'User 999'
            });
        });

        it('should handle API error gracefully', async () => {
            chatApi.getConversations.mockRejectedValue(new Error('Network error'));

            await openDirectChatById(111);

            expect(ConversationView).toHaveBeenCalledWith({
                user_id: 111,
                username: 'User 111'
            });
        });
    });

    describe('openGroupChatById', () => {
        it('should fetch group and open chat', async () => {
            chatApi.getChatGroup.mockResolvedValue({
                data: { id: 'group-1', name: 'My Group', members_count: 5 }
            });

            await openGroupChatById('group-1');

            expect(chatApi.getChatGroup).toHaveBeenCalledWith('group-1');
            expect(GroupChatView).toHaveBeenCalledWith({
                id: 'group-1',
                name: 'My Group',
                members_count: 5
            });
        });

        it('should not open chat if group not found', async () => {
            chatApi.getChatGroup.mockResolvedValue({ data: null });

            await openGroupChatById('nonexistent');

            expect(GroupChatView).not.toHaveBeenCalled();
        });

        it('should handle 404 error', async () => {
            chatApi.getChatGroup.mockRejectedValue({
                response: { status: 404 }
            });

            await openGroupChatById('no-access');

            expect(GroupChatView).not.toHaveBeenCalled();
        });
    });

    describe('generateChatDeepLink', () => {
        it('should generate dm deep link', () => {
            const link = generateChatDeepLink('dm', 123);
            expect(link).toContain('#chat/dm/123');
        });

        it('should generate group deep link', () => {
            const link = generateChatDeepLink('group', 'uuid-123');
            expect(link).toContain('#chat/group/uuid-123');
        });
    });
});
