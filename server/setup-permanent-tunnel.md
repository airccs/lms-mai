# Настройка постоянной синхронизации на ПК

## Шаг 1: Получить статический домен в ngrok

### Вариант A: Бесплатный статический домен (рекомендуется)

1. Зайдите на https://dashboard.ngrok.com/
2. Войдите в аккаунт (iljakir.06@gmail.com)
3. Перейдите в "Cloud Edge" → "Domains"
4. Нажмите "Create Domain"
5. Выберите бесплатный домен (например: `quiz-solver.ngrok-free.dev`)
6. Скопируйте домен

### Вариант B: Использовать authtoken (если нет статического домена)

1. Зайдите на https://dashboard.ngrok.com/get-started/your-authtoken
2. Скопируйте authtoken
3. Выполните в PowerShell:
   ```powershell
   ngrok config add-authtoken ваш-authtoken
   ```

## Шаг 2: Создать скрипт запуска

Создайте файл `start-permanent.bat`:

```batch
@echo off
cd /d "%~dp0"

REM Запускаем сервер
start "Quiz Solver Server" /MIN cmd /c "node server.js"

REM Ждем запуска сервера
timeout /t 3 /nobreak >nul

REM Запускаем ngrok с статическим доменом
ngrok http 3000 --domain=quiz-solver.ngrok-free.dev
```

**Или если нет статического домена:**
```batch
ngrok http 3000
```

## Шаг 3: Настроить автозапуск при включении ПК

### Способ 1: Через планировщик задач Windows

1. Нажмите `Win + R`, введите `taskschd.msc`
2. Нажмите "Создать задачу"
3. Вкладка "Общие":
   - Имя: `Quiz Solver API Server`
   - Отметить: "Выполнять для всех пользователей" и "Выполнять с наивысшими правами"
4. Вкладка "Триггеры":
   - Нажмите "Создать"
   - Начало задачи: "При входе в систему"
   - Пользователь: ваш пользователь
5. Вкладка "Действия":
   - Нажмите "Создать"
   - Действие: "Запуск программы"
   - Программа: `C:\Windows\System32\cmd.exe`
   - Аргументы: `/c "cd /d f:\lms\server && start-permanent.bat"`
6. Вкладка "Условия":
   - Снимите галочку "Запускать только при питании от электросети"
7. Вкладка "Параметры":
   - Отметьте: "Выполнять задачу немедленно, если пропущен плановый запуск"
8. Нажмите "ОК"

### Способ 2: Через автозагрузку (проще)

1. Нажмите `Win + R`, введите `shell:startup`
2. Создайте ярлык на файл `start-permanent.bat`
3. Готово - будет запускаться при входе в Windows

## Шаг 4: Настроить расширение

В расширении укажите постоянный URL:
```
https://quiz-solver.ngrok-free.dev
```

(Или ваш статический домен из ngrok)

## Шаг 5: Проверка

1. Перезагрузите ПК
2. Проверьте, что сервер запущен:
   ```
   http://localhost:3000/api/health
   ```
3. Проверьте ngrok:
   ```
   https://quiz-solver.ngrok-free.dev/api/health
   ```

## Если ngrok завершается

Создайте скрипт с автоматическим перезапуском `start-with-restart.bat`:

```batch
@echo off
:loop
cd /d "%~dp0"

REM Запускаем сервер
start "Quiz Solver Server" /MIN cmd /c "node server.js"
timeout /t 3 /nobreak >nul

REM Запускаем ngrok
ngrok http 3000 --domain=quiz-solver.ngrok-free.dev

REM Если ngrok завершился, перезапускаем
echo ngrok stopped, restarting...
timeout /t 5 /nobreak >nul
goto loop
```

## Альтернатива: Cloudflare Tunnel (бесплатно, без ограничений)

Если ngrok не подходит, используйте Cloudflare Tunnel:

1. Зарегистрируйтесь на https://www.cloudflare.com/
2. Установите cloudflared
3. Создайте туннель:
   ```bash
   cloudflared tunnel create quiz-solver
   cloudflared tunnel route dns quiz-solver quiz-solver.yourdomain.com
   cloudflared tunnel run quiz-solver
   ```

## Мониторинг

Для проверки, что все работает, откройте:
- ngrok dashboard: http://127.0.0.1:4040
- Сервер health: http://localhost:3000/api/health

