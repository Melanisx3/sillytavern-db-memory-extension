# DB Memory Extension for SillyTavern v2.0

## 🎯 Полноценная система long-term memory

Интеграция всех компонентов:
- **SillyTavern Extension** - клиентская часть
- **Backend API** - Express + TypeScript  
- **PostgreSQL + pgvector** - хранилище с векторным поиском
- **Memory Engine** - извлечение памяти через LLM

## ✨ Возможности (v2.0)

### Функциональность

- ✅ Автоматическое сохранение сообщений в PostgreSQL
- ✅ Извлечение памяти из пользовательских сообщений и ответов персонажа
- ✅ Semantic search через pgvector для релевантных воспоминаний
- ✅ Контекст с памятью перед генерацией ответа
- ✅ User/Chat/Character isolation (изоляция данных)
- ✅ Duplicate prevention (удаление дубликатов)
- ✅ Graceful degradation (работает без backend)
- ✅ Настройка similarity threshold, важности, лимитов

### Архитектура Flow

```
User message → Save to DB → Extract Memories → Embeddings → Store in pgvector

[Before Generation] Query → Create Embedding → pgvector Search → 
Return Top-N Memories → Add to Context → Generate Response

Character response → Extract from Response → Create Memories → Embed → Store
```

## 🚀 Быстрый старт

### 1. Запуск Backend на ПК

```bash
cd C:/prog/curse3
docker compose --profile backend up -d
```

**Проверить работу:**
```bash
curl http://localhost:3000/health
```

Должен вернуться: `{"status":"ok","postgres":true,"pgvector":true,...}`

### 2. Найти IP адреса сети

**Windows PowerShell:**
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Select-Object IPAddress, InterfaceAlias
```

**Искать активные (НЕ WSL/Hyper-V):**
- ✅ `10.134.209.9` или `192.168.x.x`
- ❌ Избегать: `172.22.208.1`, `172.27.112.1`

### 3. Установить расширение

В SillyTavern на телефоне:
1. **Extensions → Install Extension**
2. URL: `https://github.com/Melanisx3/sillytavern-db-memory-extension`
3. Нажать **Install**

### 4. Настроить подключение

1. Откройте **Extensions → DB Memory Extension**
2. Введите:
   - **Backend URL:** `http://10.134.209.9:3000` (ваш IP)
   - **Username:** `test_user`
   - **Password:** `testpass123`
3. Нажмите **Test** → должно быть ✅ OK
4. Нажмите **Connect** → статус "Connected"

## 📋 Документация

- **[EXTENSION-USAGE.md](./EXTENSION-USAGE.md)** — полная инструкция по использованию, troubleshooting, API reference
- **[e2e-tests.js](./e2e-tests.js)** — скрипт для end-to-end тестирования
- **[README.md](./README.md)** — базовая информация

## 🔧 Требования

- Docker запущен с PostgreSQL 16+ + pgvector extension
- Файрвол открыт на порту 3000 (создать правило если нужно)
- Телефон и ПК в одной локальной Wi-Fi сети
- SillyTavern версия с поддержкой расширений (extensions_settings)

## 🛠️ Настройки расширения

### Auto-Sync
- **Auto-sync messages** — автоматически сохранять сообщения в базу
- **Auto-extract memories** — извлекать ключевые факты после каждого сообщения

### Параметры синхронизации
- **Messages per sync:** 10 (batch size)
- **Memories per context:** 5 (сколько memories добавлять в контекст)

### Поиск и ранжирование
- **Similarity threshold:** 0.7 (минимальная релевантность 0-1)
- **Show relevance scores** — показывать процент релевантности

## 🧪 End-to-End тестирование

После подключения к backend:

1. **Отправьте сообщение:** "Мой любимый цвет - синий, я люблю читать научную фантастику"
2. **Нажмите** Process Last Message
3. Проверьте консоль — должно показать сколько memories created
4. **Отправьте новое сообщение** от персонажа
5. **Нажмите** Build Context
6. Проверьте console — должно найти ваши memories

### Тест через e2e-tests.js

Скопируйте содержимое `e2e-tests.js` в консоль браузера после подключения. Появится кнопка **"Run End-to-End Tests"** в настройках расширения.

## 🐛 Решение проблем

### "Не подключается к backend"

**Причины:**
- Неверный IP адрес (проверьте через `ipconfig`)
- Телефон в другой сети (подключите к тому же Wi-Fi)
- Firewall блокирует порт 3000

**Решение:**
```powershell
# Создать правило файрвола
New-NetFirewallRule -DisplayName "SillyTavern Backend 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any
```

### "Расширение не отображается в настройках"

**Причина:** Кэш браузера не обновился

**Решение:**
1. Hard reload: `Ctrl+Shift+R`
2. Очистите localStorage:
   ```javascript
   localStorage.clear()
   location.reload()
   ```
3. Переустановите расширение

### "Нет релевантных воспоминаний"

**Причины:**
- Мало сообщений в базе (нужно отправить больше)
- Threshold слишком высокий (поставьте 0.5-0.6)
- Типы памяти не совпадают с query

**Решение:**
1. Отправьте 10-20 сообщений разными темами
2. Уменьшите threshold в настройках до 0.5
3. Подождите 1-2 минуты после сообщений (извлечение асинхронное)

### "Extension hangs fullscreen on phone"

**Решение:** Обновилась версия 2.0.0 с исправлением inline-drawer
1. Удалите старую версию: Extensions → Manage Extensions → Delete
2. Переустановите с GitHub URL
3. Перезагрузите SillyTavern (F5)

