/**
 * GroupChatView - Окно группового чата
 *
 * Включает:
 * - Заголовок с названием группы
 * - Список участников (по клику)
 * - История сообщений с infinite scroll
 * - Имя отправителя над каждым сообщением
 * - Управление группой (для админов)
 */

import { Popup } from './popup.js';
import { dispatch } from '../../utils/utils.js';
import chatApi from '../../api/chatApi.js';
import localforage from 'localforage';

export class GroupChatView extends Popup {
    /**
     * @param {Object} group - Данные группы
     * @param {string} group.id - ID группы
     * @param {string} group.name - Название группы
     * @param {boolean} group.is_admin - Является ли текущий пользователь админом
     */
    constructor(group) {
        super({
            title: group.name,
            size: 'lg',
            modal: true,
            draggable: true,
            closeOnOverlay: true,
            closeOnEsc: true
        });

        this.groupId = group.id;
        this.groupName = group.name;
        this.groupAvatarUrl = group.avatar_url || null;
        this.isAdmin = group.is_admin || false;
        this.messages = [];
        this.members = [];
        this.isLoading = false;
        this.hasMore = true;
        this.oldestMessageId = null;
        this.currentUserId = null;
        this.typingUsers = new Set();
        this.showMembersSidebar = false;

        // File attachments
        this.pendingFiles = [];
        this.maxFiles = 5;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB

        this.init();
    }

    async init() {
        this.currentUserId = await localforage.getItem('currentUser');
        this.renderContent();
        this.bindChatEvents();
        await Promise.all([
            this.loadMessages(),
            this.loadMembers()
        ]);
        await this.markAsRead();
    }

