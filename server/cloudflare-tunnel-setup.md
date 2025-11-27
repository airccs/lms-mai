# Настройка Cloudflare Tunnel (бесплатно, статический домен)

## Преимущества:

- ✅ Полностью бесплатно
- ✅ Статический домен (можно использовать свой или бесплатный)
- ✅ Без ограничений
- ✅ HTTPS автоматически
- ✅ Надежнее ngrok

## Установка:

### Шаг 1: Регистрация

1. Зарегистрируйтесь на https://www.cloudflare.com/ (бесплатно)
2. Войдите в аккаунт

### Шаг 2: Установка cloudflared

1. Скачайте: https://github.com/cloudflare/cloudflared/releases/latest
2. Скачайте `cloudflared-windows-amd64.exe`
3. Переименуйте в `cloudflared.exe`
4. Поместите в папку `f:\lms\server\`

### Шаг 3: Авторизация

```powershell
cd f:\lms\server
.\cloudflared.exe tunnel login
```

Откроется браузер, авторизуйтесь в Cloudflare.

### Шаг 4: Создание туннеля

```powershell
.\cloudflared.exe tunnel create quiz-solver
```

Запишите ID туннеля (будет показан в выводе).

### Шаг 5: Настройка маршрута

```powershell
.\cloudflared.exe tunnel route dns quiz-solver quiz-solver.yourdomain.workers.dev
```

Или если у вас есть свой домен:
```powershell
.\cloudflared.exe tunnel route dns quiz-solver quiz-solver.yourdomain.com
```

### Шаг 6: Запуск туннеля

```powershell
.\cloudflared.exe tunnel run quiz-solver
```

### Шаг 7: Автозапуск

Создайте файл `start-cloudflare.bat`:

```batch
@echo off
cd /d "%~dp0"

REM Запускаем сервер
start "Quiz Solver Server" /MIN cmd /c "node server.js"
timeout /t 3 /nobreak >nul

REM Запускаем Cloudflare Tunnel
.\cloudflared.exe tunnel run quiz-solver
```

Добавьте в автозагрузку (Win+R → shell:startup).

## Готово!

Ваш сервер будет доступен по адресу:
```
https://quiz-solver.yourdomain.workers.dev
```

Или ваш кастомный домен.

