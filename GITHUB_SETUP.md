# Загрузка проекта на GitHub

## Шаг 1: Создание репозитория на GitHub

1. Зайдите на https://github.com/
2. Войдите в аккаунт (или создайте новый)
3. Нажмите "New repository" (зеленая кнопка справа)
4. Заполните:
   - **Repository name:** `moodle-quiz-solver` (или другое имя)
   - **Description:** `Расширение для автоматического решения тестов Moodle с синхронизацией между пользователями`
   - **Visibility:** Public (или Private, если хотите скрыть)
   - **НЕ** отмечайте "Initialize with README" (у нас уже есть README)
5. Нажмите "Create repository"

## Шаг 2: Инициализация Git в проекте

Откройте PowerShell в папке проекта:

```powershell
cd f:\lms
git init
git add .
git commit -m "Initial commit: Moodle Quiz Solver with server sync"
```

## Шаг 3: Подключение к GitHub

```powershell
# Замените YOUR_USERNAME на ваш GitHub username
git remote add origin https://github.com/YOUR_USERNAME/moodle-quiz-solver.git
git branch -M main
git push -u origin main
```

Если потребуется авторизация:
- Используйте Personal Access Token вместо пароля
- Создайте токен: GitHub → Settings → Developer settings → Personal access tokens → Generate new token
- Права: `repo` (полный доступ к репозиториям)

## Шаг 4: Проверка

Зайдите на ваш репозиторий на GitHub - код должен быть загружен.

## Шаг 5: Развертывание на Railway

1. Зайдите на https://railway.app/
2. Войдите через GitHub
3. Нажмите "New Project"
4. Выберите "Deploy from GitHub repo"
5. Выберите ваш репозиторий `moodle-quiz-solver`
6. Railway автоматически определит, что это Node.js проект
7. Нажмите на проект → Settings → Root Directory
8. Укажите: `server` (чтобы Railway знал, где находится сервер)
9. Railway автоматически развернет сервер
10. Получите URL (например: `quiz-solver.railway.app`)

## Шаг 6: Настройка Cloudflare (альтернатива)

Если хотите использовать Cloudflare Tunnel:

1. Клонируйте репозиторий на ваш ПК:
   ```powershell
   git clone https://github.com/YOUR_USERNAME/moodle-quiz-solver.git
   cd moodle-quiz-solver
   ```

2. Следуйте инструкции: [server/cloudflare-tunnel-setup.md](server/cloudflare-tunnel-setup.md)

## Обновление кода

После изменений:

```powershell
git add .
git commit -m "Описание изменений"
git push
```

Railway автоматически переразвернет сервер при обновлении кода.