## 🔄 Обновление

```bash
git pull origin main
docker compose --profile backend down && docker compose --profile backend up -d
```

На телефоне: удалить старое расширение → установить заново по тому же URL.

## 📊 Структура проекта

```
sillytavern-db-memory-extension/
├── integrated-index.js      # Основная логика v2.0 (24KB)
├── manifest.json            # Метаданные (v2.0.0)
├── assets/
│   ├── templates/          # HTML шаблоны
│   └── styles/             # CSS (minimal, no conflicts)
├── e2e-tests.js            # End-to-end тесты
├── EXTENSION-USAGE.md      # Полная инструкция (17KB)
├── README.md               # Эта страница
└── LICENSE                 # MIT License
```

## 🔒 Безопасность и изоляция

### ✅ Реализовано

- **User Isolation** — каждая память привязана к user_id
- **Chat Isolation** — фильтры по chatId при запросе
- **Character Isolation** — фильтры по characterId
- **JWT Authentication** — все запросы аутентифицируются
- **No Direct DB Access** — только через API endpoints
- **Graceful Degradation** — работает без backend

### ⚠️ Нет plaintext паролей

- Пароли хранятся в localStorage encrypted
- JWT токены expire через 24 часа
- Automatic re-authentication при истечении срока

## 🏥 API Reference

### Backend Endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/health` | GET | Проверка здоровья системы |
| `/api/auth/login` | POST | Аутентификация (возвращает JWT) |
| `/api/messages` | POST | Сохранить сообщение |
| `/api/memories` | GET | Список воспоминаний (с фильтрами) |
| `/api/memories/process` | POST | Извлечь память из текста |
| `/api/context` | POST | Построить контекст (поиск через pgvector) |
| `/api/memories/:id` | DELETE | Удалить воспоминание |

Подробная документация API: [EXTENSION-USAGE.md](./EXTENSION-USAGE.md#api-reference)

---

**GitHub:** https://github.com/Melanisx3/sillytavern-db-memory-extension  
**Версия:** 2.0.0  
**Лицензия:** MIT  
**Автор:** Melanisx3
## Mobile Support

✅ **Android** — Works in SillyTavern PWA (Chrome/Firefox)
✅ **iOS** — Works in SillyTavern PWA (Safari)
✅ **Termux** — Works with local backend

## Configuration

### Connection Tab

| Field | Description |
|-------|-------------|
| Backend URL | Your backend API URL (e.g., `http://localhost:3000`) |
| Username | Backend account username |
| Password | Backend account password |
| Connect | Authenticate and save credentials |
| Test Connection | Verify backend is reachable |

### Memory Tab

- **Search** — Filter memories by text
- **Type Filter** — Filter by memory type (fact, event, preference, relationship)
- **Importance Filter** — Filter by importance level
- **Sort** — Sort by relevance, date, or importance
- **Delete** — Remove memories from database

### Context Tab

Shows active memories for current chat:
- Memory count
- Average relevance score
- Last updated timestamp
- List of relevant memories with scores

### Settings Tab

| Setting | Default | Description |
|---------|---------|-------------|
| Auto Sync | ✓ | Sync messages automatically |
| Auto Extract | ✓ | Extract memories from messages |
| Messages per Sync | 10 | Batch size for sync |
| Memories per Context | 5 | Max memories in context |
| Similarity Threshold | 0.7 | Minimum relevance score (0.0-1.0) |
| Show Relevance Scores | ✓ | Display score percentages |
| Debug Mode | ✗ | Enable console logging |

## API Endpoints

This extension communicates with the backend via:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/auth/login` | POST | JWT authentication |
| `/api/messages` | POST | Create message |
| `/api/memories` | GET | List memories |
| `/api/memories/process` | POST | Extract memories from message |
| `/api/context` | POST | Build context for chat |

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌─────────────────┐
│ SillyTavern  │────▶│   Extension │────▶│  Backend API    │
│   (Client)   │     │   (JWT)     │     │ (Node.js + TS)  │
└──────────────┘     └─────────────┘     └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │  PostgreSQL 16  │
                                         │  + pgvector     │
                                         └─────────────────┘
```

## Troubleshooting

### "Not connected to backend"
- Verify backend is running: `curl http://localhost:3000/health`
- Check credentials in Connection tab
- Ensure no firewall blocking port 3000

### "Invalid or expired token"
- Re-enter password and click Connect
- Backend JWT tokens expire after 24h by default

### Memories not appearing
- Check that Auto Extract is enabled in Settings
- Verify backend logs for extraction errors
- Try manual extraction via backend API

### Mobile-specific issues
- Ensure backend is accessible from mobile network
- Use `http://<your-pc-ip>:3000` instead of `localhost`
- Check CORS settings in backend

## Development

### Structure

```
sillytavern-db-memory-extension/
├── manifest.json       # Extension metadata
├── index.js            # Main code (state, API, UI, sync)
├── ui/
│   └── main.html       # Panel HTML with tabs
└── styles/
    └── main.css        # Dark theme styles
```

### Testing

1. Start backend: `docker compose --profile backend up -d`
2. Create test user:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"test123"}'
   ```
3. Install extension in SillyTavern
4. Connect with test credentials

## License

MIT License — see [LICENSE](LICENSE)

## Credits

- Inspired by [SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae)
- Backend: [sillytavern-memory-backend](https://github.com/yourusername/sillytavern-memory-backend)