    renderContent() {
        this.contentArea.innerHTML = '';
        this.contentArea.className = 'popup-content p2p-group-chat-view';

        // Header with back button, group info and members toggle
        const header = document.createElement('div');
        header.className = 'p2p-group-header';

        const leftSection = document.createElement('div');
        leftSection.className = 'p2p-group-header-left';

        const backBtn = document.createElement('button');
        backBtn.className = 'p2p-conversation-back-btn';
        backBtn.innerHTML = '&larr;';
        backBtn.addEventListener('click', () => this.goBack());

        const groupInfo = document.createElement('div');
        groupInfo.className = 'p2p-group-info';

        const avatar = document.createElement('div');
        avatar.className = 'p2p-chat-avatar p2p-chat-avatar--group';

        // Show avatar image if available
        if (this.groupAvatarUrl) {
            const img = document.createElement('img');
            img.className = 'p2p-avatar-img';
            img.src = this.groupAvatarUrl;
            img.alt = '';
            // Fallback to initials on error
            img.onerror = () => {
                img.remove();
                avatar.textContent = this.groupName.charAt(0).toUpperCase();
            };
            avatar.appendChild(img);
        } else {
            avatar.textContent = this.groupName.charAt(0).toUpperCase();
        }

        const nameContainer = document.createElement('div');
        nameContainer.className = 'p2p-group-name-container';

        const name = document.createElement('span');
        name.className = 'p2p-group-name';
        name.textContent = this.groupName;

        const membersCount = document.createElement('span');
        membersCount.className = 'p2p-group-members-count';
        membersCount.id = 'members-count';
        membersCount.textContent = `${this.members.length} участников`;

        nameContainer.appendChild(name);
        nameContainer.appendChild(membersCount);

        groupInfo.appendChild(avatar);
        groupInfo.appendChild(nameContainer);

        leftSection.appendChild(backBtn);
        leftSection.appendChild(groupInfo);

        const rightSection = document.createElement('div');
        rightSection.className = 'p2p-group-header-right';

        // Members toggle button
        const membersBtn = document.createElement('button');
        membersBtn.className = 'p2p-group-members-btn';
        membersBtn.innerHTML = '&#128101;'; // People icon
        membersBtn.title = 'Участники';
        membersBtn.addEventListener('click', () => this.toggleMembersSidebar());

        // Group menu (leave for all, more options for admin)
        const menuBtn = document.createElement('button');
        menuBtn.className = 'p2p-group-menu-btn';
        menuBtn.innerHTML = '&#8942;'; // Vertical dots
        menuBtn.addEventListener('click', (e) => this.showGroupMenu(e));
        rightSection.appendChild(menuBtn);

        rightSection.appendChild(membersBtn);

        header.appendChild(leftSection);
        header.appendChild(rightSection);

        this.contentArea.appendChild(header);

        // Body container (messages + sidebar)
        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'p2p-group-body';

        // Messages container
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'p2p-group-messages';
        messagesContainer.id = 'messages-container';
        this.messagesContainer = messagesContainer;
        messagesContainer.addEventListener('scroll', () => this.handleScroll());

        bodyContainer.appendChild(messagesContainer);

        // Members sidebar
        const membersSidebar = document.createElement('div');
        membersSidebar.className = `p2p-group-members-sidebar ${this.showMembersSidebar ? 'open' : ''}`;
        membersSidebar.id = 'members-sidebar';
        this.membersSidebar = membersSidebar;

        const membersHeader = document.createElement('div');
        membersHeader.className = 'p2p-group-members-sidebar-header';
        membersHeader.textContent = 'Участники';

        const membersList = document.createElement('div');
        membersList.className = 'p2p-group-members-list';
        membersList.id = 'members-list';
        this.membersList = membersList;

        membersSidebar.appendChild(membersHeader);
        membersSidebar.appendChild(membersList);

        bodyContainer.appendChild(membersSidebar);

        this.contentArea.appendChild(bodyContainer);

        // Typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'p2p-group-typing';
        typingIndicator.id = 'typing-indicator';
        typingIndicator.style.display = 'none';
        this.typingIndicator = typingIndicator;
        this.contentArea.appendChild(typingIndicator);

        // File preview area (above input)
        const filePreviewArea = document.createElement('div');
        filePreviewArea.className = 'p2p-file-preview-area';
        filePreviewArea.id = 'file-preview-area';
        filePreviewArea.style.display = 'none';
        this.filePreviewArea = filePreviewArea;
        this.contentArea.appendChild(filePreviewArea);

        // Input area
        const inputArea = document.createElement('div');
        inputArea.className = 'p2p-group-input-area';

        // Hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.className = 'p2p-file-input';
        fileInput.id = 'file-input';
        fileInput.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.fileInput = fileInput;

        // Attach button
        const attachBtn = document.createElement('button');
        attachBtn.className = 'p2p-attach-btn';
        attachBtn.innerHTML = '&#128206;'; // Paperclip icon
        attachBtn.title = 'Прикрепить файл';
        attachBtn.addEventListener('click', () => this.fileInput.click());
        this.attachBtn = attachBtn;

        const input = document.createElement('textarea');
        input.className = 'p2p-conversation-input';
        input.placeholder = 'Написать сообщение...';
        input.rows = 1;
        input.addEventListener('input', () => this.handleInputChange());
        input.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.messageInput = input;

        const sendBtn = document.createElement('button');
        sendBtn.className = 'p2p-conversation-send-btn';
        sendBtn.innerHTML = '&#10148;';
        sendBtn.addEventListener('click', () => this.sendMessage());
        this.sendBtn = sendBtn;

        inputArea.appendChild(fileInput);
        inputArea.appendChild(attachBtn);
        inputArea.appendChild(input);
        inputArea.appendChild(sendBtn);

        this.contentArea.appendChild(inputArea);
    }

