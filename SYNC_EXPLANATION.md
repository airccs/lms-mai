# Как работает синхронизация между пользователями

## Общая схема

```
Пользователь 1          Пользователь 2          Пользователь 3
     │                        │                        │
     │                        │                        │
     ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────┐
│              API Сервер (Централизованное хранилище)     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Статистика всех вопросов:                       │   │
│  │  - questionHash1: { totalAttempts: 150, ... }   │   │
│  │  - questionHash2: { totalAttempts: 200, ... }   │   │
│  │  - questionHash3: { totalAttempts: 75, ... }    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
     ▲                        ▲                        ▲
     │                        │                        │
     │                        │                        │
Локальное хранилище    Локальное хранилище    Локальное хранилище
(Chrome Sync)          (Chrome Sync)          (Chrome Sync)
```

## Процесс синхронизации

### 1. Инициализация (Загрузка страницы)

**Что происходит:**
```
Пользователь открывает тест
    ↓
Content Script загружается
    ↓
Загружает локальную статистику (Chrome Storage Local)
    ↓
Проверяет настройки API
    ↓
Если API включен → Загружает статистику с сервера
    ↓
Объединяет локальную и серверную статистику
```

### 1.1. Синхронизация сохраненных ответов

**Что синхронизируется:**
- ✅ **Сохраненные ответы** — текст вопроса, изображение, конкретный ответ
- ✅ **Статистика** — процент правильности, количество попыток, популярность ответов

**Как работает:**
```
Пользователь сохраняет ответ
    ↓
Ответ сохраняется локально (Chrome Storage Local)
    ↓
Ответ отправляется на сервер через /api/save
    ↓
Сервер сохраняет ответ для всех пользователей
    ↓
Другие пользователи могут получить этот ответ через /api/answers/:questionHash
```

**Код:**
```javascript
// js/content.js - loadStatistics()
async loadStatistics() {
    // 1. Загружаем локальную статистику
    const result = await chrome.storage.sync.get(['questionStats', 'apiSettings']);
    
    // 2. Если API включен, загружаем с сервера
    if (settings.enabled && settings.apiUrl) {
        await this.loadStatisticsFromServer(settings);
    }
}
```

### 2. Отправка ответа на сервер

**Когда происходит:**
- Пользователь выбирает ответ → Автоматическое сохранение
- Пользователь нажимает "Сохранить ответ"
- После завершения теста → Анализ результатов

**Процесс:**
```
Пользователь выбирает ответ
    ↓
autoSaveAnswer() вызывается
    ↓
updateStatistics() обновляет локальную статистику
    ↓
Отправляет на сервер через background.js
    ↓
POST /api/submit { questionHash, answer, isCorrect }
    ↓
Сервер обновляет общую статистику
    ↓
Сервер возвращает обновленную статистику
    ↓
Расширение обновляет локальную статистику
```

**Код:**
```javascript
// js/content.js - updateStatistics()
async updateStatistics(questionHash, answer, isCorrect) {
    // 1. Обновляем локально
    stats.totalAttempts++;
    if (isCorrect) stats.correctAttempts++;
    
    // 2. Сохраняем в Chrome Sync
    await chrome.storage.sync.set({ questionStats: allStats });
    
    // 3. Отправляем на сервер
    if (apiSettings.enabled) {
        const response = await chrome.runtime.sendMessage({
            action: 'syncWithServer',
            syncAction: 'submitAnswer',
            questionHash, answer, isCorrect
        });
    }
}
```

### 3. Получение статистики с сервера

**Когда происходит:**
- При загрузке страницы (все статистики)
- При нажатии "Найти ответ" (статистика конкретного вопроса)

**Процесс:**
```
Пользователь нажимает "Найти ответ"
    ↓
loadQuestionStatisticsFromServer()
    ↓
GET /api/stats/{questionHash}
    ↓
Сервер возвращает статистику
    ↓
Объединяется с локальной статистикой
    ↓
Используется для поиска популярного ответа
```

**Код:**
```javascript
// js/content.js - loadQuestionStatisticsFromServer()
async loadQuestionStatisticsFromServer(question) {
    const response = await chrome.runtime.sendMessage({
        action: 'syncWithServer',
        syncAction: 'getStatistics',
        questionHash: question.hash
    });
    
    // Объединяем локальную и серверную статистику
    const merged = {
        totalAttempts: local + server,
        correctAttempts: local + server,
        answers: mergeAnswers(local, server),
        errors: mergeErrors(local, server)
    };
}
```

## Структура данных

### На сервере:
```javascript
{
  "questionHash1": {
    "totalAttempts": 150,      // Всего попыток всех пользователей
    "correctAttempts": 120,    // Правильных ответов
    "answers": {                // Популярность каждого ответа
      '{"value":"1","text":"Вариант А"}': 80,
      '{"value":"2","text":"Вариант Б"}': 40,
      '{"value":"3","text":"Вариант В"}': 30
    },
    "errors": [                 // Популярные ошибки
      { "answer": {...}, "timestamp": 1234567890 }
    ]
  }
}
```

