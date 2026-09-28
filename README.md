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

## 📋 Документация

- **[EXTENSION-USAGE.md](./EXTENSION-USAGE.md)** — полная инструкция по использованию, troubleshooting, API reference
- **[README.md](./README.md)** — базовая информация

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
  

## 📊 Структура проекта

```
sillytavern-db-memory-extension/
├── integrated-index.js      # Основная логика 
├── manifest.json            # Метаданные
├── assets/
│   ├── templates/          # HTML шаблоны
│   └── styles/             # CSS (minimal, no conflicts)
├── EXTENSION-USAGE.md      # Полная инструкция (17KB)
├── README.md               # Эта страница
└── LICENSE                 # MIT License
```


## 🏥 API Reference

---

**GitHub:** https://github.com/Melanisx3/sillytavern-db-memory-extension  
**Версия:** 2.0.0  
**Лицензия:** MIT  
**Автор:** Melanisx3
## Mobile Support

✅ **Android** — Works in SillyTavern PWA (Chrome/Firefox)
✅ **iOS** — Works in SillyTavern PWA (Safari)
✅ **Termux** — Works with local backend



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


## Credits

- Inspired by [SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae)
