# DB Memory Extension for SillyTavern - Full Integration v2.0

## 🎯 Цель

Полноценная система long-term memory для SillyTavern chat с интеграцией всех компонентов:
- SillyTavern Extension
- Backend API (Express + TypeScript)
- PostgreSQL + pgvector
- Memory Engine

## 📋 FLOW Системы

### Flow 1: Пользовательское сообщение → Память

```
User message
    ↓
SillyTavern UI (message sent)
    ↓
Extension (автоматически)
    ↓
Backend /api/messages
    ↓
Save message to PostgreSQL
    ↓
Backend /api/memories/process
    ↓
Memory Engine (LLM extraction)
    ↓
Create embeddings (pgvector)
    ↓
Store in memories table with vector
```

### Flow 2: Перед генерацией → Контекст из памяти

```
Перед генерацией ответа
    ↓
Extension перехватывает запрос
    ↓
Backend /api/context POST
    ↓
Создать embedding текущего query
    ↓
pgvector search (cosine similarity)
    ↓
Apply filters:
  - userId isolation
  - chatId filter (если задан)
  - characterId filter (если задан)
  - similarityThreshold ≥ configured
  - minImportance ≥ configured
    ↓
Ranking по важности и релевантности
    ↓
Return top-N memories
    ↓
Extension добавляет в context SillyTavern
    ↓
LLM генерирует ответ с учётом памяти
```

### Flow 3: Ответ персонажа → Извлечение памяти

```
Character response generated
    ↓
Extension детектирует новый ответ
    ↓
Backend /api/memories/process
    ↓
Memory Engine анализирует response
    ↓
Extract key facts, preferences, relationships
    ↓
Create new memories or update existing
    ↓
Generate embeddings
    ↓
Store in PostgreSQL
```

```

## ⚙️ Настройка расширения

### Открыть настройки расширения

1. Extensions → DB Memory Extension
2. Откроется панель с настройками

### Ввести параметры подключения

| Поле | Значение | Описание |
|------|----------|----------|
| **Backend URL** | `http://10.134.209.9:3000` | IP твоего ПК в локальной сети + порт 3000 |
| **Username** | `test_user` | Логин пользователя |
| **Password** | `testpass123` | Пароль пользователя |

### Нажатие кнопки "Test"

**Ожидается успех:**
```
✅ Backend is healthy
```

## 🔧 Настройки авто-синхронизации

### Auto-sync messages to database

**Включить:** Сообщения автоматически сохраняются в PostgreSQL после отправки.

### Auto-extract memories from messages

**Включить:** После каждого сообщения запускается LLM для извлечения ключевых фактов в память.

### Messages per sync

**По умолчанию:** `10`
- Максимум сообщений, которые загружаются перед генерацией
- Диапазон: 1-50

### Memories per context

**По умолчанию:** `5`
- Сколько релевантных воспоминаний добавляется в контекст генерации
- Диапазон: 1-20

## 🎛️ Настройки контекста

### Similarity threshold

**По умолчанию:** `0.7` (70%)
- Минимальная релевантность для включения воспоминания
- Диапазон: 0-1 (0% - 100%)
- Чем выше, тем более релевантные памяти будут использоваться
- Чем ниже, тем больше памяти включится (в том числе менее релевантных)

### Show relevance scores

**Включить:** Показывать процент релевантности каждого воспоминания в UI.

## 🛠️ Ручные операции

### Build Context

**Для чего:** Проверить работу поиска по памяти вручную.

**Что делает:**
1. Берет последнее сообщение из чата
2. Создает embedding
3. Ищет релевантные воспоминания через pgvector
4. Возвращает top-N memories

**Результат:** В консоли будет показано сколько memories найдено.

### Process Last Message

**Для чего:** Принудительно обработать последнее сообщение для извлечения памяти.

**Что делает:**
1. Берет последнее сообщение из чата
2. Отправляет в Memory Engine
3. LLM извлекает факты
4. Сохраняет в PostgreSQL

## 🐛 Отладка

### Debug mode

**Включить:** Включает детальное логирование в консоли браузера.

### Что видно в консоли:

```
[DB Memory] Extension initializing...
[DB Memory] Connected successfully!
[DB Memory] Saved message to backend: { content: "...", role: "user" }
[DB Memory] Process result: { candidates: [...], created: [...] }
[DB Memory] Context built: 3 memories found
```

### Проверка ошибок:

Если видите ошибки типа:
```
Failed to fetch: network error
```

Значит:
- Неверный IP адрес
- Телефон не видит ПК (другая сеть)
- Firewall блокирует порт 3000

Если видите:
```
HTTP 401: Unauthorized
```

Значит:
- Неверные учетные данные
- Нужно переподключиться

## 🔒 Требования к безопасности

### User Isolation ✅

Каждая память привязывается к `user_id`. Разные пользователи не видят память друг друга.

### Chat Isolation ✅

Память может быть ограничена конкретным чатом (`chatId`).

### Character Isolation ✅

Память может быть ограничена конкретным персонажем (`characterId`).

### Успешный результат:

```
✅ Connected to backend
✅ Message saved to database
✅ Memory extracted from user message
✅ Relevant memories found via pgvector
✅ Character response processed
✅ New memories created from response
✅ Context includes relevant memories
```

## 🚨 Частые проблемы

### Проблема: "Directory already exists"

**Причина:** Старая версия расширения осталась в папке.

**Решение:** 
1. Extensions → Manage Extensions → Delete
2. Закрой браузер полностью
3. Очисти кеш (Ctrl+Shift+R)
4. Установи заново

### Проблема: "Not connected" даже при правильном пароле

**Причины:**
- Неверный IP (проверь через `ipconfig`)
- Телефон в другой сети (подключи к тому же Wi-Fi)
- Файрвол блокирует (создай правило как выше)

**Решение:**
1. Перезапусти Docker: `docker restart sillytavern-memory-backend`
2. Пересоздай правило файрвола
3. Проверь с другого устройства телефона

### Проблема: "No relevant memories found"

**Причины:**
- Мало памяти в базе (нужно отправить больше сообщений)
- Threshold слишком высокий (поставь 0.5)
- Типы памяти не совпадают

**Решение:**
1. Отправь 10-20 сообщений разным темам
2. Уменьши threshold до 0.5-0.6
3. Повтори Build Context

### Проблема: Расширение не отображается в настройках

**Причина:** Кэш браузера не обновился.

**Решение:**
1. Hard reload: Ctrl+Shift+R
2. Очисти localStorage в DevTools:
   ```javascript
   localStorage.clear()
   location.reload()
   ```
3. Переустанови расширение
- **v2.0.0** - Полная интеграция с flow System

---

**GitHub:** https://github.com/Melanisx3/sillytavern-db-memory-extension  
**Автор:** Melanisx3  
**Лицензия:** MIT
