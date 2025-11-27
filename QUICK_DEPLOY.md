# Быстрое развертывание на GitHub и Railway

## Автоматический скрипт

Запустите скрипт:
```powershell
.\deploy-to-github.ps1
```

Скрипт поможет:
1. Проверить Git
2. Инициализировать репозиторий (если нужно)
3. Подключиться к GitHub
4. Загрузить код

## Ручная загрузка (если скрипт не работает)

### 1. Создайте репозиторий на GitHub

1. Зайдите на https://github.com/new
2. Repository name: `moodle-quiz-solver`
3. Description: `Расширение для автоматического решения тестов Moodle`
4. Visibility: Public или Private
5. НЕ отмечайте "Initialize with README"
6. Нажмите "Create repository"

### 2. Загрузите код

```powershell
cd f:\lms

# Если еще не инициализирован
git init
git add .
git commit -m "Initial commit: Moodle Quiz Solver with server sync"

# Подключите к GitHub (замените YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/moodle-quiz-solver.git
git branch -M main
git push -u origin main
```

### 3. Разверните на Railway

1. Зайдите на https://railway.app/
2. Войдите через GitHub
3. New Project → Deploy from GitHub repo
4. Выберите `moodle-quiz-solver`
5. Settings → Root Directory → `server`
6. Получите URL (например: `quiz-solver.railway.app`)

### 4. Настройте расширение

В расширении укажите URL от Railway:
```
https://quiz-solver.railway.app
```

## Готово!

Теперь синхронизация работает для всех пользователей!

