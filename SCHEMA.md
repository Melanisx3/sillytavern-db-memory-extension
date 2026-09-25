# Database Schema — SillyTavern DB Memory Extension


```mermaid
erDiagram
    users ||--o{ chats : "владеет (1:N, CASCADE)"
    users ||--o{ messages : "_denorm (1:N, CASCADE)"
    users ||--o{ memories : "владеет (1:N, CASCADE)"
    chats ||--o{ messages : "содержит (1:N, CASCADE)"
    chats |o--o{ memories : "источник (0..1:N, SET NULL)"
    messages |o--o{ memories : "извлечена из (0..1:N, SET NULL)"

    users {
        uuid id PK "gen_random_uuid()"
        text username UK "NOT NULL, UNIQUE"
        text password_hash "NOT NULL"
        timestamptz created_at "DEFAULT now()"
    }
    chats {
        uuid id PK
        uuid user_id FK "-> users(id) ON DELETE CASCADE, NOT NULL"
        text title "DEFAULT 'New Chat'"
        timestamptz created_at
        timestamptz updated_at
    }
    messages {
        uuid id PK
        uuid chat_id FK "-> chats(id) ON DELETE CASCADE, NOT NULL"
        uuid user_id FK "-> users(id) ON DELETE CASCADE, NOT NULL"
        text role "CHECK IN (user, assistant, system)"
        text content "NOT NULL"
        timestamptz created_at
    }
    memories {
        uuid id PK
        uuid user_id FK "-> users(id) ON DELETE CASCADE, NOT NULL"
        uuid chat_id FK "-> chats(id) ON DELETE SET NULL, NULL"
        text content "NOT NULL"
        vector embedding "vector(384), HNSW cosine"
        jsonb metadata "DEFAULT '{}'"
        text character_id "NULL"
        text type "DEFAULT 'fact', CHECK 7 значений"
        real importance "0..1, DEFAULT 0.5"
        real confidence "0..1, DEFAULT 0.5"
        uuid source_message_id FK "-> messages(id) ON DELETE SET NULL, NULL"
        timestamptz created_at
        timestamptz updated_at
    }
```

## Таблицы и ключи

| Таблица | PK | FK | Уникальность / CHECK |
|---|---|---|---|
| `users` | `id UUID` | — | `username UNIQUE NOT NULL` |
| `chats` | `id UUID` | `user_id → users(id)` CASCADE, NOT NULL | — |
| `messages` | `id UUID` | `chat_id → chats(id)` CASCADE; `user_id → users(id)` CASCADE | `role IN ('user','assistant','system')` |
| `memories` | `id UUID` | `user_id → users(id)` CASCADE; `chat_id → chats(id)` SET NULL; `source_message_id → messages(id)` SET NULL | `type IN (fact, preference, event, relationship, character_state, world_information, important_event)`; `importance 0..1`; `confidence 0..1` |

## Типы связей

| Связь | Кардинальность | ON DELETE | Комментарий |
|---|---|---|---|
| users → chats | 1 : N | CASCADE | удалил пользователя — удалились все чаты |
| users → messages | 1 : N | CASCADE | денормализация `user_id` для быстрой проверки изоляции данных |
| chats → messages | 1 : N | CASCADE | сообщения живут внутри чата |
| users → memories | 1 : N | CASCADE | память принадлежит пользователю |
| chats → memories | 0..1 : N | SET NULL | память может быть глобальной (не привязана к чату); чат удалили — память осталась |
| messages → memories | 0..1 : N | SET NULL | `source_message_id` — из какого сообщения извлечён факт; сообщение удалили — память осталась |

## Индексы

- B-Tree: `users(username)`, `chats(user_id)`, `messages(chat_id)`, `messages(user_id)`,
  `memories(user_id)`, `memories(chat_id)`, `memories(character_id)`, `memories(type)`,
  `memories(importance DESC)`, `memories(source_message_id)`
- Векторный: `memories_embedding_hnsw_idx` — **HNSW** на `embedding vector_cosine_ops`
  (семантический поиск по косинусному расстоянию, размерность = 384, должна совпадать с
  `EMBEDDING_DIMENSIONS` бэкенда)
