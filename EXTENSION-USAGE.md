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

## 🔧 Требования к установке

### На ПК (backend сервер):

**Проверить Docker запущен:**
```bash
docker ps --format "{{.Names}}: {{.Status}}"
```

**Должен быть статус Up:**
```
sillytavern-memory-backend: Up 6 minutes
sillytavern-memory-db: Up 6 minutes (healthy)
```

**Проверить здоровье API:**
```bash
curl http://localhost:3000/health
```

**Ответ должен быть:**
```json
{
  "status": "ok",
  "postgres": true,
  "pgvector": true,
  "pgvectorVersion": "0.8.6",
  "embeddingProvider": "local-hash-ngram-v1",
  "embeddingDimensions": 384
}
```

### Найти IP адреса сети:

**Windows PowerShell:**
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.AddressState -eq 'Preferred' } | Select-Object IPAddress, InterfaceAlias | Format-Table
```

**Искать адаптер с активной сетью (НЕ WSL/Hyper-V):**
- Пример: `10.134.209.9` или `192.168.x.x`

**Избегать виртуальных адаптеров:**
- ❌ 172.22.208.1 (WSL/Docker bridge)
- ❌ 172.27.112.1 (Hyper-V)

### Файрвол правила:

**Если не работает подключение с телефона, проверить:**
```powershell
netsh advfirewall firewall show rule name="SillyTavern Backend 3000"
```

**Создать правило если нет:**
```powershell
New-NetFirewallRule -DisplayName "SillyTavern Backend 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
```

## 📱 Установка на телефон

### Шаг 1: Удалить старую версию расширения

В SillyTavern:
1. Extensions → Manage Extensions
2. Найти "DB Memory Extension"
3. Delete

### Шаг 2: Очистить данные браузера

**Chrome Mobile:**
- Настройки → Конфиденциальность и безопасность → Очистить данные сайтов
- Выбрать SillyTavern сайт
- Clear all data

**Safari iOS:**
- Настройки Safari → Очистить историю и данные веб-сайтов
- Все история

### Шаг 3: Установить новую версию

**В SillyTavern:**
1. Extensions → Install Extension
2. URL: `https://github.com/Melanisx3/sillytavern-db-memory-extension`
3. Нажать Install

### Шаг 4: Перезагрузить SillyTavern

Нажать F5 или перезагрузить вкладку полностью.

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

**Если ошибка:**
- Проверь что ты вводишь правильный IP
- Убедись что телефон и ПК в одной Wi-Fi сети
- Проверь что Docker backend запущен

### Нажатие кнопки "Connect"

**Ожидается:**
```
Connected successfully!
```

Статус станет зеленым вместо красного.

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

### No Direct Database Access

Extension только через API, напрямую в PostgreSQL не подключается.

### JWT Authentication

Все запросы к backend аутентифицируются через JWT токены.

### Graceful Degradation

Если backend недоступен:
- SillyTavern продолжает работать обычным образом
- Нет ошибок, просто функция памяти отключена
- Никаких blocking операций на UI

## 🧪 End-to-End Тест

### Провести полный тест:

**Шаг 1: Войти в систему**
1. Открыть настройки расширения
2. Ввести URL, username, password
3. Нажать Test → ✅ OK
4. Нажать Connect → ✅ Connected

**Шаг 2: Первое сообщение**
1. Открой любой чат с персонажем
2. Напиши: `"Привет, меня зовут Алекс, я люблю читать научную фантастику"`
3. Подожди отправки сообщения
4. Нажати Process Last Message

**Шаг 3: Проверить извлечение памяти**
1. Должно появиться: `Message processed: 2 candidates, 1 created`
2. Это значит создано новое воспоминание о тебе

**Шаг 4: Сгенерировать ответ**
1. Отправь любое сообщение
2. Дождись ответа персонажа

**Шаг 5: Построить контекст**
1. Нажми Build Context в настройках
2. Должно показать сколько memories найдено
3. Если найдено твое воспоминание → ✓ работа

**Шаг 6: Проверить сохранение ответа**
1. Отправь новое сообщение
2. Нажати Process Last Message снова
3. Должна обновиться статистика

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

## 📊 API Reference

### Backend Endpoints

#### `/health`
**GET** - Проверка здоровья системы

**Response:**
```json
{
  "status": "ok",
  "postgres": true,
  "pgvector": true,
  "pgvectorVersion": "0.8.6"
}
```

#### `/api/auth/login`
**POST** - Аутентификация

**Request:**
```json
{
  "username": "test_user",
  "password": "testpass123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### `/api/messages`
**POST** - Сохранить сообщение

**Request:**
```json
{
  "chatId": "uuid-chat-id",
  "role": "user",
  "content": "Привет мир"
}
```

#### `/api/memories/process`
**POST** - Обработать сообщение для извлечения памяти

**Request:**
```json
{
  "content": "Привет, я люблю котиков",
  "role": "user",
  "chatId": "uuid-chat-id",
  "characterId": "optional-character-id",
  "sourceMessageId": "optional-message-id"
}
```

**Response:**
```json
{
  "candidates": [/* ... */],
  "created": [/* memories created */],
  "updated": [/* memories updated */]
}
```

#### `/api/memories`
**GET** - Список воспоминаний

**Query params:**
- `chatId?` - фильтр по чату
- `characterId?` - фильтр по персонажу
- `type?` - тип памяти (preference, fact, relationship)
- `limit?` - лимит записей
- `offset?` - смещение

#### `/api/context`
**POST** - Построить контекст из памяти

**Request:**
```json
{
  "query": "Последнее сообщение пользователя",
  "chatId": "uuid-chat-id",
  "characterId": "optional-character-id",
  "memoryLimit": 5,
  "messageLimit": 10,
  "similarityThreshold": 0.7
}
```

**Response:**
```json
{
  "query": "...",
  "chatId": "uuid",
  "characterId": null,
  "entries": [
    {
      "id": "mem-uuid",
      "content": "Пользователь любит кошек",
      "type": "preference",
      "score": 0.85,
      "importance": 0.9
    }
  ],
  "recentMessages": [...],
  "contextText": "User likes cats.\nRecent messages: ..."
}
```

#### DELETE `/api/memories/:id`
**DELETE** - Удалить воспоминание

## 📈 Performance Optimizations

### База данных

**Индексы уже созданы:**
- GIN index на векторах (pgvector)
- Composite index на (userId, chatId, characterId)
- Index на importance

### Кэширование

- JWT токен кэшируется в localStorage
- Настройки кэшируются автоматически
- Connection state persists между перезагрузками

### Асинхронность

- Все операции async/non-blocking
- UI не блокируется при работе с базой
- Processing queue для очереди сообщений

### Graceful degradation

- Если backend недоступен → ничего не ломается
- Просто память отключена
- SillyTavern работает штатно

## 🔄 Обновление

### Как обновить:

1. Удалить старое расширение
2. Установить новую версию по тому же URL
3. Настройки сохраняются автоматически (localStorage)

### Версии:

- **v1.0.x** - Базовая функциональность
- **v2.0.0** - Полная интеграция с flow System

---

**GitHub:** https://github.com/Melanisx3/sillytavern-db-memory-extension  
**Автор:** Melanisx3  
**Лицензия:** MIT