    /**
     * Handle file selection from input
     */
    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.addFiles(files);
        // Reset input so same file can be selected again
        e.target.value = '';
    }

    /**
     * Add files to pending list with validation
     */
    addFiles(files) {
        for (const file of files) {
            // Check max files limit
            if (this.pendingFiles.length >= this.maxFiles) {
                alert(`Максимум ${this.maxFiles} файлов`);
                break;
            }

            // Check file size
            if (file.size > this.maxFileSize) {
                alert(`Файл "${file.name}" превышает лимит 10MB`);
                continue;
            }

            // Check for duplicates
            if (this.pendingFiles.some(f => f.name === file.name && f.size === file.size)) {
                continue;
            }

            this.pendingFiles.push(file);
        }

        this.renderFilePreview();
    }

    /**
     * Remove file from pending list
     */
    removeFile(index) {
        this.pendingFiles.splice(index, 1);
        this.renderFilePreview();
    }

    /**
     * Render file preview area
     */
    renderFilePreview() {
        if (!this.filePreviewArea) return;

        if (this.pendingFiles.length === 0) {
            this.filePreviewArea.style.display = 'none';
            this.filePreviewArea.innerHTML = '';
            return;
        }

        this.filePreviewArea.style.display = 'flex';
        this.filePreviewArea.innerHTML = '';

        this.pendingFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'p2p-file-preview-item';

            // Preview for images
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.className = 'p2p-file-preview-img';
                img.src = URL.createObjectURL(file);
                img.onload = () => URL.revokeObjectURL(img.src);
                item.appendChild(img);
            } else {
                // Icon for other files
                const icon = document.createElement('span');
                icon.className = 'p2p-file-preview-icon';
                icon.textContent = this.getFileIcon(file.name);
                item.appendChild(icon);
            }

            // File info
            const info = document.createElement('div');
            info.className = 'p2p-file-preview-info';

            const name = document.createElement('span');
            name.className = 'p2p-file-preview-name';
            name.textContent = file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name;
            name.title = file.name;

            const size = document.createElement('span');
            size.className = 'p2p-file-preview-size';
            size.textContent = this.formatFileSize(file.size);

            info.appendChild(name);
            info.appendChild(size);
            item.appendChild(info);

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'p2p-file-preview-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', () => this.removeFile(index));
            item.appendChild(removeBtn);

            this.filePreviewArea.appendChild(item);
        });
    }

    /**
     * Get icon for file type
     */
    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📄',
            doc: '📝', docx: '📝',
            xls: '📊', xlsx: '📊',
            txt: '📃',
            zip: '📦', rar: '📦',
            default: '📎'
        };
        return icons[ext] || icons.default;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    renderMessages() {
        if (!this.messagesContainer) return;

        this.messagesContainer.innerHTML = '';

        if (this.messages.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'p2p-conversation-empty';
            emptyEl.textContent = 'Начните обсуждение в группе';
            this.messagesContainer.appendChild(emptyEl);
            return;
        }

        // Group messages by date
        const groupedMessages = this.groupMessagesByDate(this.messages);

        groupedMessages.forEach(group => {
            // Date separator
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'p2p-conversation-date-separator';
            dateSeparator.textContent = group.dateLabel;
            this.messagesContainer.appendChild(dateSeparator);

            // Messages
            group.messages.forEach(msg => {
                const msgEl = this.createMessageElement(msg);
                this.messagesContainer.appendChild(msgEl);
            });
        });

        this.scrollToBottom();
    }

    createMessageElement(message) {
        const isOwn = message.sender_id === this.currentUserId;

        const container = document.createElement('div');
        container.className = `p2p-message p2p-message--group ${isOwn ? 'p2p-message--own' : 'p2p-message--other'}`;
        container.setAttribute('data-message-id', message.id);

        // Sender name (for other users' messages)
        if (!isOwn) {
            const senderName = document.createElement('div');
            senderName.className = 'p2p-message-sender';
            senderName.textContent = message.sender_username || `User ${message.sender_id}`;
            container.appendChild(senderName);
        }

        const bubble = document.createElement('div');
        bubble.className = 'p2p-message-bubble';

        // Add text content if present
        if (message.content) {
            const textNode = document.createTextNode(message.content);
            bubble.appendChild(textNode);
        }

        // Add attachments if present
        if (message.files && message.files.length > 0) {
            const attachments = this.createAttachmentsElement(message.files);
            bubble.appendChild(attachments);
        }

        const meta = document.createElement('div');
        meta.className = 'p2p-message-meta';

        const time = document.createElement('span');
        time.className = 'p2p-message-time';
        time.textContent = this.formatMessageTime(message.created_at);

        meta.appendChild(time);
        bubble.appendChild(meta);
        container.appendChild(bubble);

        return container;
    }

    /**
     * Create attachments display element
     */
    createAttachmentsElement(files) {
        const container = document.createElement('div');
        container.className = 'p2p-message-attachments';

        files.forEach(file => {
            const isImage = file.is_image || (file.content_type && file.content_type.startsWith('image/'));

            if (isImage) {
                // Image preview
                const img = document.createElement('img');
                img.className = 'p2p-attachment-img';
                img.src = file.url || file.file_url;
                img.alt = file.name || 'Image';
                img.loading = 'lazy';
                img.addEventListener('click', () => this.openLightbox(file.url || file.file_url));
                container.appendChild(img);
            } else {
                // File attachment
                const attachment = document.createElement('a');
                attachment.className = 'p2p-attachment';
                attachment.href = file.url || file.file_url;
                attachment.target = '_blank';
                attachment.download = file.name;

                const icon = document.createElement('span');
                icon.className = 'p2p-attachment-icon';
                icon.textContent = this.getFileIcon(file.name);

                const info = document.createElement('div');
                info.className = 'p2p-attachment-info';

                const name = document.createElement('span');
                name.className = 'p2p-attachment-name';
                name.textContent = file.name;

                const size = document.createElement('span');
                size.className = 'p2p-attachment-size';
                size.textContent = this.formatFileSize(file.size);

                info.appendChild(name);
                info.appendChild(size);

                const download = document.createElement('span');
                download.className = 'p2p-attachment-download';
                download.innerHTML = '&#8681;'; // Download arrow

                attachment.appendChild(icon);
                attachment.appendChild(info);
                attachment.appendChild(download);
                container.appendChild(attachment);
            }
        });

        return container;
    }

    /**
     * Open image in lightbox
     */
    openLightbox(imageUrl) {
        const lightbox = document.createElement('div');
        lightbox.className = 'p2p-lightbox';

        const img = document.createElement('img');
        img.src = imageUrl;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'p2p-lightbox-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            lightbox.remove();
        });

        lightbox.appendChild(img);
        lightbox.appendChild(closeBtn);

        // Close on background click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                lightbox.remove();
            }
        });

        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                lightbox.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(lightbox);
    }

    renderMembers() {
        if (!this.membersList) return;

        this.membersList.innerHTML = '';

        this.members.forEach(member => {
            const memberEl = this.createMemberElement(member);
            this.membersList.appendChild(memberEl);
        });

        // Update count
        const countEl = document.getElementById('members-count');
        if (countEl) {
            countEl.textContent = `${this.members.length} участников`;
        }
    }

    createMemberElement(member) {
        const item = document.createElement('div');
        item.className = 'p2p-group-member-item';

        const avatar = document.createElement('div');
        avatar.className = 'p2p-chat-avatar p2p-chat-avatar--small';

        // Use avatar_url if available, otherwise show initial
        if (member.avatar_url) {
            avatar.innerHTML = `<img src="${this.escapeHtml(member.avatar_url)}" alt="" class="p2p-avatar-img" />`;
        } else {
            avatar.textContent = (member.username || 'U').charAt(0).toUpperCase();
        }

        const info = document.createElement('div');
        info.className = 'p2p-group-member-info';

        const name = document.createElement('span');
        name.className = 'p2p-group-member-name';
        name.textContent = member.username;

        // Show role badge
        if (member.role === 'admin' || member.is_admin) {
            const adminBadge = document.createElement('span');
            adminBadge.className = 'p2p-group-admin-badge';
            adminBadge.textContent = 'Админ';
            name.appendChild(adminBadge);
        }

        // Show "You" indicator
        if (Number(member.user_id) === Number(this.currentUserId)) {
            const youBadge = document.createElement('span');
            youBadge.className = 'p2p-group-you-badge';
            youBadge.textContent = '(вы)';
            name.appendChild(youBadge);
        }

        info.appendChild(name);

        // Show join date if available
        if (member.joined_at) {
            const joinDate = document.createElement('span');
            joinDate.className = 'p2p-group-member-joined';
            joinDate.textContent = `с ${this.formatJoinDate(member.joined_at)}`;
            info.appendChild(joinDate);
        }

        item.appendChild(avatar);
        item.appendChild(info);

        // Remove button for admins (can't remove themselves)
        if (this.isAdmin && Number(member.user_id) !== Number(this.currentUserId)) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'p2p-group-member-remove-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Удалить из группы';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeMember(member.user_id);
            });
            item.appendChild(removeBtn);
        }

        return item;
    }

    /**
     * Format join date for display
     * @param {string} isoDate - ISO date string
     * @returns {string}
     */
    formatJoinDate(isoDate) {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    /**
     * Escape HTML special characters
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    groupMessagesByDate(messages) {
        const groups = [];
        let currentGroup = null;

        messages.forEach(msg => {
            const date = new Date(msg.created_at);
            const dateKey = date.toDateString();
            const dateLabel = this.formatDateLabel(date);

            if (!currentGroup || currentGroup.dateKey !== dateKey) {
                currentGroup = {
                    dateKey,
                    dateLabel,
                    messages: []
                };
                groups.push(currentGroup);
            }

            currentGroup.messages.push(msg);
        });

        return groups;
    }

    formatDateLabel(date) {
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Сегодня';
        if (diffDays === 1) return 'Вчера';
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    formatMessageTime(isoDate) {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    async loadMessages(loadMore = false) {
        if (this.isLoading || (!loadMore && this.messages.length > 0)) return;
        if (loadMore && !this.hasMore) return;

        this.isLoading = true;

        try {
            const options = { limit: 50 };
            if (loadMore && this.oldestMessageId) {
                options.before = this.oldestMessageId;
            }

            const response = await chatApi.getGroupMessages(this.groupId, options);
            const newMessages = response.data || [];

            if (newMessages.length < 50) {
                this.hasMore = false;
            }

            if (newMessages.length > 0) {
                this.oldestMessageId = newMessages[newMessages.length - 1].id;

                if (loadMore) {
                    this.messages = [...newMessages.reverse(), ...this.messages];
                } else {
                    this.messages = newMessages.reverse();
                }
            }

            this.renderMessages();
        } catch (error) {
            console.error('Failed to load group messages:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async loadMembers() {
        try {
            const response = await chatApi.getChatGroupMembers(this.groupId);
            this.members = response.data || [];
            this.renderMembers();
        } catch (error) {
            console.error('Failed to load group members:', error);
        }
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        const files = this.pendingFiles.length > 0 ? [...this.pendingFiles] : null;

        // Need either content or files
        if (!content && !files) return;

        try {
            // Optimistic update
            const tempMessage = {
                id: 'temp-' + Date.now(),
                content,
                sender_id: this.currentUserId,
                sender_username: 'Вы',
                created_at: new Date().toISOString(),
                files: files ? files.map(f => ({
                    name: f.name,
                    size: f.size,
                    url: URL.createObjectURL(f),
                    is_image: f.type.startsWith('image/')
                })) : null
            };
            this.messages.push(tempMessage);
            this.renderMessages();
            this.messageInput.value = '';
            this.pendingFiles = [];
            this.renderFilePreview();
            this.autoResizeInput();

            // Send to server
            const response = await chatApi.sendGroupMessage(this.groupId, content, files);
            const sentMessage = response.data;

            // Replace temp message with real one
            const tempIndex = this.messages.findIndex(m => m.id === tempMessage.id);
            if (tempIndex >= 0) {
                this.messages[tempIndex] = sentMessage;
                this.renderMessages();
            }

            dispatch('ChatMessageSent', {
                type: 'group',
                groupId: this.groupId,
                message: sentMessage
            });

        } catch (error) {
            console.error('Failed to send group message:', error);
            this.messages = this.messages.filter(m => !m.id.startsWith('temp-'));
            this.renderMessages();
            this.messageInput.value = content;
            // Restore files on error
            if (files) {
                this.pendingFiles = files;
                this.renderFilePreview();
            }
        }
    }

    async markAsRead() {
        try {
            await chatApi.markGroupAsRead(this.groupId);
            dispatch('ChatMessagesRead', {
                type: 'group',
                groupId: this.groupId
            });
        } catch (error) {
            console.error('Failed to mark group as read:', error);
        }
    }

    async removeMember(userId) {
        if (!confirm('Удалить участника из группы?')) return;

        try {
            await chatApi.removeChatGroupMember(this.groupId, userId);
            this.members = this.members.filter(m => m.user_id !== userId);
            this.renderMembers();
            dispatch('ChatGroupMemberRemoved', {
                groupId: this.groupId,
                userId
            });
        } catch (error) {
            console.error('Failed to remove member:', error);
        }
    }

    toggleMembersSidebar() {
        this.showMembersSidebar = !this.showMembersSidebar;
        if (this.membersSidebar) {
            this.membersSidebar.classList.toggle('open', this.showMembersSidebar);
        }
    }

    showGroupMenu(e) {
        e.stopPropagation();

        // Remove existing menu
        const existingMenu = document.querySelector('.p2p-group-admin-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'p2p-group-admin-menu';

        // Admin-only options
        if (this.isAdmin) {
            const renameBtn = document.createElement('button');
            renameBtn.textContent = 'Переименовать';
            renameBtn.addEventListener('click', () => {
                menu.remove();
                this.renameGroup();
            });

            const addMemberBtn = document.createElement('button');
            addMemberBtn.textContent = 'Добавить участника';
            addMemberBtn.addEventListener('click', () => {
                menu.remove();
                this.showAddMemberDialog();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'danger';
            deleteBtn.textContent = 'Удалить группу';
            deleteBtn.addEventListener('click', () => {
                menu.remove();
                this.deleteGroup();
            });

            menu.appendChild(renameBtn);
            menu.appendChild(addMemberBtn);
            menu.appendChild(deleteBtn);
        }

        // Leave group - available for all members
        const leaveBtn = document.createElement('button');
        leaveBtn.className = this.isAdmin ? '' : 'danger';
        leaveBtn.textContent = 'Покинуть группу';
        leaveBtn.addEventListener('click', () => {
            menu.remove();
            this.leaveGroup();
        });
        menu.appendChild(leaveBtn);

        // Position menu
        const rect = e.target.getBoundingClientRect();
        menu.style.position = 'absolute';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;

        document.body.appendChild(menu);

        // Close on outside click
        const closeHandler = (event) => {
            if (!menu.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    async renameGroup() {
        const newName = prompt('Новое название группы:', this.groupName);
        if (newName && newName.trim() && newName !== this.groupName) {
            try {
                await chatApi.updateChatGroup(this.groupId, { name: newName.trim() });
                this.groupName = newName.trim();
                // Update title
                const titleEl = this.titleBar?.querySelector('.popup-title__text');
                if (titleEl) titleEl.textContent = this.groupName;
                const nameEl = this.contentArea.querySelector('.p2p-group-name');
                if (nameEl) nameEl.textContent = this.groupName;
                dispatch('ChatGroupRenamed', {
                    groupId: this.groupId,
                    name: this.groupName
                });
            } catch (error) {
                console.error('Failed to rename group:', error);
            }
        }
    }

    showAddMemberDialog() {
        const username = prompt('Введите имя пользователя для добавления:');
        if (username && username.trim()) {
            this.addMemberByUsername(username.trim());
        }
    }

    async addMemberByUsername(username) {
        try {
            // First search for user
            const searchRes = await chatApi.searchUsers(username);
            const users = searchRes.data || [];
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

            if (!user) {
                alert('Пользователь не найден');
                return;
            }

            await chatApi.addChatGroupMember(this.groupId, user.id);
            await this.loadMembers();
            dispatch('ChatGroupMemberAdded', {
                groupId: this.groupId,
                userId: user.id,
                username: user.username
            });
        } catch (error) {
            console.error('Failed to add member:', error);
            alert('Не удалось добавить участника');
        }
    }

    async deleteGroup() {
        if (!confirm('Вы уверены, что хотите удалить группу? Это действие необратимо.')) return;

        try {
            await chatApi.deleteChatGroup(this.groupId);
            dispatch('ChatGroupDeleted', { groupId: this.groupId });
            this.goBack();
        } catch (error) {
            console.error('Failed to delete group:', error);
            alert('Не удалось удалить группу');
        }
    }

    /**
     * Leave the group chat
     */
    async leaveGroup() {
        if (!confirm('Вы уверены, что хотите покинуть группу?')) return;

        try {
            const response = await chatApi.leaveChatGroup(this.groupId);
            const result = response.data;

            if (result.group_deleted) {
                dispatch('ChatGroupDeleted', { groupId: this.groupId });
            } else {
                dispatch('ChatGroupMemberRemoved', {
                    groupId: this.groupId,
                    userId: this.currentUserId
                });
            }

            this.goBack();
        } catch (error) {
            console.error('Failed to leave group:', error);
            alert('Не удалось покинуть группу');
        }
    }

    handleScroll() {
        if (this.messagesContainer.scrollTop < 100 && this.hasMore && !this.isLoading) {
            this.loadMessages(true);
        }
    }

    handleInputChange() {
        this.autoResizeInput();
        this.handleTyping();
    }

    autoResizeInput() {
        const input = this.messageInput;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    handleTyping() {
        dispatch('ChatTyping', {
            type: 'group',
            groupId: this.groupId,
            isTyping: true
        });

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        this.typingTimeout = setTimeout(() => {
            dispatch('ChatTyping', {
                type: 'group',
                groupId: this.groupId,
                isTyping: false
            });
        }, 2000);
    }

    handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    scrollToBottom() {
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    goBack() {
        this.close();
        import('./chatPanel.js').then(({ openChatPanel }) => {
            openChatPanel();
        });
    }

    bindChatEvents() {
        // Listen for new group messages
        this.newMessageHandler = (e) => {
            const { type, data } = e.detail || {};
            // Используем нестрогое сравнение для совместимости типов (string/number)
            // eslint-disable-next-line eqeqeq
            if (type === 'group_message' && data?.group_id == this.groupId) {
                this.handleIncomingMessage(data.message);
            // eslint-disable-next-line eqeqeq
            } else if (type === 'group_update' && data?.group_id == this.groupId) {
                this.handleGroupUpdate(data);
            }
        };
        window.addEventListener('ChatEvent', this.newMessageHandler);

        // Listen for typing indicator
        this.typingHandler = (e) => {
            const { groupId, userId, username, isTyping } = e.detail || {};
            // eslint-disable-next-line eqeqeq
            if (groupId == this.groupId && userId != this.currentUserId) {
                this.updateTypingIndicator(userId, username, isTyping);
            }
        };
        window.addEventListener('GroupTypingIndicator', this.typingHandler);
    }

    handleIncomingMessage(message) {
        this.messages.push(message);
        this.renderMessages();
        this.markAsRead();
    }

    handleGroupUpdate(data) {
        switch (data.action) {
            case 'member_added':
            case 'member_removed':
                this.loadMembers();
                break;
            case 'group_renamed':
                this.groupName = data.name;
                const titleEl = this.titleBar?.querySelector('.popup-title__text');
                if (titleEl) titleEl.textContent = this.groupName;
                break;
        }
    }

    updateTypingIndicator(userId, username, isTyping) {
        if (isTyping) {
            this.typingUsers.add(username || `User ${userId}`);
        } else {
            this.typingUsers.delete(username || `User ${userId}`);
        }

        if (this.typingIndicator) {
            if (this.typingUsers.size > 0) {
                const names = Array.from(this.typingUsers).slice(0, 3);
                let text = names.join(', ');
                if (this.typingUsers.size > 3) {
                    text += ` и ещё ${this.typingUsers.size - 3}`;
                }
                this.typingIndicator.textContent = `${text} печата${this.typingUsers.size > 1 ? 'ют' : 'ет'}...`;
                this.typingIndicator.style.display = 'block';
            } else {
                this.typingIndicator.style.display = 'none';
            }
        }
    }

    close() {
        // Stop typing indicator
        dispatch('ChatTyping', {
            type: 'group',
            groupId: this.groupId,
            isTyping: false
        });

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        if (this.newMessageHandler) {
            window.removeEventListener('ChatEvent', this.newMessageHandler);
        }
        if (this.typingHandler) {
            window.removeEventListener('GroupTypingIndicator', this.typingHandler);
        }

        super.close();
    }

    // Override buttons
    createButtons() {
        // No default buttons for group chat view
    }
}
