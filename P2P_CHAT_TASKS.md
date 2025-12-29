# Задачи для omnimap-front: P2P и групповые чаты UI

## Описание

Реализовать UI для личных и групповых сообщений в OmniMap.

**Ключевые особенности:**
- Писать можно только пользователям с общими блоками
- Групповые чаты создаются в окне выдачи прав на блок

## UI Компоненты

### 1. Кнопка чата в sidebar

Добавить в sidebar новую кнопку "Чаты" (💬), которая открывает панель чатов.

```
sidebar.js → добавить кнопку
├── onClick → открыть ChatPanel popup
└── badge с количеством непрочитанных
```

### 2. ChatPanel (popup)

Главное окно чатов с двумя табами:

```
┌─────────────────────────────────────┐
│ Чаты                            ✕ │
├─────────────────────────────────────┤
│ [Личные] [Группы]                   │
├─────────────────────────────────────┤
│ 🔍 Поиск...                         │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ 👤 John Doe              14:30  │ │
│ │    Последнее сообщение...    🔴│ │
│ ├─────────────────────────────────┤ │
│ │ 👤 Jane Smith            вчера  │ │
│ │    Ок, договорились           │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 3. ConversationView (внутри ChatPanel)

Открывается при клике на диалог:

```
┌─────────────────────────────────────┐
│ ← John Doe                  online  │
├─────────────────────────────────────┤
│                                     │
│     ┌────────────────────┐          │
│     │ Привет!        14:25│         │
│     └────────────────────┘          │
│                                     │
│ ┌────────────────────┐              │
│ │ Привет! Как дела?  │              │
│ │              14:26 ✓✓│            │
│ └────────────────────┘              │
│                                     │
│         John печатает...            │
├─────────────────────────────────────┤
│ │ Написать сообщение...   │ [➤]    │
└─────────────────────────────────────┘
```

### 4. GroupChatView

Аналогично ConversationView, но с:
- Списком участников (по клику)
- Именем отправителя над каждым сообщением

### 5. Интеграция с окном прав на блок (PermissionsPopup)

Добавить секцию "Групповой чат" внизу:

```
┌─────────────────────────────────────┐
│ Права на блок "Project Alpha"       │
├─────────────────────────────────────┤
│ Пользователи:                       │
│ ☑ john@example.com (write)          │
│ ☑ jane@example.com (read)           │
│ [+ Добавить]                        │
├─────────────────────────────────────┤
│ Групповой чат                       │
│ ┌─────────────────────────────────┐ │
│ │ 💬 Создать чат для этого блока  │ │
│ │    (автоматически добавит всех  │ │
│ │    пользователей с правами)     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ☐ Автоматически добавлять новых    │
│   пользователей в чат               │
└─────────────────────────────────────┘
```

После создания чата:

```
│ Групповой чат                       │
│ ┌─────────────────────────────────┐ │
│ │ 💬 "Project Alpha Chat"         │ │
│ │    3 участника • Открыть →      │ │
│ └─────────────────────────────────┘ │
```

## Файловая структура

```
src/js/
├── controller/
│   ├── popups/
│   │   ├── chatPanel.js         # Главное окно чатов
│   │   ├── conversationView.js  # Личный диалог
│   │   ├── groupChatView.js     # Групповой чат
│   │   └── permissionsPopup.js  # Добавить секцию чата
│   └── chatManager.js           # Управление чатами
├── api/
│   └── chatApi.js               # API для чатов
└── sincManager/
    └── chatSync.js              # WebSocket для чатов
```

## API интеграция

### chatApi.js

```javascript
// Личные сообщения
export async function getContacts() { ... }
export async function getConversations() { ... }
export async function getMessages(userId, page) { ... }
export async function sendMessage(userId, content) { ... }
export async function markAsRead(userId) { ... }

// Групповые чаты
export async function getGroups() { ... }
export async function createGroup(name, blockId) { ... }
export async function getGroupMessages(groupId, page) { ... }
export async function sendGroupMessage(groupId, content) { ... }
export async function getGroupMembers(groupId) { ... }

// Unread count
export async function getUnreadCount() { ... }
```

### chatSync.js (WebSocket)

```javascript
class ChatSync {
    constructor(sincManager) {
        this.sincManager = sincManager;
    }

    // Подписаться на чаты
    subscribe() {
        this.sincManager.send({ type: 'chat_subscribe' });
    }

    // Отправить typing indicator
    sendTyping(recipientId, isTyping) {
        this.sincManager.send({
            type: 'dm_typing',
            recipient_id: recipientId,
            is_typing: isTyping
        });
    }

    // Обработчики входящих сообщений
    handleMessage(data) {
        switch (data.type) {
            case 'dm':
                dispatch('NewDirectMessage', data.message);
                break;
            case 'group_message':
                dispatch('NewGroupMessage', { groupId: data.group_id, message: data.message });
                break;
            case 'dm_typing':
                dispatch('TypingIndicator', { userId: data.user_id, isTyping: data.is_typing });
                break;
            // ...
        }
    }
}
```

## События (dispatch)

```javascript
// Новое личное сообщение
dispatch('NewDirectMessage', { id, senderId, content, createdAt });

// Новое групповое сообщение
dispatch('NewGroupMessage', { groupId, message });

// Typing indicator
dispatch('TypingIndicator', { userId, isTyping });

// Обновление unread count
dispatch('UnreadCountUpdated', { dm: 5, groups: 3 });

// Открыть чат с пользователем
dispatch('OpenDirectChat', { userId });

// Открыть групповой чат
dispatch('OpenGroupChat', { groupId });
```

## Стили

Добавить в `src/style/`:
- `chat-panel.css` - стили для ChatPanel
- Или расширить существующий `chat.css` (который уже используется для LLM chat)

## Задачи

### Фаза 1 — Базовый UI
- [ ] Создать `chatApi.js` с API вызовами
- [ ] Создать `ChatPanel` popup с табами
- [ ] Список диалогов (conversations list)
- [ ] Базовый `ConversationView`
- [ ] Кнопка в sidebar с badge

### Фаза 2 — Групповые чаты
- [ ] `GroupChatView`
- [ ] Интеграция с `PermissionsPopup`
- [ ] Создание группы из окна прав

### Фаза 3 — Real-time
- [ ] Интеграция с WebSocket (`chatSync.js`)
- [ ] Typing indicators
- [ ] Real-time обновление списка
- [ ] Уведомления о новых сообщениях

### Фаза 4 — Улучшения
- [ ] Поиск по сообщениям
- [ ] Emoji picker
- [ ] Вложения (файлы, изображения)
- [ ] Цитирование сообщений

## Зависимости

Требуется реализация API в omnimap-back:
- `GET /api/v1/chat/dm/contacts/`
- `GET /api/v1/chat/dm/conversations/`
- `GET/POST /api/v1/chat/dm/{user_id}/messages/`
- `GET /api/v1/chat/groups/`
- `POST /api/v1/chat/groups/`
- И т.д. (см. P2P_CHAT_TASKS.md в omnimap-back)

Требуется WebSocket поддержка в omnimap-sync:
- Message types: `dm`, `group_message`, `dm_typing`, `group_typing`
- (см. P2P_CHAT_TASKS.md в omnimap-sync)
