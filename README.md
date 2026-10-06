# SillyTavern DB Memory Extension

Долговременная память для SillyTavern: сообщения чата разбираются на «воспоминания», получают эмбеддинги и
сохраняются в PostgreSQL с pgvector. Релевантные воспоминания находятся семантическим поиском.

```
SillyTavern
    ↓
Extension (браузер)
    ↓  HTTP + JWT
Backend (Node.js / Express)
    ↓
PostgreSQL + pgvector
```


## Требования

- Docker и Docker Compose v2 (рекомендуется), либо PostgreSQL 16 с расширением pgvector и Node.js ≥ 20
- Node.js ≥ 20 (для генерации `.env` и локальной разработки)
- SillyTavern (актуальная версия с поддержкой сторонних расширений)
- Сетевой доступ от устройства с SillyTavern до порта бэкенда (по умолчанию `3000`)
- Если SillyTavern открыт по `https://`, бэкенд тоже должен быть за HTTPS (иначе браузер заблокирует запросы как mixed content)

## Быстрый старт бэкенда (с чистого окружения)

```bash
git clone https://github.com/Melanisx3/sillytavern-db-memory-extension.git
cd sillytavern-db-memory-extension

node scripts/init-env.mjs                       # создаёт .env со случайными паролем БД и JWT_SECRET
docker compose --profile backend up -d --build  # PostgreSQL + pgvector + backend
```

При первом запуске пустого тома миграции из `database/migrations` применяются автоматически.
Проверка:

```bash
curl http://localhost:3000/health
# {"status":"ok","postgres":true,"pgvector":true,...,"embeddingDimensions":384}
```

Если том БД уже существовал: `./database/scripts/apply-migrations.sh` (Linux/macOS) или
`.\database\scripts\apply-migrations.ps1` (Windows).

### Создайте учётную запись

В расширении нет формы регистрации, поэтому один раз:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"mel","password":"ваш-пароль-от-8-символов"}'
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register `
  -ContentType "application/json" -Body '{"username":"mel","password":"ваш-пароль"}'
```

Логин 3–64 символа, пароль 6–128 символов.

## Установка расширения в SillyTavern

1. Откройте SillyTavern → **Extensions** (значок с кубиками) → **Install extension**.
2. Вставьте `https://github.com/Melanisx3/sillytavern-db-memory-extension` и нажмите **Install**.
3. Обновите страницу (F5). В списке расширений появится **DB Memory Extension**.

Вручную: склонируйте репозиторий в `data/<ваш-пользователь>/extensions/sillytavern-db-memory-extension`
(имя папки должно совпадать — шаблон загружается по пути `third-party/sillytavern-db-memory-extension`).

## Использование

### Что вписать в поля

| Поле | Значение |
|---|---|
| Backend URL | Адрес бэкенда без слеша в конце. Тот же компьютер: `http://localhost:3000`. Телефон/другой ПК: `http://<IP-компьютера-с-Docker>:3000`, например `http://192.168.1.70:3000` |
| Username / Password | Данные, с которыми вы зарегистрировались выше |

Нажмите **Connect** — статус станет «Connected». **Test Connection** проверяет `/health`, **Disconnect** сбрасывает токен и пароль.

### Настройки

| Параметр | Что делает |
|---|---|
| Auto-sync messages | Отправлять новые сообщения чата на бэкенд |
| Auto-extract memories | Извлекать из сообщений воспоминания (тип, важность, уверенность) |
| Messages per sync | Сколько последних сообщений учитывать при сборке контекста (берётся ×2, максимум 50) |
| Memories per context | Сколько воспоминаний возвращать (1–50) |
| Similarity threshold | Минимальная похожесть. Для встроенного провайдера `local-hash` рекомендуется **0.25–0.4**; значение 0.7 почти ничего не найдёт |
| Show relevance scores | Показывать процент релевантности |
| Debug mode | Логи расширения в консоли браузера |

Не забудьте **Save Settings**.

### Разделы

- **Memory Browser** — список воспоминаний, пагинация, удаление.
- **Context Preview** — какие воспоминания бэкенд подберёт к последнему сообщению текущего чата.

### Как работает память

Сообщение → предобработка → разбиение на фразы → классификация (`fact`, `preference`, `event`, `relationship`,
`character_state`, `world_information`, `important_event`) → оценка важности и уверенности → эмбеддинг →
поиск похожих → объединение дубликатов или создание новой записи. Поиск ранжирует результаты по
сходству, важности и уверенности. Данные каждого пользователя изолированы.

> Встроенный эмбеддинг `local-hash` — детерминированный, локальный, на хэшах символьных n-грамм. Он ловит
> лексическое сходство, а не смысл. Для настоящей семантики подключите другой `EmbeddingProvider`
> (размерность задаётся `EMBEDDING_DIMENSIONS` и должна совпадать с `vector(N)` в миграциях).

## Конфигурация (`.env`)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | — | Доступ к БД (пароль генерируется `init-env.mjs`) |
| `POSTGRES_PORT` | 5432 | Порт БД, слушает только `127.0.0.1` |
| `BACKEND_PORT` | 3000 | Порт бэкенда |
| `JWT_SECRET` | — | Обязателен, ≥ 32 символов при `NODE_ENV=production` |
| `JWT_EXPIRES_IN` | 7d | Срок жизни токена |
| `CORS_ORIGIN` | `*` | `*` или список origin через запятую |
| `AUTH_RATE_LIMIT_MAX` | 50 | Запросов к `/api/auth` с одного IP за 15 минут |
| `EMBEDDING_DIMENSIONS` | 384 | Должна совпадать с `vector(384)` (проверяется при старте) |


## Разработка и проверка

```bash
cd backend
npm ci
npm test            # unit-тесты (если glob не раскрывается в Windows: npx tsx --test src/memory/memory-engine.test.ts)
npm run build       # production-сборка (tsc)
BACKEND_URL=http://localhost:3000 npm run verify   # сквозная проверка API при запущенном стеке
```

## Безопасность и ограничения

- Пароль и JWT хранятся в настройках SillyTavern (`settings.json`) — не используйте пароль, который применяете где-либо ещё.
- Регистрация открыта для всех, кто достучится до бэкенда: не публикуйте порт в интернет без HTTPS и фильтрации.
- Параллельная обработка одинаковых сообщений теоретически может создать дубль (проверка дубликатов не атомарна).
- Пока бэкенд недоступен, сообщения не ставятся в очередь повторной отправки.

## Вдохновение

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) — платформа и API расширений
- [pgvector](https://github.com/pgvector/pgvector) — векторный поиск в PostgreSQL
- [horae](https://github.com/SenriYuki/SillyTavern-Horae) – вдохновение системы памяти
- [fetish-manager](https://github.com/delidgi/fetish-manager) — визуальный ориентир интерфейса

## Лицензия и автор

MIT — см. файл [LICENSE](LICENSE). Автор: **Melanisx3**.