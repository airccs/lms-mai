# 🎓 LMS MAI Quiz Solver

<div align="center">

**Расширение для браузера, которое помогает решать тесты в Moodle LMS**

[![Version](https://img.shields.io/badge/Version-2.0.0-blue.svg)](manifest.json)
[![Manifest](https://img.shields.io/badge/Manifest-V3-orange.svg)](manifest.json)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)

[Установка](#-установка) • [Использование](#-использование) • [Структура](#-структура-проекта) • [API сервер](#-api-сервер)

</div>

---

## 📋 Описание

**LMS MAI Quiz Solver** — расширение для Chrome/Edge, которое автоматически находит и подставляет правильные ответы в тестах на [lms.mai.ru](https://lms.mai.ru/). Работает на базе статистики от всех пользователей, синхронизируется через облачный API.

### ✨ Возможности

- 🤖 **Автосканирование** — в фоне сканирует все пройденные тесты без открытия вкладок
- 🔍 **Умный поиск** — ищет ответы по нескольким источникам в порядке приоритета
- 📊 **Статистика** — показывает процент правильности по данным всех пользователей
- 💾 **Автосохранение** — сохраняет ответы при каждом прохождении теста
- 🔄 **Синхронизация** — данные доступны с любого устройства через Oracle Cloud API

### 📝 Поддерживаемые типы вопросов

| Тип | Статус |
|-----|--------|
| Множественный выбор (Multiple Choice) | ✅ |
| Короткий ответ (Short Answer) | ✅ |
| Числовой ответ (Numerical) | ✅ |
| Верно/Неверно (True/False) | ✅ |
| Вопросы с изображениями | ✅ |
| Вопросы с LaTeX формулами | ✅ |

---

## 📦 Установка

### Из исходников (рекомендуется)

```bash
git clone https://github.com/airccs/lms-mai.git
cd lms-mai
npm install
npm run build:prod
```

Затем загрузите расширение в браузер:

1. Откройте `chrome://extensions/` (или `edge://extensions/`)
2. Включите **Режим разработчика**
3. Нажмите **Загрузить распакованное расширение**
4. Выберите папку `lms-mai`

### Скрипты сборки

| Команда | Описание |
|---------|----------|
| `npm run build:prod` | Production сборка (рекомендуется) |
| `npm run build:dev` | Dev сборка с отладочными функциями |
| `npm run dev` | Watch-режим для разработки |
| `npm run package` | Собрать и упаковать в `dist/` |

---

## 🎯 Использование

### На странице теста

Под каждым вопросом появляются кнопки:

- 🔍 **Найти ответ** — ищет и применяет ответ автоматически
- 💾 **Сохранить ответ** — сохраняет выбранный вами ответ
- ⚡ **Авто-решение** — решает все вопросы на странице за один клик

Статистика (% правильных ответов, число попыток) отображается под каждым вопросом автоматически.

### Порядок поиска ответов

1. **Сохранённые ответы** — из локальной БД и общей базы пользователей
2. **Статистика** — самый популярный правильный ответ по данным всех
3. **Поиск на странице** — ответы, уже отмеченные как верные
4. **Онлайн-поиск** — Google для сложных вопросов без данных

### Popup расширения

- **Просмотр данных** — все сохранённые вопросы с ответами и изображениями
- **Ручное автосканирование** — запуск сканирования всех курсов и тестов

---

## 🏗️ Структура проекта

```
lms-mai/
├── src/                        # Исходный код (TypeScript + React)
│   ├── popup/                  # Popup-окно расширения
│   ├── saved-data/             # Страница сохранённых данных
│   ├── auto-scan/              # Страница автосканирования
│   ├── components/             # Общие React-компоненты
│   └── config.ts               # Конфигурация (API URL, флаги)
├── js/                         # Скомпилированные JS файлы расширения
│   ├── content.js              # Content script для страниц LMS
│   ├── background.js           # Service Worker (фоновые задачи)
│   ├── api.js                  # Клиент для синхронизации с сервером
│   ├── saved-data.js           # Скрипт страницы данных
│   └── auto-scan.js            # Скрипт страницы автосканирования
├── html/                       # Скомпилированные HTML + JS + CSS
│   ├── popup.html
│   ├── saved-data-react.html
│   └── auto-scan-react.html
├── css/
│   └── content.css             # Стили для страниц LMS
├── icons/                      # Иконки расширения
├── server/                     # Node.js API сервер (Oracle Cloud)
│   ├── server.js               # Express API
│   ├── init-db.js              # Инициализация SQLite
│   └── ORACLE_DEPLOY.md        # Инструкция по деплою
├── manifest.json               # Манифест расширения (MV3)
├── vite.config.ts              # Конфигурация Vite
└── package.json
```

---

## 🌐 API Сервер

Сервер развёрнут на **Oracle Free Tier** с SQLite. Синхронизация включена по умолчанию.

### Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/health` | Проверка доступности |
| `GET` | `/api/stats/:questionHash` | Статистика по вопросу |
| `POST` | `/api/submit` | Отправка результата ответа |
| `POST` | `/api/save` | Сохранение ответа |
| `GET` | `/api/answers/:questionHash` | Получение сохранённых ответов |

### Развернуть свой сервер

```bash
cd server
npm install
node init-db.js
node server.js
```

Полная инструкция: [server/ORACLE_DEPLOY.md](server/ORACLE_DEPLOY.md)

После деплоя обновите `API_URL` в `src/config.ts` и пересоберите: `npm run build:prod`

---

## 🔧 Технологии

- **Расширение:** Chrome Manifest V3, Content Scripts, Service Worker
- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide React
- **Сборка:** Vite 5
- **Backend:** Node.js, Express, SQLite (Oracle Free Tier)

---

<div align="center">

**Сделано для студентов МАИ** · [Открыть Issue](https://github.com/airccs/lms-mai/issues)

</div>