### В расширении (локально):
```javascript
// Chrome Storage Sync (синхронизация между устройствами пользователя)
{
  "questionStats": {
    "questionHash1": { ... },
    "questionHash2": { ... }
  },
  "apiSettings": {
    "enabled": true,
    "apiUrl": "https://api.example.com",
    "apiKey": "optional-key"
  }
}

// Chrome Storage Local (только на этом устройстве)
{
  "answer_questionHash1": {
    "answer": {...},
    "timestamp": 1234567890,
    "isCorrect": true
  }
}
```

## API Endpoints

### 1. Сохранить ответ (синхронизация ответов между пользователями)
```
POST /api/save
Body: {
  questionHash: "abc123",
  answer: { value: "1", text: "Вариант А" },
  isCorrect: true,
  questionText: "Текст вопроса...",
  questionImage: "data:image/png;base64,...",
  timestamp: 1234567890
}
Response: {
  success: true,
  answers: [{ answer: {...}, isCorrect: true, ... }]
}
```

### 2. Получить сохраненные ответы других пользователей
```
GET /api/answers/{questionHash}
Response: {
  answers: [
    {
      answer: { value: "1", text: "Вариант А" },
      isCorrect: true,
      questionText: "Текст вопроса...",
      questionImage: "data:image/png;base64,...",
      timestamp: 1234567890
    },
    ...
  ]
}
```

### 3. Отправить статистику ответа
```
POST /api/submit
Body: {
  questionHash: "abc123",
  answer: { value: "1", text: "Вариант А" },
  isCorrect: true,
  timestamp: 1234567890
}
Response: {
  success: true,
  statistics: { totalAttempts: 151, ... }
}
```

### 4. Получить статистику вопроса
```
GET /api/stats/{questionHash}
Response: {
  statistics: {
    totalAttempts: 150,
    correctAttempts: 120,
    answers: {...},
    errors: [...]
  }
}
```

### 5. Получить всю статистику
```
GET /api/stats
Response: {
  statistics: {
    questionHash1: {...},
    questionHash2: {...}
  }
}
```

## Объединение данных

### При загрузке статистики:
```javascript
// Локальная статистика
localStats = {
  totalAttempts: 5,
  correctAttempts: 4,
  answers: { "answer1": 3, "answer2": 2 }
}

// Серверная статистика
serverStats = {
  totalAttempts: 150,
  correctAttempts: 120,
  answers: { "answer1": 80, "answer2": 40, "answer3": 30 }
}

// Объединенная статистика
merged = {
  totalAttempts: 155,        // 5 + 150
  correctAttempts: 124,       // 4 + 120
  answers: {
    "answer1": 83,            // 3 + 80
    "answer2": 42,            // 2 + 40
    "answer3": 30             // только с сервера
  }
}
```

## Безопасность и приватность

### Что передается:
- ✅ Хеш вопроса (не сам текст вопроса)
- ✅ Выбранный ответ
- ✅ Правильность ответа (true/false)
- ✅ Временная метка

### Что НЕ передается:
- ❌ Текст вопроса
- ❌ Личные данные пользователя
- ❌ Имя пользователя
- ❌ ID пользователя в Moodle

### Анонимность:
- Каждый пользователь имеет уникальный ID (генерируется локально)
- ID не связан с личностью
- Статистика агрегированная, без привязки к конкретному пользователю

## Обработка ошибок

### Если сервер недоступен:
```
Попытка отправить на сервер
    ↓
Ошибка соединения
    ↓
Fallback на локальное хранилище
    ↓
Продолжение работы без синхронизации
    ↓
Попытка повторной синхронизации при следующем действии
```

### Если API отключен:
```
Проверка настроек
    ↓
API отключен
    ↓
Используется только локальное хранилище
    ↓
Синхронизация только между устройствами пользователя (Chrome Sync)
```

## Преимущества такой архитектуры

1. **Масштабируемость**: Сервер может обрабатывать тысячи пользователей
2. **Надежность**: Fallback на локальное хранилище при ошибках
3. **Приватность**: Передаются только анонимные статистические данные
4. **Производительность**: Локальное кэширование + периодическая синхронизация
5. **Гибкость**: Можно работать без сервера (только локально)

## Пример работы

### Сценарий: 3 пользователя решают один вопрос

**Вопрос:** "Что такое JavaScript?"
**Варианты:** A) Язык программирования, B) Браузер, C) Фреймворк

**Пользователь 1:**
- Выбирает A (правильно)
- Отправляется на сервер: `{ questionHash: "xyz", answer: "A", isCorrect: true }`
- Сервер: `{ totalAttempts: 1, correctAttempts: 1, answers: {"A": 1} }`

**Пользователь 2:**
- Загружает статистику с сервера
- Видит: 1 попытка, 100% правильность, популярный ответ "A"
- Выбирает A (правильно)
- Отправляется на сервер
- Сервер: `{ totalAttempts: 2, correctAttempts: 2, answers: {"A": 2} }`

**Пользователь 3:**
- Загружает статистику с сервера
- Видит: 2 попытки, 100% правильность, популярный ответ "A"
- Выбирает B (неправильно)
- Отправляется на сервер
- Сервер: `{ totalAttempts: 3, correctAttempts: 2, answers: {"A": 2, "B": 1}, errors: [{"B"}] }`

**Пользователь 1 (снова):**
- Загружает обновленную статистику
- Видит: 3 попытки, 67% правильность, популярный ответ "A", ошибка "B"
- Может использовать эту информацию для выбора правильного ответа

