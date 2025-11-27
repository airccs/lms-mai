# API Сервер для Moodle Quiz Solver

Сервер для синхронизации статистики ответов между пользователями расширения.

## Установка

1. Установите Node.js (версия 14 или выше)
2. Перейдите в папку `server`
3. Установите зависимости:
```bash
npm install
```

## Запуск

```bash
npm start
```

Или для разработки с автоперезагрузкой:
```bash
npm run dev
```

Сервер запустится на порту 3000 (или на порту, указанном в переменной окружения PORT).

## API Endpoints

### Health Check
```
GET /api/health
```
Проверка доступности сервера.

### Получить статистику вопроса
```
GET /api/stats/:questionHash
```
Возвращает статистику для конкретного вопроса.

### Получить всю статистику
```
GET /api/stats
```
Возвращает всю статистику всех вопросов.

### Отправить ответ
```
POST /api/submit
Body: {
  questionHash: string,
  answer: any,
  isCorrect: boolean
}
```
Обновляет статистику на основе ответа пользователя.

### Сохранить ответ
```
POST /api/save
Body: {
  questionHash: string,
  answer: any,
  isCorrect: boolean
}
```
Сохраняет ответ для будущего использования.

### Получить сохраненные ответы
```
GET /api/answers/:questionHash
```
Возвращает сохраненные ответы для вопроса.

### Статистика сервера
```
GET /api/server/stats
```
Возвращает общую статистику сервера.

## Настройка в расширении

1. Откройте popup расширения
2. Включите "Синхронизацию с сервером"
3. Введите URL вашего сервера (например: `http://localhost:3000` или `https://your-domain.com`)
4. (Опционально) Введите API ключ, если требуется авторизация
5. Нажмите "Сохранить настройки"

## Развертывание в продакшене

Для продакшена рекомендуется:

1. Использовать базу данных (MongoDB, PostgreSQL, и т.д.) вместо памяти
2. Добавить аутентификацию и авторизацию
3. Использовать HTTPS
4. Добавить rate limiting
5. Настроить логирование
6. Использовать переменные окружения для конфигурации

## Пример с MongoDB

```javascript
const mongoose = require('mongoose');

const QuestionStatsSchema = new mongoose.Schema({
  questionHash: { type: String, unique: true, required: true },
  totalAttempts: { type: Number, default: 0 },
  correctAttempts: { type: Number, default: 0 },
  answers: { type: Map, of: Number },
  errors: [{
    answer: mongoose.Schema.Types.Mixed,
    timestamp: Date
  }]
});

const QuestionStats = mongoose.model('QuestionStats', QuestionStatsSchema);
```

## Безопасность

- Добавьте валидацию входных данных
- Используйте HTTPS в продакшене
- Добавьте rate limiting для предотвращения злоупотреблений
- Реализуйте аутентификацию, если требуется приватность данных

