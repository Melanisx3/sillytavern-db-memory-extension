# Инструкция по публикации на GitHub

## 1. Создать репозиторий на GitHub

1. Зайти на https://github.com/new
2. Repository name: `sillytavern-db-memory-extension`
3. Description: "Database-backed memory extension for SillyTavern with PostgreSQL + pgvector"
4. Public (рекомендуется) или Private
5. **НЕ** создавать README/.gitignore/license — мы их уже добавили
6. Click **Create repository**

## 2. Инициализировать Git локально

Открыть PowerShell в папке проекта:

```powershell
cd C:\prog\curse3\sillytavern-db-memory-extension
git init
git add .
git commit -m "Initial commit: DB/Memory Extension for SillyTavern"
```

## 3. Привязать удалённый репозиторий

```powershell
# Заменить YOUR_USERNAME на ваш логин GitHub
git remote add origin https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git
git branch -M main
git push -u origin main
```

## 4. Обновить README

Открыть `README.md` и заменить:
- `YOUR_USERNAME` → ваш логин GitHub
- Ссылки на backend репозиторий (если есть)

## 5. Проверить на GitHub

1. Обновить страницу репозитория
2. Убедиться что все файлы загружены
3. Проверить что README отображается корректно

## 6. Установка для пользователей

Пользователи смогут установить через:

### Git URL (рекомендуется)
```
https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git
```

### Manual Download
1. Скачать ZIP: `https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension/archive/refs/heads/main.zip`
2. Распаковать в `SillyTavern/extensions/sillytavern-db-memory-extension/`

## 7. Мобильная установка

### Android (Termux)
```bash
git clone https://github.com/YOUR_USERNAME/sillytavern-db-memory-extension.git
# Копировать в SillyTavern/extensions/
```

### Android/iOS (PWA)
1. Открыть SillyTavern в браузере
2. Extensions → Install Extension
3. Вставить GitHub URL

## 8. Поддержка и обновления

### Выпустить обновление
```powershell
# Внести изменения
git add .
git commit -m "v1.0.1: Fix JWT token handling"
git push
```

### Создать релиз (опционально)
1. GitHub → Releases → Create new release
2. Tag: `v1.0.1`
3. Title: "Version 1.0.1"
4. Describe changes
5. Publish

## 9. Лицензия

Проект использует MIT License — пользователи могут:
- ✅ Использовать бесплатно
- ✅ Модифицировать
- ✅ Распространять
- ✅ Использовать коммерчески

Требуется только сохранить копирайт notice.

## 10. Ссылки для README

Заменить в README.md:
- `[Backend Repository](https://github.com/YOUR_USERNAME/sillytavern-memory-backend)`
- `[SillyTavern-Horae](https://github.com/SenriYuki/SillyTavern-Horae)` (оставить как есть)

---

**Готово!** Extension доступен для установки по всему миру. 🌍
