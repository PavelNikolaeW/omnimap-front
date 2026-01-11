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
    generateChatDeepLink,
    parseChatHash
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

    describe('parseChatHash', () => {
        describe('valid hashes', () => {
            it('should parse dm hash with numeric id', () => {
                const result = parseChatHash('#chat/dm/123');
                expect(result).toEqual({ type: 'dm', id: '123' });
            });

            it('should parse dm hash with string id', () => {
                const result = parseChatHash('#chat/dm/user-456');
                expect(result).toEqual({ type: 'dm', id: 'user-456' });
            });

            it('should parse group hash with uuid', () => {
                const result = parseChatHash('#chat/group/abc-123-def');
                expect(result).toEqual({ type: 'group', id: 'abc-123-def' });
            });

            it('should parse group hash with alphanumeric id', () => {
                const result = parseChatHash('#chat/group/group123');
                expect(result).toEqual({ type: 'group', id: 'group123' });
            });
        });

        describe('invalid hashes - empty/null', () => {
            it('should return null for empty string', () => {
                expect(parseChatHash('')).toBeNull();
            });

            it('should return null for null', () => {
                expect(parseChatHash(null)).toBeNull();
            });

            it('should return null for undefined', () => {
                expect(parseChatHash(undefined)).toBeNull();
            });
        });

        describe('invalid hashes - wrong prefix', () => {
            it('should return null for hash without #chat/ prefix', () => {
                expect(parseChatHash('#other/dm/123')).toBeNull();
            });

            it('should return null for hash with only #', () => {
                expect(parseChatHash('#')).toBeNull();
            });

            it('should return null for hash with only #chat', () => {
                expect(parseChatHash('#chat')).toBeNull();
            });

            it('should return null for hash with only #chat/', () => {
                expect(parseChatHash('#chat/')).toBeNull();
            });
        });

        describe('invalid hashes - wrong format', () => {
            it('should return null for hash with only type (no id)', () => {
                expect(parseChatHash('#chat/dm')).toBeNull();
            });

            it('should return null for hash with empty id', () => {
                expect(parseChatHash('#chat/dm/')).toBeNull();
            });

            it('should return null for hash with too many parts', () => {
                expect(parseChatHash('#chat/dm/123/extra')).toBeNull();
            });

            it('should return null for invalid chat type', () => {
                expect(parseChatHash('#chat/invalid/123')).toBeNull();
            });

            it('should return null for chat type "channel"', () => {
                expect(parseChatHash('#chat/channel/123')).toBeNull();
            });
        });

        describe('invalid hashes - security', () => {
            it('should reject id with script tag', () => {
                expect(parseChatHash('#chat/dm/<script>')).toBeNull();
            });

            it('should reject id with path traversal', () => {
                expect(parseChatHash('#chat/group/../../../etc/passwd')).toBeNull();
            });

            it('should reject id with spaces', () => {
                expect(parseChatHash('#chat/dm/user 123')).toBeNull();
            });

            it('should reject id with special characters', () => {
                expect(parseChatHash('#chat/dm/user@123')).toBeNull();
            });

            it('should reject very long id (>64 chars)', () => {
                const longId = 'a'.repeat(65);
                expect(parseChatHash(`#chat/dm/${longId}`)).toBeNull();
            });
        });

        describe('edge cases', () => {
            it('should accept id at max length (64 chars)', () => {
                const maxId = 'a'.repeat(64);
                const result = parseChatHash(`#chat/dm/${maxId}`);
                expect(result).toEqual({ type: 'dm', id: maxId });
            });

            it('should accept id with underscores', () => {
                const result = parseChatHash('#chat/group/group_123_test');
                expect(result).toEqual({ type: 'group', id: 'group_123_test' });
            });

            it('should accept id with hyphens', () => {
                const result = parseChatHash('#chat/dm/user-name-123');
                expect(result).toEqual({ type: 'dm', id: 'user-name-123' });
            });
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
