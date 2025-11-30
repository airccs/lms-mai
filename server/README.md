# LMS MAI Quiz Solver API Server

Node.js API сервер для синхронизации данных расширения LMS MAI Quiz Solver.

## Возможности

- ✅ RESTful API совместимый с Cloudflare Worker
- ✅ SQLite база данных (легко мигрировать на Oracle DB)
- ✅ Хранение статистики ответов
- ✅ Хранение сохраненных ответов с изображениями
- ✅ CORS поддержка
- ✅ Готов к деплою на Oracle Free Tier

## Установка

```bash
cd server
npm install
```

## Запуск

```bash
# Production
npm start

# Development (с автоперезагрузкой)
npm run dev
```

Сервер запустится на порту 3000 (или из переменной окружения `PORT`).

## API Эндпоинты

### Health Check
```
GET /api/health
```

### Получить статистику вопроса
```
GET /api/stats/:questionHash
```

### Отправить статистику ответа
```
POST /api/submit
Body: { questionHash, answer, isCorrect }
```

### Сохранить ответ
```
POST /api/save
Body: { questionHash, answer, isCorrect, questionText, questionImage, timestamp }
```

### Получить сохраненные ответы
```
GET /api/answers/:questionHash
```

## Деплой на Oracle Free Tier

См. [ORACLE_DEPLOY.md](./ORACLE_DEPLOY.md) для подробных инструкций.

## Миграция с Cloudflare Worker

1. Разверните сервер на Oracle
2. Обновите URL в `js/background.js`:
   ```javascript
   const fixedApiUrl = 'https://your-oracle-server-ip:3000';
   ```
3. Пересоберите расширение

## База данных

По умолчанию используется SQLite (`quiz_data.db`). Для Oracle Database см. [ORACLE_DEPLOY.md](./ORACLE_DEPLOY.md).

## Переменные окружения

- `PORT` - Порт сервера (по умолчанию 3000)

