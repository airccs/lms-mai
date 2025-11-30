# Быстрый старт

## Локальный запуск для тестирования

1. Установите зависимости:
```bash
cd server
npm install
```

2. Запустите сервер:
```bash
npm start
```

3. Проверьте работу:
```bash
curl http://localhost:3000/api/health
```

Должен вернуться: `{"status":"ok","timestamp":...}`

## Обновление расширения для использования локального сервера

1. Откройте `js/background.js`
2. Найдите функцию `handleServerSync`
3. В Chrome DevTools Console выполните:
```javascript
chrome.storage.local.set({ apiUrl: 'http://localhost:3000' });
```

Или временно измените в коде:
```javascript
const defaultApiUrl = 'http://localhost:3000';
```

4. Перезагрузите расширение

## Тестирование API

```bash
# Health check
curl http://localhost:3000/api/health

# Получить статистику
curl http://localhost:3000/api/stats/test_hash

# Отправить статистику
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"questionHash":"test","answer":"a","isCorrect":true}'

# Сохранить ответ
curl -X POST http://localhost:3000/api/save \
  -H "Content-Type: application/json" \
  -d '{"questionHash":"test","answer":"a","isCorrect":true,"questionText":"Test question"}'

# Получить сохраненные ответы
curl http://localhost:3000/api/answers/test_hash
```

## База данных

База данных SQLite создается автоматически при первом запуске: `quiz_data.db`

Для сброса базы данных:
```bash
rm quiz_data.db
npm start
```

